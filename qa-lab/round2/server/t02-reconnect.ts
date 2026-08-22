/** 대국 중 끊김 → 재접속. 손패·증강·프롬프트 복원 검증. */
import { C, signup, login, hostRoomWithBots, autoPlay, sleep, health } from "./lib.js";

const { c, name, pw } = await signup();
autoPlay(c);
const code = await hostRoomWithBots(c, "tonpuu");
await c.wait("view", 20000);
await sleep(4000);
const before = c.last("view")!.view;
console.log("before: seat", before.you ?? before.playerId, "hand", (before.hand ?? []).length, "augments", JSON.stringify(before.augments ?? before.myAugments ?? []).slice(0,200));
console.log("view keys:", Object.keys(before));

// 네트워크 단절 (FIN 없음)
c.kill();
await sleep(1500);
console.log("health after kill", await health());

// 같은 계정으로 재로그인 → joinRoom
const { c: c2, auth } = await login(name, pw);
console.log("resumeRoom on auth:", auth.resumeRoom);
autoPlay(c2);
c2.send({ type: "joinRoom", code });
const v2 = await c2.wait("view", 15000).catch((e) => { console.log("NO VIEW AFTER REJOIN:", e.message); return null; });
if (v2) {
  const after = v2.view;
  console.log("after: hand", (after.hand ?? []).length);
  console.log("joined msg:", JSON.stringify(c2.last("joined")));
  console.log("prompt after rejoin?", c2.count("prompt"));
}
await sleep(6000);
console.log("still playing:", (await health()));
console.log("c2 msg types:", [...new Set(c2.log.map(m=>m.type))].join(","));
c2.close();
await sleep(300);
process.exit(0);
