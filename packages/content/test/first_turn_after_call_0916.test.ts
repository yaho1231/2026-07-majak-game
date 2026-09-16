/**
 * 2026-09-16 QA 5라운드 — 약속 검사기(B-4) §5 «조건 위반 (첫 순)» 13건의 진위 판정.
 *
 * 장면: 보유자(p0)가 이 국에 **아직 한 장도 버리지 않은 채** 남의 버림패를 퐁해 멘쯔 1개가
 * 생긴 직후의 `turn.act` (`discardCount = 0`, `melds = 1`, `lastDrawnTile = null`,
 * `round.firstTurn = false`, `goAroundBroken = true`). 검사기는 이 장면의 발동을
 * «버림/멘쯔 뒤 발동»으로 찍었다.
 *
 * 판정: **검사기 오판** — 이 장면에서 6종은 «열려야 한다».
 *
 * 근거 — 이 저장소의 «내 첫 순» 규약은 «내가 아직 한 장도 버리지 않은 내 순»
 * (`discardCount === 0`)이고, 코어의 `round.firstTurn`(첫 바퀴·누구든 울면 false)을
 * 쓰지 않는다. 2026-07-31·08-25 사용자 보고(«앞자리가 퐁 한 번 하면 내 창이 사라진다»)로
 * 못박힌 결정이다:
 *   - `dead_wall_master.ts` canSwap 주석, `full_hand_swap.ts` validate 주석,
 *     `rank_gate.ts` atFirstTurn 주석, `shape_first_turn_0827.test.ts` 헤더.
 * 카드 문구도 이 규약과 어긋나지 않는다:
 *   - blood_contract «첫 타패 전», broken_border·mixed_triplet «한 장이라도 버린 뒤에는
 *     발동할 수 없다» — 버림만 기준.
 *   - dead_wall_master·discard_lock·jackpot «첫 순 / 국 시작» — 규약의 정의를 따른다.
 * 멘쯔까지 보는 카드는 문구가 그렇게 약속한 것뿐이다: big_hand·rank_gate
 * («버리지도 울지도 전», `meldCountOf === 0`), full_hand_swap·seat_swap·table_flip
 * («치·퐁 직후 불가», `lastDrawnTile !== null`). 이 테스트는 그 대조군도 함께 못박는다.
 *
 * 검사기 쪽 수정: `qa-lab/round5/promise/judge.ts` 의 «첫 순» 판정에서 멘쯔 수는
 * 위 대조군 5종에만 세고, 나머지는 버림 수만 본다.
 */

import { describe, expect, it } from "vitest";
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";
import { craft } from "./helpers.js";

import { bloodContract } from "../src/augments/blood_contract.js";
import { brokenBorder } from "../src/augments/broken_border.js";
import { deadWallMaster } from "../src/augments/dead_wall_master.js";
import { discardLock } from "../src/augments/discard_lock.js";
import { jackpot } from "../src/augments/jackpot.js";
import { mixedTriplet } from "../src/augments/mixed_triplet.js";
import { bigHand } from "../src/augments/big_hand.js";
import { rankGate } from "../src/augments/rank_gate.js";

/** p0가 첫 타패 전에 p3의 2z를 퐁한 직후 — 자기 첫 turn.act, 쯔모패 없음 */
function afterCallScene(id: string): GameState {
  const base = craft({
    hands: { p0: "123m456p789s1z2z", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "222z", from: "p3" }] },
    discards: { p3: "9m" },
    phase: "turn.act",
    turnSeat: 0,
  });
  return {
    ...base,
    round: { ...base.round, firstTurn: false, goAroundBroken: true },
    players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: [id] } : p)),
  };
}

function build(id: string, def: AugmentDef) {
  const st = afterCallScene(id);
  const g = createStandardGameFromState(st, undefined, [def]);
  installAugment(g.engine, def, "p0", { yaku: g.yaku });
  const s = g.engine.state;
  expect(s.round.byPlayer.p0?.discardCount).toBe(0);
  expect(s.round.byPlayer.p0?.melds.length).toBe(1);
  expect(s.round.lastDrawnTile).toBeNull();
  return g;
}

function optionsFor(id: string, def: AugmentDef): string[] {
  const g = build(id, def);
  return g.engine.turnOptionProviders.flatMap((p) => p(g.engine.state, "p0")).map((o) => o.type);
}

const OPEN = [
  { id: "blood_contract", def: bloodContract, action: "blood_contract_declare" },
  { id: "broken_border", def: brokenBorder, action: "declare_broken_border" },
  { id: "dead_wall_master", def: deadWallMaster, action: "dw_swap" },
  { id: "discard_lock", def: discardLock, action: "seal_hands" },
  { id: "jackpot", def: jackpot, action: "jackpot_roll" },
  { id: "mixed_triplet", def: mixedTriplet, action: "declare_mixed_triplet" },
];

describe.each(OPEN)("$id — 첫 타패 전에 울어 멘쯔가 생긴 뒤의 내 첫 순에도 열린다 (규약: discardCount === 0)", ({ id, def, action }) => {
  it(`«${action}» 이 제시된다`, () => {
    expect(optionsFor(id, def)).toContain(action);
  });
});

/**
 * 대조군 — 문구가 «버리지도 울지도 전»까지 약속하는 카드는 같은 장면에서 validate 가
 * 거절한다. (big_hand 는 버튼 자체는 노출하고 validate 만 막는다 — 제출 결과로 본다.)
 */
const CLOSED = [
  { id: "big_hand", def: bigHand, action: "declare_big_hand", payload: {} },
  { id: "rank_gate", def: rankGate, action: "rank_gate_mark", payload: { target: "p1" } },
];

describe.each(CLOSED)("$id — 문구가 «울기 전»까지 약속하므로 같은 장면에서 닫힌다 (대조군)", ({ id, def, action, payload }) => {
  it(`«${action}» 제출이 거절된다`, () => {
    const g = build(id, def);
    const res = g.engine.submit({ player: "p0", type: action, payload });
    expect(res.ok).toBe(false);
  });
});
