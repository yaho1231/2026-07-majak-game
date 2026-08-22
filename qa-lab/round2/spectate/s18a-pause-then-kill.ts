/** s18a — 판을 세우고 상태를 파일에 적는다. 그다음 서버를 재시작한다. */
import { admin, botTable, sleep, autoPlay, signup } from "./lib.js";
import { writeFileSync } from "node:fs";

const P = await signup();
autoPlay(P.c, { pick: (l) => l.find((o: any) => o.type === "discard") ?? l[0] });
const code = await botTable(P.c, "tonpuu");
const A = await admin();
A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);
await sleep(4000);
A.c.send({ type: "adminRoomNotice", code, text: "재개 대기 중 — 심판 판정", seconds: 3600 });
await sleep(300);
A.c.send({ type: "adminPauseGame", code, paused: true, reason: "심판 판정 중" });
await A.c.wait((m: any) => m.type === "gamePaused" && m.paused === true, 8000);
writeFileSync(process.env["OUT"]!, JSON.stringify({ code, player: P.name, adminName: A.name }));
console.log("PAUSED", code, P.name, A.name);
P.c.close(); A.c.close();
await sleep(300); process.exit(0);
