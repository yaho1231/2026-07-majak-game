import { describe, expect, it } from "vitest";
import { Prng } from "../src/engine/random/Prng.js";

describe("Prng", () => {
  it("같은 시드는 항상 같은 수열을 만든다 (리플레이 보장)", () => {
    const a = new Prng(42);
    const b = new Prng(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("다른 시드는 다른 수열을 만든다", () => {
    const a = new Prng(1);
    const b = new Prng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("int()는 [0, max) 범위를 지킨다", () => {
    const rng = new Prng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(34);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(34);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("shuffle은 같은 시드에서 같은 결과를 내고 원소를 보존한다", () => {
    const base = Array.from({ length: 136 }, (_, i) => i); // 마작패 136장
    const a = new Prng(99).shuffle([...base]);
    const b = new Prng(99).shuffle([...base]);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(base);
    expect(a).not.toEqual(base); // 사실상 확실
  });

  it("getState/setState로 진행 상태를 복원할 수 있다 (리플레이 중단·재개)", () => {
    const rng = new Prng(5);
    rng.next();
    rng.next();
    const saved = rng.getState();
    const v1 = rng.next();
    rng.setState(saved);
    expect(rng.next()).toBe(v1);
  });
});
