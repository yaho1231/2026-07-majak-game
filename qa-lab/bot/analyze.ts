/**
 * 계측 결과 요약기.  tsx qa-lab/bot/analyze.ts <forced.json> [arena.json ...]
 */
import { readFileSync } from "node:fs";
import { contentAugments } from "@majak/content";

const byId = new Map(contentAugments.map((d) => [d.id, d]));
const forcedPath = process.argv[2]!;
const f = JSON.parse(readFileSync(forcedPath, "utf8")) as { rows: any[] };

const hasPolicy = (id: string): boolean => byId.get(id)?.bot !== undefined;

console.log(`=== 강제 스위프: ${f.rows.length}종 ===`);
const active = f.rows.filter((r) => r.actions.length > 0 || r.opportunity > 0);
console.log(`액션을 가진 증강(관측): ${active.length}`);

console.log("\n--- 기회는 있었는데 한 번도 발동 안 함 (opp>0, fired=0) ---");
for (const r of f.rows.filter((r) => r.opportunity > 0 && r.fired === 0)) {
  console.log(
    `${r.id.padEnd(22)} opp=${String(r.opportunity).padStart(4)} prop=${r.proposed} policy=${hasPolicy(r.id)} lostTo=${JSON.stringify(r.lostTo ?? []).slice(0, 90)}`,
  );
}

console.log("\n--- 정책은 제안했는데 발동률이 낮음 (prop>0, fired/prop<0.5) ---");
for (const r of f.rows.filter((r) => r.proposed > 0 && r.fired / r.proposed < 0.5)) {
  console.log(`${r.id.padEnd(22)} prop=${r.proposed} fired=${r.fired} lostTo=${JSON.stringify(r.lostTo ?? []).slice(0, 90)}`);
}

console.log("\n--- 정책 없는 증강인데 봇이 눌렀다 (난수 경로) ---");
for (const r of f.rows.filter((r) => r.fired > 0 && !hasPolicy(r.id))) {
  console.log(`${r.id.padEnd(22)} fired=${r.fired} opp=${r.opportunity} sample=${(r.samples ?? [])[0] ?? ""}`);
}

console.log("\n--- 정책이 아예 없는데 봇에게 선택지가 제시됨 (bot=undefined, opp>0) ---");
for (const r of f.rows.filter((r) => r.opportunity > 0 && !hasPolicy(r.id))) {
  console.log(`${r.id.padEnd(22)} opp=${r.opportunity} fired=${r.fired} actions=${r.actions.join(",")}`);
}

console.log("\n--- 자기 지목 ---");
for (const r of f.rows.filter((r) => (r.selfTarget ?? 0) > 0)) {
  console.log(`${r.id.padEnd(22)} selfTarget=${r.selfTarget} / fired=${r.fired} sample=${(r.samples ?? [])[0]}`);
}

// 액션→증강 귀속 교차검증: 소스에 그 액션 문자열이 실제로 있는가
import { readdirSync, readFileSync as rf } from "node:fs";
const dir = new URL("../../packages/content/src/augments/", import.meta.url).pathname;
const srcOf = new Map<string, string>();
for (const fn of readdirSync(dir)) if (fn.endsWith(".ts")) srcOf.set(fn.replace(/\.ts$/, ""), rf(dir + fn, "utf8"));
console.log("\n--- 액션 귀속 검증 (소스에 문자열이 없는 것) ---");
for (const r of f.rows) {
  for (const a of r.actions ?? []) {
    const src = srcOf.get(r.id);
    if (src !== undefined && !src.includes(`"${a}"`)) console.log(`  ${r.id} <- ${a} (소스에 없음)`);
  }
}

console.log("\n--- 예외 · 크래시 · 미제시 옵션 ---");
for (const r of f.rows) {
  if (r.crash !== null) console.log(`CRASH ${r.id}: ${String(r.crash).split("\n")[0]}`);
  if (r.threw > 0) console.log(`POLICY THREW ${r.id} x${r.threw}: ${JSON.stringify(r.contentFailures)}`);
  if (r.throws > 0) console.log(`decideNow THREW ${r.id} x${r.throws}`);
  if ((r.unoffered ?? []).length > 0) console.log(`UNOFFERED ${r.id}: ${JSON.stringify(r.unoffered)}`);
  if ((r.effectErrors ?? []).length > 0) console.log(`EFFECT_ERR ${r.id}: ${r.effectErrors.slice(0, 3).join(" | ")}`);
}

for (const p of process.argv.slice(3)) {
  const a = JSON.parse(readFileSync(p, "utf8")) as any;
  console.log(`\n=== 아레나 ${p} — ${a.games}판 ${a.mode} · ${a.rounds}국 · 결정 ${a.decisions} ===`);
  console.log(
    `crash=${a.crash === null ? "-" : a.crash.slice(0, 200)} decideNowThrows=${a.decideNowThrows.length} contentFailures=${JSON.stringify(a.contentFailures)} unoffered=${JSON.stringify(a.unofferedWarns)}`,
  );
  console.log(`conflicts=${JSON.stringify(a.conflictViolations)} modeViol=${JSON.stringify(a.modeViolations)}`);
  const offeredNeverPicked = (a.arenaAug ?? [])
    .filter((r: any) => r.offered >= 8 && r.picked === 0)
    .map((r: any) => `${r.id}(offered ${r.offered}, power ${r.power ?? "-"})`);
  console.log(`제시 8회 이상인데 한 번도 안 뽑음: ${offeredNeverPicked.join(", ") || "없음"}`);
  const rows = (a.augStats ?? []).filter((r: any) => r.opportunity > 0);
  rows.sort((x: any, y: any) => y.opportunity - x.opportunity);
  console.log("보유 중 기회 대비 발동:");
  for (const r of rows) {
    console.log(
      `  ${r.id.padEnd(22)} opp=${String(r.opportunity).padStart(4)} fired=${String(r.fired).padStart(3)} prop=${String(r.proposed).padStart(3)} selfTarget=${r.selfTarget ?? 0}`,
    );
  }
}
