/**
 * 의심 5 재검증 — picky_eater 가 리치 중에도 손패 전체를 물들이는가,
 * 그리고 그것이 **리치 손 동결**을 실제로 깨고 대기를 갈아치우는가.
 * 대조군: 같은 일을 하는 suit_unify 는 리치 중 반려한다.
 */
import {
  FlowController, createStandardGameFromState, handZone, installAugment,
  kindKey, kindOf, winningKinds,
} from "@majak/core";
import type { GameState, PlayerId, TileKind } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { pickyEater } from "../../packages/content/src/augments/picky_eater.js";
import { suitUnify } from "../../packages/content/src/augments/suit_unify.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});
const handKinds = (st: GameState, p: PlayerId): TileKind[] =>
  st.zones[handZone(p)]!.tileIds.map((i) => kindOf(st, i));
const show = (st: GameState, p: PlayerId): string =>
  st.zones[handZone(p)]!.tileIds.map((i) => `${i}:${kindKey(kindOf(st, i))}`).join(" ");
const waitsOf = (st: GameState, p: PlayerId): string[] => {
  const k = handKinds(st, p);
  // 14장이면 한 장씩 빼 보며 대기형을 찾는다
  let best = winningKinds(k, 0, undefined, undefined);
  if (best.length === 0) {
    for (let i = 0; i < k.length; i++) {
      const rest = k.slice(0, i).concat(k.slice(i + 1));
      const w = winningKinds(rest, 0, undefined, undefined);
      if (w.length > best.length) best = w;
    }
  }
  return best.map(kindKey);
};

// p0: 리치 · 123456789m + 22m + 12p 텐파이(pin3 대기), 쯔모패는 자패 5z
// 퀘스트: 통(pin)만 12장 버렸다 → picky_eater 발동 조건 충족 (pin3 은 버리지 않았다)
function build(aug: string): GameState {
  const base = craft({
    hands: { p0: "123456789m22m12p5z", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "444555666777p" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...withAug(base, "p0", [aug]),
    round: {
      ...base.round,
      byPlayer: {
        ...base.round.byPlayer,
        p0: {
          ...base.round.byPlayer.p0!,
          riichi: { declaredTurn: 3, ippatsu: false, double: false } as never,
        },
      },
    },
  };
}

function boot(st: GameState, def: typeof pickyEater) {
  const game = createStandardGameFromState(st);
  installAugment(game.engine, def, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  return { game, flow, s: flow.begin() };
}

// ── 대조군: suit_unify
{
  const { s } = boot(build("suit_unify"), suitUnify);
  const opts = s.kind === "awaiting" ? (s.prompts.find((x) => x.player === "p0")?.options ?? []) : [];
  console.log(`[대조군] suit_unify · 리치 중 옵션: ${[...new Set(opts.map((o) => o.type))].join(",")}`);
}

// ── 본건: picky_eater
{
  const st0 = build("picky_eater");
  const { game, flow, s } = boot(st0, pickyEater);
  if (s.kind !== "awaiting") throw new Error("no prompt");
  const opts = s.prompts.find((x) => x.player === "p0")?.options ?? [];
  console.log(`[본건]  picky_eater · 리치 중 옵션: ${[...new Set(opts.map((o) => o.type))].join(",")}`);
  const before = game.engine.state;
  console.log(`  리치 선언됨 = ${before.round.byPlayer.p0?.riichi != null}`);
  console.log(`  발동 전 손패: ${show(before, "p0")}`);
  console.log(`  발동 전 대기: ${waitsOf(before, "p0").join(",")}`);
  const man = opts.find((o) => o.type === "picky_unify" && (o.payload as { suit: string }).suit === "man");
  if (man === undefined) throw new Error("man 통일 후보가 없다");
  flow.submit("p0", man as never);
  const after = game.engine.state;
  console.log(`  발동 후 손패: ${show(after, "p0")}`);
  console.log(`  발동 후 대기: ${waitsOf(after, "p0").join(",")}`);

  // 리치 동결 검사: 리치 선언 시점의 tileId → kind 가 그대로인가
  const b = new Map(before.zones[handZone("p0")]!.tileIds.map((i) => [i, kindKey(kindOf(before, i))]));
  const changed: string[] = [];
  for (const [id, k] of b) {
    const now = after.tiles[id] === undefined ? "(손패에서 빠짐)" : kindKey(kindOf(after, id));
    if (now !== k) changed.push(`${id}:${k}→${now}`);
  }
  const gone = [...b.keys()].filter((i) => !after.zones[handZone("p0")]!.tileIds.includes(i));
  console.log(`  리치 손 동결 위반: kind가 바뀐 패 ${changed.length}장 [${changed.join(" ")}] · 손에서 빠진 패 ${gone.length}장 [${gone.join(",")}]`);
}
