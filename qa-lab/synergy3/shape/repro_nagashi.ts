/**
 * 유국역만(nagashi_yakuman) × 역만 방어술 / 거신병 / 유국 계열.
 *
 * 기대(미리 적음):
 *  ① 유국역만 단독 — 자(子) 보유자면 오야 16000 + 자 8000×2 = 32000 수령, 노텐 벌점과 함께.
 *  ② 방어술 보유자는 면제되고 **화료자 수령은 줄지 않는다**(뱅크가 낸다) → 총합 드리프트 +.
 *  ③ 거신병(giant_god)과 함께 — 거신병의 발동 조건은 "국사 13종을 전부 버려 뒀다"이고
 *     그 13종은 전부 요구패다. 즉 **거신병 조건 = 유국역만 조건의 부분집합**이다.
 *     각성하면 거신병이 버림 이력을 갈아 끼우므로(요구패 이력 삭제 + 손패 13장 이력 추가)
 *     유국역만이 조용히 깨질 것이다. 어느 카드에도 그 말은 없다.
 */
import {
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  WALL,
  createStandardGameFromState,
  createZone,
  installAugment,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { nagashiYakuman } from "../../../packages/content/src/augments/nagashi_yakuman.js";
import { yakumanShield } from "../../../packages/content/src/augments/yakuman_shield.js";
import { giantGod } from "../../../packages/content/src/augments/giant_god.js";

function drawSettle(
  augs: Partial<Record<PlayerId, AugmentDef[]>>,
  discards: Partial<Record<PlayerId, string>>,
  hands: Partial<Record<PlayerId, string>> = {},
) {
  let st: GameState = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*", ...hands } as never,
    discards: { p0: "", p1: "", p2: "", p3: "", ...discards } as never,
    phase: "turn.draw",
    turnSeat: 0,
  });
  st = {
    ...st,
    zones: { ...st.zones, [WALL]: { ...createZone(WALL, "wall"), tileIds: [] } },
    players: st.players.map((p) => ({ ...p, augments: (augs[p.id] ?? []).map((a) => a.id) })),
  };
  const game = createStandardGameFromState(st);
  for (const [pid, defs] of Object.entries(augs)) {
    for (const d of defs ?? []) installAugment(game.engine, d, pid as PlayerId, { yaku: game.yaku });
  }
  const r = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleDraw",
    payload: {},
  } as never);
  if (!(r as { ok: boolean }).ok) throw new Error((r as { reason: string }).reason);
  const log = game.engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) {
      const p = log[i]!.payload as Record<string, unknown>;
      const d = p["deltas"] as Record<string, number>;
      return { deltas: d, sum: Object.values(d).reduce((a, b) => a + b, 0), special: p["drawSpecial"] };
    }
  }
  throw new Error("no settle");
}

const show = (n: string, s: ReturnType<typeof drawSettle>) =>
  console.log(`  ${n.padEnd(30)} deltas=${JSON.stringify(s.deltas)} sum=${s.sum} special=${JSON.stringify(s.special)}`);

// 요구패만 버린 이력 (13종)
const ORPHANS = "19m19p19s1234z567z";
// 요구패가 아닌 패 한 장이 섞인 이력
const DIRTY = ORPHANS + "5m";

console.log("### ① 유국역만 단독 (p0 = 오야)");
show("이력 전부 요구패", drawSettle({ p0: [nagashiYakuman] }, { p0: ORPHANS }));
show("중장패 1장 섞임", drawSettle({ p0: [nagashiYakuman] }, { p0: DIRTY }));
show("증강 없음", drawSettle({}, { p0: ORPHANS }));

console.log("\n### ② 유국역만 × 역만 방어술");
show("p1만 방어술", drawSettle({ p0: [nagashiYakuman], p1: [yakumanShield] }, { p0: ORPHANS }));
show("p1·p2 방어술", drawSettle({ p0: [nagashiYakuman], p1: [yakumanShield], p2: [yakumanShield] }, { p0: ORPHANS }));
show("전원 방어술", drawSettle({ p0: [nagashiYakuman], p1: [yakumanShield], p2: [yakumanShield], p3: [yakumanShield] }, { p0: ORPHANS }));

console.log("\n### ③ 유국역만 두 명 동시");
show("p0·p1 둘 다", drawSettle({ p0: [nagashiYakuman], p1: [nagashiYakuman] }, { p0: ORPHANS, p1: ORPHANS }));
show("p0·p1 + p2 방어술", drawSettle({ p0: [nagashiYakuman], p1: [nagashiYakuman], p2: [yakumanShield] }, { p0: ORPHANS, p1: ORPHANS }));
