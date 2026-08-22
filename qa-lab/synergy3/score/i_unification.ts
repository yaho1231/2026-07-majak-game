/**
 * I군: 한 국에 뱅크가 얼마나 발행할 수 있나 — 천하통일(45,000)이 첫 국에 끝나는가.
 *
 * 기대: 25,000점 4명 = 테이블 100,000점. 뱅크 발행형이 겹쳐도 한 국의 발행이
 * 매치 총점을 두 배로 만들지는 않을 것이다(적어도 카드 어디에도 그런 말은 없다).
 */
import { run } from "./lib.js";
import { tsumo } from "./scenes.js";
import { K, rk } from "./keys.js";
import type { GameState } from "@majak/core";

const YK = tsumo("111m333m555m777m9m9m"); // 스안커단기 (오야 쯔모 96,000)
const merge =
  (...fs: ((s: GameState) => Record<string, unknown>)[]) =>
  (s: GameState) =>
    Object.assign({}, ...fs.map((f) => f(s)));
const sg = (h: string, t: string) => (s: GameState) => ({
  [K.scapegoatTarget(s, h)]: t,
});
const armed = (aug: string, h: string) => (s: GameState) => ({ [K.armed(aug, h)]: rk(s) });

interface Row {
  label: string;
  augs: Record<string, string[]>;
  data?: (s: GameState) => Record<string, unknown>;
}
const rows: Row[] = [
  { label: "없음", augs: {} },
  { label: "aotenjou(p0)", augs: { p0: ["aotenjou_ceiling"] } },
  {
    label: "aotenjou + scapegoat(p0→p1)",
    augs: { p0: ["aotenjou_ceiling", "scapegoat"] },
    data: sg("p0", "p1"),
  },
  {
    label: "+ die_hard(p1)",
    augs: { p0: ["aotenjou_ceiling", "scapegoat"], p1: ["die_hard"] },
    data: sg("p0", "p1"),
  },
  {
    label: "+ sign_flip(p1) 대신",
    augs: { p0: ["aotenjou_ceiling", "scapegoat"], p1: ["sign_flip"] },
    data: merge(sg("p0", "p1"), armed("sign_flip", "p1")),
  },
];

console.log("| 조합 | p0 | p1 | p2 | p3 | 테이블 총점(정산 후) | 뱅크 발행 | 45,000 돌파 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  const res = run({
    craft: YK,
    augs: r.augs,
    winner: "p0",
    ...(r.data ? { data: r.data } : {}),
  });
  const scores = (["p0", "p1", "p2", "p3"] as const).map(
    (p) => 25000 + (res.deltas[p] ?? 0),
  );
  const over = (["p0", "p1", "p2", "p3"] as const)
    .filter((p, i) => (scores[i] as number) >= 45000)
    .join(",");
  console.log(
    `| ${r.label} | ${scores[0]} | ${scores[1]} | ${scores[2]} | ${scores[3]} | ${scores.reduce((a, b) => a + b, 0)} | ${res.total} | ${over || "-"} |`,
  );
}
