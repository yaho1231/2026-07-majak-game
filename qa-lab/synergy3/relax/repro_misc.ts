/**
 * relax 축의 나머지 조합들 — reload · no_ron_pact · omni_chi × broken_border ·
 * bluff_pretense × mixed_triplet.
 */
import { FlowController, kindKey, kindOf, ROUND_SCOPED_MARK } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft, start, table } from "./lib.js";
import { reload } from "../../../packages/content/src/augments/reload.js";
import { silentPact } from "../../../packages/content/src/augments/silent_pact.js";
import { meldDissolve } from "../../../packages/content/src/augments/meld_dissolve.js";
import { bluffPretense } from "../../../packages/content/src/augments/bluff_pretense.js";
import { hourglass } from "../../../packages/content/src/augments/hourglass.js";
import { bloodContract } from "../../../packages/content/src/augments/blood_contract.js";
import { noRonPact } from "../../../packages/content/src/augments/no_ron_pact.js";
import { omniChi } from "../../../packages/content/src/augments/omni_chi.js";
import { brokenBorder } from "../../../packages/content/src/augments/broken_border.js";
import { mixedTriplet } from "../../../packages/content/src/augments/mixed_triplet.js";

const P0 = "p0" as PlayerId;

// ═══ S1. reload — 이 축에서 실제로 되살릴 수 있는 게 있나 ═══
{
  const base = craft({
    hands: { p0: "234m567p99s77z1m2m", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: P0,
  });
  const rk = (id: string, name: string): string =>
    `${id}:${name}:1-1-0:${P0}${ROUND_SCOPED_MARK}`;
  const used: GameState = {
    ...base,
    augmentData: {
      ...base.augmentData,
      // 국 스코프 소진 플래그(묵계·파혼·허장성세)와 국 단위 쿨다운(모래시계)을 모두 소진 상태로
      [rk("silent_pact", "used")]: true,
      [rk("meld_dissolve", "used")]: true,
      [rk("bluff_pretense", "used")]: true,
      [rk("blood_contract", "yaku")]: "tanyao",
      ["hourglass:usedSeq:p0"]: 0,
      ["hourglass:seq:p0"]: 1,
    },
  };
  const g = start(used, [
    reload,
    silentPact,
    meldDissolve,
    bluffPretense,
    hourglass,
    bloodContract,
  ]);
  const flow = new FlowController(g.engine);
  const st = flow.begin();
  const opts =
    st.kind === "awaiting" ? (st.prompts.find((p) => p.player === "p0")?.options ?? []) : [];
  table("S1. reload 후보 (묵계·파혼·허장성세·모래시계·핏빛계약 전부 소진 상태)", [
    { label: "reload_use 후보", value: opts.filter((o) => o.type === "reload_use").map((o) => JSON.stringify(o.payload)) },
    { label: "다른 후보", value: opts.map((o) => o.type) },
  ]);
}

// ═══ S2. no_ron_pact × 묵계 / 파혼 ═══
function pactImmune(g: ReturnType<typeof start>): boolean {
  return g.engine.rules.resolve<boolean>("win.ronImmune", {
    playerId: P0,
    state: g.engine.state,
  });
}
{
  const clean = craft({
    hands: { p0: "234m567p99s77z12m", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "1z2z" },
    phase: "turn.act",
    turnSeat: 0,
  });
  const silentMeld: GameState = (() => {
    const s = craft({
      hands: { p0: "234m567p99s1m2m3m4m", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "pon", spec: "777z", from: "p1" as PlayerId }] },
      discards: { p0: "1z2z" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const rs = s.round.byPlayer["p0"]!;
    return {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: { ...rs, melds: rs.melds.map((m) => ({ ...m, silent: true })) },
        },
      },
    };
  })();
  table("S2. 불가침 조약 — 론 면역인가", [
    { label: "① 후로 없음", value: pactImmune(start(clean, [noRonPact])) },
    {
      label: "② 묵계 퐁(멘젠 유지) 뒤",
      value: pactImmune(start(silentMeld, [noRonPact, silentPact])),
    },
  ]);
}

// ═══ S3. omni_chi × broken_border — 원격 + 혼색 치 ═══
{
  // p0 은 하가(p1)가 아니라 p2 의 버림을 치하려 한다. 손에는 2만·4삭(혼색 슌쯔 재료)
  const base = craft({
    hands: { p0: "2m4s567p99s1234z", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 2,
    lastDiscard: { player: "p2" as PlayerId, spec: "3p" },
  });
  for (const [label, defs] of [
    ["① 없음", []],
    ["② omni_chi 만", [omniChi]],
    ["③ broken_border 만", [brokenBorder]],
    ["④ 둘 다", [omniChi, brokenBorder]],
  ] as const) {
    const g = start(base, [...defs]);
    const flow = new FlowController(g.engine);
    const st = flow.begin();
    const opts =
      st.kind === "awaiting" ? (st.prompts.find((p) => p.player === "p0")?.options ?? []) : [];
    const chis = opts.filter((o) => o.type === "chi");
    table(`S3. ${label} — 대면(p2)의 3통에 대한 치 후보`, [
      { label: "options", value: opts.map((o) => o.type) },
      {
        label: "치 조합",
        value: chis.map((o) =>
          ((o.payload as { tileIds: number[] }).tileIds ?? [])
            .map((id) => kindKey(kindOf(g.engine.state, id)))
            .join("+"),
        ),
      },
    ]);
  }
}

// ═══ S4. bluff_pretense × mixed_triplet — 혼색 퐁을 허장성세로 부를 수 있나 ═══
{
  // p0 손에 1만이 1장뿐 · 1통 1장 · 상대가 1삭을 버린다
  // ⓐ 손에 1삭이 정확히 1장 (허장성세의 표준 조건)
  const exact = craft({
    hands: { p0: "1s234m567p99s2s3s", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1" as PlayerId, spec: "1s" },
  });
  // ⓑ 손에 1삭은 없고 **1만이 1장** — 동수의 결속이면 "같은 커쯔 재료"다
  const mixed = craft({
    hands: { p0: "1m234m567p99s2s3s", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1" as PlayerId, spec: "1s" },
  });
  for (const [label, base, defs] of [
    ["ⓐ 1삭 1장 · bluff 만", exact, [bluffPretense]],
    ["ⓐ 1삭 1장 · bluff+mixed", exact, [bluffPretense, mixedTriplet]],
    ["ⓑ 1만 1장 · bluff 만", mixed, [bluffPretense]],
    ["ⓑ 1만 1장 · mixed 만", mixed, [mixedTriplet]],
    ["ⓑ 1만 1장 · bluff+mixed (설명대로면 퐁 가능해야)", mixed, [bluffPretense, mixedTriplet]],
  ] as const) {
    const g = start(base, [...defs]);
    const flow = new FlowController(g.engine);
    const st = flow.begin();
    const opts =
      st.kind === "awaiting" ? (st.prompts.find((p) => p.player === "p0")?.options ?? []) : [];
    table(`S4. ${label}`, [{ label: "options", value: opts.map((o) => o.type) }]);
  }
}

// ═══ S5. silent_pact × mixed_triplet — 혼색 커쯔를 묵계로 부를 수 있나 ═══
{
  const mixed = craft({
    hands: { p0: "1m1p234m567p99s2s", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1" as PlayerId, spec: "1s" },
  });
  const same = craft({
    hands: { p0: "1s1s234m567p99s2s", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1" as PlayerId, spec: "1s" },
  });
  for (const [label, base, defs] of [
    ["ⓐ 1삭 2장(같은 패) · silent 만", same, [silentPact]],
    ["ⓑ 1만+1통 · silent 만", mixed, [silentPact]],
    ["ⓑ 1만+1통 · mixed 만", mixed, [mixedTriplet]],
    ["ⓑ 1만+1통 · silent+mixed (설명대로면 묵계 퐁 가능해야)", mixed, [silentPact, mixedTriplet]],
  ] as const) {
    const g = start(base, [...defs]);
    const flow = new FlowController(g.engine);
    const st = flow.begin();
    const opts =
      st.kind === "awaiting" ? (st.prompts.find((p) => p.player === "p0")?.options ?? []) : [];
    table(`S5. ${label}`, [{ label: "options", value: opts.map((o) => o.type) }]);
  }
}
