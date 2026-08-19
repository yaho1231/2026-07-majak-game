/** 문구가 약속한 수치·시점을 직접 돌려 확인한다 (OK 판정 근거). */
import {
  createStandardGameFromState,
  installAugment,
  seatWindOf,
  playerAtSeat,
} from "@majak/core";
import type { GameState } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { pseudoDealer } from "../../../packages/content/src/augments/pseudo_dealer.js";
import { lateBloomer } from "../../../packages/content/src/augments/late_bloomer.js";
import { lateBloomerEast } from "../../../packages/content/src/augments/late_bloomer_east.js";
import { omniChi } from "../../../packages/content/src/augments/omni_chi.js";
import { callSeal } from "../../../packages/content/src/augments/call_seal.js";

// ── pseudo_dealer: 자풍 재매김 · 오야 자리 이동 · 이미 오야면 불가 ─────
{
  const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 2 });
  const s: GameState = {
    ...base,
    players: base.players.map((p) => (p.id === "p2" ? { ...p, augments: ["pseudo_dealer"] } : p)),
  };
  const g = createStandardGameFromState(s, undefined, []);
  installAugment(g.engine, pseudoDealer, "p2", { yaku: g.yaku });
  const winds = (st: GameState): string =>
    st.players.map((p) => `${p.id}=${seatWindOf(st, p.id)}`).join(" ");
  console.log("[pseudo_dealer] 선언 전 오야자리:", g.engine.state.round.dealerSeat, "자풍:", winds(g.engine.state));
  console.log("  선언:", g.engine.submit({ player: "p2", type: "claim_dealer", payload: {} }).ok);
  const st = g.engine.state;
  console.log("  선언 후 오야자리:", st.round.dealerSeat, "rotationSeat:", st.round.rotationSeat, "자풍:", winds(st));
  console.log("  오야 판정(정산이 보는 것): dealer =", playerAtSeat(st, st.round.dealerSeat).id);
  console.log("  재선언(이미 오야):", g.engine.submit({ player: "p2", type: "claim_dealer", payload: {} }).ok);
}

// ── late_bloomer / _east: 만개 시점 ────────────────────────────────
for (const [label, def, id, mode, cases] of [
  ["반장전판", lateBloomer, "late_bloomer", "hanchan", [[2, 3, "남3국"], [2, 4, "남4국"], [3, 1, "서1국(서입)"]]],
  ["동풍전판", lateBloomerEast, "late_bloomer_east", "tonpuu", [[1, 3, "동3국"], [1, 4, "동4국"], [2, 1, "남1국(남입)"]]],
] as const) {
  const out: string[] = [];
  for (const [wind, num, name] of cases) {
    const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 });
    const s: GameState = {
      ...base,
      config: { ...base.config, mode },
      players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: [id] } : p)),
      round: { ...base.round, prevalentWind: wind, roundNumber: num },
    };
    const g = createStandardGameFromState(s, undefined, []);
    installAugment(g.engine, def, "p0", { yaku: g.yaku });
    const furiten = g.engine.rules.resolve<boolean>("win.furiten.enabled", { playerId: "p0", state: g.engine.state });
    const needYaku = g.engine.rules.resolve<boolean>("win.requiresYaku", { playerId: "p0", state: g.engine.state });
    const han = g.engine.rules.resolve<number>("score.extraHan", { playerId: "p0", state: g.engine.state });
    out.push(`${name}: 후리텐적용=${furiten} 역필요=${needYaku} (score.extraHan=${han} — +판 보너스는 이 규칙이 아니라 정산 단계 뱅크 지급(addWinHanBonus)이라 여기선 0이 정상)`);
  }
  console.log(`\n[late_bloomer ${label}]`);
  for (const l of out) console.log("  " + l);
}

// ── omni_chi / call_seal: 규칙이 실제로 켜지는가 ────────────────────
{
  const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 });
  const s: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["omni_chi", "call_seal"] } : p,
    ),
  };
  const g = createStandardGameFromState(s, undefined, []);
  installAugment(g.engine, omniChi, "p0", { yaku: g.yaku });
  installAugment(g.engine, callSeal, "p0", { yaku: g.yaku });
  const R = (k: string, pid: string): unknown =>
    g.engine.rules.resolve(k, { playerId: pid, state: g.engine.state });
  console.log("\n[omni_chi] call.chi.fromAnyone  p0:", R("call.chi.fromAnyone", "p0"), " p1:", R("call.chi.fromAnyone", "p1"));
  console.log("[call_seal] 선언:", g.engine.submit({ player: "p0", type: "call_seal_use", payload: {} }).ok);
  console.log("  call.blocked  p0(보유자):", R("call.blocked", "p0"), " p1:", R("call.blocked", "p1"), " p2:", R("call.blocked", "p2"));
  console.log("  (안깡·가깡 validate는 call.blocked를 보지 않는다 — standardActions.ts:385/446/576은 pon·chi·minkan뿐)");
}
