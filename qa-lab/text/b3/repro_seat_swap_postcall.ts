/**
 * 자리 바꿈(seat_swap) × 후로 직후 창.
 *
 * detail 약속: "내가 방금 뽑은 쯔모패 한 장만 내게 남아 그대로 버림을 이어 간다"
 *              "손패 장수와 후로 개수가 나와 같은 상대만 대상이 된다 — 이미 울어 둔 상대는 목록에 뜨지 않는다"
 *
 * 발동 창은 `discardCount === 0`인 내 순이다. 펑 직후가 정확히 그 창에 든다
 * (펑하면 turn.act로 오지만 아직 한 장도 안 버렸다). 이때 lastDrawnTile은 null이다.
 */
import {
  FlowController,
  createStandardGameFromState,
  handZone,
  meldsZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { seatSwap } from "../../../packages/content/src/augments/seat_swap.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});

function show(st: GameState, tag: string): void {
  for (const p of ["p0", "p1"] as PlayerId[]) {
    const hand = st.zones[handZone(p)]!.tileIds;
    console.log(
      `  ${tag} ${p}: 손패 ${hand.length}장 [${hand.map((i) => kindKey(kindOf(st, i))).join(" ")}]` +
        ` 멘쯔=${st.round.byPlayer[p]!.melds.length} 버림수=${st.round.byPlayer[p]!.discardCount}`,
    );
  }
  console.log(`  ${tag} lastDrawnTile=${st.round.lastDrawnTile}`);
}

function run(label: string, cfg: Parameters<typeof craft>[0], expectTargets: string): void {
  console.log(`\n=== ${label}`);
  const base = craft(cfg);
  const st = withAug(base, "p0", ["seat_swap"]);
  const game = createStandardGameFromState(st);
  installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  if (s.kind !== "awaiting") throw new Error("no prompt");
  const opts = s.prompts.find((x) => x.player === "p0")?.options ?? [];
  const swaps = opts.filter((o) => o.type === "seat_swap");
  console.log(
    `  seat_swap 후보 대상 = [${swaps.map((o) => (o.payload as { target: string }).target).join(",")}]  (기대: ${expectTargets})`,
  );
  if (swaps.length === 0) return;
  const st0 = game.engine.state;
  console.log("  --- 발동 전");
  show(st0, "");
  const aHandBefore = [...st0.zones[handZone("p0")]!.tileIds];
  const drawnBefore = st0.round.lastDrawnTile;
  const target = (swaps[0]!.payload as { target: PlayerId }).target;
  s = flow.submit("p0", { type: "seat_swap", payload: { target } });
  const st1 = game.engine.state;
  console.log(`  --- ${target} 와 교환 후`);
  show(st1, "");
  // 내게 남은 '내 옛 손패' 조각을 찾는다
  const kept = st1.zones[handZone("p0")]!.tileIds.filter((id) => aHandBefore.includes(id));
  console.log(
    `  내게 남은 옛 손패 = [${kept.map((i) => `${kindKey(kindOf(st1, i))}#${i}`).join(" ")}]` +
      `  / 발동 직전 쯔모패 = ${drawnBefore === null ? "없음(null)" : `${kindKey(kindOf(st0, drawnBefore))}#${drawnBefore}`}`,
  );
  console.log(
    `  ⇒ 남은 패가 '방금 뽑은 쯔모패'인가: ${kept.length === 1 && kept[0] === drawnBefore}`,
  );
  console.log(`  발동 후 옵션: ${[...new Set((s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0")?.options ?? [] : []).map((o) => o.type))].join(",")}`);
}

// ── A) 정상 창: 쯔모 직후 첫 순, 아무도 안 울었다 ───────────────────────────
run(
  "A) 대조군 — 쯔모 직후 첫 순 (멘쯔 0 vs 0)",
  {
    hands: { p0: "123m456m789m11p22p3p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  },
  "p1,p2,p3",
);

// ── B) 후로 직후 창: p0가 펑을 해 멘쯔 1 · 버림 0 · 쯔모패 없음 ─────────────
run(
  "B) p0가 펑한 직후 (p0 멘쯔 1, 상대는 전부 멘쯔 0)",
  {
    hands: { p0: "123456789m11p", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "222p", from: "p3" }] },
    phase: "turn.act",
    turnSeat: 0,
  },
  "텍스트대로면 p1,p2,p3 (실제는?)",
);

// ── C) 후로 직후 창 + 상대도 울어 둔 경우 ────────────────────────────────────
run(
  "C) p0 펑 직후 · p1도 이미 펑해 둠",
  {
    hands: { p0: "123456789m11p", p1: "123456789s9s", p2: "*", p3: "*" }, // p1은 이미 버려 10장
    melds: {
      p0: [{ kind: "pon", spec: "222p", from: "p3" }],
      p1: [{ kind: "pon", spec: "333p", from: "p2" }],
    },
    phase: "turn.act",
    turnSeat: 0,
  },
  "텍스트대로면 '이미 울어 둔 p1'은 안 떠야 한다",
);
