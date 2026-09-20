/**
 * buckets — 사람 성향 표(`priors.ts`)의 **축**. 연구(`study/`)가 셀 때와 봇이 읽을 때
 * 같은 함수를 써야 표가 맞는다 — 그래서 여기 한 곳에만 있다.
 */
export function bucketTurn(turn: number): "early" | "mid" | "late" {
  return turn <= 5 ? "early" : turn <= 11 ? "mid" : "late";
}
export function bucketWait(tiles: number): "0" | "1-3" | "4-7" | "8+" {
  return tiles <= 0 ? "0" : tiles <= 3 ? "1-3" : tiles <= 7 ? "4-7" : "8+";
}
export function bucketPoints(points: number): "<2k" | "2-4k" | "4-8k" | "8k+" {
  return points < 2000 ? "<2k" : points < 4000 ? "2-4k" : points < 8000 ? "4-8k" : "8k+";
}
export function bucketThreat(threat: number): "none" | "some" | "riichi" {
  return threat < 0.3 ? "none" : threat < 0.8 ? "some" : "riichi";
}
export function bucketShanten(s: number): "0" | "1" | "2" | "3+" {
  return s <= 0 ? "0" : s === 1 ? "1" : s === 2 ? "2" : "3+";
}
export const TURN_INDEX = { early: 0, mid: 1, late: 2 } as const;
