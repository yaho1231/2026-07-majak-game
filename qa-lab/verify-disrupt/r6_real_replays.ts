/**
 * 재검증 6 보조: **실제 서버 대국 리플레이**의 종국 분포.
 *
 * /Users/skul/majak/replays/*.jsonl 을 읽어 마지막 RoundStarted 의 장풍을 본다.
 *  - prevalentWind: 1=동 2=남 3=서
 *  - 반장전(남까지)에서 장풍 3(서)에 도달한 판 = 서입
 * 사람이 낀 판(playerMeta.isBot=false 가 하나라도)과 봇만인 판을 갈라 센다.
 *
 * 실행: tsx qa-lab/verify-disrupt/r6_real_replays.ts
 */
import { readdirSync, readFileSync } from "node:fs";

const DIR = "/Users/skul/majak/replays";
const files = readdirSync(DIR).filter((f) => f.endsWith(".jsonl"));

interface Row { human: boolean; maxWind: number; rounds: number; mode: string; }
const rows: Row[] = [];

for (const f of files) {
  let text: string;
  try { text = readFileSync(`${DIR}/${f}`, "utf8"); } catch { continue; }
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 5) continue;
  let human = false;
  let mode = "?";
  try {
    const init = JSON.parse(lines[0]!) as any;
    const meta = init?.payload?.config?.playerMeta ?? {};
    human = Object.values(meta).some((m: any) => m?.isBot === false);
    mode = String(init?.payload?.config?.mode ?? "?");
  } catch { /* ignore */ }
  /*
   * ⚠ RoundSettled 의 prevalentWind/roundNumber 는 **다음 국의** 값이다
   * (standardActions.ts:1126 — payload 는 advanceRound 결과인 next 를 싣는다).
   * 그래서 "실제로 친 마지막 국의 장풍"은 **끝에서 두 번째** settle 이 말한 값이다.
   */
  const winds: number[] = [];
  for (const l of lines) {
    if (!/"type":"RoundSettled"/.test(l)) continue;
    const w = /"prevalentWind":(\d+)/.exec(l);
    winds.push(w === null ? 0 : Number(w[1]));
  }
  const rounds = winds.length;
  if (rounds === 0) continue;
  const maxWind = rounds >= 2 ? (winds[rounds - 2] ?? 1) : 1;
  rows.push({ human, maxWind, rounds, mode });
}

function report(label: string, rs: Row[]): void {
  if (rs.length === 0) { console.log(`${label}: 표본 없음`); return; }
  const west = rs.filter((r) => r.maxWind >= 3).length;
  const south = rs.filter((r) => r.maxWind === 2).length;
  const east = rs.filter((r) => r.maxWind === 1).length;
  const avg = rs.reduce((s, r) => s + r.rounds, 0) / rs.length;
  console.log(
    `${label}: ${rs.length}판  동에서 끝 ${east} · 남까지 ${south} · 서입 ${west} (${((west / rs.length) * 100).toFixed(1)}%)  평균 ${avg.toFixed(1)}국`,
  );
}

const hanchan = rows.filter((r) => r.mode === "hanchan");
const tonpuu = rows.filter((r) => r.mode === "tonpuu");
console.log(`리플레이 ${rows.length}판 (mode 표기 있음: hanchan ${hanchan.length} / tonpuu ${tonpuu.length} / 미표기 ${rows.length - hanchan.length - tonpuu.length})`);
report("반장전 전체", hanchan);
report("반장전 · 사람이 낀 판", hanchan.filter((r) => r.human));
report("반장전 · 봇만", hanchan.filter((r) => !r.human));
report("동풍전 전체 (서입=남입)", tonpuu);
report("전체", rows);
report("사람이 낀 판", rows.filter((r) => r.human));
report("봇만", rows.filter((r) => !r.human));
// 반장전으로 보이는 것만 — 남(2)까지 갔거나 서입한 판
report("남 이상 진행(=반장전으로 판단)", rows.filter((r) => r.maxWind >= 2));
report("남 이상 · 사람이 낀 판", rows.filter((r) => r.maxWind >= 2 && r.human));
