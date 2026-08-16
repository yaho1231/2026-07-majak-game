/**
 * 잠금 통보(증강에 막힌 론)의 회귀 가드.
 *
 * 지키는 것 두 가지:
 *  ① **자동으로 넘어가는 것은 고를 것이 없는 프롬프트뿐이다.** 퐁·치가 함께 온
 *     프롬프트를 통보로 오인하면 그 후로를 사람 대신 버려 버린다.
 *  ② **띠 길이와 자동 패스 시간이 같다.** 둘은 서로 다른 파일에 있어서 조용히
 *     어긋나며, 어긋나면 띠가 다 빠진 뒤에도 버튼이 남거나(길다) 다 빠지기 전에
 *     사라진다(짧다) — 어느 쪽이든 "얼마나 남았는가"가 거짓말이 된다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DecisionPrompt } from "@majak/core";
import { LOCK_NOTICE_MS, isLockNoticeOnly } from "../src/lockNotice.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");

const PASS = { type: "pass", payload: {} };
const RON_LOCK = { type: "win", reason: "minHan" as const, minHan: 5 };

const prompt = (p: Partial<DecisionPrompt>): DecisionPrompt => ({
  player: "p1",
  options: [PASS],
  ...p,
});

describe("잠금 통보 — 자동 패스 대상 판정", () => {
  it("잠긴 론 + 패스뿐이면 통보다", () => {
    expect(isLockNoticeOnly(prompt({ locked: [RON_LOCK] }))).toBe(true);
  });

  it("후로가 함께 오면 통보가 아니다 — 사람이 정할 몫이 남아 있다", () => {
    const p = prompt({
      options: [{ type: "pon", payload: { tileIds: [1, 2] } }, PASS],
      locked: [RON_LOCK],
    });
    expect(isLockNoticeOnly(p)).toBe(false);
  });

  it("내 턴(쯔모가 잠긴 경우)은 통보가 아니다 — 버릴 패를 골라야 한다", () => {
    const p = prompt({
      options: [{ type: "discard", payload: { tileId: 7 } }],
      locked: [RON_LOCK],
    });
    expect(isLockNoticeOnly(p)).toBe(false);
  });

  it("자물쇠가 없는 평범한 패스 프롬프트는 건드리지 않는다", () => {
    expect(isLockNoticeOnly(prompt({}))).toBe(false);
    expect(isLockNoticeOnly(prompt({ locked: [] }))).toBe(false);
  });
});

describe("잠금 통보 — 띠 길이와 자동 패스 시간이 같다", () => {
  it("lock-notice-drain 애니메이션이 LOCK_NOTICE_MS와 맞는다", () => {
    const rule = /\.act-locked-timed::after\s*\{[^}]*\}/.exec(CSS)?.[0];
    expect(rule, ".act-locked-timed::after 규칙을 못 찾았다").toBeDefined();
    const dur = /animation:\s*lock-notice-drain\s+([\d.]+)s/.exec(rule!)?.[1];
    expect(dur, "lock-notice-drain 길이를 못 읽었다").toBeDefined();
    expect(Number(dur) * 1000).toBe(LOCK_NOTICE_MS);
  });
});
