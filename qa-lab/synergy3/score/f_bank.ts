/**
 * F군: 뱅크 발행(BankTopUp) × 훔치기(Transfer) / 방어(Shield) / 업보.
 *
 * 기대:
 *  F1 all_or_nothing(판돈 12,000 지급) × spy: AON은 "판돈과 같은 금액을 뱅크에서
 *     추가로 받는다", spy는 "그 점수가 전부 나에게". 판돈까지 통째로 새어 나가면
 *     AON의 약속은 조용히 사라진다(큰손과 달리 Reassert 방어가 없다).
 *  F2 AON × 기생충: 판돈의 절반이 기생충에게.
 *  F3 AON × 큰손: 판돈이 먼저 얹히므로 하한이 안 걸린다(정상).
 *  F4 죽기살기 × 덤터기: 전액을 문 지목자가 되살아난다.
 *  F5 죽기살기 × 눈먼 총알: 총알을 맞은 사람이 되살아난다.
 *  F6 죽기살기 × 반전(같은 사람): 반전이 손실을 이익으로 바꾸므로 죽기살기는 안 터진다.
 *  F7 카르마 게이지: 책임전가·덤터기·눈먼총알·반전·죽기살기가 낀 국에서
 *     "국 정산에서 잃은 점수"가 실제 잃은 만큼 쌓이는가.
 */
import { run, table } from "./lib.js";
import { ron, tsumo } from "./scenes.js";
import { K, rk } from "./keys.js";
import type { GameState } from "@majak/core";

const SMALL = { hand: "123m123p123s678s9s", wait: "9s" };
const CHIN = { hand: "111234567m2234m", wait: "2m" };

const merge =
  (...fs: ((s: GameState) => Record<string, unknown>)[]) =>
  (s: GameState) =>
    Object.assign({}, ...fs.map((f) => f(s)));
const spyMark = (h: string, key: string) => () => ({ [K.spyMark(h)]: key });
const para = (h: string, t: string) => (s: GameState) => ({
  [K.parasiteTarget(s, h)]: t,
});
const bigHand = (h: string) => (s: GameState) => ({ [K.bigHandDeclared(h)]: rk(s) });
const armed = (aug: string, h: string) => (s: GameState) => ({ [K.armed(aug, h)]: rk(s) });
const aon = (h: string, amount: number) => (s: GameState) => ({
  [K.aonActive(s, h)]: amount,
  [K.aonUses(s, h)]: 1,
});
const sg = (h: string, t: string) => (s: GameState) => ({
  [K.scapegoatTarget(s, h)]: t,
});

// ── F1~F3: all_or_nothing 은 리치가 살아 있어야 한다 → riichi 상태를 심는다
const riichiRound = (h: string) => (s: GameState) => s; // placeholder (아래 craft에서 처리)

const aonScene = {
  ...ron(SMALL.hand, SMALL.wait, "p1"),
};
function withRiichi(h: string) {
  return (s: GameState): GameState => ({
    ...s,
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        [h]: { ...(s.round.byPlayer[h] as object), riichi: { turn: 1, ippatsu: false } },
      },
    },
  });
}

// run()에는 round patch만 있으므로 byPlayer를 직접 넣는다
const A = (
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
) => {
  const base = run({
    craft: aonScene,
    augs,
    winner: "p0",
    round: {
      byPlayer: undefined as never,
    } as never,
    ...(data ? { data } : {}),
  });
  return base;
};

// byPlayer 패치가 필요하므로 별도 경로: craft 결과를 직접 만든다
import { craft } from "../../../packages/content/test/helpers.js";
import {
  FlowController,
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import { DEFS, P } from "./lib.js";
import type { GameEvent, RoundSettledPayload } from "@majak/core";

function runRiichi(
  augs: Record<string, string[]>,
  seed: Record<string, unknown>,
  riichiFor: string,
  scores?: Record<string, number>,
): { deltas: Record<string, number>; total: number; notes: string } {
  let state = craft(aonScene);
  state = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      augments: [...(augs[p.id] ?? [])],
      score: scores?.[p.id] ?? p.score,
    })),
    round: {
      ...state.round,
      byPlayer: {
        ...state.round.byPlayer,
        [riichiFor]: {
          ...(state.round.byPlayer[riichiFor] as object),
          riichi: { turn: 1, ippatsu: false },
        } as never,
      },
    },
  };
  state = { ...state, augmentData: { ...state.augmentData, ...seed } };
  const game = createStandardGameFromState(state);
  for (const p of state.players) {
    for (const id of augs[p.id] ?? []) {
      installAugment(game.engine, DEFS.get(id)!, p.id, { yaku: game.yaku });
    }
  }
  const flow = new FlowController(game.engine);
  flow.begin();
  flow.submit("p0", { type: "win", payload: {} });
  const log = (flow as unknown as { engine: { eventLog: GameEvent[] } }).engine.eventLog;
  const settled = [...log].reverse().find((e) => e.type === ROUND_SETTLED)!
    .payload as RoundSettledPayload;
  const deltas = settled.deltas as Record<string, number>;
  return {
    deltas,
    total: Object.values(deltas).reduce((a, b) => a + b, 0),
    notes: (settled.augPoints ?? [])
      .map((n) => `${n.player}:${n.augId}=${n.points}`)
      .join(", "),
  };
}

function show(title: string, rows: [string, ReturnType<typeof runRiichi>][]): void {
  console.log(`\n### ${title}`);
  console.log(`| 조합 | ${P.join(" | ")} | 합 | augPoints |\n|---|---|---|---|---|---|---|`);
  for (const [label, r] of rows) {
    console.log(
      `| ${label} | ${P.map((p) => r.deltas[p] ?? 0).join(" | ")} | ${r.total} | ${r.notes} |`,
    );
  }
}

const stake = 12000;
show("F1-F3 · 모 아니면 도(판돈 12,000) × 스파이/기생충/큰손 — p0 오야 론 3,900", [
  ["없음", runRiichi({}, {}, "p0")],
  [
    "A=all_or_nothing",
    runRiichi({ p0: ["all_or_nothing"] }, aonSeed(stake), "p0"),
  ],
  ["B=spy(p1)", runRiichi({ p1: ["spy"] }, { [K.spyMark("p1")]: "sou9" }, "p0")],
  [
    "A+B",
    runRiichi(
      { p0: ["all_or_nothing"], p1: ["spy"] },
      { ...aonSeed(stake), [K.spyMark("p1")]: "sou9" },
      "p0",
    ),
  ],
  [
    "A+parasite(p2)",
    runRiichi(
      { p0: ["all_or_nothing"], p2: ["parasite"] },
      { ...aonSeed(stake), ...paraSeed("p2", "p0") },
      "p0",
    ),
  ],
  [
    "A+big_hand",
    runRiichi(
      { p0: ["all_or_nothing", "big_hand"] },
      { ...aonSeed(stake), ...bigSeed("p0") },
      "p0",
    ),
  ],
]);

function aonSeed(amount: number): Record<string, unknown> {
  const s = craft(aonScene);
  return { [K.aonActive(s, "p0")]: amount, [K.aonUses(s, "p0")]: 1 };
}
function paraSeed(h: string, t: string): Record<string, unknown> {
  const s = craft(aonScene);
  return { [K.parasiteTarget(s, h)]: t };
}
function bigSeed(h: string): Record<string, unknown> {
  const s = craft(aonScene);
  return { [K.bigHandDeclared(h)]: rk(s) };
}

// ── F4~F6: 죽기살기
const tsc = tsumo("111234567m2234m2m"); // 오야 쯔모 24,000 (각 8,000)
const T = (
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
  scores?: Record<string, number>,
) =>
  run({
    craft: tsc,
    augs,
    winner: "p0",
    ...(scores ? { scores } : {}),
    ...(data ? { data } : {}),
  });

table("F4 · 죽기살기(p1) × 덤터기(p0→p1) — p1 소지 5,000", [
  { label: "없음", r: T({}, undefined, { p1: 5000 }) },
  { label: "A=scapegoat", r: T({ p0: ["scapegoat"] }, sg("p0", "p1"), { p1: 5000 }) },
  { label: "B=die_hard(p1)", r: T({ p1: ["die_hard"] }, undefined, { p1: 5000 }) },
  {
    label: "A+B",
    r: T({ p0: ["scapegoat"], p1: ["die_hard"] }, sg("p0", "p1"), { p1: 5000 }),
  },
]);

const ronScene2 = { ...ron(CHIN.hand, CHIN.wait, "p1"), seed: 2 };
const R2 = (
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
  scores?: Record<string, number>,
) =>
  run({
    craft: ronScene2,
    augs,
    winner: "p0",
    ...(scores ? { scores } : {}),
    ...(data ? { data } : {}),
  });
table("F5 · 죽기살기(p2) × 눈먼 총알(p2) — p2 소지 5,000, 24,000 론", [
  { label: "없음", r: R2({}, undefined, { p2: 5000 }) },
  { label: "A=blind_ron(p2)", r: R2({ p2: ["blind_ron"] }, armed("blind_ron", "p2"), { p2: 5000 }) },
  { label: "B=die_hard(p2)", r: R2({ p2: ["die_hard"] }, undefined, { p2: 5000 }) },
  {
    label: "A+B",
    r: R2({ p2: ["blind_ron", "die_hard"] }, armed("blind_ron", "p2"), { p2: 5000 }),
  },
]);

table("F6 · 죽기살기(p1) × 반전(p1) — p1 소지 5,000, 24,000 방총", [
  { label: "A=die_hard", r: R2({ p1: ["die_hard"] }, undefined, { p1: 5000 }) },
  { label: "B=sign_flip", r: R2({ p1: ["sign_flip"] }, armed("sign_flip", "p1"), { p1: 5000 }) },
  {
    label: "A+B",
    r: R2({ p1: ["die_hard", "sign_flip"] }, armed("sign_flip", "p1"), { p1: 5000 }),
  },
]);

// ── F7: 카르마 게이지
function gaugeAfter(
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
  scores?: Record<string, number>,
): { deltas: Record<string, number>; gauge: number } {
  const r = run({
    craft: ronScene2,
    augs,
    winner: "p0",
    ...(scores ? { scores } : {}),
    ...(data ? { data } : {}),
  });
  const st = (r.flow as unknown as { engine: { state: GameState } }).engine.state;
  return { deltas: r.deltas, gauge: (st.augmentData[K.karmaGauge("p1")] as number) ?? 0 };
}

console.log("\n### F7 · 카르마(p1) 게이지 적립 — p0가 p1에게서 24,000 론");
console.log("| 조합 | p1 최종 delta | 게이지 | 판정 |\n|---|---|---|---|");
const karmaCases: [string, Record<string, string[]>, ((s: GameState) => Record<string, unknown>) | undefined][] = [
  ["karma만", { p1: ["karma"] }, undefined],
  ["+ blame_shift(p0)", { p0: ["blame_shift"], p1: ["karma"] }, undefined],
  ["+ blind_ron(p2)", { p1: ["karma"], p2: ["blind_ron"] }, armed("blind_ron", "p2")],
  ["+ sign_flip(p1)", { p1: ["karma", "sign_flip"] }, armed("sign_flip", "p1")],
  ["+ die_hard(p1)", { p1: ["karma", "die_hard"] }, undefined],
];
for (const [label, augs, data] of karmaCases) {
  const g = gaugeAfter(augs, data, { p1: 20000 });
  console.log(
    `| ${label} | ${g.deltas["p1"]} | ${g.gauge} | ${g.gauge === Math.max(0, -(g.deltas["p1"] ?? 0)) ? "일치" : "⚠ 불일치"} |`,
  );
}
