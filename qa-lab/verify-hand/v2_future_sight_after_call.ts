/**
 * 의심 2 재검증 — future_sight 가 후로(펑) 직후의 '쯔모패 없는 순'에도 발동되는가,
 * 그리고 그 순에 lastDrawnTile 이 새로 생겨 **쯔모 화료 창**이 열리는가.
 *
 * 1차: 후로 직후 상태에서 future_arm / future_exchange 후보가 나오는지.
 * 2차: 교환으로 들어오는 3장을 손패에서 빠지는 3장과 같은 종류로 맞춰
 *      (탄야오 완성형 유지) 실제로 win 이 제시되는지.
 */
import {
  FlowController, WALL, createStandardGameFromState, createZone, handZone,
  installAugment, kindKey, kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId, TileKind } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { futureSight } from "../../packages/content/src/augments/future_sight.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});

function build(): GameState {
  // p0: 222m 펑(p1에게서) + 손패 11장 345m 678m 55m 234p → 탄야오 완성형
  const base = craft({
    hands: { p0: "34567855m234p", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "222m", from: "p1" }] },
    discards: { p1: "1z", p2: "2z", p3: "3z" },
    phase: "turn.act",
    turnSeat: 0,
    // drawnLastFor 없음 → lastDrawnTile === null (= 펑 직후의 '쯔모 없는 순')
  });
  return withAug(base, "p0", ["future_sight"]);
}

function open(st: GameState) {
  const game = createStandardGameFromState(st);
  installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const s = flow.begin();
  return { game, flow, s };
}

// ---------- 1차: 후보가 나오는가 ----------
{
  const st = build();
  console.log(`[전제] lastDrawnTile = ${st.round.lastDrawnTile}  (펑 직후 = 쯔모패 없음)`);
  const { s } = open(st);
  if (s.kind !== "awaiting") throw new Error("no prompt");
  const opts = s.prompts.find((x) => x.player === "p0")?.options ?? [];
  console.log("후로 직후 p0 옵션:", [...new Set(opts.map((o) => o.type))].join(","));
}

// ---------- 2차: 실제로 교환하고 쯔모 화료 창이 열리는가 ----------
// pass1 — 손을 떠날 무작위 3장이 무엇인지 알아낸다
let outKinds: TileKind[] = [];
{
  const { game, flow, s } = open(build());
  if (s.kind !== "awaiting") throw new Error("no prompt");
  let st2 = flow.submit("p0", { type: "future_arm", payload: {} } as never);
  if (st2.kind !== "awaiting") throw new Error("armed but no prompt");
  const ex = (st2.prompts.find((x) => x.player === "p0")?.options ?? []).filter(
    (o) => o.type === "future_exchange",
  );
  outKinds = ex.map((o) => kindOf(game.engine.state, (o.payload as { tileId: TileId }).tileId));
  console.log(
    `무작위로 뽑힌 3장 = ${outKinds.map(kindKey).join(",")}  (후보 ${ex.length}개)`,
  );
}

// pass2 — 패산 맨 위 3장을 같은 종류로 갈아 끼워, 교환 뒤에도 완성형이 유지되게 한다
{
  let st = build();
  // 필요한 종류를 아무 존에서나 찾아 패산 맨 위 3칸과 자리를 바꾼다
  const zonesOf = ["wall", handZone("p1"), handZone("p2"), handZone("p3")];
  const want: TileId[] = [];
  for (const k of outKinds) {
    let found: { zone: string; id: TileId } | null = null;
    for (const z of zonesOf) {
      const id = (st.zones[z]?.tileIds ?? []).find(
        (t) => kindKey(kindOf(st, t)) === kindKey(k) && !want.includes(t),
      );
      if (id !== undefined) { found = { zone: z, id }; break; }
    }
    if (found === null) throw new Error(`어디에도 ${kindKey(k)} 가 없다`);
    want.push(found.id);
    if (found.zone !== "wall") {
      // 패산 뒤쪽 한 장과 맞바꿔 총량을 보존한다
      const w = st.zones[WALL]!.tileIds;
      const swapOut = w[w.length - 1] as TileId;
      st = {
        ...st,
        zones: {
          ...st.zones,
          [WALL]: { ...st.zones[WALL]!, tileIds: [...w.slice(0, -1), found.id] },
          [found.zone]: {
            ...st.zones[found.zone]!,
            tileIds: st.zones[found.zone]!.tileIds.map((t) => (t === found!.id ? swapOut : t)),
          },
        },
      };
    }
  }
  {
    const w = st.zones[WALL]!.tileIds;
    const rest = w.filter((id) => !want.includes(id));
    st = { ...st, zones: { ...st.zones, [WALL]: { ...createZone(WALL, "wall"), tileIds: [...want, ...rest] } } };
  }

  const { game, flow, s } = open(st);
  if (s.kind !== "awaiting") throw new Error("no prompt");
  let cur = flow.submit("p0", { type: "future_arm", payload: {} } as never);
  if (cur.kind !== "awaiting") throw new Error("no prompt after arm");
  const ex = (cur.prompts.find((x) => x.player === "p0")?.options ?? []).filter(
    (o) => o.type === "future_exchange",
  );
  if (ex[0] === undefined) throw new Error("no exchange option");
  cur = flow.submit("p0", ex[0] as never);
  const after = game.engine.state;
  const d = after.round.lastDrawnTile;
  console.log(
    `교환 후: lastDrawnTile = ${d === null ? "null" : `${d} (${kindKey(kindOf(after, d))})`}  · rinshan=${after.round.lastDrawRinshan}`,
  );
  console.log(
    `손패(${after.zones[handZone("p0")]!.tileIds.length}장) = ${after.zones[handZone("p0")]!.tileIds.map((i) => kindKey(kindOf(after, i))).join(" ")}  + 펑 222m`,
  );
  const mine = cur.kind === "awaiting" ? cur.prompts.find((x) => x.player === "p0") : undefined;
  const types = [...new Set(mine?.options.map((o) => o.type) ?? [])];
  console.log("교환 직후 옵션:", types.join(","));
  console.log(
    types.includes("win")
      ? "→ 후로 직후(쯔모 없는 순)에 발동 → 쯔모 화료 창이 열렸다"
      : "→ win 제시 없음",
  );
}
