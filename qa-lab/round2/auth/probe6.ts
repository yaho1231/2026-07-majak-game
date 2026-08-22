/** 재전송 큐가 실제로 만드는 순서: guestPlay 직후 login/register 가 같은 소켓으로 나간다. */
import { newHarness, conn, speak, cleanup, tick } from "./harness.js";
const log = (t: string, ...a: unknown[]) => console.log(`\n=== ${t} ===`, ...a);

async function main() {
  const { rm } = newHarness();
  await speak(rm, { type: "register", username: "미리가입", password: "goodpass123" });

  log("flushPendingSends 순서 재현: [guestPlay, login] 을 연달아 보낸다");
  const c = conn(rm);
  // resendPolicy.RESENDABLE_MESSAGES 에 guestPlay·login 이 둘 다 있다 →
  // 끊긴 사이 «바로 한 판»과 «로그인»을 차례로 누르면 재연결 때 이 순서로 나간다.
  c.clientSend({ type: "guestPlay" });
  c.clientSend({ type: "login", username: "미리가입", password: "goodpass123" });
  await c.waitFor((m) => m.type === "authOk" && m.sessionToken !== "", 8000);
  console.log("최종 authOk:", JSON.stringify(c.last("authOk")));
  c.clear();
  c.clientSend({ type: "createRoom" });
  c.clientSend({ type: "statsRequest" });
  c.clientSend({ type: "replayList" });
  c.clientSend({ type: "friendList" });
  c.clientSend({ type: "changePassword", currentPassword: "goodpass123", newPassword: "brandnew99" });
  await tick(300);
  console.log("로그인했는데 홈 기능 전부:", JSON.stringify(c.all("error").map((m: any) => m.code)));
  console.log("성공 응답:", JSON.stringify(c.sent.filter((m: any) => m.type !== "error").map((m: any) => m.type)));
  const rooms = (rm as any).rooms as Map<string, any>;
  console.log("유령 체험 방:", [...rooms.values()].filter((r) => r.guest).length, "개 (phase:", [...rooms.values()].map((r) => r.phase).join(",") + ")");
  cleanup();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
