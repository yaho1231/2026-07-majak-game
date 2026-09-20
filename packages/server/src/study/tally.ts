/**
 * tally — 셀별 «기회 n · 채택 k · 값의 합»을 세는 가장 작은 도구.
 *
 * 키는 `a|b|c` 꼴의 문자열이고, `addMarginals`는 그 키의 1차원 주변부(각 축만 남긴
 * 키)까지 함께 센다 — 표를 나중에 어느 축으로든 볼 수 있게.
 */
export interface Cell {
  n: number;
  k: number;
  sum: number;
}

export class Tally {
  readonly cells = new Map<string, Cell>();

  add(key: string, hit: boolean, value = 0): void {
    let c = this.cells.get(key);
    if (c === undefined) {
      c = { n: 0, k: 0, sum: 0 };
      this.cells.set(key, c);
    }
    c.n++;
    if (hit) c.k++;
    c.sum += value;
  }

  /**
   * `dims`의 축 이름과 값으로 전체 키·각 축의 주변부 키·`pairs`로 지정한 2축 키를 센다.
   *   dims = [["tier","top"],["wait","4-7"]] → "tier=top|wait=4-7", "tier=top", "wait=4-7"
   */
  addMarginals(
    dims: readonly (readonly [string, string])[],
    hit: boolean,
    value = 0,
    pairs: readonly (readonly [string, string])[] = [],
  ): void {
    this.add(dims.map(([a, b]) => `${a}=${b}`).join("|"), hit, value);
    this.add("*", hit, value);
    for (const [a, b] of dims) this.add(`${a}=${b}`, hit, value);
    for (const [x, y] of pairs) {
      const dx = dims.find(([a]) => a === x);
      const dy = dims.find(([a]) => a === y);
      if (dx && dy) this.add(`${dx[0]}=${dx[1]}|${dy[0]}=${dy[1]}`, hit, value);
    }
  }

  merge(other: Record<string, Cell>): void {
    for (const [key, c] of Object.entries(other)) {
      const mine = this.cells.get(key);
      if (mine === undefined) this.cells.set(key, { ...c });
      else {
        mine.n += c.n;
        mine.k += c.k;
        mine.sum += c.sum;
      }
    }
  }

  toJSON(): Record<string, Cell> {
    return Object.fromEntries(this.cells);
  }
}

export function bucketTurn(turn: number): string {
  return turn <= 5 ? "early" : turn <= 11 ? "mid" : "late";
}
export function bucketWait(tiles: number): string {
  return tiles <= 0 ? "0" : tiles <= 3 ? "1-3" : tiles <= 7 ? "4-7" : "8+";
}
export function bucketPoints(points: number): string {
  return points < 2000 ? "<2k" : points < 4000 ? "2-4k" : points < 8000 ? "4-8k" : "8k+";
}
export function bucketThreat(threat: number): string {
  return threat < 0.3 ? "none" : threat < 0.8 ? "some" : "riichi";
}
export function bucketShanten(s: number): string {
  return s <= 0 ? "0" : s === 1 ? "1" : s === 2 ? "2" : "3+";
}
