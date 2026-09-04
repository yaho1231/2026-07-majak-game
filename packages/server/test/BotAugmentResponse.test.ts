/**
 * **증강에 대한 대응이 하나로 정해져 있지 않다** (2026-09-04 사용자 지적).
 *
 * "개벽 같은 증강을 썼다고 모든 봇이 무조건 수비만 하는 게 아니라, 형태에 따라 수비형은
 * 수비하고 공격형은 무시하고 자패도 내고 — 그렇다고 수비형이 손이 빠르고 강한데 수비만
 * 해야 하는 건 절대 아니다." 즉 대응은 **규칙이 아니라 판단**이어야 하고, 판단의 재료는
 *
 *   1. 상대의 실제 위협 — 언제 터졌나(`collect.ripeness`) · 그 손이 아직 서는가
 *      (`collect.feasibilityOf`: 밖에 다 보이는 종류, 본인이 발동 뒤 버린 종류)
 *   2. 내 손 — 몇 샹텐인가, 얼마짜리인가 (`discard.lineEV`의 기대 획득)
 *   3. 내 처지 — 순위·남은 국 (`match.riskAppetite`)
 *   4. 성격 — 신호를 얼마나 믿는가(`profile.credence`) · 실점을 어떻게 저울질하는가(`aggression`)
 *
 * 그리고 한 장 뒤에 위험패가 몇 장 더 남는지로 미는 지평이 줄어야(`discard.pushHorizonOf`)
 * "자패 이거 하나만 내면 끝인데"가 계산에 잡힌다. 이 파일은 그 넷이 각각 답을 바꾸는지를 본다.
 */

import { describe, expect, it } from "vitest";
import { kindKey } from "@majak/core";
import type { TileKind } from "@majak/core";
import { botScene, h } from "./botTestView.js";
import { buildRead } from "../src/bot/read.js";
import { bidDiscard, bidRiichi } from "../src/bot/discard.js";
import { profileOf } from "../src/bot/profile.js";
import type { ArchetypeName } from "../src/bot/profile.js";
import { readCollect } from "../src/bot/collect.js";
import type { FiredSight } from "../src/bot/collect.js";
import { OpponentMemory } from "../src/bot/opponents.js";

const GENESIS = { augments: { p1: ["genesis"] }, augmentView: { "genesis:p1": true } };
const BASE = { turnCount: 8, wallLeft: 40, discards: { p1: "9p9s", p2: "1m9m", p3: "2p9m" } };
/** 량면 텐파이 직전 — 1z 한 장만 내면 5-8m 대기 (자패는 이 한 장뿐) */
const FAST = "234m567p456s88s67m1z";

const seen = (sight: FiredSight) => (): FiredSight => sight;

function pick(
  a: ArchetypeName,
  opts: Parameters<typeof botScene>[0],
  sight?: FiredSight,
): string {
  const sc = botScene(opts);
  const read = buildRead(sc.view, "p0", {
    mode: "hanchan",
    profile: profileOf(a),
    ...(sight === undefined ? {} : { sightOf: () => sight }),
  });
  // 실제 봇처럼 버림과 리치가 같은 축에서 겨룬다 (`BotAgent` 턴 소비 층)
  const discard = bidDiscard(read, sc.discardOptions(), null, profileOf(a));
  const riichi = bidRiichi(read, sc.riichiOptions(), null, profileOf(a));
  const bid = riichi !== null && riichi.value > (discard?.value ?? -Infinity) ? riichi : discard;
  const id = (bid?.option.payload as { tileId?: number } | undefined)?.tileId;
  return kindKey(sc.view.tiles[id ?? -1]?.kind as TileKind);
}

describe("개벽 — 상대의 실제 위협을 읽는다 (표의 값이 아니라)", () => {
  it("방금 터진 개벽은 여섯 순 묵은 개벽보다 텐파이 하한이 낮다", () => {
    const sc = botScene({ hand: FAST, ...BASE, ...GENESIS });
    const fresh = readCollect(sc.view, "p1", { sightOf: seen({ turn: 8, riverLen: 2 }) });
    const ripe = readCollect(sc.view, "p1", { sightOf: seen({ turn: 2, riverLen: 0 }) });
    const unknown = readCollect(sc.view, "p1");
    expect(fresh.minLevel).toBeLessThan(ripe.minLevel * 0.6);
    // 언제부터인지 모르면 익은 것으로 본다 (덜 무서워하는 오차는 방총으로 갚는다)
    expect(unknown.minLevel).toBeCloseTo(ripe.minLevel, 5);
    expect(fresh.tags.some((t) => t.startsWith("genesis:ripe:"))).toBe(true);
  });

  it("자패 종류가 밖에 다 나와 자일색이 안 서면 실점 추정이 내려간다", () => {
    const alive = botScene({ hand: FAST, ...BASE, ...GENESIS });
    // 東·南·西·北이 석 장씩 보인다 → 살아 있는 자패는 삼원패 셋뿐
    const dead = botScene({
      hand: FAST,
      ...BASE,
      discards: { p1: "9p9s", p2: "1m9m1z1z2z2z3z3z4z4z", p3: "2p9m1z2z3z4z" },
      ...GENESIS,
    });
    const a = readCollect(alive.view, "p1");
    const d = readCollect(dead.view, "p1");
    expect(d.hanBonus).toBeLessThan(a.hanBonus * 0.5);
    expect(d.hanBonus).toBeGreaterThan(0); // 혼일색·역패는 남는다 — 0으로 지우지 않는다
    expect(d.tags.some((t) => t.startsWith("genesis:feas:"))).toBe(true);
  });

  it("발동 뒤 자패를 세 종류나 버린 사람의 자일색은 물 건너갔다", () => {
    const sc = botScene({
      hand: FAST,
      ...BASE,
      discards: { p1: "9p9s5z6z7z", p2: "1m9m", p3: "2p9m" },
      ...GENESIS,
    });
    const before = readCollect(sc.view, "p1", { sightOf: seen({ turn: 8, riverLen: 5 }) });
    const after = readCollect(sc.view, "p1", { sightOf: seen({ turn: 3, riverLen: 2 }) });
    expect(after.hanBonus).toBeLessThan(before.hanBonus);
    // 버린 자패는 현물이고, 아직 안 버린 자패는 여전히 위험하다
    expect(after.riskOf(h("1z")[0]!)).toBeGreaterThan(1);
  });

  it("손이 통째로 자패인 사람에게 수패는 거의 안전하다", () => {
    const sc = botScene({ hand: FAST, ...BASE, ...GENESIS });
    const read = readCollect(sc.view, "p1");
    expect(read.riskOf(h("5p")[0]!)).toBeLessThan(1);
    expect(read.riskOf(h("5p")[0]!)).toBeGreaterThan(0); // 0은 아니다 — 남은 수패로 단기가 선다
    expect(read.riskOf(h("1z")[0]!)).toBeGreaterThan(2);
  });

  it("거신병의 국사는 요구패 한 종이 넉 장 다 보이면 끝이다 (왕의 징표는 예외)", () => {
    const spec = (augments: string[]) =>
      botScene({
        hand: "234m567p456s88s67m1z",
        turnCount: 10,
        discards: { p1: "5p6p", p2: "9m9m9m", p3: "9m2p" },
        augments: { p1: augments },
        augmentView: { "giant_god:p1": true },
      });
    const plain = readCollect(spec(["giant_god"]).view, "p1");
    const royal = readCollect(spec(["giant_god", "royal_kokushi"]).view, "p1");
    expect(plain.hanBonus).toBeLessThan(royal.hanBonus * 0.5);
  });
});

describe("성격 — 같은 신호를 다르게 믿는다", () => {
  it("공격형은 개벽 상대의 텐파이 확률을 수비형보다 낮게 잡지만, 실점 추정은 같다", () => {
    const sc = botScene({ hand: FAST, ...BASE, ...GENESIS });
    const atk = readCollect(sc.view, "p1", { credence: profileOf("attacker").credence });
    const def = readCollect(sc.view, "p1", { credence: profileOf("defender").credence });
    expect(atk.minLevel).toBeLessThan(def.minLevel);
    // 자일색은 누가 봐도 역만이다 — 태도가 값어치를 바꾸지는 않는다
    expect(atk.hanBonus).toBeCloseTo(def.hanBonus, 5);
    // 균형형(0.5)은 표의 값 그대로
    const bal = readCollect(sc.view, "p1", { credence: 0.5 });
    expect(bal.minLevel).toBeCloseTo(readCollect(sc.view, "p1").minLevel, 5);
  });
});

describe("대응은 규칙이 아니라 판단이다 — 손·처지·성격이 각각 답을 바꾼다", () => {
  const RIPE: FiredSight = { turn: 2, riverLen: 0 };

  it("싼 텐파이: 공격형·속공형은 자패를 내고 텐파이를 잡고, 수비형·타점형은 접는다", () => {
    expect(pick("attacker", { hand: FAST, ...BASE, ...GENESIS }, RIPE)).toBe("wind1");
    expect(pick("speedster", { hand: FAST, ...BASE, ...GENESIS }, RIPE)).toBe("wind1");
    expect(pick("defender", { hand: FAST, ...BASE, ...GENESIS }, RIPE)).not.toBe("wind1");
    expect(pick("valueHunter", { hand: FAST, ...BASE, ...GENESIS }, RIPE)).not.toBe("wind1");
  });

  it("비싼 텐파이(도라 다섯)면 수비형도 자패를 내고 싸운다", () => {
    // 도라 3m·8s(머리라 둘) + 적5p·적5s = 다섯
    const rich = { hand: FAST, doraIndicator: "2m7s", redAt: [3, 7], ...BASE, ...GENESIS };
    expect(pick("defender", rich, RIPE)).toBe("wind1");
    expect(pick("valueHunter", rich, RIPE)).toBe("wind1");
  });

  it("반드시 화료해야 하는 처지(올라스 꼴찌)면 균형형도 민다 — 선두면 접는다", () => {
    const allLast = { hand: FAST, ...BASE, ...GENESIS, prevalentWind: 2, roundNumber: 4 };
    const last = { ...allLast, scores: { p0: 5000, p1: 35000, p2: 30000, p3: 30000 } };
    const lead = { ...allLast, scores: { p0: 45000, p1: 20000, p2: 20000, p3: 15000 } };
    expect(pick("balanced", last, RIPE)).toBe("wind1");
    expect(pick("balanced", lead, RIPE)).not.toBe("wind1");
  });

  it("방금 터진 개벽이면 균형형은 아직 자패를 낸다 (뒤집힌 직후는 뒤죽박죽이다)", () => {
    const fresh: FiredSight = { turn: 8, riverLen: 2 };
    expect(pick("balanced", { hand: FAST, ...BASE, ...GENESIS }, fresh)).toBe("wind1");
    // 타점형은 방금 터진 개벽에는 내고, 여섯 순 묵은 개벽에는 접는다 — 시간이 답을 바꾼다
    expect(pick("valueHunter", { hand: FAST, ...BASE, ...GENESIS }, fresh)).toBe("wind1");
    expect(pick("valueHunter", { hand: FAST, ...BASE, ...GENESIS }, RIPE)).not.toBe("wind1");
  });

  it("느린 손(2샹텐)이면 공격형도 자패를 안 낸다", () => {
    const slow = { hand: "13m57p29s88s67m1z4s", ...BASE, ...GENESIS };
    expect(pick("attacker", slow, RIPE)).not.toBe("wind1");
  });

  it("자패가 두 장 남은 1샹텐이면 공격형도 접는다 — 한 장 뒤에 또 한 장이다", () => {
    const two = { hand: "234m567p45s88s67m1z2z", ...BASE, ...GENESIS };
    expect(pick("attacker", two, RIPE)).not.toMatch(/wind/);
    expect(pick("defender", two, RIPE)).not.toMatch(/wind/);
  });

  it("자패 종류가 밖에 많이 나와 있으면 수비형도 그 자패를 낸다 (읽기가 답을 바꾼다)", () => {
    const dead = {
      hand: FAST,
      ...BASE,
      discards: { p1: "9p9s", p2: "1m9m1z", p3: "2p9m1z" },
      ...GENESIS,
    };
    expect(pick("defender", dead, RIPE)).toBe("wind1");
  });
});

describe("발동을 처음 본 순간을 기억한다 (OpponentMemory)", () => {
  it("채널이 켜진 것을 처음 본 순·바닥 장수를 적고, 그 뒤로는 바꾸지 않는다", () => {
    const mem = new OpponentMemory();
    mem.observe(botScene({ hand: FAST, turnCount: 4, discards: { p1: "9p" } }).view, "p0");
    expect(mem.firedSightOf("p1", "genesis")).toBeUndefined();
    mem.observe(
      botScene({ hand: FAST, turnCount: 5, discards: { p1: "9p9s" }, ...GENESIS }).view,
      "p0",
    );
    expect(mem.firedSightOf("p1", "genesis")).toEqual({ turn: 5, riverLen: 2 });
    mem.observe(
      botScene({ hand: FAST, turnCount: 9, discards: { p1: "9p9s5z6z" }, ...GENESIS }).view,
      "p0",
    );
    expect(mem.firedSightOf("p1", "genesis")).toEqual({ turn: 5, riverLen: 2 });
  });

  it("국이 바뀌면 기록이 비워진다", () => {
    const mem = new OpponentMemory();
    mem.observe(botScene({ hand: FAST, turnCount: 5, ...GENESIS }).view, "p0");
    expect(mem.firedSightOf("p1", "genesis")).toBeDefined();
    mem.observe(botScene({ hand: FAST, turnCount: 1, roundNumber: 2 }).view, "p0");
    expect(mem.firedSightOf("p1", "genesis")).toBeUndefined();
  });
});
