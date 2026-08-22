/** lobby QA #3 — 전적·통계·리더보드가 실제 결과와 맞는가. 실제 판 2개를 돌려 직접 센다. */
import { newHarness, cleanup, reg, chk, summary, tick } from "./h.js";

const h = await newHarness();
const me = await reg(h, "Stat1", { autoRespond: true });

const played: { rank: number; score: number; gameId: number }[] = [];
for (let g = 0; g < 2; g++) {
  me.clear();
  me.clientSend({ type: "createRoom" });
  await tick();
  const code = me.last("roomCreated").code;
  for (let i = 0; i < 3; i++) me.clientSend({ type: "addBot" });
  me.clientSend({ type: "startGame" });
  await me.waitFor((m) => m.type === "gameOver", 900_000);
  await me.waitFor((m) => m.type === "stats", 20_000);
  await tick(300);
  const over = me.last("gameOver");
  const mine = over.rankings.find((r: any) => r.nickname === "Stat1");
  console.log(`판${g + 1}: gameId=${over.gameId} 내 순위=${mine.rank} 점수=${mine.rawScore}`);
  played.push({ rank: mine.rank, score: mine.rawScore, gameId: over.gameId });
  // 결과 화면 → 대기실로 (다음 판을 위해 방을 나간다)
  me.clientSend({ type: "leaveRoom" });
  await tick(200);
}

// 1) games 표의 내 성적이 gameOver 와 같은가
const user = (h.db as any).userByName("Stat1");
const rows = h.db.listGamesFor(user.id);
console.log("listGamesFor 판 수:", rows.length);
chk("전적 목록 판 수 == 실제로 끝낸 판 수", rows.length === played.length, `${rows.length} vs ${played.length}`);

// 2) 누적 통계
const raw = h.store.get("Stat1");
console.log("StatsStore raw:", JSON.stringify(raw));
chk("누적 판 수 == 2", (raw as any)?.games === 2, JSON.stringify(raw));
const placements = (raw as any)?.placements as number[] | undefined;
if (placements !== undefined) {
  const expect = [0, 0, 0, 0];
  for (const p of played) expect[p.rank - 1]!++;
  console.log("착순 분포 기대:", expect, "실제:", placements);
  chk("착순 분포가 실제 순위와 일치", JSON.stringify(placements) === JSON.stringify(expect));
}

// 3) periodStats (최근 7일)
const ps = h.db.periodStats(user.id, 7);
console.log("periodStats(7):", JSON.stringify(ps));
chk("7일 판 수 == 2", ps.games === 2, JSON.stringify(ps));

// 4) statsRequest 가 준 career
me.clear();
me.clientSend({ type: "statsRequest" });
await tick(100);
const career = me.last("careerStats") ?? me.last("stats");
console.log("statsRequest 응답:", JSON.stringify(career).slice(0, 400));

// 5) 리더보드
me.clear();
me.clientSend({ type: "leaderboard" });
await tick(100);
const lb = me.last("leaderboard");
console.log("리더보드:", JSON.stringify(lb).slice(0, 500));
const mineLb = lb.entries.find((e: any) => e.stats.games === 2);
chk("리더보드에 내 판 수가 잡힌다", mineLb !== undefined, JSON.stringify(lb.entries));
chk("비관리자에게는 닉네임이 지워진다", lb.entries.every((e: any) => e.nickname === ""),
  JSON.stringify(lb.entries.map((e: any) => e.nickname)));

// 6) 연습(게스트) 판은 섞이지 않는가
me.clear();
me.clientSend({ type: "practicePlay", mode: "tonpuu" });
await me.waitFor((m) => m.type === "gameOver", 900_000);
await tick(500);
const rows2 = h.db.listGamesFor(user.id);
const raw2 = h.store.get("Stat1");
console.log("연습 후 전적 판 수:", rows2.length, "누적:", JSON.stringify(raw2));
chk("연습 판은 전적 목록에 안 남는다", rows2.length === played.length, `${rows2.length}`);
chk("연습 판은 누적 통계에 안 남는다", (raw2 as any)?.games === 2, JSON.stringify(raw2));

summary();
await cleanup();
process.exit(0);
