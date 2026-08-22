/**
 * 자유 선언(free_riichi_discard) — **숨은 리치가 남에게 깨지면 스냅샷만 남아 그 국이 벽돌이 된다.**
 *
 * free_riichi_discard 자신이 그 위험을 알고 `conflicts: ["last_stand","palm_flip"]` 로
 * "리치를 푸는 증강"을 배제해 뒀다(주석: "A급 파괴 … 그 국이 통째로 벽돌"). 그런데
 * conflicts는 **같은 사람의 드래프트 안**에서만 작동한다. 리치를 푸는 경로가 하나 더 있다 —
 * `stealthBreak.STEALTH_RIICHI_BROKEN` 이고, 그것을 내는 것은 **상대의** 증강
 * (full_hand_swap · hand_swap3 · seat_swap)이다. 게다가 stealth_riichi 쪽은
 * free_riichi_discard를 "잠그지 않는 것"으로 명시해 두어 조합이 그대로 열려 있다.
 */
import { createStandardGameFromState, handIdsOf, installAugment } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { freeRiichiDiscard } from "../../../packages/content/src/augments/free_riichi_discard.js";
import { stealthRiichi } from "../../../packages/content/src/augments/stealth_riichi.js";
import { fullHandSwap } from "../../../packages/content/src/augments/full_hand_swap.js";

function withAugs(s: GameState, m: Record<string, string[]>): GameState {
  return { ...s, players: s.players.map((p) => (m[p.id] ? { ...p, augments: [...m[p.id]!] } : p)) };
}
const base = craft({
  hands: { p0: "123m456m789m123p11s", p1: "456p789p234s567s99s", p2: "*", p3: "*" },
  phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
});
const state = withAugs(base, { p0: ["stealth_riichi", "free_riichi_discard"], p1: ["full_hand_swap"] });
const game = createStandardGameFromState(state);
installAugment(game.engine, freeRiichiDiscard, "p0", { yaku: game.yaku });
installAugment(game.engine, stealthRiichi, "p0", { yaku: game.yaku });
installAugment(game.engine, fullHandSwap, "p1", { yaku: game.yaku });

const snap = (): unknown => {
  const st = game.engine.state;
  const k = Object.keys(st.augmentData).find((x) => x.startsWith("free_riichi_discard:snap"));
  return k === undefined ? null : st.augmentData[k];
};
const winIds = (): unknown =>
  game.engine.rules.resolve("hand.winTileIds", { playerId: "p0", state: game.engine.state });

// ① p0이 숨은 리치를 건다
const hand = handIdsOf(game.engine.state, "p0");
const drawn = game.engine.state.round.lastDrawnTile;
const kk = (id: number): string => { const k = game.engine.state.tiles[id]!.kind; return `${k.suit}${k.rank}`; };
const pick = hand.filter((id) => kk(id) === "sou1")[0]!;
let r = game.engine.submit({ player: "p0", type: "stealth_riichi", payload: { tileId: pick } });
console.log("숨은 리치 ok =", r.ok, JSON.stringify(r));
console.log("  riichi =", game.engine.state.round.byPlayer.p0?.riichi !== null, "| 스냅샷 =", (snap() as unknown[])?.length, "장");

// ② p1의 차례로 넘겨 통째로 바꾸기로 p0을 턴다 (숨은 리치는 대상 허용 — riichiBlocksSwap)
const st2 = game.engine.state;
const forced: GameState = {
  ...st2,
  round: { ...st2.round, phase: "turn.act", turnSeat: 1, turnCount: 1, lastDrawnTile: handIdsOf(st2, "p1")[0]! },
};
const g2 = createStandardGameFromState(forced);
installAugment(g2.engine, freeRiichiDiscard, "p0", { yaku: g2.yaku });
installAugment(g2.engine, stealthRiichi, "p0", { yaku: g2.yaku });
installAugment(g2.engine, fullHandSwap, "p1", { yaku: g2.yaku });
r = g2.engine.submit({ player: "p1", type: "hand_swap", payload: { target: "p0" } });
console.log("p1의 통째로 바꾸기 ok =", r.ok, (r as { error?: string }).error ?? "");

const st3 = g2.engine.state;
const k = Object.keys(st3.augmentData).find((x) => x.startsWith("free_riichi_discard:snap"));
const snapIds = (k === undefined ? [] : st3.augmentData[k]) as number[];
const nowHand = new Set(handIdsOf(st3, "p0"));
const p1Hand = new Set(handIdsOf(st3, "p1"));
console.log("  p0 riichi =", st3.round.byPlayer.p0?.riichi ?? null);
console.log("  스냅샷 남아 있음 =", snapIds.length, "장");
const gone = snapIds.filter((id) => !nowHand.has(id));
console.log("  그중 p0 손에 없는 패 =", gone.length, "장 (p1 손으로 넘어간 것 =", gone.filter((id) => p1Hand.has(id)).length, "장)");
const resolved = g2.engine.rules.resolve("hand.winTileIds", { playerId: "p0", state: st3 }) as number[] | null;
console.log("  hand.winTileIds(p0) =", resolved === null ? "null(정상)" : `${resolved.length}장 옛 손패`);
console.log(st3.round.byPlayer.p0?.riichi == null && (resolved?.length ?? 0) > 0 && gone.length > 0
  ? "BUG: 리치는 풀렸는데 스냅샷이 남아, 화료·후리텐·유국 텐파이가 **남의 손에 있는 패**로 계산된다"
  : "OK");
