/** s18b — 재시작 뒤: 세워 둔 판이 세워진 채로 돌아오는가 / 공지는 남는가. */
import { login, sleep, ok } from "./lib.js";
import { readFileSync } from "node:fs";
const st = JSON.parse(readFileSync(process.env["OUT"]!, "utf8"));

const A = await login(st.adminName);
A.c.send({ type: "liveGames" });
const lg = await A.c.wait("liveGames", 8000).catch(() => null);
const row = ((lg as any)?.rooms ?? (lg as any)?.games)?.find((g: any) => g.code === st.code);
console.log("liveGames 행:", JSON.stringify(row));
ok(row !== undefined, "재시작 뒤에도 판이 목록에 있다");
ok(row?.paused === true, "재시작 뒤에도 «정지» 표식이 남아 있다", { paused: row?.paused });

const P = await login(st.player);
let paused: any = null, notice: any = null, views = 0;
P.c.onMsg = (m: any) => {
  if (m.type === "gamePaused") paused = m;
  if (m.type === "roomNotice") notice = m;
  if (m.type === "view") views++;
};
P.c.send({ type: "joinRoom", code: st.code });
await P.c.wait((m: any) => m.type === "joined" || m.type === "view" || m.type === "error", 12000).catch(() => null);
await sleep(6000);
ok(paused?.paused === true, "복귀한 대국자에게 «정지 중»이 복원된다", paused);
ok(notice !== null, "재시작 뒤에도 방 공지가 남아 있다", notice);
const v0 = views;
await sleep(10000);
ok(views === v0, "세워 둔 판은 재시작 뒤에도 흐르지 않는다", { 추가뷰: views - v0 });

// 관전도 되는가
A.c.send({ type: "spectate", code: st.code });
const sp = await A.c.wait((m: any) => m.type === "spectateStarted" || m.type === "error", 8000).catch(() => null);
ok(sp?.type === "spectateStarted", "재시작 뒤에도 관전을 붙일 수 있다", sp);
let sPaused: any = null;
A.c.onMsg = (m: any) => { if (m.type === "gamePaused") sPaused = m; };
await sleep(1500);
ok(sPaused?.paused === true, "합류한 관전석에 «정지 중»이 복원된다", sPaused);

P.c.close(); A.c.close(); await sleep(300); process.exit(0);
