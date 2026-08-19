/** mixed_nine_gates: 뼈대 판정 × 화료 가능성 (27종 대기가 실제로 서는가) */
import { winningKinds } from "@majak/core";
import type { DecomposeOptions, TileKind } from "@majak/core";
import { isWinningShape } from "../../packages/core/src/mahjong/scoring/decompose.js";
import { h } from "../../packages/content/test/helpers.js";
const O: DecomposeOptions = { mixedRuns: true, mixedTriplets: true, mixedPairs: true };
const BASE = [0, 3, 1, 1, 1, 1, 1, 1, 1, 3];
const extra = (t: readonly TileKind[]): number | null => {
  if (!t.every((k) => ["man", "pin", "sou"].includes(k.suit))) return null;
  const c = new Array(10).fill(0);
  for (const k of t) c[k.rank]++;
  let e = 0;
  for (let r = 1; r <= 9; r++) { const d = c[r] - BASE[r]!; if (d < 0) return null; e += d; }
  return e;
};
// 무늬를 흩뿌린 구련 뼈대 13장
const skel = "111m234p567s89m9p9s".replace("111m", "1m1p1s");
console.log("뼈대:", skel, "extra=", extra(h(skel)), "장수=", h(skel).length);
const waits = winningKinds(h(skel), 0, undefined, O);
console.log("대기 종수(무늬 무시 켠 상태):", waits.length, waits.map((k) => `${k.rank}${k.suit[0]}`).join(","));
console.log("표준 옵션 대기 종수:", winningKinds(h(skel), 0, undefined, {}).length);
// 14장이 되면 역 조건(isMixedNineGates: 14장 · 수패만 · 무늬 2종 이상 · extra 1)
for (const add of ["5m", "5p", "1z"]) {
  const full = skel + add;
  const t = h(full);
  const ok = t.length === 14 && new Set(t.map((k) => k.suit)).size >= 2 && extra(t) === 1;
  console.log(`  +${add}: 화료형=${isWinningShape(t, 0, O)} 역조건=${ok}`);
}
