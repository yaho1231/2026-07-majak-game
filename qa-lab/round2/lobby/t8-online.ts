/** lobby QA #8 — 친구 온라인 표시가 접속/이탈 때 갱신되는가. */
import { newHarness, cleanup, reg, login, chk, summary, tick } from "./h.js";

const h = await newHarness();
const a = await reg(h, "OnA");
const b = await reg(h, "OnB");
a.clientSend({ type: "friendRequest", nickname: "OnB" }); await tick();
b.clientSend({ type: "friendRespond", nickname: "OnA", accept: true }); await tick();

// B 가 나간다
b.close(); await tick(50);
a.clear();
await tick(300);
console.log("B 이탈 후 A 가 받은 메시지:", JSON.stringify(a.sent.map((m: any) => m.type)));
chk("친구가 나가면 내 친구 목록이 갱신된다", a.last("friendList") !== undefined,
  "아무 push 도 오지 않았다");

// B 가 다시 들어온다
const b2 = await login(h, "OnB");
await tick(300);
console.log("B 재접속 후 A 가 받은 메시지:", JSON.stringify(a.sent.map((m: any) => m.type)));
chk("친구가 접속하면 내 친구 목록이 갱신된다", a.last("friendList") !== undefined,
  "아무 push 도 오지 않았다");

// 직접 물으면 정확한가
a.clear();
a.clientSend({ type: "friendList" }); await tick();
console.log("직접 물었을 때:", JSON.stringify(a.last("friendList").friends));

// B 가 대국을 시작하면 playing 이 갱신되는가
b2.clientSend({ type: "createRoom" }); await tick();
a.clear();
await tick(200);
console.log("B 가 방을 만든 뒤 A 가 받은 것:", JSON.stringify(a.sent.map((m: any) => m.type)));

summary();
await cleanup();
process.exit(0);
