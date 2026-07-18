/**
 * Prng — 시드 기반 결정론적 난수 생성기 (mulberry32).
 *
 * core의 모든 난수(배패, 패산 섞기, 증강 3개 뽑기)는 반드시 이 클래스를 거친다.
 * Math.random / Date.now는 core에서 금지 — 시드와 이벤트 로그만으로
 * 게임 전체를 재현할 수 있어야 한다 (리플레이·버그 재현).
 *
 * 설계: docs/00_MASTER_ARCHITECTURE.md §4 불변 규칙 2
 */
export class Prng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0, 1) 범위의 난수 */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0, maxExclusive) 범위의 정수 */
  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error(`int() requires a positive integer, got: ${maxExclusive}`);
    }
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("pick() requires a non-empty array");
    }
    return items[this.int(items.length)] as T;
  }

  /** Fisher–Yates 셔플 (제자리). 패산 섞기에 사용 */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** 리플레이 저장/복원용 내부 상태 */
  getState(): number {
    return this.s;
  }

  setState(state: number): void {
    this.s = state >>> 0;
  }
}
