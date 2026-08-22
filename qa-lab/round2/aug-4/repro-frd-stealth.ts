/**
 * 확정 후보 — free_riichi_discard(자유 선언) + stealth_riichi(스텔스 리치) 보유자의
 * 숨은 리치가 남의 손 교환 증강(hand_swap3·full_hand_swap·seat_swap)에 풀리면
 * **스냅샷만 남아 그 국이 통째로 벽돌**이 된다.
 *
 * free_riichi_discard의 conflicts 주석이 정확히 이 파괴를 A급이라 부르며 last_stand·
 * palm_flip 둘만 막아 두었는데, stealthBreak 경로는 목록에 없다.
 */
import {
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
  meldCountOf,
  scoringOptionsOf,
  winningKinds,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { stealthRiichi } from "../../../packages/content/src/augments/stealth_riichi.js";
import { freeRiichiDiscard } from "../../../packages/content/src/augments/free_riichi_discard.js";
import { handSwap3 } from "../../../packages/content/src/augments/hand_swap3.js";

function withAug(state: GameState, map: Record<string, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      map[p.id] === undefined ? p : { ...p, augments: [...(map[p.id] as string[])] },
    ),
  };
}

// p0: 텐파이(23456789m 111p 55s 에서 한 장 버리면 텐파이) — 14장
const base = craft({
  hands: {
    p0: "234567m11123p55s7m",
    p1: "19m19p19s1234567z",
    p2: "*",
    p3: "*",
  },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const state = withAug(base, {
  p0: ["stealth_riichi", "free_riichi_discard"],
  p1: ["hand_swap3"],
});

const game = createStandardGameFromState(state);
installAugment(game.engine, stealthRiichi, "p0", { yaku: game.yaku });
installAugment(game.engine, freeRiichiDiscard, "p0", { yaku: game.yaku });
installAugment(game.engine, handSwap3, "p1", { yaku: game.yaku });

const eng = game.engine;
const st0 = eng.state;
const p0hand = handIdsOf(st0, "p0");
const discardId = p0hand.at(-1) as TileId;

// ① p0가 스텔스 리치를 건다
const r1 = eng.submit({ player: "p0", type: "stealth_riichi", payload: { tileId: discardId } });
console.log("stealth_riichi submit:", r1.ok === true ? "ok" : JSON.stringify(r1));

const snapKeys = Object.keys(eng.state.augmentData).filter((k) => k.includes("free_riichi_discard:snap"));
console.log("snapshot key:", snapKeys);
const snap = eng.state.augmentData[snapKeys[0] as string] as TileId[];
console.log("snapshot ids:", snap);

const waitsBefore = winningKinds(
  snap.map((id) => eng.state.tiles[id]!.kind),
  meldCountOf(eng.state, "p0"),
  undefined,
  scoringOptionsOf(eng.state, eng.rules, "p0"),
).map(kindKey);
console.log("리치 시점 대기:", waitsBefore);
console.log("p0 riichi:", eng.state.round.byPlayer["p0"]?.riichi !== null);

// ② p1이 손패 3장 교환으로 p0을 지목 → 숨은 리치 해제
const aim = eng.submit({ player: "p1", type: "swap3", payload: { target: "p0" } });
console.log("aim:", aim.ok === true ? "ok" : JSON.stringify(aim));
const p1hand = handIdsOf(eng.state, "p1");
const gives = [...p1hand].sort((a, b) => a - b).slice(0, 3);
const g = eng.submit({ player: "p1", type: "swap3_give", payload: { gives } });
console.log("give:", g.ok === true ? "ok" : JSON.stringify(g));
const takes = [...handIdsOf(eng.state, "p0")].sort((a, b) => a - b).slice(0, 3);
const t = eng.submit({ player: "p1", type: "swap3_take", payload: { takes } });
console.log("take:", t.ok === true ? "ok" : JSON.stringify(t));

const after = eng.state;
console.log("p0 riichi after swap:", after.round.byPlayer["p0"]?.riichi);
const snapAfter = after.augmentData[snapKeys[0] as string] as TileId[] | undefined;
console.log("snapshot still present:", snapAfter !== undefined);

const physical = handIdsOf(after, "p0");
const stale = (snapAfter ?? []).filter((id) => !physical.includes(id));
console.log("스냅샷에 있는데 손에 없는 패:", stale, "→ 지금 어디에?");
for (const id of stale) {
  for (const p of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
    if (handIdsOf(after, p).includes(id)) console.log(`   tile ${id} (${kindKey(after.tiles[id]!.kind)}) 는 ${p}의 손에 있다`);
  }
}
// hand.winTileIds 가 무엇을 돌려주는가
const win = eng.rules.resolve<readonly TileId[] | null>("hand.winTileIds", {
  playerId: "p0",
  state: after,
});
console.log("hand.winTileIds(p0) =", win);
console.log("→ 스냅샷 그대로인가:", JSON.stringify(win) === JSON.stringify(snapAfter));
const kanOk = eng.rules.resolve<boolean>("call.kan.enabled", { playerId: "p0", state: after });
console.log("call.kan.enabled(p0) =", kanOk, "(리치가 풀렸는데도 깡 금지)");
