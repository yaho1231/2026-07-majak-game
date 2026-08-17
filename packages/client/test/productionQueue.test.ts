/**
 * 연출 큐 — 리치 알림이 증강 컷인 줄을 앞질러 나가고, 밀린 만큼 빨리 흘러간다.
 *
 * 고치기 전에는 큐가 순수 FIFO였다. 한 순에 증강 컷인 다섯이 터지면 2초 × 5 = 10초짜리
 * 줄이 서고, 그 뒤에 들어온 리치 배너가 10초 뒤에 떴다 — 심하면 론 직전에
 * (2026-08-17 사용자 보고). 여기서 지키는 것은 두 가지다.
 *  ① 리치 알림이 앞으로 나간다 (같은 등급끼리는 넣은 순서 유지)
 *  ② 뒤에 밀린 만큼 체류가 줄되, 읽을 시간(바닥값)은 남는다
 */

import { describe, expect, it } from "vitest";
import {
  backlogProdTtl,
  insertByPriority,
  PROD_PRIORITY_RIICHI,
  PROD_TTL_FLOOR_MS,
} from "../src/productionQueue.js";

interface Item {
  name: string;
  priority?: number;
}

/** 이름만 뽑아 순서를 눈으로 보게 */
function order(q: Item[]): string[] {
  return q.map((i) => i.name);
}

const riichi = (name: string): Item => ({ name, priority: PROD_PRIORITY_RIICHI });
const plain = (name: string): Item => ({ name });

describe("연출 큐 — 등급 끼워넣기", () => {
  it("리치 알림은 밀려 있는 증강 컷인 줄을 앞질러 나간다", () => {
    const q: Item[] = [];
    for (const n of ["증강1", "증강2", "증강3"]) insertByPriority(q, plain(n));
    insertByPriority(q, riichi("리 치"));
    expect(order(q)).toEqual(["리 치", "증강1", "증강2", "증강3"]);
  });

  it("같은 등급끼리는 넣은 순서를 지킨다 — 등 떠밀기 → 리치가 갈리지 않는다", () => {
    const q: Item[] = [];
    insertByPriority(q, plain("증강1"));
    insertByPriority(q, riichi("등 떠밀기"));
    insertByPriority(q, riichi("리 치"));
    expect(order(q)).toEqual(["등 떠밀기", "리 치", "증강1"]);
  });

  it("등급이 없으면 예전 그대로 맨 뒤에 붙는다 (FIFO)", () => {
    const q: Item[] = [];
    for (const n of ["가", "나", "다"]) insertByPriority(q, plain(n));
    expect(order(q)).toEqual(["가", "나", "다"]);
  });

  it("리치가 이미 있어도 뒤에 온 리치는 그 뒤, 평범한 연출 앞에 선다", () => {
    const q: Item[] = [];
    insertByPriority(q, riichi("리 치"));
    insertByPriority(q, plain("펑"));
    insertByPriority(q, riichi("추격 리치"));
    expect(order(q)).toEqual(["리 치", "추격 리치", "펑"]);
  });
});

describe("연출 큐 — 밀린 만큼 압축", () => {
  it("큐가 한가하면(0~1개) 길이를 손대지 않는다", () => {
    expect(backlogProdTtl(2000, 0)).toBe(2000);
    expect(backlogProdTtl(2000, 1)).toBe(2000);
  });

  it("밀릴수록 짧아진다", () => {
    expect(backlogProdTtl(2000, 2)).toBe(1400);
    expect(backlogProdTtl(2000, 4)).toBe(900);
    expect(backlogProdTtl(2000, 9)).toBe(900);
  });

  it("아무리 밀려도 읽을 시간(바닥값) 아래로는 안 내려간다", () => {
    expect(backlogProdTtl(800, 9)).toBe(PROD_TTL_FLOOR_MS);
    // 원래 바닥값보다 짧은 연출은 그대로 둔다 — 늘리지 않는다
    expect(backlogProdTtl(300, 9)).toBe(PROD_TTL_FLOOR_MS);
  });

  it("압축은 단조롭다 — 더 밀렸는데 더 오래 서 있는 일이 없다", () => {
    let prev = Infinity;
    for (let backlog = 0; backlog <= 8; backlog++) {
      const cur = backlogProdTtl(2000, backlog);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });
});
