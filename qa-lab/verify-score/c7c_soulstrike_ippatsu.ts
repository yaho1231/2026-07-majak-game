/**
 * 의심 7-③ 재검증 — soul_strike 폭주 중 **타가의 대명깡**이 들어오면 일발이 남는가.
 * 폭주는 보유자의 쯔모마다 일발을 되살린다(IPPATSU_KEPT). 대명깡은 후로이므로
 * 코어가 일발을 꺼야 하고, soul_strike도 그 자리에서 폭주를 끝내야 한다.
 */
import { createStandardGameFromState, handZone, installAugment, kindKey, FlowController } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { soulStrike } from "../../packages/content/src/augments/soul_strike.js";

const RIICHI = { double: false, ippatsu: true, discardIndex: 0, cost: 1000 };
const RK = "1-1-0";

function scene(active: boolean, left: number): GameState {
  const base = craft({
    // p0: 폭주 중 리치자. p2: 손에 5s 3장 → p0가 5s를 버리면 대명깡할 수 있다.
    hands: { p0: "234m 345p 678s 99s 1z 5s", p1: "*", p2: "555s 234m 456p 78p 9p", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: ["soul_strike"] } : p)),
    round: {
      ...base.round, turnCount: 1, riichiPot: 1000,
      byPlayer: { ...base.round.byPlayer, p0: { ...base.round.byPlayer["p0"]!, riichi: RIICHI } },
    },
    augmentData: {
      ...base.augmentData,
      [`soul_strike:active:${RK}:p0#round`]: active,
      [`soul_strike:left:${RK}:p0#round`]: left,
      [`soul_strike:declared:${RK}:p0#round`]: true,
    },
  } as GameState;
}

for (const active of [true, false]) {
  const g = createStandardGameFromState(scene(active, 4));
  installAugment(g.engine, soulStrike, "p0", { yaku: g.yaku });
  const s = g.engine.state;
  const t5s = s.zones[handZone("p0")]!.tileIds.find((t) => kindKey(s.tiles[t]!.kind) === "sou5") as TileId;
  const rd = g.engine.submit({ player: "p0", type: "discard", payload: { tileId: t5s } as never });
  if (!rd.ok) console.log("   discard reason:", String((rd as { reason?: unknown }).reason), "lastDrawn=", s.round.lastDrawnTile, "t5s=", t5s);
  const afterDiscard = g.engine.state;
  const ipAfterDiscard = afterDiscard.round.byPlayer["p0"]?.riichi?.ippatsu;
  const own = afterDiscard.zones[handZone("p2")]!.tileIds.filter((t) => kindKey(afterDiscard.tiles[t]!.kind) === "sou5");
  const rk = g.engine.submit({ player: "p2", type: "minkan", payload: { tileIds: own } as never });
  const a = g.engine.state;
  console.log(
    `폭주=${String(active)}  discard.ok=${rd.ok} 버림직후 일발=${String(ipAfterDiscard)}  ` +
    `대명깡.ok=${rk.ok}${rk.ok ? "" : `(${String((rk as { reason?: unknown }).reason)})`}  ` +
    `대명깡 후 일발=${String(a.round.byPlayer["p0"]?.riichi?.ippatsu)}  폭주active=${String(a.augmentData[`soul_strike:active:${RK}:p0#round`])}`,
  );
}

// ── 순서 검증: 폭주 중 재쯔모(설계상 일발 부활) vs 대명깡이 낀 뒤의 쯔모
console.log("\n[순서 검증]");
function seq(withKan: boolean): void {
  const g = createStandardGameFromState(scene(true, 4));
  installAugment(g.engine, soulStrike, "p0", { yaku: g.yaku });
  const s = g.engine.state;
  const t5s = s.zones[handZone("p0")]!.tileIds.find((t) => kindKey(s.tiles[t]!.kind) === "sou5") as TileId;
  g.engine.submit({ player: "p0", type: "discard", payload: { tileId: t5s } as never });
  if (withKan) {
    const st = g.engine.state;
    const own = st.zones[handZone("p2")]!.tileIds.filter((t) => kindKey(st.tiles[t]!.kind) === "sou5");
    g.engine.submit({ player: "p2", type: "minkan", payload: { tileIds: own } as never });
  }
  const act = String(g.engine.state.augmentData[`soul_strike:active:${RK}:p0#round`]);
  // 반응 창을 전원 패스로 닫아 다음 쯔모까지 흐름을 진행시킨다
  const flow = new FlowController(g.engine);
  for (let i = 0; i < 20; i++) {
    const st = flow.begin() as unknown as { prompts?: { player: string; options: { type: string }[] }[] };
    const prompts = st.prompts ?? [];
    const pass = prompts.filter((pr) => pr.options.some((o) => o.type === "pass"));
    if (pass.length === 0) break;
    for (const pr of pass) flow.submit(pr.player as never, { type: "pass", payload: {} } as never);
  }
  const a2 = g.engine.state;
  const ip = a2.round.byPlayer["p0"]?.riichi?.ippatsu;
  console.log(`  대명깡=${String(withKan)}  폭주active=${act}  phase=${a2.round.phase} 턴자리=${a2.round.turnSeat}  쯔모 후 일발=${String(ip)}`);
}
seq(false);
seq(true);
