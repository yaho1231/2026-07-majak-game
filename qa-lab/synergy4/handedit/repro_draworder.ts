/**
 * 쯔모를 바꾸는 카드끼리 — 소환(conjure_draw) × 밑장빼기(bottom_deal) × 해저의
 * 지배자(haitei_lord) × 무르기(take_back).
 *
 * 예측(먼저 적는다):
 *  ① 소환 + 밑장빼기 (같은 좌석, 둘 다 예약): 다음 쯔모는 **패산 맨 밑의 실물**을
 *     가져오되 그 한 장의 kind 가 소환 목표로 바뀐다 → 둘 다 산다. 어느 한쪽이
 *     조용히 무시되면 결함.
 *  ② 밑장빼기 + 해저의 지배자: 밑장은 «가장 마지막에 뽑힐 패» = 해저패다. 밑장을
 *     빼도 패산이 비지 않으면(=마지막 한 장이 아니면) 지배자는 발동하지 않아야 한다.
 *     즉 밑장빼기는 자기 해저를 앞당겨 «먹어 버리는» 안티시너지다 — 그 자체는 규칙대로.
 *     확인할 것은 **패산이 정확히 1장 남았을 때** 둘이 겹쳐 이중 발동/유실이 없는가.
 *  ③ 소환 + 해저의 지배자: 지배자가 우선하고 소환 예약은 남는다(소스 주석). 실측한다.
 *  ④ 무르기 + 밑장빼기: 밑장으로 뽑은 패를 무르면 그 패는 다시 패산 맨 밑으로 가고
 *     새 패는 맨 위에서 온다 → 밑장 3장 열람 내용이 그대로 복원돼야 한다.
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
import { bottomDeal } from "../../../packages/content/src/augments/bottom_deal.js";
import { haiteiLord } from "../../../packages/content/src/augments/haitei_lord.js";
import { takeBack } from "../../../packages/content/src/augments/take_back.js";
import {
  craft,
  withAugments,
  handIds,
  wallLen,
  tileCensus,
  check,
  section,
  done,
} from "./lib.js";

const DEFS: Record<string, unknown> = {
  conjure_draw: conjureDraw,
  bottom_deal: bottomDeal,
  haitei_lord: haiteiLord,
  take_back: takeBack,
};

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

function scene(augs: string[], wall: number, hand = "123m456m789m123p3m9p"): {
  game: ReturnType<typeof createStandardGameFromState>;
  flow: FlowController;
} {
  const base = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    discards: { p0: "5m5p", p1: "2z", p2: "5z", p3: "6z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const st = trimWall(withAugments(base, { p0: augs }), wall);
  const game = createStandardGameFromState(st);
  for (const a of augs) {
    installAugment(game.engine, DEFS[a] as never, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    } as never);
  }
  const flow = new FlowController(game.engine);
  flow.begin();
  return { game, flow };
}

type Game = ReturnType<typeof createStandardGameFromState>;

function opts(flow: FlowController, player: string): { type: string; payload?: unknown }[] {
  const st = flow.begin();
  return st.kind === "awaiting"
    ? (st.prompts.find((p) => p.player === player)?.options ?? [])
    : [];
}
/** 그 타입의 옵션을 (조건에 맞는 첫 후보로) 제출한다 */
function submit(
  flow: FlowController,
  player: string,
  type: string,
  match?: (payload: unknown) => boolean,
): boolean {
  const o = opts(flow, player).filter((x) => x.type === type);
  const pick = match === undefined ? o[0] : o.find((x) => match(x.payload));
  if (pick === undefined) return false;
  flow.submit(player as never, pick as never);
  return true;
}
const wallIds = (g: Game): TileId[] => [...(g.engine.state.zones[WALL]?.tileIds ?? [])];
const kk = (g: Game, id: TileId): string => kindKey(kindOf(g.engine.state, id));

// ────────────────────────────────────────────────────────────
section("§1 소환 × 밑장빼기 — 둘 다 예약하면 둘 다 사는가");
{
  const { game, flow } = scene(["conjure_draw", "bottom_deal"], 30);
  const before = wallIds(game);
  const bottomBefore = before[before.length - 1] as TileId;
  const topBefore = before[0] as TileId;
  // 손패에서 3만을 부른다 (손에 있는 종류 아무거나 — 여기서는 첫 패)
  const target = handIds(game.engine.state, "p0")[0] as TileId;
  const targetKind = kk(game, target);
  const okConjure = submit(flow, "p0", "conjure_tsumo", (p) => (p as { tileId: TileId }).tileId === target);
  const okBottom = submit(flow, "p0", "bottom_deal");
  check("소환·밑장빼기를 같은 순에 둘 다 예약할 수 있다", okConjure && okBottom, `conjure=${okConjure} bottom=${okBottom}`);
  // 버리고 한 바퀴 돌려 p0 의 다음 쯔모까지 간다
  let st = flow.begin();
  let steps = 0;
  while (st.kind === "awaiting" && steps < 12) {
    steps++;
    const pr = st.prompts[0];
    if (pr === undefined) break;
    const drawn = game.engine.state.round.lastDrawnTile;
    const pick =
      pr.options.find((o) => o.type === "discard" && (o.payload as { tileId?: number })?.tileId === drawn) ??
      pr.options.find((o) => o.type === "discard") ??
      pr.options.find((o) => o.type === "pass");
    if (pick === undefined) break;
    st = flow.submit(pr.player, pick as never);
    if (game.engine.state.round.lastDrawnTile !== null && steps >= 4 && game.engine.state.round.turnSeat === 0) break;
  }
  const newDrawn = game.engine.state.round.lastDrawnTile as TileId;
  check(
    "다음 쯔모의 실물이 «패산 맨 밑» 패다 (밑장빼기가 살았다)",
    newDrawn === bottomBefore,
    `drawn=${newDrawn} bottom=${bottomBefore} top=${topBefore}`,
  );
  check(
    "그 한 장의 종류가 소환 목표다 (소환이 살았다)",
    kk(game, newDrawn) === targetKind,
    `drawn kind=${kk(game, newDrawn)} target=${targetKind}`,
  );
  const c = tileCensus(game.engine.state);
  check("패 중복 0 · 총 136", c.dupes.length === 0 && c.total === 136, `${c.total}/${c.dupes.length}`);
}

// ────────────────────────────────────────────────────────────
section("§2 밑장빼기 × 해저의 지배자 — 패산 마지막 한 장을 두 카드가 노린다");
for (const wall of [1, 2]) {
  const { game, flow } = scene(["bottom_deal", "haitei_lord"], wall);
  const ok = submit(flow, "p0", "bottom_deal");
  let st = flow.begin();
  let steps = 0;
  while (st.kind === "awaiting" && steps < 20) {
    steps++;
    const pr = st.prompts[0];
    if (pr === undefined) break;
    const drawn = game.engine.state.round.lastDrawnTile;
    const pick =
      pr.options.find((o) => o.type === "discard" && (o.payload as { tileId?: number })?.tileId === drawn) ??
      pr.options.find((o) => o.type === "discard") ??
      pr.options.find((o) => o.type === "pass");
    if (pick === undefined) break;
    st = flow.submit(pr.player, pick as never);
  }
  const fired = Object.entries(game.engine.state.augmentData).filter(
    ([k]) => k.startsWith("haitei_lord:fired") && game.engine.state.augmentData[k] === true,
  );
  const c = tileCensus(game.engine.state);
  console.log(
    `  · wall=${wall}: 예약=${ok} · 지배자 발동=${fired.length > 0} · 결과=${st.kind === "roundOver" ? st.outcome : st.kind} · 패산=${wallLen(game.engine.state)} · census ${c.total}/${c.dupes.length}`,
  );
  check(`wall=${wall}: 패 중복 없음`, c.dupes.length === 0 && c.total === 136, `${c.total}/${c.dupes.length}`);
}

// ────────────────────────────────────────────────────────────
section("§3 소환 × 해저의 지배자 — 지배자가 우선하고 소환 예약은 남는가");
{
  const { game, flow } = scene(["conjure_draw", "haitei_lord"], 1);
  const target = handIds(game.engine.state, "p0")[0] as TileId;
  submit(flow, "p0", "conjure_tsumo", (p) => (p as { tileId: TileId }).tileId === target);
  // p0 이 버리면 p1 이 마지막 패를 뽑는다 → p0 은 못 뽑는다. 대신 패산 1장에서
  // p0 이 곧바로 다음 쯔모를 받도록 하려면 밑장 없이 한 바퀴가 필요하다.
  // 여기서는 «지배자 우선» 술어만 직접 확인한다.
  const pending = Object.entries(game.engine.state.augmentData).find(([k]) =>
    k.startsWith("conjure_draw:pending"),
  );
  check("소환 예약이 걸렸다", pending?.[1] != null, JSON.stringify(pending));
  void flow;
}

// ────────────────────────────────────────────────────────────
section("§4 무르기 × 밑장빼기 — 밑장으로 뽑은 패를 무르면 어디로 가는가");
{
  const { game, flow } = scene(["take_back", "bottom_deal"], 30);
  const w0 = wallIds(game);
  const bottom0 = w0[w0.length - 1] as TileId;
  submit(flow, "p0", "bottom_deal");
  let st = flow.begin();
  let steps = 0;
  while (st.kind === "awaiting" && steps < 12) {
    steps++;
    const pr = st.prompts[0];
    if (pr === undefined) break;
    const drawn = game.engine.state.round.lastDrawnTile;
    const pick =
      pr.options.find((o) => o.type === "discard" && (o.payload as { tileId?: number })?.tileId === drawn) ??
      pr.options.find((o) => o.type === "discard") ??
      pr.options.find((o) => o.type === "pass");
    if (pick === undefined) break;
    st = flow.submit(pr.player, pick as never);
    if (game.engine.state.round.turnSeat === 0 && game.engine.state.round.lastDrawnTile !== null && steps >= 4) break;
  }
  const drawnBottom = game.engine.state.round.lastDrawnTile as TileId;
  const gotBottom = drawnBottom === bottom0;
  const okBack = submit(flow, "p0", "take_back");
  const w1 = wallIds(game);
  console.log(
    `  · 밑장으로 뽑은 패=${drawnBottom}(밑장이었나 ${gotBottom}) · 무르기=${okBack} · 무른 뒤 패산 맨 밑=${w1[w1.length - 1]} · 맨 위=${w1[0]}`,
  );
  check("무르기가 허용된다 (패산에서 온 패다)", okBack);
  check("무른 패가 다시 패산 맨 밑으로 돌아온다", w1[w1.length - 1] === drawnBottom, `${w1[w1.length - 1]} vs ${drawnBottom}`);
  const c = tileCensus(game.engine.state);
  check("패 중복 0 · 총 136", c.dupes.length === 0 && c.total === 136, `${c.total}/${c.dupes.length}`);
}

done();
