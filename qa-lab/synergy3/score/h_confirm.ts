/**
 * H군: 확정 후보 재현 고정 — 시드/좌석을 바꿔도 같은 결함이 나오는가.
 */
import { run, table } from "./lib.js";
import { ron } from "./scenes.js";
import { K, rk } from "./keys.js";
import type { GameState } from "@majak/core";

const CHIN = { hand: "111234567m2234m", wait: "2m" };
const SMALL = { hand: "123m123p123s678s9s", wait: "9s" };
const armedBR = (h: string) => (s: GameState) => ({ [K.armed("blind_ron", h)]: rk(s) });
const spyMark = (h: string, key: string) => () => ({ [K.spyMark(h)]: key });
const bigHand = (h: string) => (s: GameState) => ({ [K.bigHandDeclared(h)]: rk(s) });
const merge =
  (...fs: ((s: GameState) => Record<string, unknown>)[]) =>
  (s: GameState) =>
    Object.assign({}, ...fs.map((f) => f(s)));

// H1 — blame_shift × blind_ron: 시드별로 "쏜 사람이 이득을 보는가"
console.log("### H1 · 책임전가 × 눈먼 총알 — 시드별 (p0 오야 론 24,000, 쏜 사람=p1)");
console.log("| seed | 총알 보유 | p0 | p1(쏜사람) | p2 | p3 | 합 | p1 이득? |");
console.log("|---|---|---|---|---|---|---|---|");
for (const holder of ["p0", "p2", "p3"]) {
  for (const seed of [2, 3, 5, 8, 13]) {
    const r = run({
      craft: { ...ron(CHIN.hand, CHIN.wait, "p1"), seed },
      augs: { p0: ["blame_shift"], [holder]: [...(holder === "p0" ? ["blame_shift"] : []), "blind_ron"] },
      data: armedBR(holder),
      winner: "p0",
    });
    const p1 = r.deltas["p1"] ?? 0;
    console.log(
      `| ${seed} | ${holder} | ${r.deltas["p0"]} | ${p1} | ${r.deltas["p2"]} | ${r.deltas["p3"]} | ${r.total} | ${p1 > 0 ? "⚠ 예 (+" + p1 + ")" : "아니오"} |`,
    );
  }
}

// H2 — big_hand × spy: 스파이가 쏜 사람이 아닐 때도 뱅크가 두 번 발행하는가
const tinyScene = ron(SMALL.hand, SMALL.wait, "p1");
const T = (
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
) => run({ craft: tinyScene, augs, winner: "p0", ...(data ? { data } : {}) });
table("H2 · 큰손(p0) × 스파이 — 스파이 좌석별 (오야 론 3,900 · 하한 12,000)", [
  { label: "big_hand만", r: T({ p0: ["big_hand"] }, bigHand("p0")) },
  ...(["p1", "p2", "p3"] as const).map((who) => ({
    label: `big_hand + spy(${who})`,
    r: T(
      { p0: ["big_hand"], [who]: ["spy"] },
      merge(bigHand("p0"), spyMark(who, "sou9")),
    ),
  })),
]);

// H3 — 큰손 × 스파이 × 기생충 3중
table("H3 · 큰손(p0) × 스파이(p2) × 기생충(p3→p0)", [
  { label: "big_hand", r: T({ p0: ["big_hand"] }, bigHand("p0")) },
  {
    label: "+spy(p2)",
    r: T({ p0: ["big_hand"], p2: ["spy"] }, merge(bigHand("p0"), spyMark("p2", "sou9"))),
  },
  {
    label: "+spy(p2)+parasite(p3)",
    r: T(
      { p0: ["big_hand"], p2: ["spy"], p3: ["parasite"] },
      merge(bigHand("p0"), spyMark("p2", "sou9"), (s) => ({
        [K.parasiteTarget(s, "p3")]: "p0",
      })),
    ),
  },
]);

// H4 — 책임전가 × 뚫린 천장: 초과분이 쏜 사람에게만 몰리는가 (여러 판수)
console.log("\n### H4 · 책임전가 × 뚫린 천장 — 쏜 사람만 더 낸다");
console.log("| 손 | p0 | p1(쏜사람) | p2 | p3 | 초과분 부담 |");
console.log("|---|---|---|---|---|---|");
for (const [name, hand, wait] of [
  ["8판 청일색", CHIN.hand, CHIN.wait],
  ["2판 삼색", SMALL.hand, SMALL.wait],
] as const) {
  const r = run({
    craft: ron(hand, wait, "p1"),
    augs: { p0: ["blame_shift", "aotenjou_ceiling"] },
    winner: "p0",
  });
  console.log(
    `| ${name} | ${r.deltas["p0"]} | ${r.deltas["p1"]} | ${r.deltas["p2"]} | ${r.deltas["p3"]} | p1이 ${(r.deltas["p2"] ?? 0) - (r.deltas["p1"] ?? 0)}만큼 더 낸다 |`,
  );
}
