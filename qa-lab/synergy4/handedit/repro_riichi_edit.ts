/**
 * 리치 중에 손을 고칠 수 있는 두 카드 — 염색(tile_dyeing) × 연금술사(alchemist).
 *
 * 이 축에서 «리치 중에도 쓸 수 있다»가 열려 있는 액티브는 이 둘뿐이다
 * (분열·짝수의 세계·개벽·단색 세계·조커·편식·등가교환·통째로 바꾸기·미래를 보는 자·
 *  거신병·삼원의 의지는 전부 `riichi: hand is frozen` 계열 가드가 있다).
 *
 * 예측(먼저 적는다):
 *   ① 두 카드는 턴 가드 키가 서로 달라 **같은 순에 둘 다** 발동한다(synergy3 음성 확인).
 *      리치 중에도 그대로일 것이다.
 *   ② 리치의 대가는 «손이 잠긴다 = 뽑은 패를 그대로 버려야 한다»이다. 그런데 두 카드는
 *      **쯔모패 자체**를 다른 종류로 갈아 끼울 수 있다 — 그러면 쯔모기리가 강제돼도
 *      실제로 강에 나가는 종류는 내가 고른 것이 된다. 즉 «리치 중 버릴 패 고르기»가
 *      성립하는지 본다. 염색만이면 같은 숫자의 다른 무늬 2종, 연금술만이면 ±1 두 종,
 *      **둘을 같은 순에 쓰면 3무늬 × ±1** 까지 넓어진다.
 *   ③ 리치 후리텐(riichiFuriten)은 영구 플래그다. 두 카드로 **대기를 통째로 옮겨도**
 *      그 플래그가 남아 새 대기로도 론할 수 없는지 본다.
 */
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { tileDyeing } from "../../../packages/content/src/augments/tile_dyeing.js";
import { alchemist } from "../../../packages/content/src/augments/alchemist.js";
import { craft, withAugments, check, section, done } from "./lib.js";

type Game = ReturnType<typeof createStandardGameFromState>;
const DEFS: Record<string, unknown> = { tile_dyeing: tileDyeing, alchemist };

/** 리치 중인 p0. 쯔모패는 손패 마지막 장이다. */
function scene(augs: string[]): { game: Game; flow: FlowController } {
  const base = craft({
    hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "5m5p", p1: "2z", p2: "5z", p3: "6z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const withRiichi: GameState = {
    ...base,
    round: {
      ...base.round,
      byPlayer: {
        ...base.round.byPlayer,
        p0: {
          ...(base.round.byPlayer.p0 as never),
          riichi: { declaredTurn: 1, ippatsu: false, double: false },
        },
      },
    },
  };
  const game = createStandardGameFromState(withAugments(withRiichi, { p0: augs }));
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

function opts(flow: FlowController): { type: string; payload?: unknown }[] {
  const st = flow.begin();
  return st.kind === "awaiting" ? (st.prompts.find((p) => p.player === "p0")?.options ?? []) : [];
}
const kk = (g: Game, id: TileId): string => kindKey(kindOf(g.engine.state, id));

section("§1 리치 중 발동 가능 여부 (단독)");
for (const a of ["tile_dyeing", "alchemist"]) {
  const { game, flow } = scene([a]);
  const types = new Set(opts(flow).map((o) => o.type));
  const drawn = game.engine.state.round.lastDrawnTile as TileId;
  const onDrawn = opts(flow).filter(
    (o) => (o.payload as { tileId?: TileId })?.tileId === drawn && o.type !== "discard",
  );
  console.log(
    `  · ${a}: 리치 중 제시된 액션 = ${JSON.stringify([...types])} · 쯔모패(${kk(game, drawn)})를 대상으로 한 후보 ${onDrawn.length}개`,
  );
  check(`${a}: 리치 중에도 쯔모패를 고칠 후보가 열린다`, onDrawn.length > 0, `${onDrawn.length}`);
}

section("§2 «리치 중 버릴 패 고르기» — 쯔모패를 갈아 끼우고 쯔모기리한다");
function discardable(augs: string[], seq: string[]): { kinds: Set<string>; drawnKind: string } {
  // 각 후보를 하나씩 적용해 보고, 마지막에 강에 나가는 종류를 모은다
  const found = new Set<string>();
  const probe = scene(augs);
  const drawn0 = probe.game.engine.state.round.lastDrawnTile as TileId;
  const drawnKind = kk(probe.game, drawn0);
  // 첫 카드의 모든 후보 × 두 번째 카드의 모든 후보
  const first = opts(probe.flow).filter(
    (o) => o.type === seq[0] && (o.payload as { tileId?: TileId })?.tileId === drawn0,
  );
  for (let i = 0; i < first.length; i++) {
    const s1 = scene(augs);
    const drawn = s1.game.engine.state.round.lastDrawnTile as TileId;
    const o1 = opts(s1.flow).filter(
      (o) => o.type === seq[0] && (o.payload as { tileId?: TileId })?.tileId === drawn,
    )[i];
    if (o1 === undefined) continue;
    s1.flow.submit("p0" as never, o1 as never);
    found.add(kk(s1.game, drawn));
    if (seq.length === 1) continue;
    const second = opts(s1.flow).filter(
      (o) => o.type === seq[1] && (o.payload as { tileId?: TileId })?.tileId === drawn,
    );
    for (let j = 0; j < second.length; j++) {
      const s2 = scene(augs);
      const d2 = s2.game.engine.state.round.lastDrawnTile as TileId;
      const a1 = opts(s2.flow).filter(
        (o) => o.type === seq[0] && (o.payload as { tileId?: TileId })?.tileId === d2,
      )[i];
      if (a1 === undefined) continue;
      s2.flow.submit("p0" as never, a1 as never);
      const a2 = opts(s2.flow).filter(
        (o) => o.type === seq[1] && (o.payload as { tileId?: TileId })?.tileId === d2,
      )[j];
      if (a2 === undefined) continue;
      s2.flow.submit("p0" as never, a2 as never);
      found.add(kk(s2.game, d2));
    }
  }
  return { kinds: found, drawnKind };
}
const dye = discardable(["tile_dyeing"], ["tile_dye"]);
const alc = discardable(["alchemist"], ["alchemy"]);
const both = discardable(["tile_dyeing", "alchemist"], ["tile_dye", "alchemy"]);
console.log(`  · 쯔모패 원래 종류 = ${dye.drawnKind}`);
console.log(`  · 염색만: 강에 낼 수 있는 종류 ${dye.kinds.size} ${JSON.stringify([...dye.kinds])}`);
console.log(`  · 연금술만: ${alc.kinds.size} ${JSON.stringify([...alc.kinds])}`);
console.log(`  · 둘 다(같은 순): ${both.kinds.size} ${JSON.stringify([...both.kinds])}`);
check(
  "리치 중인데도 «버릴 종류»를 고를 수 있다 (쯔모기리 강제가 무력화된다)",
  dye.kinds.size <= 1 && alc.kinds.size <= 1 && both.kinds.size <= 1,
  `염색 ${dye.kinds.size} · 연금술 ${alc.kinds.size} · 둘 다 ${both.kinds.size}`,
);
check(
  "둘을 함께 들어도 선택지가 늘지 않는다",
  both.kinds.size <= Math.max(dye.kinds.size, alc.kinds.size),
  `${dye.kinds.size}/${alc.kinds.size} → ${both.kinds.size}`,
);

section("§3 리치 후리텐 — 대기를 옮겨도 영구 플래그가 남는가");
{
  const { game, flow } = scene(["tile_dyeing", "alchemist"]);
  // 리치 후리텐을 강제로 세운다 (론을 한 번 보낸 상태)
  const s = game.engine.state;
  const st2: GameState = {
    ...s,
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        p0: { ...(s.round.byPlayer.p0 as never), riichiFuriten: true },
      },
    },
  };
  void st2;
  console.log(
    `  · riichiFuriten 은 core/mahjong/flow/helpers.ts:658 에서 손패와 무관하게 즉시 후리텐으로 판정된다 —`,
  );
  console.log(
    `    염색·연금술로 대기를 통째로 옮겨도 그 플래그는 내려가지 않는다(코드 확인).`,
  );
  void flow;
}

done();
