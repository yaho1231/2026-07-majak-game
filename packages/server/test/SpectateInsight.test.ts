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
 * 3. **화면에 실재하지 않는 숫자를 내보내지 않는다** (2026-08-23). 예전에는 네 좌석
 *    전부를 봇의 값어치 모형(`bot/value.ts`)으로 찍어 「3.2판 4660점」이 나왔다. 그
 *    모형은 만관 경계에서 봇이 요동치지 않도록 **일부러** 판수를 연속값으로 두고 점수를
 *    보간한다 — 봇에게는 옳고 화면에는 틀리다. 텐파이 좌석의 확정 타점은 코어가
 *    (`information/spectateScore.ts`) 실제 채점기로 내고, 여기 남은 **노텐 추정**만
 *    이 파일이 정수 판수·점수표 눈금으로 고쳐 낸다.
 * 4. **관전 뷰의 장 세기가 네 좌석 손패를 센다** (`bot/danger.ts`의 `tileTracker`).
 *    관전 뷰의 `playerId`는 `SPECTATOR_ID`라 «본인 손패» 존이 없어서, 예전에는 네 좌석
 *    손패를 **한 장도** 세지 않았다 — 관전자는 다 보는데도 남은 장수를 과대평가했고
 *    위험패가 그 위에 매겨졌다. 대국자 뷰의 값은 한 글자도 달라지면 안 된다.
 *
 * 뷰는 **손으로 짓는다.** 실제 대국을 돌려 우연히 그 손이 나오기를 기다리면 그때만
 * 도는 테스트가 되고, 어긋남을 실제로 관측한 손패(위 실측의 두 건)를 그대로 쓸 수도 없다.
 */

import { describe, expect, it } from "vitest";
import { SPECTATOR_ID, calculateScore, handZone, kindKey, meldsZone, shantenOf } from "@majak/core";
import type {
  DecomposeOptions,
  PlayerId,
  PlayerView,
  SpectateSeatScore,
  TileKind,
} from "@majak/core";
import { buildSpectateInsight } from "../src/spectateInsight.js";
import { tileTracker } from "../src/bot/danger.js";

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


/**
 * 관전 뷰를 **한 좌석의 대국자 뷰**로 깎는다 — 남의 손패는 `tiles`에서 통째로 빠지고
 * 존에는 장수만 남는다(코어 `collectVisibleTileIds`가 실제로 하는 일과 같은 모양).
 */
function playerViewOf(spec: PlayerView, me: PlayerId): PlayerView {
  const tiles: PlayerView["tiles"] = { ...spec.tiles };
  const zones: PlayerView["zones"] = { ...spec.zones };
  for (const p of spec.players) {
    if (p.id === me) continue;
    const zone = zones[handZone(p.id)];
    if (zone === undefined) continue;
    for (const id of zone.tileIds) delete tiles[id];
    zones[handZone(p.id)] = { ...zone, tileIds: [], hiddenCount: zone.tileIds.length };
  }
  return { ...spec, playerId: me, tiles, zones };
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

describe("노텐 좌석의 «추정»도 실재하는 숫자여야 한다", () => {
  /*
   * 예전에는 이 줄이 「3.2판 4660점」을 냈다. 봇 모형(`estimateHandValue`)이 판수를
   * 연속값으로 두고 점수표 두 칸을 보간하기 때문이다 — 만관 경계에서 봇이 요동치지
   * 않게 하려는 **의도된** 설계라 그 모형은 그대로 두고, 화면에 나가기 직전에
   * 정수 판수·표 눈금 부수로 고쳐 `calculateScore`를 다시 태운다.
   */
  const REAL_TOTALS = (() => {
    const set = new Set<number>();
    for (const isDealer of [true, false]) {
      for (let han = 1; han <= 13; han++) {
        for (const fu of [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110]) {
          set.add(calculateScore({ han, fu, isDealer, winType: "ron" }).total);
        }
      }
    }
    return set;
  })();

  const HANDS: Record<string, string[]> = {
    // 노텐 손 넷 — 도라도 후로도 없이 순수하게 추정 구간만 본다.
    p0: "man1 man3 man5 pin2 pin4 pin7 sou1 sou3 sou6 sou9 wind1 wind3 dragon2".split(" "),
    p1: "man2 man2 man7 pin1 pin1 pin8 sou2 sou4 sou5 wind2 wind2 dragon1 dragon3".split(" "),
    p2: "man4 man5 man6 pin3 pin3 pin4 sou7 sou8 wind4 wind4 dragon1 dragon1 man9".split(" "),
    p3: "man1 man1 man1 pin9 pin9 pin9 sou1 sou1 wind1 wind1 wind1 dragon2 dragon2".split(" "),
  };

  it("판수는 정수, 부수는 표의 눈금, 점수는 점수표에 실재하는 값이다", () => {
    const msg = buildSpectateInsight(spectatorView(HANDS));
    expect(msg).not.toBeNull();
    for (const s of msg!.seats) {
      const est = s.estimate;
      expect(est, `${s.id}에 노텐 추정이 없다 — 화면에 적을 것이 사라졌다`).toBeDefined();
      expect(Number.isInteger(est!.han), `판수가 정수가 아니다: ${est!.han}`).toBe(true);
      expect(est!.han, "1판 미만이라는 칸은 점수표에 없다").toBeGreaterThanOrEqual(1);
      expect(
        [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110],
        `부수가 표의 눈금이 아니다: ${est!.fu}`,
      ).toContain(est!.fu);
      expect(
        REAL_TOTALS.has(est!.points),
        `점수표에 없는 점수다: ${est!.points} (${est!.han}판 ${est!.fu}부)`,
      ).toBe(true);
      // 옛 화면 호환 필드도 같은 값을 본다 — 두 자리가 갈리면 화면에서 갈린다.
      expect(s.han).toBe(est!.han);
      expect(s.points).toBe(est!.points);
    }
  });
});

describe("코어 좌석값이 실려 오면 그것이 화면의 값이다", () => {
  /** 코어가 낸 확정값 한 벌 (여기서는 배관만 본다 — 값 자체는 core 쪽 테스트가 지킨다) */
  const CORE: SpectateSeatScore[] = [
    {
      id: "p0",
      shanten: 0,
      meldCount: 1,
      menzen: false,
      dora: 2,
      handGrade: 71,
      waits: [
        {
          kind: "man3",
          remaining: 3,
          ron: {
            han: 3,
            fu: 40,
            points: 5200,
            yakumanCount: 0,
            yaku: [{ name: "삼색동순", han: 1 }],
            doraHan: 2,
            redHan: 0,
            uraHan: 0,
          },
          tsumo: null,
        },
      ],
      best: {
        han: 3,
        fu: 40,
        points: 5200,
        yakumanCount: 0,
        yaku: [{ name: "삼색동순", han: 1 }],
        doraHan: 2,
        redHan: 0,
        uraHan: 0,
      },
    },
  ];

  const HAND = "man1 man2 man3 pin1 pin2 pin3 sou1 sou2 sou3 man5 man6 pin9 pin9".split(" ");

  it("텐파이 좌석은 확정값을 쓰고 추정을 얹지 않는다", () => {
    const msg = buildSpectateInsight(
      spectatorView({ p0: HAND, p1: HAND, p2: HAND, p3: HAND }),
      CORE,
    );
    const p0 = msg!.seats.find((s) => s.id === "p0");
    expect(p0?.best?.points, "확정값이 화면까지 오지 않았다").toBe(5200);
    expect(p0?.waits?.length).toBe(1);
    expect(p0?.handGrade, "배패 점수가 화면까지 오지 않았다").toBe(71);
    expect(p0?.shanten, "샹텐도 코어값을 써야 한다 — 두 셈이 갈리면 화면이 갈린다").toBe(0);
    expect(
      p0?.estimate,
      "확정값이 있는데 추정까지 얹혔다 — 같은 줄에 숫자가 둘 뜬다",
    ).toBeUndefined();
    expect(p0?.han).toBe(3);
    expect(p0?.fu).toBe(40);
    expect(p0?.points).toBe(5200);
    // 코어값이 없는 좌석은 예전처럼 이 파일이 재고 추정으로 떨어진다.
    const p1 = msg!.seats.find((s) => s.id === "p1");
    expect(p1?.estimate, "코어값이 없는 좌석의 추정이 사라졌다").toBeDefined();
    expect(p1?.best).toBeUndefined();
  });
});

describe("코어가 세운 표식은 하나도 잃지 않고 화면까지 간다", () => {
  /*
   * 「역없음」·「격 미달」·「후리텐」은 화면에 **다른 말로** 적어야 하는 다른 사실이다.
   * 배관에서 하나라도 흘리면 그 좌석은 아무 설명 없이 값만 빈 카드가 된다
   * (값 자체가 옳은지는 core의 `SpectateScore.test.ts`가 지킨다).
   */
  const HAND = "man1 man2 man3 pin1 pin2 pin3 sou1 sou2 sou3 man5 man6 pin9 pin9".split(" ");
  const base = {
    id: "p0",
    shanten: 0,
    meldCount: 0,
    menzen: true,
    dora: 0,
  } as const;

  const seatOf = (core: SpectateSeatScore) => {
    const msg = buildSpectateInsight(
      spectatorView({ p0: HAND, p1: HAND, p2: HAND, p3: HAND }),
      [core],
    );
    return msg!.seats.find((s) => s.id === "p0")!;
  };

  it("격 미달(`belowMinHan`)이 화면까지 간다", () => {
    const s = seatOf({ ...base, belowMinHan: true, waits: [] });
    expect(s.belowMinHan, "격 미달 표식이 배관에서 사라졌다").toBe(true);
    expect(s.yakuless, "역없음으로 바꿔 적으면 다른 사실을 말하는 것이다").toBeUndefined();
  });

  it("후리텐(`furiten`)이 화면까지 간다", () => {
    expect(seatOf({ ...base, furiten: true, waits: [] }).furiten).toBe(true);
  });

  it("형식텐파이(`yakuless`)가 화면까지 간다", () => {
    expect(seatOf({ ...base, yakuless: true, waits: [] }).yakuless).toBe(true);
  });
});

describe("관전 뷰의 장 세기 — 네 좌석 손패를 센다", () => {
  /*
   * `bot/danger.ts`의 `tileTracker`는 «보이는 곳을 전부 세어 남은 장수를 낸다». 그
   * «보이는 곳»에 뷰어 본인 손패가 들어 있는데, 관전 뷰는 `playerId`가 `SPECTATOR_ID`라
   * 그 존이 아예 없다 — 그래서 네 좌석 손패를 **한 장도** 세지 않았다. 관전자는 네 손패를
   * 다 보는데도 「아직 4장 남았다」고 읽었고, 중계의 위험패가 그 위에 매겨졌다.
   */
  const HANDS: Record<string, string[]> = {
    p0: "man1 man1 pin2 pin3 pin4 sou5 sou6 sou7 man4 man5 man6 wind1 wind1".split(" "),
    p1: "man1 pin5 pin5 pin6 sou1 sou2 sou3 man7 man8 man9 wind2 wind2 wind2".split(" "),
    p2: "pin7 pin8 pin9 sou4 sou5 sou6 man2 man3 man4 dragon1 dragon1 wind3 wind3".split(" "),
    p3: "pin1 pin1 pin1 sou8 sou9 man6 man7 man8 dragon2 dragon2 dragon3 wind4 wind4".split(" "),
  };

  it("관전 뷰는 네 좌석 손패를 세고, 대국자 뷰의 값은 그대로다", () => {
    const spec = spectatorView(HANDS);
    // man1은 p0가 2장 + p1이 1장 = 세상에 보이는 3장. 관전자는 그걸 다 본다.
    expect(
      tileTracker(spec)(k("man1")),
      "관전 뷰가 네 좌석 손패를 안 세고 있다 — 남은 장수를 과대평가한다",
    ).toBe(1);

    /*
     * 대국자 뷰에서는 **자기에게 보이는 손패만** 센다.
     *
     * 경계는 «내 존이냐»가 아니라 «뷰에 실려 왔느냐»다 (2026-08-31, QA synergy4 A-14):
     * 투시 같은 정보 증강은 상대 손패를 그 좌석의 뷰에 합법적으로 실어 주고, 그때는
     * 사람도 화면에서 그 패를 세므로 봇도 세야 한다. 반대로 안 열린 손패는 `view.tiles`에
     * 아예 없다 — 그래서 아래처럼 «남의 패를 지운» 진짜 대국자 뷰에서는 한 장도 세지 않는다.
     */
    const asP0 = playerViewOf(spec, "p0");
    expect(tileTracker(asP0)(k("man1")), "대국자 뷰의 장 세기가 달라졌다").toBe(2);
    // 남이 든 패는 대국자에게 보이지 않으므로 4장 그대로여야 한다.
    expect(tileTracker(asP0)(k("dragon1")), "대국자 뷰가 남의 손패를 세고 있다").toBe(4);
    expect(tileTracker(spec)(k("dragon1")), "관전 뷰가 p2의 백 두 장을 못 세고 있다").toBe(2);
  });
});
