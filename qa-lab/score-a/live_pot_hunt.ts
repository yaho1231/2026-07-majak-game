/**
 * 실경기에서 "공탁이 배수에 태워졌다"를 실측한다.
 * 화료 정산에서 회수 공탁 gain>0 이고 화료자가 jackpot(배수≠1) 또는 blood_contract(계약 적중)을
 * 들고 있으면, augPoints에 기록된 증가분이 공탁을 포함해 계산됐는지 본다.
 */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { PERSONAS, runMatch2 } from "./lib.js";
import { roundKey } from "../../packages/content/src/util.js";

const N = Number(process.argv[2] ?? 40);
let hits = 0, rounds = 0;
for (let seed = 1; seed <= N; seed++) {
  const rng = new Prng(seed * 31 + 5);
  const preset: Record<PlayerId, string[]> = {
    p0: ["jackpot", "blood_contract"],
    p1: ["let_it_ride", "counter"],
    p2: ["jackpot", "big_hand"],
    p3: ["blood_contract", "counter"],
  };
  if (rng.int(2) === 0) { preset.p0 = ["blood_contract", "jackpot"]; }
  await runMatch2({
    seed,
    preset: preset as never,
    personas: {
      p0: PERSONAS.riichiRusher!, p1: PERSONAS.riichiRusher!,
      p2: PERSONAS.masher!, p3: PERSONAS.riichiRusher!,
    },
    onSettle: (o) => {
      rounds++;
      const p = o.payload;
      if (p.outcome !== "win") return;
      const first = (p.winInfos ?? [])[0];
      const gain = (first as { riichiPotGain?: number } | undefined)?.riichiPotGain ?? 0;
      if (gain <= 0 || first === undefined) return;
      const w = first.winner;
      const rk = roundKey(o.before);
      const mult = o.before.augmentData[`jackpot:mult:${rk}:${w}`];
      const contract = o.before.augmentData[`blood_contract:yaku:${rk}:${w}`];
      const contractHit = typeof contract === "string" && first.yaku.some((y) => y.id === contract);
      if ((typeof mult === "number" && mult !== 1) || contractHit) {
        const m = typeof mult === "number" && mult !== 1 ? mult : 1;
        const bc = contractHit ? 1.5 : 1;
        const note = (p.augPoints ?? []).filter((n) => n.player === w && (n.augId === "jackpot" || n.augId === "blood_contract"));
        // 공탁을 뺀 올바른 계산과 비교
        console.log(
          `seed=${seed} ${rk} winner=${w} 손=${first.points} 공탁회수=${gain} ` +
            `jackpot=${m} contract=${contractHit ? contract : "-"} delta=${p.deltas[w]} ` +
            `augPoints=${JSON.stringify(note)} riichiPot(payload)=${p.riichiPot}`,
        );
        hits++;
      }
    },
  });
}
console.log(`\n${N}매치 ${rounds}국 — 공탁×배수 동시 발생 ${hits}건`);
