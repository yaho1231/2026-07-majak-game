/**
 * 무장해제 — **잠긴 내 증강을 봇이 자기 손 값어치에서 빼는가.**
 *
 * 상대를 볼 때는 전부 `effectiveAugmentsOf`를 통과시키면서(`bot/danger.ts` 리치 신뢰·
 * 위협 배수, `bot/collect.ts`) `read.ts`의 **내 쪽만** 원본 `player.augments`를 읽고
 * 있었다(`qa-lab/findings/bot.md` 확정 2 · `qa-lab/bot/disarm_probe.ts`).
 *
 * 그래서 사람이 봇의 큰손·뚫린 천장·만년 오야를 잠근 바로 그 국에, 봇은 자기 손을
 * 최대 35% 비싸게 세고 그만큼 더 밀었다 — 잠근 대가로 얻어야 할 "저 봇이 접는다"가
 * 일어나지 않는다. `handRulesOf`도 같은 목록을 봐서 **역 없이 화료·오픈 리치**가
 * 잠긴 뒤에도 봇은 그 규칙이 살아 있다고 믿었다.
 */

import { describe, expect, it } from "vitest";
import type { PlayerView } from "@majak/core";
import { buildRead } from "../src/bot/read.js";
import { readThreats } from "../src/bot/danger.js";
import { botScene } from "./botTestView.js";

/** 값 배수가 큰 축 하나 — 만년 오야(threat 1.4 · value 1.35) */
const AUG = "eternal_dealer";

function scene(opts: { lockMine?: boolean; lockOpp?: boolean; aug?: string }): PlayerView {
  const aug = opts.aug ?? AUG;
  const s = botScene({
    hand: "123m456p789s22m5p",
    turnCount: 8,
    riichi: ["p1"],
    discards: { p1: "1m9m1p9p" },
    riichiTileIndex: { p1: 0 },
  });
  const v = s.view as PlayerView & { augmentView: Record<string, unknown> };
  for (const p of v.players) {
    if (p.id === "p0" || p.id === "p1") (p as { augments: string[] }).augments = [aug];
  }
  v.augmentView = { ...(v.augmentView ?? {}) };
  // 전원 공개 지목 채널 — 시전자 p2/p3가 각각 상대의 증강을 잠갔다
  if (opts.lockMine === true) v.augmentView["disarm:p2"] = { target: "p0", augmentId: aug };
  if (opts.lockOpp === true) v.augmentView["disarm:p3"] = { target: "p1", augmentId: aug };
  return v;
}

const myValue = (v: PlayerView): number =>
  buildRead(v, "p0", { mode: "hanchan" }).valueOf({ plan: null }).points;
const oppThreat = (v: PlayerView): number =>
  readThreats(v, "p0", []).find((t) => t.player === "p1")?.value ?? 0;

describe("내 증강이 잠기면 내 손도 싸진다", () => {
  it("잠긴 뒤의 값어치가 잠기기 전보다 낮다 (예전엔 한 푼도 안 내려갔다)", () => {
    const base = myValue(scene({}));
    const locked = myValue(scene({ lockMine: true }));
    expect(locked).toBeLessThan(base);
  });

  it("잠기면 그 증강을 아예 안 든 것과 같은 값이 된다", () => {
    const none = (() => {
      const v = scene({});
      for (const p of v.players) (p as { augments: string[] }).augments = [];
      return myValue(v);
    })();
    expect(myValue(scene({ lockMine: true }))).toBeCloseTo(none, 5);
  });

  it("남의 증강이 잠긴 것으로 내 손이 싸지지는 않는다 (대상을 제대로 가린다)", () => {
    expect(myValue(scene({ lockOpp: true }))).toBeCloseTo(myValue(scene({})), 5);
  });

  it("상대 쪽 읽기는 종전대로다 — 고친 것은 비대칭뿐이다", () => {
    expect(oppThreat(scene({ lockOpp: true }))).toBeLessThan(oppThreat(scene({})));
    expect(oppThreat(scene({ lockMine: true }))).toBeCloseTo(oppThreat(scene({})), 5);
  });
});

describe("잠긴 규칙은 봇에게도 꺼져 있다", () => {
  it("무형화료가 잠기면 봇은 다시 '역이 필요하다'고 읽는다", () => {
    const live = buildRead(scene({ aug: "yakuless_win" }), "p0", { mode: "hanchan" });
    const locked = buildRead(scene({ aug: "yakuless_win", lockMine: true }), "p0", {
      mode: "hanchan",
    });
    expect(live.noYakuRequired).toBe(true);
    expect(locked.noYakuRequired).toBe(false);
  });
});
