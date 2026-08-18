/**
 * 끊긴 동안 보낸 메시지를 어떻게 할 것인가 — 재전송 정책.
 *
 * 가르는 기준은 하나다: **지금 화면에 떠 있는 무언가에 대한 응답인가.**
 *
 *  ① 응답이면 **재전송하지 않는다.** 늦게 도착한 응답은 다른 상황에 적용되기 때문이다.
 *     버림패 하나가 1초 뒤에 도착하면 그때는 이미 다른 패를 뽑은 뒤이고, 서버는 AFK
 *     폴백으로 대신 뒀을 수도 있다. 드래프트 픽·무효 투표·결과창 닫기도 같다 —
 *     전부 "지금 이 순간"에만 뜻이 있다. 대신 **조용히 사라지지는 않게** 한다:
 *     App이 토스트로 알리고 프롬프트를 그대로 두어 다시 누를 수 있게 한다
 *     (서버는 재접속 시 대기 중이던 결정을 복원해 준다 — HumanAgent).
 *
 *  ② 그 밖의 요청·의사표시는 **큐에 담았다가 다시 붙는 즉시 보낸다.** 로그인·게스트
 *     체험·방 만들기/들어가기·준비·봇 추가·통계 요청 같은 것들이다. "상태를 이렇게
 *     바꿔 달라"는 요청이라 조금 늦게 도착해도 뜻이 변하지 않고, 서버가 어차피
 *     유효성을 다시 본다.
 *
 * **중복 전송은 구조적으로 없다.** 큐에 담기는 것은 전송에 실패한 것뿐이다 — 소켓이
 * 열려 있으면 그 자리에서 보내고 큐를 거치지 않으므로, 이미 나간 메시지가 다시 나갈
 * 길이 없다. 그래서 제보 등록·계정 삭제 같은 쓰기 요청도 안전하게 재전송한다.
 *
 * 두 목록은 **ClientMessage 전체를 빠짐없이 덮는다** (resendPolicy.test.ts가 강제).
 * 새 메시지를 추가하면 테스트가 깨지고, 그때 이 판단을 한 번 하게 된다.
 */

import type { ClientMessage } from "@majak/core";

/** ① 재전송하지 않는다 — 지금 이 순간에 대한 응답 (늦게 도착하면 딴 상황에 적용된다) */
export const VOLATILE_MESSAGES: ReadonlySet<string> = new Set([
  "action", // 프롬프트에 대한 답 (타패·후로·화료·증강 발동)
  "draftPick", // 지금 떠 있는 드래프트 제안에 대한 답
  "draftReroll", // 지금 떠 있는 그 슬롯을 갈아 달라 — 늦게 가면 다음 스테이지의 슬롯을 갈아 버린다
  "voteAbort", // 지금 진행 중인 무효 투표에 대한 답
  "roundContinue", // "이 결과창을 닫는다" — 늦게 가면 다음 국 결과창을 건너뛴다
  "ping", // 스스로 다시 온다
  "emote", // 인사는 그 순간의 것이다 — 늦게 도착하면 뜻이 어긋난다
  // 체험 판 복귀는 **소켓이 열리는 순간** 연결 핸들러가 스스로 보낸다(tokenLogin과 같다).
  // 큐에 담아 두면 다음 연결에서 두 번 나가고, 그중 하나는 이미 로그인한 연결에
  // 도착해 `ALREADY_AUTHED`가 된다.
  "guestResume",
]);

/** ② 큐에 담았다가 재전송한다 — 상태에 대한 요청·의사표시 */
export const RESENDABLE_MESSAGES: ReadonlySet<string> = new Set([
  // 인증·입장
  "register", "login", "tokenLogin", "logout", "guestPlay", "practicePlay",
  "createRoom", "joinRoom", "leaveRoom", "join",
  // 대기실 조작
  "ready", "startGame", "setGameMode", "shuffleSeats",
  "addBot", "removeBot", "setBotArchetype", "setBotDifficulty", "kickPlayer",
  // 조회
  "statsRequest", "replayList", "replayGet", "leaderboard", "liveGames",
  "feedbackList", "adminUsers", "adminAugmentTiers",
  // 도감 카탈로그 — 로그인 전에도 통하는 유일한 조회다(§3-7). 끊긴 사이 눌렀다면
  // 다시 붙었을 때 도감이 여전히 비어 있으므로, 늦게 도착해도 뜻이 그대로다.
  "catalogRequest",
  // 쓰기 요청 (전송 실패한 것만 큐에 담기므로 중복 등록이 되지 않는다)
  "feedbackSubmit", "feedbackUpdate", "feedbackDelete", "adminDeleteUser",
  // 관전·증강 테스트
  "spectate", "spectateStop",
  "sandboxStart", "sandboxGrant", "sandboxReset", "sandboxViewAs",
  "sandboxBotRules", "sandboxControl",
  // 표시용 (마지막 것만 뜻이 있다 — 큐에서 앞엣것을 지운다)
  "handOrder",
]);

/*
 * `emote`는 **볼라틸 쪽**이다(위 목록). "잘 부탁드립니다"가 15초 뒤 남의 화면에
 * 뜨면 그건 인사가 아니라 유령이다 — 대화는 그 순간에만 뜻이 있다.
 */

/** 큐가 이보다 오래 묵으면 보내지 않는다 — 그건 복구가 아니라 유령 조작이다. */
export const RESEND_TTL_MS = 15_000;

/** 큐 상한 — 넘치면 오래된 것부터 버린다 (메모리와 재전송 폭풍을 함께 묶는다). */
export const RESEND_QUEUE_MAX = 16;

/** 큐에 담긴 한 건 — 담긴 시각을 함께 들고 있어야 묵은 것을 가릴 수 있다. */
export interface QueuedSend {
  msg: ClientMessage;
  at: number;
}

/** 끊겼을 때 이 메시지를 큐에 담아도 되는가. */
export function isResendable(type: string): boolean {
  return RESENDABLE_MESSAGES.has(type);
}

/**
 * 큐에 한 건 담은 **새 큐**를 돌려준다 (원본은 건드리지 않는다).
 * 담을 수 없는 메시지면 큐를 그대로 돌려준다 — 판정은 부르는 쪽이 이미 했다고 보지 않는다.
 */
export function enqueueSend(
  queue: readonly QueuedSend[],
  msg: ClientMessage,
  at: number,
): QueuedSend[] {
  if (!isResendable(msg.type)) return [...queue];
  // 손패 배치는 마지막 것만 뜻이 있다 — 같은 것을 여러 벌 되살릴 이유가 없다.
  const kept = msg.type === "handOrder" ? queue.filter((q) => q.msg.type !== "handOrder") : queue;
  const next = [...kept, { msg, at }];
  return next.length > RESEND_QUEUE_MAX ? next.slice(next.length - RESEND_QUEUE_MAX) : next;
}

/** 지금 실제로 보낼 것들 — 담긴 순서 그대로, 묵은 것은 빼고. */
export function dueForResend(queue: readonly QueuedSend[], now: number): ClientMessage[] {
  return queue.filter((q) => now - q.at <= RESEND_TTL_MS).map((q) => q.msg);
}
