/**
 * augmentData 키 증식 — 국 경계에서 지워져야 할 것이 남는가 / 국마다 새 키가 쌓이는가.
 * 국 스코프(#round) 키는 setupRound 가 지운다. 반면 키 이름에 국 번호를 박아 만든
 * 키(`x:1-1-0:p0`)는 아무도 지우지 않아 국마다 쌓인다.
 */
import { Prng } from "@majak/core";
import { runDraftMatch, allPersonaSets } from "./lib.js";

const seed = Number(process.argv[2] ?? 7);
const mode = (process.argv[3] ?? "hanchan") as "hanchan" | "tonpuu";
const rep = await runDraftMatch({ seed, mode, personas: allPersonaSets(new Prng(seed ^ 0x5eed)) });

const roundish = /\b\d+-\d+-\d+\b/;
console.log(`seed=${seed} ${mode} rounds=${rep.rounds} end=${rep.endReason}`);
console.log("augs", JSON.stringify(rep.finalAugments));
let prev: string[] = [];
for (const s of rep.roundSnaps) {
  const added = s.augKeys.filter((k) => !prev.includes(k));
  const gone = prev.filter((k) => !s.augKeys.includes(k));
  const stale = s.augKeys.filter((k) => roundish.test(k) && !k.includes(`${s.wind}-${s.round}-${s.honba}`));
  console.log(
    `R${s.idx} ${s.wind}-${s.round}-${s.honba}  keys=${s.augKeys.length} (+${added.length}/-${gone.length})  국번호박힌_지난키=${stale.length}`,
  );
  if (stale.length > 0 && s.idx === rep.roundSnaps.length) console.log("    ", stale.join("\n     "));
  prev = s.augKeys;
}
const finalKeys = Object.keys(rep.finalAugData);
console.log(`\n최종 키 ${finalKeys.length}개, 그중 국번호 박힌 것 ${finalKeys.filter((k) => roundish.test(k)).length}개`);
console.log("#round 마크 남은 것:", finalKeys.filter((k) => k.endsWith("#round")).length);
