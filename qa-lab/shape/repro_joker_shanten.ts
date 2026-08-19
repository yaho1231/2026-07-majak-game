/**
 * 확정 재현 — joker(조커) 발동 뒤 샹텐 계산이 치또이·국사를 통째로 놓친다.
 *
 * 원인: core/mahjong/scoring/shanten.ts `shantenUncached`
 *   1) wildKinds가 있으면 조커 패를 **손에서 빼고** `shantenOf(rest) - wilds` 로 근사한다.
 *   2) 그 rest는 12장 이하가 되는데, 아래 특수형 분기는 `kinds.length >= 13` 을 요구한다.
 *      → 치또이·국사 샹텐이 계산되지 않고 표준형(4멘쯔) 값만 남는다.
 *
 * 영향: server/src/bot/read.ts 는 `if (shanten <= 0)` 일 때만 텐파이·대기를 계산한다.
 * 조커를 켠 봇이 국사/치또이 텐파이여도 **노텐으로 읽혀** 리치·푸시·버림 선택이 전부 어긋난다.
 * 반대로 13장 손에 -1(=완성)이 나오는 경우도 있다(불가능한 값).
 */
import { shantenOf, winningKinds } from "@majak/core";
import type { DecomposeOptions, TileKind } from "@majak/core";
import { h } from "../../packages/content/test/helpers.js";

const HAKU: TileKind = { suit: "dragon", rank: 1 }; // 백 = 5z
const JK: DecomposeOptions = { wildKinds: [HAKU] };

const rows: [string, string][] = [
  ["19m19p19s1234567z", "국사 13면 텐파이 (백 포함)"],
  ["19m19p19s1234z56z1z", "국사 텐파이 (백 1장)"],
  ["112233445566m5z", "치또이 텐파이 (6쌍 + 백)"],
  ["1122334455m66p5z", "치또이 텐파이 (6쌍 + 백)"],
  ["123m456p789s11z55z", "표준 텐파이 (백 2장)"],
  ["5z5z5z5z123m456p789s", "3멘쯔 + 백 4장"],
];

let bad = 0;
for (const [spec, label] of rows) {
  const hand = h(spec);
  const base = shantenOf(hand, 0, {});
  const wj = shantenOf(hand, 0, JK);
  const waits = winningKinds(hand, 0, undefined, JK);
  const tenpai = waits.length > 0; // 조커를 정확히 아는 판정 (isWinningShape 경로)
  const botSeesTenpai = wj <= 0; // server/src/bot/read.ts 의 게이트
  const wrong = (tenpai && !botSeesTenpai) || (hand.length === 13 && wj < 0);
  if (wrong) bad++;
  console.log(
    `${wrong ? "BUG " : "ok  "} ${spec.padEnd(22)} ${label.padEnd(26)} ` +
    `n=${hand.length} 표준샹텐=${base} 조커샹텐=${wj} 실제대기=${waits.length}종 ` +
    `→ 봇이 텐파이로 보는가=${botSeesTenpai}`,
  );
}
console.log(`\nBUG=${bad}/${rows.length}`);
console.log("기대: 조커샹텐 ≤ 표준샹텐 이고, 13장 손에서 -1 은 나올 수 없다.");
