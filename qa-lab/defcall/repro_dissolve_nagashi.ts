/**
 * 확정 재현 — 파혼(meld_dissolve)이 **남의 유국만관을 되살린다**.
 *
 * 실제 퐁(엔진 액션)으로 강에서 패를 빼고, 그 퐁을 파혼으로 해체한 뒤 유국 정산을 돌린다.
 *  · 표준: 자기 버림패가 한 번이라도 울려 나가면 유국만관 불성립
 *    (`standardActions.ts` nagashiManganSeats — 강 장수 ≠ 버림 이력 길이).
 *  · 파혼은 가져왔던 1장을 **원 버린 사람의 강으로 되돌린다** → 두 수가 다시 같아져
 *    "울린 적 없다"로 판정되고, 없던 유국만관(8000)이 정산된다.
 *
 * 실행: tsx qa-lab/defcall/repro_dissolve_nagashi.ts
 */
import {
  ROUND_SETTLED,
  WALL,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { meldDissolve } from "../../packages/content/src/augments/meld_dissolve.js";

const SYS = "__system";
const withAug = (st: GameState, p: PlayerId, id: string): GameState => ({
  ...st,
  players: st.players.map((pl) => (pl.id === p ? { ...pl, augments: [...pl.augments, id] } : pl)),
});
const lastSettle = (g: any): RoundSettledPayload =>
  ([...g.engine.eventLog].reverse().find((e: any) => e.type === ROUND_SETTLED) as any).payload;

/** p1이 요구패만 버렸고 마지막 1z가 방금 버려진 상태 (p0가 퐁할 수 있다) */
function base(): GameState {
  const b = craft({
    hands: { p0: "11z234m345p55s9s", p1: "*", p2: "*", p3: "*" },
    discards: { p1: "19m19p19s2334z" },
    phase: "reaction", turnSeat: 1,
    lastDiscard: { player: "p1", spec: "1z" },
  });
  return withAug(b, "p0", "meld_dissolve");
}

function settleDraw(st: GameState): RoundSettledPayload {
  const emptied: GameState = {
    ...st,
    zones: { ...st.zones, [WALL]: { ...st.zones[WALL]!, tileIds: [] } },
    round: { ...st.round, phase: "turn.draw" },
  };
  const g = createStandardGameFromState(emptied);
  const r = g.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
  if (!r.ok) throw new Error((r as any).reason);
  return lastSettle(g);
}

function ponned(dissolve: boolean): { pond: number; hist: number; settle: RoundSettledPayload } {
  const g = createStandardGameFromState(base());
  installAugment(g.engine, meldDissolve, "p0");
  const st0 = g.engine.state;
  const ids = st0.zones["hand:p0"]!.tileIds.filter(
    (t) => st0.tiles[t]!.kind.suit === "wind" && st0.tiles[t]!.kind.rank === 1,
  );
  const rp = g.engine.submit({ player: "p0", type: "pon", payload: { tileIds: [ids[0], ids[1]] } });
  if (!rp.ok) throw new Error(`pon: ${(rp as any).reason}`);
  if (dissolve) {
    // 퐁 직후엔 turn.act이지만 lastDrawnTile이 null이라 파혼 validate는 통과한다
    const rd = g.engine.submit({ player: "p0", type: "dissolve_meld", payload: { meldIndex: 0 } });
    if (!rd.ok) throw new Error(`dissolve: ${(rd as any).reason}`);
  }
  const st = g.engine.state;
  return {
    pond: st.zones[discardsZone("p1")]?.tileIds.length ?? 0,
    hist: st.round.byPlayer.p1?.discardedKinds.length ?? 0,
    settle: settleDraw(st),
  };
}

for (const dissolve of [false, true]) {
  const r = ponned(dissolve);
  const sp = (r.settle as any).drawSpecial;
  console.log(
    `파혼=${dissolve ? "함" : "안함"}  p1 강=${r.pond}장 / 버림이력=${r.hist}개  ` +
    `→ 유국만관=${sp?.augId === "nagashi_mangan"}  deltas=${JSON.stringify(r.settle.deltas)}`,
  );
}
