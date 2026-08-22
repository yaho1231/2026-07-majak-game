/** lobby QA #4 — 실제 판을 돌려 리플레이를 남기고, 클라이언트 replayRebuild 로 재구성해 대조한다. */
import { readFile } from "node:fs/promises";
import { newHarness, cleanup, reg, chk, summary, tick } from "./h.js";
import { rebuildReplay, replaySettlements } from "../../../packages/client/src/replayRebuild.js";

const h = await newHarness();
const me = await reg(h, "Rec", { autoRespond: true });
me.clientSend({ type: "createRoom" });
await me.waitFor((m) => m.type === "lobby");
const code = me.last("roomCreated").code;
await h.rm.fillWithBots(code);
await me.waitFor((m) => m.type === "gameOver", 180_000);
await tick(500);

const over = me.last("gameOver");
console.log("서버 최종 순위:", JSON.stringify(over.rankings.map((r: any) => [r.rank, r.nickname, r.rawScore])));
console.log("gameId:", over.gameId);

const game = h.db.getGame(over.gameId)!;
const text = await readFile(game.replayPath, "utf-8");
const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
console.log("리플레이 줄 수:", lines.length);

const rb = rebuildReplay(lines);
console.log("재구성 이벤트 수:", rb.events.length, "| 국 수:", rb.roundStarts.length);
chk("모든 줄이 재적용된다 (중간에서 끊기지 않는다)", rb.events.length === lines.length - 1,
  `${rb.events.length} vs ${lines.length - 1}`);

const finalState = rb.states[rb.states.length - 1]!;
const rebuilt: Record<string, number> = {};
for (const [pid, ps] of Object.entries(finalState.players as any)) rebuilt[pid] = (ps as any).score;
console.log("재구성 최종 점수:", JSON.stringify(rebuilt));

const serverScores: Record<string, number> = {};
for (const r of over.rankings) serverScores[r.playerId] = r.rawScore;
console.log("서버 최종 점수:", JSON.stringify(serverScores));

let same = true;
for (const [pid, sc] of Object.entries(serverScores)) if (rebuilt[pid] !== sc) same = false;
chk("재구성 점수 == 서버 최종 점수", same, `rebuilt=${JSON.stringify(rebuilt)} server=${JSON.stringify(serverScores)}`);

// 점수 총합 보존
const sum = Object.values(rebuilt).reduce((a, b) => a + b, 0);
console.log("재구성 점수 총합:", sum);

// 정산 패널
const st = replaySettlements(rb);
console.log("정산 건수:", st.length, st.map((s) => s.label).join(" / "));
chk("정산 건수 == 국 수", st.length === rb.roundStarts.length, `${st.length} vs ${rb.roundStarts.length}`);

// 증강 설치가 재구성에서도 이뤄졌는지
const drafted = rb.events.filter((e: any) => e.type === "AugmentDrafted");
console.log("증강 드래프트 이벤트:", drafted.length, drafted.map((e: any) => e.payload.augmentId).join(","));
const missing = drafted.filter((e: any) => rb.game.augments.get(e.payload.augmentId) === undefined);
chk("재구성 카탈로그에 모든 증강이 있다", missing.length === 0, missing.map((e:any)=>e.payload.augmentId).join(","));

summary();
await cleanup();
process.exit(0);
