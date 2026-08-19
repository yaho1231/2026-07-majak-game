import { runPair } from "./lib.js";
const cases: [string, string, number, number][] = [
  ["take_back", "disarm", 5000, 0],
  ["jackpot", "reload", 5279, 0],
  ["future_sight", "reload", 5251, 2],
  ["seat_swap", "reload", 5223, 1],
];
for (const [a, b, seed, mix] of cases) {
  const r = await runPair({ a, b, bucket: "usesCtl" }, seed, "hanchan", mix, true);
  console.log(`${a}×${b} seed=${seed} rounds=${r.rounds} bad=${JSON.stringify([...new Set(r.bad.map((v) => v.kind))])}`);
  for (const v of r.bad.slice(0, 4)) console.log("   ", v.kind, v.seat, v.round, v.detail.slice(0, 200));
}
