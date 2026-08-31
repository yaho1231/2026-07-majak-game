/**
 * synergy4 / riichi — S11. 오픈 리치 × 리치 봉인 (synergy3 확정 1의 수정 확인).
 * 봉인당해 추격 리치를 못 건 사람이 쏘면 역만이 아니라 «3판 취급»이어야 한다.
 */
import { run } from "./s1b_lowhan.js";
const rows: [string, string[], string][] = [
  ["표준 리치", [], "riichi"],
  ["open 단독 (p1 비리치·비봉인)", ["open_riichi_reveal"], "open_riichi"],
  ["open + seal (p1 봉인)", ["open_riichi_reveal", "riichi_seal"], "open_riichi"],
  ["open + upgrade (하가 p1 봉인)", ["open_riichi_reveal", "riichi_upgrade"], "open_riichi"],
  ["seal 단독", ["riichi_seal"], "riichi"],
];
for (const [k, a, act] of rows) {
  const r = run(a, act);
  console.log(`${k.padEnd(32)} han=${r?.han} extra=${r?.extraHan} 점수=${r?.points} 역=${r?.yaku.join(",")} aug=${r?.augPoints || "-"}`);
}
