/**
 * QA round2 · spectate 도메인 공용 — server/lib.ts 를 그대로 쓰되
 * 이 도메인 전용 포트(3931)와 임시 DB를 향한다.
 *
 * 서버 기동 (워크트리 packages/server 에서):
 *   PORT=3931 DB_PATH=<scratchpad>/qa.db ADMIN_CODE=qaspectateadmin1234 \
 *     node --import tsx/esm src/index.ts
 */
// ⚠ 포트는 **실행 환경변수**로 준다 (QA_WS/QA_HTTP). ESM import 는 호이스팅되므로
// 이 파일 안에서 process.env 를 대입해도 server/lib.ts 가 먼저 평가된다.
if (!(process.env["QA_WS"] ?? "").includes("3931")) {
  throw new Error("QA_WS=ws://127.0.0.1:3931 QA_HTTP=http://127.0.0.1:3931 로 실행해라");
}

export * from "../server/lib.js";
export const ADMIN_CODE = "qaspectateadmin1234";

import { signup, sleep, type C, type Msg } from "../server/lib.js";

/** 관리자 계정 하나 만든다. */
export async function admin(prefix = "관"): Promise<{ c: C; name: string }> {
  const { c, name } = await signup(undefined, "qatest1234", ADMIN_CODE);
  void prefix;
  return { c, name };
}

/** 사람 1 + 봇 3 방을 만들고 게임 시작까지. */
export async function botTable(host: C, mode = "tonpuu"): Promise<string> {
  host.send({ type: "createRoom" });
  const rc = await host.wait("roomCreated", 10000);
  const code = rc["code"] as string;
  host.send({ type: "setGameMode", mode });
  for (let i = 0; i < 3; i++) {
    host.send({ type: "addBot" });
    await sleep(60);
  }
  await sleep(250);
  host.send({ type: "startGame" });
  await host.wait("view", 15000);
  return code;
}

export function ok(cond: boolean, label: string, extra?: unknown): void {
  console.log(`${cond ? "  OK " : "FAIL "} ${label}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`);
}

export type { C, Msg };
