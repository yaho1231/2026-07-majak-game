import { PERSONAS, runMatch } from "../../harness.js";
const P = { p0: PERSONAS.chaos!, p1: PERSONAS.chaos!, p2: PERSONAS.caller!, p3: PERSONAS.folder! };
for (const ids of [[], ["broken_border"]]) {
  const t = Date.now();
  for (const seed of [1, 2]) {
    await runMatch({ seed, mode: "tonpuu", preset: { p0: ids, p1: [], p2: [], p3: [] } as never, personas: P });
  }
  console.log(JSON.stringify(ids), ((Date.now() - t) / 2 / 1000).toFixed(1) + "s/판 (PersonaAgent, 봇 계산 없음)");
}
