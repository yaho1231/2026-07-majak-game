/**
 * **중계 패널의 숫자가 좌석 뱃지와 같은 셈을 쓴다** (docs/36 A2·A5 · QA 2차 spectate 확정 2·3).
 *
 * 해설이 화면에서 읽는 숫자다. 같은 화면 안에서 두 숫자가 갈리면 어느 쪽을 읽어도
 * 절반은 거짓말이 된다. 여기서 못 박는 것은 둘이다.
 *
 * 1. **14장 시점의 샹텐은 「한 장 버린 뒤의 최선」이다** (확정 2). 예전에는
 *    `hand.slice(0, -1)` — 손패 배치에 따라 아무 패나 될 수 있는 «배열의 마지막 한 장»을
 *    그냥 잘라 냈다. 실측 64건 중 22건(34%)이 좌석 뱃지와 어긋났고, 어긋날 때는 언제나
 *    한 단계 나쁘게 나왔다. 텐파이인 좌석을 「1샹텐」이라 읽는 일이 실제로 났다.
 * 2. **좌석마다 그 좌석의 화료형 규칙으로 잰다** (확정 3). 관전 뷰의 `scoringOptions`는
 *    «관전자는 특정 플레이어가 아니다»라서 `{}`(표준)다. 그걸 네 좌석에 그대로 쓰면
 *    이 게임의 간판 요소인 증강을 든 좌석에서 정확히 틀린다 — 5멘쯔·만능패 좌석이
 *    가장 극적인 자리인데 하필 거기서.
 *
 * 뷰는 **손으로 짓는다.** 실제 대국을 돌려 우연히 그 손이 나오기를 기다리면 그때만
 * 도는 테스트가 되고, 어긋남을 실제로 관측한 손패(위 실측의 두 건)를 그대로 쓸 수도 없다.
 */

import { describe, expect, it } from "vitest";
import { SPECTATOR_ID, handZone, kindKey, meldsZone, shantenOf } from "@majak/core";
import type { DecomposeOptions, PlayerId, PlayerView, TileKind } from "@majak/core";
import { buildSpectateInsight } from "../src/spectateInsight.js";

/** "man4" · "wind4" · "dragon3" → TileKind */
function k(s: string): TileKind {
  const m = /^([a-z]+)(\d)$/.exec(s);
  if (m === null) throw new Error(`kind 표기가 아니다: ${s}`);
  return { suit: m[1]!, rank: Number(m[2]) };
}

/**
 * 관전 뷰 한 장을 짓는다 — `buildSpectateInsight`가 실제로 읽는 자리만 채운다.
 *
 * 나머지 필드를 다 채우면 이 파일이 뷰 스키마의 사본이 되고, 스키마가 움직일 때마다
 * 이 테스트가 «틀리지 않았는데» 깨진다. 읽는 자리만 채우고 캐스트한다.
 */
function spectatorView(
  hands: Record<string, string[]>,
  opts?: Record<string, DecomposeOptions>,
): PlayerView {
  const tiles: Record<number, { id: number; kind: TileKind; attrs: Record<string, unknown> }> = {};
  const zones: Record<string, { tileIds: number[] }> = {};
  const byPlayer: Record<string, unknown> = {};
  let nextId = 0;
  const players = Object.keys(hands).map((id, i) => ({ id, seat: i }));
  for (const [id, hand] of Object.entries(hands)) {
    const ids: number[] = [];
    for (const s of hand) {
      const tid = nextId++;
      tiles[tid] = { id: tid, kind: k(s), attrs: {} };
      ids.push(tid);
    }
    zones[handZone(id)] = { tileIds: ids };
    zones[meldsZone(id)] = { tileIds: [] };
    byPlayer[id] = { meldCount: 0, melds: [], riichiDeclared: false };
  }
  return {
    playerId: SPECTATOR_ID,
    tiles,
    zones,
    players,
    round: { doraIndicators: [], dealerSeat: 0, turnSeat: -1, byPlayer },
    augmentView: {},
    scoringOptions: {},
    ...(opts !== undefined ? { seatScoringOptions: opts } : {}),
  } as unknown as PlayerView;
}

/** 좌석 뱃지가 쓰는 셈 — 모든 버림 후보를 돌려 최소값 (App.tsx:14745-14751 과 같다). */
function badgeShanten(hand: string[], options?: DecomposeOptions): number {
  const kinds = hand.map(k);
  if (kinds.length % 3 !== 2) return shantenOf(kinds, 0, options);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < kinds.length; i++) {
    const s = shantenOf(
      kinds.filter((_, j) => j !== i),
      0,
      options,
    );
    if (s < best) best = s;
  }
  return best;
}

/** 예전 셈 — 배열의 마지막 한 장을 그냥 잘라 낸다. 이 테스트가 막으려는 것. */
function oldShanten(hand: string[]): number {
  const kinds = hand.map(k);
  return shantenOf(kinds.length % 3 === 2 ? kinds.slice(0, -1) : kinds, 0);
}

const insight = (view: PlayerView): Record<string, number> => {
  const msg = buildSpectateInsight(view);
  expect(msg, "관전 뷰인데 보조값이 안 나왔다").not.toBeNull();
  return Object.fromEntries(msg!.seats.map((s) => [s.id, s.shanten]));
};

describe("중계 샹텐 — 14장이면 «한 장 버린 뒤의 최선»", () => {
  /*
   * 실측에서 어긋난 손 그대로다(spectate.md 확정 2). 배열의 마지막 장(`sou8`)을 버리는
   * 것이 최선이 아니라서, 예전 셈은 한 단계 나쁘게 읽었다.
   */
  const p0 = "man4 man4 pin3 pin4 pin6 pin6 sou2 sou4 sou6 sou6 sou8 wind4 dragon3 sou8".split(" ");
  const p2 = "man1 man7 man8 man9 pin3 pin4 pin6 pin8 pin9 sou3 sou7 wind4 dragon1 sou7".split(" ");

  it("실제로 어긋났던 손에서 좌석 뱃지와 같은 값을 낸다", () => {
    const got = insight(spectatorView({ p0, p1: p0, p2, p3: p2 }));
    expect(got.p0, "패널이 좌석 뱃지와 다른 샹텐을 말한다").toBe(badgeShanten(p0));
    expect(got.p2, "패널이 좌석 뱃지와 다른 샹텐을 말한다").toBe(badgeShanten(p2));
    // 그리고 예전 셈과는 실제로 다르다 — 아니면 이 테스트가 아무 것도 안 지킨다.
    expect(oldShanten(p0), "이 손은 더 이상 회귀를 잡지 못한다 — 어긋나는 손으로 바꿔라")
      .toBeGreaterThan(got.p0!);
    expect(oldShanten(p2), "이 손은 더 이상 회귀를 잡지 못한다 — 어긋나는 손으로 바꿔라")
      .toBeGreaterThan(got.p2!);
  });

  it("13장(3n+1) 시점은 버리지 않고 그대로 잰다", () => {
    const h13 = "man4 man4 pin3 pin4 pin6 pin6 sou2 sou4 sou6 sou6 sou8 wind4 dragon3".split(" ");
    const got = insight(spectatorView({ p0: h13, p1: h13, p2: h13, p3: h13 }));
    expect(got.p0).toBe(shantenOf(h13.map(k), 0));
  });

  it("같은 종류가 여러 장이어도 결과가 같다 (종류 단위로 한 번씩만 재는 최적화)", () => {
    // 손패 배치만 바꾼 같은 손 — 배열 순서에 답이 흔들리면 안 된다.
    const shuffled = [...p0].reverse();
    const a = insight(spectatorView({ p0, p1: p0, p2: p0, p3: p0 }));
    const b = insight(spectatorView({ p0: shuffled, p1: shuffled, p2: shuffled, p3: shuffled }));
    expect(b.p0, "손패 배치를 바꿨더니 샹텐이 달라졌다 — 그건 배치를 읽고 있다는 뜻이다")
      .toBe(a.p0);
  });
});

describe("중계 샹텐 — 좌석마다 그 좌석의 화료형 규칙", () => {
  /*
   * 5멘쯔(진짜 용)를 든 좌석. 표준 4멘쯔로 재면 이미 다 맞춘 손이지만, 그 좌석의
   * 규칙으로는 멘쯔가 하나 더 필요하다 — 두 값이 실제로 갈리는 손을 골랐다.
   */
  const fiveSets =
    "man1 man2 man3 pin1 pin2 pin3 sou1 sou2 sou3 man5 man6 man7 dragon1 dragon1".split(" ");

  it("`seatScoringOptions`가 있으면 그 옵션으로 잰다", () => {
    const opts: DecomposeOptions = { totalSets: 5 };
    const got = insight(
      spectatorView({ p0: fiveSets, p1: fiveSets, p2: fiveSets, p3: fiveSets }, { p0: opts }),
    );
    expect(got.p0, "증강 좌석이 자기 규칙으로 재지지 않았다").toBe(badgeShanten(fiveSets, opts));
    // 옵션이 없는 좌석은 표준 그대로 — 남의 증강이 내 숫자를 흔들지 않는다.
    expect(got.p1).toBe(badgeShanten(fiveSets));
    expect(got.p0, "표준과 값이 같으면 이 테스트가 아무 것도 안 지킨다").not.toBe(got.p1);
  });

  it("좌석 옵션이 없는 옛 뷰에서는 표준 규칙으로 떨어진다", () => {
    const got = insight(spectatorView({ p0: fiveSets, p1: fiveSets, p2: fiveSets, p3: fiveSets }));
    expect(got.p0).toBe(badgeShanten(fiveSets));
  });
});

describe("관전 뷰가 아니면 아무 것도 만들지 않는다", () => {
  it("대국자 뷰에는 중계 보조값이 없다 — 한 글자도 새면 안 된다", () => {
    const view = spectatorView({ p0: ["man1"], p1: ["man1"], p2: ["man1"], p3: ["man1"] });
    const asPlayer = { ...view, playerId: "p0" as PlayerId };
    expect(buildSpectateInsight(asPlayer)).toBeNull();
    // 지어내지 않는다는 뜻이지, 좌석 표기(kindKey)까지 잊는다는 뜻은 아니다.
    expect(kindKey(k("man1"))).toBe("man1");
  });
});
