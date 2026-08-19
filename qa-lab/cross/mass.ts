/**
 * 대량 실행 — 실제 드래프트 · 두 모드 · 페르소나 랜덤 조합.
 * 사용: tsx qa-lab/cross/mass.ts <n> <startSeed> [mode]
 */
import { Prng } from "@majak/core";
import {
  runDraftMatch,
  auditAugments,
  auditSchedule,
  auditEnd,
  allPersonaSets,
  byId,
  type CrossIssue,
  type CrossReport,
} from "./lib.js";
import { writeFileSync } from "node:fs";

const n = Number(process.argv[2] ?? 20);
const start = Number(process.argv[3] ?? 1000);
const only = process.argv[4] as "hanchan" | "tonpuu" | undefined;

const issues: { seed: number; mode: string; kind: string; detail: string }[] = [];
const endCounts = new Map<string, number>();
const augKeyInventory = new Map<string, Set<string>>(); // key → seeds seen at round start
const roundCounts: number[] = [];
const offeredCount = new Map<string, number>();
const heldCount = new Map<string, number>();
let crashes = 0;
let t0 = Date.now();

for (let i = 0; i < n; i++) {
  const seed = start + i;
  const mode = only ?? (i % 2 === 0 ? "hanchan" : "tonpuu");
  const rng = new Prng(seed ^ 0x5eed);
  let rep: CrossReport;
  try {
    rep = await runDraftMatch({ seed, mode, personas: allPersonaSets(rng), timeoutMs: 90_000 });
  } catch (e) {
    issues.push({ seed, mode, kind: "RUNNER_THROW", detail: String(e) });
    continue;
  }
  const push = (list: CrossIssue[]): void => {
    for (const x of list) issues.push({ seed, mode, ...x });
  };
  if (rep.crash !== undefined) { crashes++; issues.push({ seed, mode, kind: "CRASH", detail: rep.crash.split("\n")[0]! }); }
  for (const e of rep.effectErrors.slice(0, 3)) issues.push({ seed, mode, kind: "EFFECT_ERROR", detail: e });
  for (const v of rep.violations.slice(0, 3)) issues.push({ seed, mode, kind: v.kind, detail: `${v.detail} @${v.round}` });
  push(auditAugments(rep));
  push(auditSchedule(rep));
  push(auditEnd(rep));
  endCounts.set(String(rep.endReason), (endCounts.get(String(rep.endReason)) ?? 0) + 1);
  roundCounts.push(rep.rounds);
  for (const s of rep.roundSnaps) {
    for (const k of s.augKeys) {
      const norm = k.replace(/p[0-3]/g, "pX").replace(/\d+/g, "#");
      if (!augKeyInventory.has(norm)) augKeyInventory.set(norm, new Set());
      augKeyInventory.get(norm)!.add(`${mode}:${seed}`);
    }
  }
  for (const d of rep.drafts) {
    for (const ids of Object.values(d.offered)) for (const id of ids) offeredCount.set(id, (offeredCount.get(id) ?? 0) + 1);
  }
  for (const held of Object.values(rep.finalAugments)) for (const id of held) heldCount.set(id, (heldCount.get(id) ?? 0) + 1);
  if ((i + 1) % 25 === 0) {
    console.log(`… ${i + 1}/${n}  ${(Date.now() - t0) / 1000}s  issues=${issues.length}`);
  }
}

console.log(`\n=== ${n} games, ${(Date.now() - t0) / 1000}s, crashes=${crashes} ===`);
console.log("end reasons:", [...endCounts].sort((a, b) => b[1] - a[1]));
console.log("rounds avg", (roundCounts.reduce((a, b) => a + b, 0) / roundCounts.length).toFixed(1),
  "max", Math.max(...roundCounts));

const byKind = new Map<string, { n: number; ex: string[] }>();
for (const x of issues) {
  const e = byKind.get(x.kind) ?? { n: 0, ex: [] };
  e.n++;
  if (e.ex.length < 4) e.ex.push(`seed=${x.seed} ${x.mode}: ${x.detail}`);
  byKind.set(x.kind, e);
}
console.log("\n=== ISSUES ===");
for (const [k, v] of [...byKind].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`\n[${k}] x${v.n}`);
  for (const e of v.ex) console.log("   ", e);
}

// 모드별 제시 커버리지 — tonpuu 전용/제외가 제대로 걸렸나 별도 확인은 audit 이 한다
const never = [...byId.keys()].filter((id) => !offeredCount.has(id));
console.log(`\n제시된 적 없는 증강 ${never.length}/${byId.size}:`, never.slice(0, 40).join(" "));

writeFileSync("qa-lab/cross/last-issues.json", JSON.stringify(issues, null, 1));
writeFileSync(
  "qa-lab/cross/aug-keys.json",
  JSON.stringify([...augKeyInventory].map(([k, v]) => [k, v.size]).sort((a, b) => b[1] - a[1]), null, 1),
);
