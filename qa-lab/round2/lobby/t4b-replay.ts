/** lobby QA #4b — 실제 판 → 리플레이 재구성 대조 (RoomManager.test 방식 그대로). */
import { readFile } from "node:fs/promises";
import { newHarness, cleanup, reg, chk, summary, tick } from "./h.js";
import { rebuildReplay, replaySettlements } from "../../../packages/client/src/replayRebuild.js";

const h = await newHarness();
const me = await reg(h, "Rec", { autoRespond: true });
me.clientSend({ type: "createRoom" });
await tick();
const code = me.last("roomCreated").code;
for (let i = 0; i < 3; i++) me.clientSend({ type: "addBot" });
me.clientSend({ type: "startGame" });
const t0 = Date.now();
const iv = setInterval(() => {
  const types = new Map<string, number>();
  for (const m of me.sent) types.set(m.type, (types.get(m.type) ?? 0) + 1);
  console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, JSON.stringify([...types]));
}, 15000);
await me.waitFor((m) => m.type === "gameOver", 900_000);
clearInterval(iv);
await tick(500);

const over = me.last("gameOver");
console.log("서버 최종 순위:", JSON.stringify(over.rankings.map((r: any) => [r.rank, r.nickname, r.rawScore])));
const game = h.db.getGame(over.gameId)!;
const text = await readFile(game.replayPath, "utf-8");
const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
console.log("리플레이 줄 수:", lines.length);

const rb = rebuildReplay(lines);
console.log("재구성 이벤트 수:", rb.events.length, "| 국 수:", rb.roundStarts.length);
chk("모든 줄이 재적용된다", rb.events.length === lines.length - 1, `${rb.events.length} vs ${lines.length - 1}`);

const finalState = rb.states[rb.states.length - 1]!;
const rebuilt: Record<string, number> = {};
for (const [k, ps] of Object.entries(finalState.players as any)) rebuilt[/^\d+$/.test(k) ? `p${k}` : k] = (ps as any).score;
const serverScores: Record<string, number> = {};
for (const r of over.rankings) serverScores[r.playerId] = r.rawScore;
console.log("재구성:", JSON.stringify(rebuilt), "서버:", JSON.stringify(serverScores));
let same = true;
for (const [pid, sc] of Object.entries(serverScores)) if (rebuilt[pid] !== sc) same = false;
chk("재구성 점수 == 서버 최종 점수", same);

const st = replaySettlements(rb);
console.log("정산 건수:", st.length, "| 국 수:", rb.roundStarts.length, "|", st.map((s) => s.label).join(" / "));
chk("정산 건수 == 국 수", st.length === rb.roundStarts.length, `${st.length} vs ${rb.roundStarts.length}`);


// ── 정산 패널의 뒷도라 ──
let uraWins = 0, uraShown = 0;
for (const s of st) {
  for (const w of (s.result.settle as any).winInfos ?? []) {
    if ((w.uraHan ?? 0) > 0) { uraWins++; if (s.result.uraDoraIndicators.length > 0) uraShown++; }
  }
}
console.log("뒷도라 판수가 붙은 화료:", uraWins, "| 그중 표시패가 실린 것:", uraShown);
chk("뒷도라 판수가 있으면 표시패도 실린다", uraWins === 0 || uraShown === uraWins,
  `${uraWins}건 중 ${uraShown}건만 표시패 있음`);
const anyUra = st.some((s) => s.result.uraDoraIndicators.length > 0);
console.log("정산 패널에 뒷도라가 하나라도 실린 국:", anyUra);

const drafted = rb.events.filter((e: any) => e.type === "AugmentDrafted");
const missing = drafted.filter((e: any) => rb.game.augments.get(e.payload.augmentId) === undefined);
chk("재구성 카탈로그에 모든 증강이 있다", missing.length === 0, missing.map((e: any) => e.payload.augmentId).join(","));

summary();
await cleanup();
process.exit(0);
