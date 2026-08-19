/** 실제 대국(드래프트 정상 경로)에서 같은 증강을 두 사람이 보유 — seed 3443 tonpuu */
import { Prng } from "@majak/core";
import { runDraftMatch, allPersonaSets } from "./lib.js";

const seed = Number(process.argv[2] ?? 3443);
const mode = (process.argv[3] ?? "tonpuu") as "hanchan" | "tonpuu";
const rep = await runDraftMatch({ seed, mode, personas: allPersonaSets(new Prng(seed ^ 0x5eed)) });
for (const d of rep.drafts) {
  console.log(`--- ${d.stage} @${d.wind}-${d.round}-${d.honba}`);
  for (const s of ["p0", "p1", "p2", "p3"]) {
    console.log(`   offer ${s}: ${(d.offered[s] ?? []).join(", ")}`);
  }
  console.log("   held:", JSON.stringify(d.held));
}
console.log("\nfinal:", JSON.stringify(rep.finalAugments));
const owner = new Map<string, string>();
for (const [s, held] of Object.entries(rep.finalAugments))
  for (const id of held) {
    if (owner.has(id)) console.log(`>>> DUP_GAME: ${id} = ${owner.get(id)} + ${s}`);
    else owner.set(id, s);
  }
