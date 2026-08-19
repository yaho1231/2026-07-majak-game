/**
 * 초읽기(time_pressure) detail:
 *   "제한을 넘기면 … **되돌릴 수 없는 발동의 마무리 단계에서는 남은 후보 중 하나가
 *    무작위로 선택된다.**"
 *
 * 서버의 폴백은 2026년 리팩터로 `Math.random()`을 버리고 **후보 목록의 해시**로 바뀌었다
 * (HumanAgent.ts:143-161, 주석에 그 경위가 적혀 있다 — "같은 상황이면 같은 선택이
 * 나온다(재현 가능)"). 카드 문구만 옛 동작(무작위) 그대로다.
 *
 * 확인: 같은 후보 목록으로 200번 불러도 언제나 같은 하나가 나온다.
 */
import { safeFallbackOption } from "../../../packages/server/src/HumanAgent.js";
import type { ActionOption } from "@majak/core";

const opts: ActionOption[] = [0, 1, 2, 3, 4].map((i) => ({
  type: "swap3_take",
  payload: { tileId: 100 + i },
}));

const picks = new Set<string>();
for (let i = 0; i < 200; i++) {
  picks.add(JSON.stringify(safeFallbackOption(opts).payload));
}
console.log("후보 5개 × 200회 호출 → 서로 다른 결과 수:", picks.size);
console.log("  나온 것:", [...picks]);
console.log("  기대(문구 '무작위'): 여러 후보가 고루 나온다 / 실제: 항상 같은 하나");

// 후보 목록이 달라지면 선택도 달라진다(= '항상 첫 번째'는 아니다)는 것도 함께 보인다
for (let n = 2; n <= 6; n++) {
  const sub = opts.slice(0, n);
  const chosen = safeFallbackOption(sub).payload as { tileId: number };
  console.log(`  후보 ${n}개 → 결정적으로 index ${chosen.tileId - 100}`);
}

// 타패 폴백(쯔모기리)·반응 폴백(패스)은 문구대로다
console.log(
  "\n타패 폴백:",
  JSON.stringify(
    safeFallbackOption([
      { type: "discard", payload: { tileId: 1 } },
      { type: "discard", payload: { tileId: 2 } },
      { type: "discard", payload: { tileId: 9 } }, // 쯔모패(손패 맨 끝)
    ]).payload,
  ),
  "← 마지막 = 쯔모패 (쯔모기리, 문구대로)",
);
console.log(
  "반응 폴백:",
  safeFallbackOption([
    { type: "win", payload: {} },
    { type: "pon", payload: {} },
    { type: "pass", payload: {} },
  ]).type,
  "← 패스 (문구대로)",
);
