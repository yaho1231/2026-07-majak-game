/**
 * docs/59 B19 «퐁 후보 넓히기» 클라이언트 쪽 가드 (2026-09-25, U58).
 *
 * 서버(FlowController)가 동수의 결속·양극 국에서 퐁 재료를 서명(종류·적도라)마다 하나씩 더 낸다.
 * 클라이언트는 새 코드 없이 B17 후로 고르기(callPick)로 받는다 — [퐁] 버튼 하나에 손패 클릭으로 좁힌다.
 * 이 파일은 그 전제(«버튼이 늘지 않고 손패로 고른다»)가 실제 후보 모양에서 성립하는지 본다.
 */

import { describe, expect, it } from "vitest";
import type { ActionOption, PlayerView } from "@majak/core";
import { callPickRemaining, resolveCallPick } from "../src/callPick.js";
import type { CallPick } from "../src/callPick.js";

type T = { suit: "man" | "pin" | "sou"; rank: number };
function viewOf(hand: Record<number, T>): PlayerView {
  const tiles: Record<number, unknown> = {};
  for (const [id, t] of Object.entries(hand)) {
    tiles[Number(id)] = { kind: { suit: t.suit, rank: t.rank }, attrs: {} };
  }
  return {
    playerId: "me",
    tiles,
    zones: { "hand:me": { tileIds: Object.keys(hand).map(Number) } },
  } as unknown as PlayerView;
}
const pon = (tileIds: number[]): ActionOption => ({ type: "pon", payload: { tileIds } }) as ActionOption;
function pickOf(view: PlayerView, options: ActionOption[], picks: number[] = []): CallPick {
  return { type: "pon", options, picks, remaining: callPickRemaining(view, options, picks), cursor: null };
}

describe("U58 동수의 결속 퐁 — 손패로 어느 무늬 두 장을 쓸지 고른다", () => {
  // 1만 버림 · 손패 1통(1)·1삭(2)·1통(3) → 서버 후보 [1통,1삭](예전 첫 후보) · [1통,1통](새 후보)
  const view = viewOf({ 1: { suit: "pin", rank: 1 }, 2: { suit: "sou", rank: 1 }, 3: { suit: "pin", rank: 1 } });
  const options = [pon([1, 2]), pon([1, 3])];

  it("1삭을 누르면 [1통,1삭] 후보가 곧바로 나간다(서버 옵션 객체 그대로)", () => {
    const r = resolveCallPick(view, pickOf(view, options), 2);
    expect(r?.submit).toBe(options[0]);
  });

  it("1통 두 장을 누르면 1삭을 남기는 [1통,1통] 후보가 나간다", () => {
    const first = resolveCallPick(view, pickOf(view, options), 3);
    expect(first?.submit).toBeNull();
    const second = resolveCallPick(view, pickOf(view, options, first!.picks), 1);
    expect(second?.submit).toBe(options[1]);
  });
});
