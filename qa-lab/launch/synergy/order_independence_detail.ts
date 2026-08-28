import { PERSONAS, runMatch } from "../../harness.js";
const FIVE = ["spy", "jackpot", "big_hand", "aotenjou_ceiling", "counter"];
const REVERSED = [...FIVE].reverse();
async function main() {
  const base = { seed: 1, mode: "hanchan" as const, personas: { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.masher!, p3: PERSONAS.masher! } };
  const rA = await runMatch({ ...base, preset: { p0: FIVE, p1: [], p2: [], p3: [] } });
  const rB = await runMatch({ ...base, preset: { p0: REVERSED, p1: [], p2: [], p3: [] } });
  console.log("A actionsTaken:", JSON.stringify(rA.actionsTaken));
  console.log("B actionsTaken:", JSON.stringify(rB.actionsTaken));
}
main();
