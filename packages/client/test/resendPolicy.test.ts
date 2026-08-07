/**
 * 재전송 정책 — 끊긴 동안 보낸 메시지를 어떻게 할 것인가.
 *
 * 여기서 못을 박는 것 셋:
 *  1. **분류가 빠짐없다.** ClientMessage 하나라도 어느 쪽에도 없으면 깨진다 —
 *     새 메시지를 만든 사람이 "이건 지금 이 순간에 대한 응답인가"를 한 번 정하게 된다.
 *  2. **응답은 절대 큐에 담기지 않는다.** 늦게 도착한 타패는 다른 패를 뽑은 뒤에 적용된다.
 *  3. 큐 자체의 규칙 — 순서·묵은 것·상한·손패 배치 접기.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ClientMessage } from "@majak/core";
import {
  RESENDABLE_MESSAGES,
  RESEND_QUEUE_MAX,
  RESEND_TTL_MS,
  VOLATILE_MESSAGES,
  dueForResend,
  enqueueSend,
  isResendable,
} from "../src/resendPolicy.js";
import type { QueuedSend } from "../src/resendPolicy.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROTOCOL = readFileSync(join(HERE, "../../core/src/network/protocol.ts"), "utf8");

/** 프로토콜의 **클라이언트 → 서버** 메시지 타입 전부 (파일 앞쪽이 그 구간이다) */
function clientMessageTypes(): string[] {
  const end = PROTOCOL.indexOf("서버 → 클라이언트");
  expect(end, "프로토콜 파일의 구간 표시를 못 찾았다").toBeGreaterThan(0);
  const found = [
    ...new Set(
      [...PROTOCOL.slice(0, end).matchAll(/^\s+type: "([a-zA-Z]+)";$/gm)].map((m) => m[1]!),
    ),
  ];
  // 정규식이 헛돌면(포맷 변경 등) 이 테스트가 통째로 무의미해진다 — 최소 개수를 못 박는다.
  expect(found.length).toBeGreaterThan(30);
  return found;
}

const q = (type: string): ClientMessage => ({ type }) as ClientMessage;

describe("분류", () => {
  it("ClientMessage 전체가 둘 중 정확히 한쪽에 든다", () => {
    const classified = new Set([...VOLATILE_MESSAGES, ...RESENDABLE_MESSAGES]);
    const missing = clientMessageTypes().filter((t) => !classified.has(t));
    expect(missing, `분류되지 않은 메시지: ${missing.join(", ")}`).toEqual([]);
    const both = [...VOLATILE_MESSAGES].filter((t) => RESENDABLE_MESSAGES.has(t));
    expect(both, `양쪽에 든 메시지: ${both.join(", ")}`).toEqual([]);
  });

  it("지금 이 순간에 대한 응답은 재전송 대상이 아니다", () => {
    for (const t of ["action", "draftPick", "voteAbort", "roundContinue", "ping"]) {
      expect(isResendable(t), `${t} 는 재전송하면 안 된다`).toBe(false);
    }
  });

  it("상태 요청·의사표시는 재전송 대상이다", () => {
    for (const t of ["guestPlay", "login", "joinRoom", "ready", "addBot", "statsRequest"]) {
      expect(isResendable(t), `${t} 는 재전송해야 한다`).toBe(true);
    }
  });
});

describe("큐", () => {
  it("응답은 담기지 않는다 — 큐가 그대로다", () => {
    expect(enqueueSend([], q("action"), 0)).toEqual([]);
    expect(enqueueSend([], q("roundContinue"), 0)).toEqual([]);
  });

  it("담긴 순서대로 나간다", () => {
    let queue: QueuedSend[] = [];
    for (const t of ["login", "joinRoom", "ready"]) queue = enqueueSend(queue, q(t), 0);
    expect(dueForResend(queue, 0).map((m) => m.type)).toEqual(["login", "joinRoom", "ready"]);
  });

  it("묵은 것은 보내지 않는다 (TTL)", () => {
    const queue = enqueueSend(enqueueSend([], q("createRoom"), 0), q("ready"), RESEND_TTL_MS);
    // 지금이 TTL+1이면 처음 것만 만료 — 뒤엣것은 아직 살아 있다
    expect(dueForResend(queue, RESEND_TTL_MS + 1).map((m) => m.type)).toEqual(["ready"]);
    expect(dueForResend(queue, RESEND_TTL_MS * 3)).toEqual([]);
  });

  it("상한을 넘으면 오래된 것부터 버린다", () => {
    let queue: QueuedSend[] = [];
    for (let i = 0; i < RESEND_QUEUE_MAX + 5; i++) queue = enqueueSend(queue, q("statsRequest"), i);
    expect(queue.length).toBe(RESEND_QUEUE_MAX);
    expect(queue[0]!.at).toBe(5); // 0~4가 밀려났다
  });

  it("손패 배치는 마지막 것만 남는다", () => {
    let queue: QueuedSend[] = [];
    queue = enqueueSend(queue, { type: "handOrder", tileIds: [1] } as ClientMessage, 0);
    queue = enqueueSend(queue, q("ready"), 1);
    queue = enqueueSend(queue, { type: "handOrder", tileIds: [2] } as ClientMessage, 2);
    const types = queue.map((x) => x.msg.type);
    expect(types).toEqual(["ready", "handOrder"]);
    expect((queue[1]!.msg as { tileIds: number[] }).tileIds).toEqual([2]);
  });

  it("원본 큐를 건드리지 않는다", () => {
    const before: QueuedSend[] = [];
    enqueueSend(before, q("ready"), 0);
    expect(before).toEqual([]);
  });
});
