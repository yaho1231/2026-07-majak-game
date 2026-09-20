/**
 * draftStyle — 드래프트 픽을 **사람이 고르는 카드** 쪽으로 기울인다.
 *
 * 실측(docs/58 §드래프트, 상위 계층 ~100오퍼/카드): 사람은 손을 통째로 바꾸는 카드
 * (개벽 86% vs 봇 42% · 비동기 치또이 66/40 · 전체 교환 48/27)를 훨씬 자주 고르고,
 * 봇은 조건부 수비·정보 카드(늦깎이 동 64 vs 9 · 리치 봉인 39/13 · 큰 손 34/6)를 더
 * 고른다. 봇의 `powerOf × sqrt(fit×synergy)`는 «센가»만 보고 «쓰기 좋은가»를 안 본다.
 *
 * 배율 = sqrt(clamp((사람 p + 0.05)/(봇 p + 0.05), 0.5, 2)) — 기존 tilt와 같은 압축.
 */
import { DRAFT_PICK } from "./priors.js";
import { clamp } from "./style.js";

export function draftTilt(augId: string): number {
  const pair = DRAFT_PICK[augId];
  if (pair === undefined) return 1;
  return Math.sqrt(clamp((pair[0] + 0.05) / (pair[1] + 0.05), 0.5, 2));
}
