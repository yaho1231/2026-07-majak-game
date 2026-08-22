/**
 * **원형이 판에서 구분되는가** — 이름표가 아니라 고른 패로.
 *
 * ## 왜 이 테스트가 있나 (QA 2차 봇 감사 확정 3)
 *
 * `BotPersonality.test.ts`는 원형표의 **값들이** 서로 다른지, 그리고 장면 하나에서
 * 그 값이 결정을 가르는지를 본다. 그런데 값이 다른 것과 **판에서 다르게 두는 것**은
 * 같지 않았다. 실측은 밀기/접기가 갈려야 하는 바로 그 장면에서 여섯 원형이
 * **91.3%를 같은 패로** 골랐다 — 이름표는 여섯인데 판에서 느껴지는 봇은 하나였다.
 *
 * 원인은 축이 안 이어져 있어서가 아니었다(성격 여덟 축은 전부 어딘가에서 읽힌다).
 * `discard.scales`의 폭이 좁아서였다: 공격형 0.85 ↔ 수비형 0.15가 저울에 주는 차이가
 * gain ×1.21 대 ×0.79뿐이라, 후보들의 기대 획득 격차가 그보다 크면 argmax가 그대로였다.
 * 고친 방향은 `discard.AGGRESSION_SPAN_FOLD`(접는 쪽만 넓힌다)에 적어 두었다.
 *
 * 그래서 여기서 재는 것은 장면 하나가 아니라 **비율**이다 — 성질 검사라야 폭이 다시
 * 좁아졌을 때 잡힌다. 이 파일의 장면 묶음에서 실측은 **27.5% 불일치 · 밀기율 차
 * 35.4%p**이고, 폭이 0.6이던 시절은 **10.8% · 15.4%p**였다. 문턱은 그 사이에 둔다.
 *
 * 장면 생성은 시드 PRNG라 값이 완전히 결정론적이다 — 플레이크가 없다.
 */

import { describe, expect, it } from "vitest";
import { kindKey, standardKinds } from "@majak/core";
import type { TileKind } from "@majak/core";
import { botScene } from "./botTestView.js";
import { buildRead } from "../src/bot/read.js";
import { bidDiscard } from "../src/bot/discard.js";
import { profileOf } from "../src/bot/profile.js";
import type { ArchetypeName } from "../src/bot/profile.js";

const SEED = 4242;
const SCENES = 120;

const KINDS = standardKinds();
const SUIT_CH: Record<string, string> = { man: "m", pin: "p", sou: "s" };
const spec = (ks: readonly TileKind[]): string =>
  ks
    .map((k) =>
      k.suit === "wind"
        ? `${k.rank}z`
        : k.suit === "dragon"
          ? `${k.rank + 4}z`
          : `${k.rank}${SUIT_CH[k.suit]}`,
    )
    .join("");

/**
 * 무작위 14장은 4000손에 6손만 텐파이라 표본이 안 쌓인다. 완성형을 만든 뒤 한 장을
 * 바꿔치기해 **텐파이 근처**로 만든다 — 밀기/접기가 실제로 갈리는 손이 그런 손이다.
 * (`qa-lab/round2/bot/archetype_scan.ts`와 같은 생성기다.)
 */
function nearTenpaiHands(count: number): TileKind[][] {
  let st = SEED >>> 0;
  const rnd = (): number => {
    st = (Math.imul(st ^ (st >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return st / 0x1_0000_0000;
  };
  const pick = (): TileKind => KINDS[Math.floor(rnd() * KINDS.length)] as TileKind;

  const one = (): TileKind[] | null => {
    const used = new Map<string, number>();
    const take = (k: TileKind): void => {
      used.set(kindKey(k), (used.get(kindKey(k)) ?? 0) + 1);
    };
    const out: TileKind[] = [];
    for (let b = 0; b < 4; b++) {
      let ok = false;
      for (let tries = 0; tries < 40 && !ok; tries++) {
        const k = pick();
        const isNum = k.suit === "man" || k.suit === "pin" || k.suit === "sou";
        if (isNum && rnd() < 0.65 && k.rank <= 7) {
          const run: TileKind[] = [
            k,
            { suit: k.suit, rank: k.rank + 1 },
            { suit: k.suit, rank: k.rank + 2 },
          ];
          if (run.every((x) => (used.get(kindKey(x)) ?? 0) < 4)) {
            for (const x of run) take(x);
            out.push(...run);
            ok = true;
          }
        } else if ((used.get(kindKey(k)) ?? 0) === 0) {
          for (let i = 0; i < 3; i++) take(k);
          out.push(k, k, k);
          ok = true;
        }
      }
      if (!ok) return null;
    }
    for (let tries = 0; ; tries++) {
      if (tries > 40) return null;
      const k = pick();
      if ((used.get(kindKey(k)) ?? 0) <= 2) {
        take(k);
        take(k);
        out.push(k, k);
        break;
      }
    }
    // 한 장 바꿔치기 → 대개 텐파이 또는 1샹텐
    const idx = Math.floor(rnd() * out.length);
    for (let tries = 0; tries < 40; tries++) {
      const k = pick();
      const cur = out[idx] as TileKind;
      used.set(kindKey(cur), (used.get(kindKey(cur)) ?? 1) - 1);
      if ((used.get(kindKey(k)) ?? 0) < 4) {
        used.set(kindKey(k), (used.get(kindKey(k)) ?? 0) + 1);
        out[idx] = k;
        break;
      }
      used.set(kindKey(cur), (used.get(kindKey(cur)) ?? 0) + 1);
    }
    return out;
  };

  const hands: TileKind[][] = [];
  while (hands.length < count) {
    const h = one();
    if (h !== null) hands.push(h);
  }
  return hands;
}

interface Tally {
  /** 두 원형이 다른 패를 고른 장면 수 */
  disagree: number;
  /** 전체 장면 수 */
  scenes: number;
  /** 원형별 — 손에 현물이 있는데도 비현물을 낸 장면 수 */
  push: Map<ArchetypeName, number>;
  /** 손에 현물이 있던 장면 수 */
  pushChances: number;
}

/** p1이 10순에 리치를 건 판. 손에는 안전패도 밀 패도 섞여 있다. */
function scanDanger(archetypes: readonly ArchetypeName[]): Tally {
  const t: Tally = { disagree: 0, scenes: 0, push: new Map(), pushChances: 0 };
  for (const hand of nearTenpaiHands(SCENES)) {
    const sc = botScene({
      hand: spec(hand),
      turnCount: 10,
      wallLeft: 30,
      riichi: ["p1"],
      riichiTileIndex: { p1: 2 },
      discards: { p1: "1z2z9m9p", p2: "1z2z3z", p3: "1z2z3z" },
    });
    const read = buildRead(sc.view, "p0", { mode: "hanchan" });
    const options = sc.discardOptions();
    // 리치자에게 100% 안전한 패 = 그 사람 바닥에 있는 종류(후리텐이라 론이 안 된다)
    const genbutsu = new Set(
      (sc.view.zones["discards:p1"]?.tileIds ?? []).map((id) =>
        kindKey(sc.view.tiles[id]?.kind as TileKind),
      ),
    );
    const haveGenbutsu = read.hand.some((k) => genbutsu.has(kindKey(k)));

    const picks: string[] = [];
    for (const a of archetypes) {
      const bid = bidDiscard(read, options, null, profileOf(a));
      const id = (bid?.option.payload as { tileId?: number } | undefined)?.tileId;
      const key = id === undefined ? "?" : kindKey(sc.view.tiles[id]?.kind as TileKind);
      picks.push(key);
      if (haveGenbutsu && !genbutsu.has(key)) t.push.set(a, (t.push.get(a) ?? 0) + 1);
    }
    t.scenes++;
    if (haveGenbutsu) t.pushChances++;
    if (new Set(picks).size > 1) t.disagree++;
  }
  return t;
}

describe("원형이 판에서 구분된다 (밀기/접기 장면)", () => {
  const ALL: ArchetypeName[] = [
    "attacker",
    "defender",
    "speedster",
    "valueHunter",
    "balanced",
    "wildcard",
  ];

  it("공격형과 수비형은 같은 장면에서 다른 패를 고른다", () => {
    const t = scanDanger(["attacker", "defender"]);
    const rate = t.disagree / t.scenes;
    // 이 장면 묶음의 실측 27.5%. 폭이 0.6이던 시절은 **10.8%** — 반드시 실패한다.
    expect(rate).toBeGreaterThan(0.18);
  });

  it("수비형은 공격형보다 뚜렷하게 덜 민다 (현물이 손에 있는 장면)", () => {
    const t = scanDanger(["attacker", "defender"]);
    const push = (a: ArchetypeName): number => (t.push.get(a) ?? 0) / t.pushChances;
    // 실측 차이 35.4%p. 폭이 0.6이던 시절은 **15.4%p** — 반드시 실패한다.
    expect(push("attacker") - push("defender")).toBeGreaterThan(0.22);
    // 그래도 수비형이 **아무것도 안 미는** 봇이 되지는 않는다 (접기는 규칙이 아니다)
    expect(push("defender")).toBeGreaterThan(0.2);
  });

  it("여섯 원형을 한 장면에 세우면 선택이 하나로 모이지 않는다", () => {
    const t = scanDanger(ALL);
    // 실측 27.5%. QA 2차 실측은 8.7%(= 91.3% 일치)였다.
    expect(t.disagree / t.scenes).toBeGreaterThan(0.18);
  });
});

/**
 * **스지도 성격이다** (`docs/00_MASTER_ARCHITECTURE.md §5.4`).
 *
 * `sujiTrust`는 분기가 아니라 `suji.waitFactor`가 지우는 량면 몫에 곱해지는 저울이다.
 * 그래서 "스지를 믿는 봇이 스지를 더 안전하게 본다"는 성질로만 검사한다 — 어떤 패를
 * 고르는지가 아니라, 같은 패의 **기대 실점 자체가** 갈리는지를 본다.
 */
describe("스지 신뢰가 위험 평가를 가른다", () => {
  it("스지가 선 패를 공격형은 수비형보다 싸게 본다", () => {
    // p1이 2p·8m을 버렸다 → 5p는 양스지, 5m은 무스지
    const sc = botScene({
      hand: "123m456m5p5s99s11z2z",
      turnCount: 10,
      wallLeft: 30,
      riichi: ["p1"],
      riichiTileIndex: { p1: 2 },
      discards: { p1: "2p8p1z", p2: "1z2z3z", p3: "1z2z3z" },
    });
    const suji: TileKind = { suit: "pin", rank: 5 };
    const lossFor = (a: ArchetypeName): number =>
      buildRead(sc.view, "p0", { mode: "hanchan", profile: profileOf(a) }).expectedLoss(suji);
    // 0.9 대 0.28 — 같은 양스지를 공격형이 확실히 싸게 본다
    expect(lossFor("attacker")).toBeLessThan(lossFor("defender") * 0.8);
    // 그래도 0은 아니다 — 스지는 샤보·간짱·단기를 지우지 못한다
    expect(lossFor("attacker")).toBeGreaterThan(0);
  });
});
