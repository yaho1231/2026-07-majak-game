/** 눈먼 총알이 실제로 총알을 옮기는 시드를 찾고, 그 시드에서 책임전가와 겹쳐 본다. */
import { run, table } from "./lib.js";
import { ron } from "./scenes.js";
import { K, rk } from "./keys.js";
import type { GameState } from "@majak/core";

const CHIN = { hand: "111234567m2234m", wait: "2m" };
const armedBR = (s: GameState) => ({ [K.armed("blind_ron", "p2")]: rk(s) });

const hits: number[] = [];
for (let seed = 1; seed <= 40; seed++) {
  const r = run({
    craft: { ...ron(CHIN.hand, CHIN.wait, "p1"), seed },
    augs: { p2: ["blind_ron"] },
    data: armedBR,
    winner: "p0",
  });
  const victim = (["p0", "p1", "p2", "p3"] as const).find(
    (p) => p !== "p0" && (r.deltas[p] ?? 0) < 0,
  );
  const selfPaid = (r.deltas["p0"] ?? 0) !== 24000;
  if (victim !== "p1" || selfPaid) hits.push(seed);
}
console.log("총알이 옮겨간 시드:", hits.join(",") || "(없음)");

const seed = hits[0];
if (seed === undefined) {
  console.log("옮겨간 시드 없음 — 더 넓게 훑어야 한다");
} else {
  const scene = { ...ron(CHIN.hand, CHIN.wait, "p1"), seed };
  const R = (
    augs: Record<string, string[]>,
    data?: (s: GameState) => Record<string, unknown>,
  ) => run({ craft: scene, augs, winner: "p0", ...(data ? { data } : {}) });
  table(`B9 · 책임전가(p0) × 눈먼 총알(p2) — seed=${seed}`, [
    { label: "없음", r: R({}) },
    { label: "A=blame_shift", r: R({ p0: ["blame_shift"] }) },
    { label: "B=blind_ron", r: R({ p2: ["blind_ron"] }, armedBR) },
    {
      label: "A+B",
      r: R({ p0: ["blame_shift"], p2: ["blind_ron"] }, armedBR),
    },
  ]);
}
