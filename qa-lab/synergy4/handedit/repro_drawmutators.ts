/**
 * «다음 쯔모 한 장의 종류»를 바꾸는 카드 셋 — 소환(conjure_draw) · 해저의 지배자
 * (haitei_lord) · 마작의 거신병(giant_god).
 *
 * 셋 다 `TILE_DRAWN` 리액션에서 **같은 tileId** 에 `tileKindChanged` 를 쏜다.
 * synergy3 kandora 확정 2 가 소환 × 지배자에서 «나중에 설치된 쪽(=드래프트 픽 순서)이
 * 이기고 진 쪽은 조용히 죽는다»를 잡았고, 소환이 `haiteiLordWaits` 라는 공통 술어를
 * 읽고 스스로 물러나는 방식으로 고쳤다.
 *
 * 예측(먼저 적는다):
 *   · 소환 × 지배자: 고쳐졌으므로 설치 순서와 무관하게 지배자가 이기고 소환 예약은 남는다.
 *   · **거신병은 그 술어를 읽지 않는다** (`giant_god.ts` 는 `haiteiLordWaits` 도
 *     소환의 예약도 보지 않는다). 그러므로 거신병 × 소환은 같은 결함이 그대로 남아
 *     설치 순서가 승패를 정하고, 진 쪽은 «국당 1회»를 태운 채 아무 일도 못 한다고 의심한다.
 */
import {
  FlowController,
  WALL,
  createStandardGameFromState,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { conjureDraw } from "../../../packages/content/src/augments/conjure_draw.js";
import { haiteiLord } from "../../../packages/content/src/augments/haitei_lord.js";
import { giantGod } from "../../../packages/content/src/augments/giant_god.js";
import { craft, withAugments, check, section, done } from "./lib.js";

type Game = ReturnType<typeof createStandardGameFromState>;
const DEFS: Record<string, unknown> = {
  conjure_draw: conjureDraw,
  haitei_lord: haiteiLord,
  giant_god: giantGod,
};

/** 국사 13종을 p0 이 직접 버려 둔 장면 (거신병 각성 조건) */
const KOKUSHI_POND = "19m19p19s1234z567z";

function trimWall(s: GameState, n: number): GameState {
  const ids = s.zones[WALL]?.tileIds ?? [];
  const p3 = s.zones["discards:p3"];
  return {
    ...s,
    zones: {
      ...s.zones,
      [WALL]: { ...(s.zones[WALL] as never), tileIds: ids.slice(0, n) },
      "discards:p3": {
        ...(p3 as never),
        tileIds: [...(p3?.tileIds ?? []), ...ids.slice(n)],
      },
    },
  };
}

function scene(order: string[], wall: number): { game: Game; flow: FlowController } {
  const base = craft({
    hands: { p0: "234m567m234p567p22s", p1: "*", p2: "*", p3: "*" },
    discards: { p0: KOKUSHI_POND, p1: "2m", p2: "3m", p3: "4m" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const game = createStandardGameFromState(
    trimWall(withAugments(base, { p0: [...order] }), wall),
  );
  for (const a of order) {
    installAugment(game.engine, DEFS[a] as never, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    } as never);
  }
  const flow = new FlowController(game.engine);
  flow.begin();
  return { game, flow };
}
function opts(flow: FlowController): { type: string; payload?: unknown }[] {
  const st = flow.begin();
  return st.kind === "awaiting" ? (st.prompts.find((p) => p.player === "p0")?.options ?? []) : [];
}
function submit(flow: FlowController, type: string): boolean {
  const o = opts(flow).find((x) => x.type === type);
  if (o === undefined) return false;
  flow.submit("p0" as never, o as never);
  return true;
}
const aug = (g: Game, pre: string): [string, unknown][] =>
  Object.entries(g.engine.state.augmentData).filter(([k]) => k.startsWith(pre));

section("§1 거신병 × 소환 — 같은 쯔모 한 장을 둘이 노린다 (설치 순서 양방향)");
for (const order of [
  ["giant_god", "conjure_draw"],
  ["conjure_draw", "giant_god"],
]) {
  const { game, flow } = scene(order, 30);
  // 소환 예약 (손패 첫 장의 종류를 부른다)
  const conj = opts(flow).find((o) => o.type === "conjure_tsumo");
  const calledId = (conj?.payload as { tileId?: TileId })?.tileId;
  const calledKind = calledId === undefined ? "?" : kindKey(kindOf(game.engine.state, calledId));
  if (conj !== undefined) flow.submit("p0" as never, conj as never);
  const okGod = submit(flow, "giant_god");
  console.log(
    `  · 설치순서 [${order.join(">")}] — 소환 예약=${conj !== undefined}(${calledKind}) · 거신병 각성=${okGod}`,
  );
  // 버리고 한 바퀴 돌려 p0 의 «다음 쯔모»까지 간다
  let st = flow.begin();
  let steps = 0;
  let p0Turns = 0;
  while (st.kind === "awaiting" && steps < 40) {
    steps++;
    const pr = st.prompts[0];
    if (pr === undefined) break;
    const drawn = game.engine.state.round.lastDrawnTile;
    const pick =
      pr.options.find(
        (o) => o.type === "discard" && (o.payload as { tileId?: number })?.tileId === drawn,
      ) ??
      pr.options.find((o) => o.type === "discard") ??
      pr.options.find((o) => o.type === "pass");
    if (pick === undefined) break;
    if (pr.player === "p0" && pick.type === "discard") p0Turns++;
    st = flow.submit(pr.player, pick as never);
    const s2 = game.engine.state;
    if (p0Turns >= 1 && s2.round.turnSeat === 0 && s2.round.phase === "turn.act") break;
  }
  const drawn = game.engine.state.round.lastDrawnTile;
  const got = drawn === null ? "?" : kindKey(kindOf(game.engine.state, drawn));
  console.log(
    `    다음 쯔모 종류 = ${got} (소환 목표 ${calledKind}) · 소환 예약 잔량 ${JSON.stringify(aug(game, "conjure_draw:pending"))} · 거신병 예약 ${JSON.stringify(aug(game, "giant_god:tsumo"))}`,
  );
  console.log(
    `    소환 소진 = ${JSON.stringify(aug(game, "conjure_draw:used"))} · 거신병 소진 = ${JSON.stringify(aug(game, "giant_god:used"))}`,
  );
  const canWin = opts(flow).some((o) => o.type === "win");
  console.log(`    → 이 쯔모로 화료 가능? ${canWin}  (거신병의 «다음 순에 반드시 화료» 약속)`);
  check(`[${order.join(">")}] 거신병 각성 다음 쯔모로 화료할 수 있다`, canWin);
}

section("§2 지배자 × 소환 — 이미 고쳐진 쪽 (대조군, 설치 순서 양방향)");
for (const order of [
  ["haitei_lord", "conjure_draw"],
  ["conjure_draw", "haitei_lord"],
]) {
  const { game, flow } = scene(order, 30);
  const conj = opts(flow).find((o) => o.type === "conjure_tsumo");
  if (conj !== undefined) flow.submit("p0" as never, conj as never);
  console.log(
    `  · 설치순서 [${order.join(">")}] — 소환 예약=${conj !== undefined} · (해저는 패산 0 에서만 발동하므로 여기서는 소환이 그대로 산다)`,
  );
  check(`[${order.join(">")}] 소환 예약이 걸린다`, conj !== undefined);
}

done();
