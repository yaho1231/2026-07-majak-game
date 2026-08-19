/**
 * 결정론 — 같은 시드·같은 페르소나로 두 번 돌리면 이벤트 로그까지 같아야 한다.
 * 사용: tsx qa-lab/cross/determinism.ts <n> <startSeed>
 */
import { Prng } from "@majak/core";
import { runDraftMatch, allPersonaSets } from "./lib.js";

const n = Number(process.argv[2] ?? 10);
const start = Number(process.argv[3] ?? 500);
let bad = 0;

for (let i = 0; i < n; i++) {
  const seed = start + i;
  const mode = i % 2 === 0 ? "hanchan" : "tonpuu";
  const mk = (): ReturnType<typeof allPersonaSets> => allPersonaSets(new Prng(seed ^ 0x5eed));
  const a = await runDraftMatch({ seed, mode, personas: mk(), timeoutMs: 90_000 });
  const b = await runDraftMatch({ seed, mode, personas: mk(), timeoutMs: 90_000 });
  const same =
    a.logDigest === b.logDigest &&
    JSON.stringify(a.finalScores) === JSON.stringify(b.finalScores) &&
    a.endReason === b.endReason &&
    JSON.stringify(a.finalAugments) === JSON.stringify(b.finalAugments);
  if (!same) {
    bad++;
    console.log(`MISMATCH seed=${seed} ${mode}`);
    console.log("  digest", a.logDigest, b.logDigest);
    console.log("  scores", JSON.stringify(a.finalScores), JSON.stringify(b.finalScores));
    console.log("  end", a.endReason, b.endReason, "rounds", a.rounds, b.rounds);
    console.log("  augs A", JSON.stringify(a.finalAugments));
    console.log("  augs B", JSON.stringify(b.finalAugments));
    // 어디서 갈렸나 — 라운드 스냅 비교
    for (let k = 0; k < Math.max(a.roundSnaps.length, b.roundSnaps.length); k++) {
      const x = JSON.stringify(a.roundSnaps[k]);
      const y = JSON.stringify(b.roundSnaps[k]);
      if (x !== y) { console.log(`  first diff at round ${k}:\n   A ${x}\n   B ${y}`); break; }
    }
  } else {
    console.log(`ok seed=${seed} ${mode} len=${a.logLen}`);
  }
}
console.log(`\n${n} pairs, ${bad} mismatches`);
