/**
 * 과제 H 스모크 — qa-lab/harness.ts 신규 옵션 검증
 *   · RunOpts.drafts:false  → __init__ 의 draftSchedules 가 [] 이고 preset 만 설치된다
 *   · RunOpts.onEvent       → 첫 줄이 __init__ 인 리플레이 JSONL 이 그대로 흘러온다, 같은 시드 두 번 = 같은 로그
 *   · assignPreset(..., includeStandard) → 기본 풀엔 standard 4종이 절대 없고, true 면 나올 수 있다
 *   · preset 에 standard id(iron_wall …)를 강제하면 1국 시작 시 실제로 설치돼 있다
 *
 * 사용: npx tsx qa-lab/round5/harness-opts/smoke.ts [shard=0] [shards=1] [games=12]
 * 결과: qa-lab/round5/harness-opts/out/smoke-<shard>of<shards>.jsonl — 판마다 seed·preset·mode·persona·ms·검사
 * 종료코드: 검사 하나라도 실패하면 1
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Prng, standardAugments } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { PERSONAS, SEATS, allAugments, assignPreset, byId, runMatch } from "../../harness.js";
import type { Persona, RunOpts } from "../../harness.js";

const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const games = Number(process.argv[4] ?? 12);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `smoke-${shard}of${shards}.jsonl`);
writeFileSync(outFile, "");

const STD = standardAugments.map((d) => d.id);
const pnames = Object.keys(PERSONAS);
let failed = 0;
const fail = (what: string): void => { failed++; console.log(`FAIL ${what}`); };

// ── 정적 검사 (엔진 없이) ──
const staticChecks = {
  allAugments: allAugments.length,
  byIdHasStandard: STD.every((id) => byId.has(id)),
  // 기본 풀(includeStandard 생략)은 standard 를 절대 뽑지 않는다 → 기존 스위프 재현 불변
  defaultPoolExcludesStandard: (() => {
    for (let s = 0; s < 300; s++) {
      const p = assignPreset(new Prng(s), s % 2 ? "hanchan" : "tonpuu", [], 2);
      if (Object.values(p).flat().some((id) => STD.includes(id))) return false;
    }
    return true;
  })(),
  includeStandardCanDraw: (() => {
    for (let s = 0; s < 300; s++) {
      const p = assignPreset(new Prng(s), s % 2 ? "hanchan" : "tonpuu", [], 2, true);
      if (Object.values(p).flat().some((id) => STD.includes(id))) return true;
    }
    return false;
  })(),
};
console.log("static", JSON.stringify(staticChecks));
if (!staticChecks.byIdHasStandard) fail("byId 에 standard 4종 없음");
if (!staticChecks.defaultPoolExcludesStandard) fail("기본 assignPreset 풀에 standard 가 섞임 (재현 깨짐)");
if (!staticChecks.includeStandardCanDraw) fail("includeStandard=true 인데 300시드 동안 standard 가 한 번도 안 뽑힘");

// ── 동적 검사 ──
interface GameArgs {
  seed: number;
  mode: "hanchan" | "tonpuu";
  preset: Record<PlayerId, string[]>;
  personaNames: string[];
  drafts: boolean;
}
interface GameRun {
  lines: string[];
  installedAtRound1: Record<PlayerId, string[]> | undefined;
  report: Awaited<ReturnType<typeof runMatch>>;
  ms: number;
}
async function play(a: GameArgs): Promise<GameRun> {
  const personas = Object.fromEntries(
    SEATS.map((s, k) => [s, PERSONAS[a.personaNames[k]!]!]),
  ) as Record<PlayerId, Persona>;
  const lines: string[] = [];
  let installedAtRound1: Record<PlayerId, string[]> | undefined;
  const opts: RunOpts = {
    seed: a.seed, mode: a.mode, preset: a.preset, personas, timeoutMs: 90_000,
    onEvent: (l) => { lines.push(l); },
    onRound: (st, phase) => {
      if (phase === "start" && installedAtRound1 === undefined) {
        installedAtRound1 = Object.fromEntries(
          st.players.map((p) => [p.id, [...p.augments]]),
        ) as Record<PlayerId, string[]>;
      }
    },
    ...(a.drafts ? {} : { drafts: false }),
  };
  const t0 = Date.now();
  const report = await runMatch(opts);
  return { lines, installedAtRound1, report, ms: Date.now() - t0 };
}

const msByKind: Record<"noDraft" | "default", number[]> = { noDraft: [], default: [] };
for (let i = 0; i < games; i++) {
  if (i % shards !== shard) continue;
  const seed = 500_000 + i;
  const rng = new Prng(seed * 2654435761);
  const mode: "hanchan" | "tonpuu" = i % 2 === 0 ? "hanchan" : "tonpuu";
  const forced = [STD[i % STD.length]!]; // standard 4종을 돌아가며 p0 에 강제 (X-11)
  const preset = assignPreset(rng, mode, forced, 2, true);
  const personaNames = SEATS.map(() => pnames[rng.int(pnames.length)]!);
  const drafts = i % 4 === 3; // 4판 중 1판은 기본(드래프트 있음)으로 돌려 시간 비교
  const args: GameArgs = { seed, mode, preset, personaNames, drafts };
  const g = await play(args);
  msByKind[drafts ? "default" : "noDraft"].push(g.ms);

  // 검사
  let init: { type?: string; payload?: { hanchan?: { draftSchedules?: unknown } } } = {};
  try { init = JSON.parse(g.lines[0] ?? "{}") as typeof init; } catch { /* 아래에서 잡힘 */ }
  const firstIsInit = init.type === "__init__";
  const initSchedules = init.payload?.hanchan?.draftSchedules;
  const drafted = g.lines.filter((l) => l.includes('"type":"AugmentDrafted"'));
  const draftedForced = drafted.some((l) => l.includes(`"${forced[0]}"`));
  const installedP0 = g.installedAtRound1?.p0 ?? [];
  const installedForced = installedP0.includes(forced[0]!);
  const presetCount = Object.values(preset).flat().length;
  const badViol = g.report.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
  const checks = {
    firstIsInit,
    initSchedulesEmpty: drafts ? null : Array.isArray(initSchedules) && initSchedules.length === 0,
    installedForced,
    draftedEvents: drafted.length,
    draftedForced,
    presetCount,
    eventLines: g.lines.length,
    lastEventType: (() => { try { return (JSON.parse(g.lines[g.lines.length - 1] ?? "{}") as { type?: string }).type; } catch { return undefined; } })(),
  };
  let deterministic: boolean | undefined;
  if (i === 0 || i === 1) {
    // 같은 인자로 한 번 더 → onEvent 로그가 바이트 단위로 같아야 한다 (B-7 미니)
    const g2 = await play(args);
    deterministic = g2.lines.join("\n") === g.lines.join("\n");
    msByKind[drafts ? "default" : "noDraft"].push(g2.ms);
  }
  const row = {
    i, seed, mode, preset, personas: personaNames, drafts, ms: g.ms,
    rounds: g.report.rounds, crash: g.report.crash?.split("\n")[0] ?? null,
    effectErrors: g.report.effectErrors.length,
    violations: badViol.map((v) => `${v.kind}@${v.round}${v.seat ? "/" + v.seat : ""}`),
    installedAtRound1: g.installedAtRound1 ?? null,
    checks, ...(deterministic === undefined ? {} : { deterministic }),
  };
  appendFileSync(outFile, JSON.stringify(row) + "\n");
  console.log(
    `i=${i} seed=${seed} ${mode} drafts=${drafts} forced=${forced[0]} ms=${g.ms} rounds=${g.report.rounds}` +
    ` init=${firstIsInit} sched=${JSON.stringify(initSchedules)} installed=${installedForced} drafted=${drafted.length}` +
    ` lines=${g.lines.length} crash=${row.crash ?? "-"} eff=${row.effectErrors} viol=${badViol.length}` +
    (deterministic === undefined ? "" : ` det=${deterministic}`),
  );
  if (!firstIsInit) fail(`i=${i} 첫 줄이 __init__ 아님`);
  if (!drafts && checks.initSchedulesEmpty !== true) fail(`i=${i} drafts:false 인데 draftSchedules=${JSON.stringify(initSchedules)}`);
  if (!installedForced) fail(`i=${i} 강제한 standard ${forced[0]} 가 1국 시작 시 p0 에 없음: ${JSON.stringify(installedP0)}`);
  if (!drafts && drafted.length > presetCount) fail(`i=${i} drafts:false 인데 AugmentDrafted ${drafted.length} > preset ${presetCount} (드래프트가 돌았다)`);
  if (deterministic === false) fail(`i=${i} 같은 시드 두 번의 onEvent 로그가 다름`);
  if (g.report.crash !== undefined) fail(`i=${i} crash: ${row.crash}`);
}

const avg = (xs: number[]): number => (xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length));
console.log(`DONE games=${msByKind.noDraft.length + msByKind.default.length} avgMs(noDraft)=${avg(msByKind.noDraft)} n=${msByKind.noDraft.length}` +
  ` avgMs(default)=${avg(msByKind.default)} n=${msByKind.default.length} failed=${failed} out=${outFile}`);
process.exitCode = failed > 0 ? 1 : 0;
