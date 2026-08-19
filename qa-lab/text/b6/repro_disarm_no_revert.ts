/**
 * 무장해제(disarm) detail:
 *   "**손패 장수처럼 그 증강이 이미 바꿔 놓은 것이 있으면 잠기는 순간 원래대로 되돌아간다**
 *    — 진짜 용을 잠그면 필요 없는 패 3장이 패산으로 돌아가며 평범한 손패로 복귀한다."
 *
 * 실제로 `AUGMENT_DISARMED`를 듣고 스스로 원상복구하는 증강은 카탈로그 113종 중
 * **둘뿐**이다(true_dragon.ts:137, picky_eater.ts:189). 손패를 실제로 바꿔 놓는 다른
 * 증강 — 삼원의 의지(잡패 2장을 삼원패로 덮어씀) 같은 것 — 은 잠겨도 그 결과가 그대로
 * 남는다. "대삼원을 세운 저 사람의 삼원의 의지를 잠가 손을 되돌린다"는, 문구를 그대로
 * 믿는 사람의 유일한 대응책이 통하지 않는다.
 */
import { DISARMED_SOURCES_KEY, createStandardGameFromState, installAugment, kindKey } from "@majak/core";
import type { GameState } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { threeDragonsWill } from "../../../packages/content/src/augments/three_dragons_will.js";
import { disarm } from "../../../packages/content/src/augments/disarm.js";

const dragons = (st: GameState): string =>
  (st.zones["hand:p0"]?.tileIds ?? [])
    .map((id) => kindKey(st.tiles[id]!.kind))
    .filter((k) => k.startsWith("dragon"))
    .sort()
    .join(" ");

// ── ① p0가 삼원의 의지를 발동해 대삼원을 세운다 ──────────────────────
const base = craft({
  // 白×3 · 發×3 · 中×1 + 잡패 6장
  hands: { p0: "555z666z7z234m567p", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
});
const s0: GameState = {
  ...base,
  players: base.players.map((p) =>
    p.id === "p0"
      ? { ...p, augments: ["three_dragons_will"] }
      : p.id === "p1"
        ? { ...p, augments: ["disarm"] }
        : p,
  ),
};
const g1 = createStandardGameFromState(s0, undefined, []);
installAugment(g1.engine, threeDragonsWill, "p0", { yaku: g1.yaku });
installAugment(g1.engine, disarm, "p1", { yaku: g1.yaku });

console.log("발동 전 p0 손의 삼원패:", dragons(g1.engine.state));
const use = g1.engine.submit({ player: "p0", type: "dragons_will", payload: {} });
console.log("삼원의 의지 발동:", use.ok);
console.log("발동 후 p0 손의 삼원패:", dragons(g1.engine.state), "← 대삼원 성립");

// ── ② p1의 순이 오자 그 증강을 무장해제한다 ──────────────────────────
const mid = g1.engine.state;
const s1: GameState = { ...mid, round: { ...mid.round, turnSeat: 1 } };
const g2 = createStandardGameFromState(s1, undefined, []);
installAugment(g2.engine, threeDragonsWill, "p0", { yaku: g2.yaku });
installAugment(g2.engine, disarm, "p1", { yaku: g2.yaku });

const d = g2.engine.submit({
  player: "p1",
  type: "disarm_lock",
  payload: { target: "p0", augmentId: "three_dragons_will" },
});
console.log("\n무장해제(p0의 three_dragons_will):", d.ok, d.ok ? "" : (d as { reason?: string }).reason);
console.log("  무장해제 목록:", JSON.stringify(g2.engine.state.augmentData[DISARMED_SOURCES_KEY]));
console.log("잠근 뒤 p0 손의 삼원패:", dragons(g2.engine.state));
console.log(
  "  → 기대(문구): 잡패 2장으로 되돌아가 대삼원이 무너진다 / 실제: 그대로 남는다",
);
