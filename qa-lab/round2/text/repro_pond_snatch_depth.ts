/**
 * 재현: 날치기(pond_snatch)의 **description**이 후보 범위를 3분의 1로 줄여 적는다.
 *
 *  description: "상대가 최근에 버린 3장 중 1장을 주워"
 *  detail     : "상대 세 명이 각각 최근에 버린 3장(최대 9장) 중 1장을 골라"
 *  구현        : recentDiscards()가 상대 3인 × 최근 3장 = 최대 9장
 *
 * 실제 판을 돌려 p0의 순마다 pond_snatch 후보 수와 그 출처(몇 명의 바닥에서 왔는가)를 센다.
 */
import type { PlayerId } from "@majak/core";
import { runMatch2 } from "../../hand-a/run.js";
import { ScriptAgent } from "../../hand-a/agent.js";
import { PERSONAS, PersonaAgent } from "../../harness.js";

let best = { n: 0, owners: 0, sample: [] as string[] };
let seen = 0;

const p0 = new ScriptAgent("p0", (prompt) => {
  const snatch = prompt.options.filter((o: any) => o.type === "pond_snatch");
  if (snatch.length > 0) {
    seen++;
    const owners = new Set(snatch.map((o: any) => String(o.payload?.fromPlayer)));
    if (snatch.length > best.n) {
      best = {
        n: snatch.length,
        owners: owners.size,
        sample: snatch.map((o: any) => `${o.payload?.fromPlayer}#${o.payload?.snatchId}`),
      };
    }
  }
  // 날치기는 쓰지 않고 평범하게 버린다 — 후보 목록만 센다
  const d = prompt.options.find((o: any) => o.type === "discard" || o.type === "free_discard");
  return d ?? prompt.options[0];
});

const agents = [p0,
  new PersonaAgent("p1" as PlayerId, PERSONAS.caller!, 11),
  new PersonaAgent("p2" as PlayerId, PERSONAS.masher!, 22),
  new PersonaAgent("p3" as PlayerId, PERSONAS.folder!, 33)];

const r = await runMatch2({
  seed: 20260822, mode: "tonpuu", agents,
  preset: { p0: ["pond_snatch"], p1: [], p2: [], p3: [] } as any,
  draftSchedules: [],
});

console.log("판 수:", r.rounds, "/ 날치기 후보가 뜬 순:", seen);
console.log("한 순에 뜬 최대 후보 수:", best.n, "· 그 후보가 나온 상대 바닥 수:", best.owners);
console.log("후보 목록:", best.sample.join(" "));
console.log();
console.log('description  : "상대가 최근에 버린 3장 중 1장"      → 3장이라 읽힌다');
console.log('detail       : "상대 세 명이 각각 최근에 버린 3장(최대 9장)"');
console.log(`실측          : 최대 ${best.n}장 · ${best.owners}명의 바닥`);
