/**
 * 소환(conjure_draw) × 리치 — 리치 중에도 발동되어 다음 쯔모가 확정 오름패가 된다.
 *
 * 같은 계열의 손 관련 액티브(거신병·분열·개벽·짝수의 세계·귀환)는 전부
 * `riichi: hand is frozen`으로 반려한다(honor_return.ts:92-96 주석이 그 규약을 명시).
 * 소환만 리치 검사가 없다. 손패를 직접 건드리진 않지만, 단기(탄키)·샹퐁 대기라면
 * **대기패가 손에 있으므로** 그것을 지목해 다음 쯔모를 확정 화료로 만들 수 있다.
 */
import {
  FlowController,
  createStandardGameFromState,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { conjureDraw } from "../../packages/content/src/augments/conjure_draw.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});

// p0: 리치 · 탄키(단기) 대기 — 123m456m789m123p + 5s 단기
const base = craft({
  hands: { p0: "123456789m123p5s9s", p1: "*", p2: "*", p3: "*" }, // 14장, 쯔모패=9s
  discards: { p0: "1z2z3z" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const handIds = base.zones[handZone("p0")]!.tileIds;
const st: GameState = {
  ...withAug(base, "p0", ["conjure_draw"]),
  round: {
    ...base.round,
    byPlayer: {
      ...base.round.byPlayer,
      p0: {
        ...base.round.byPlayer.p0!,
        riichi: { declaredTurn: 1, ippatsu: false, double: false } as never,
      },
    },
  },
};

const game = createStandardGameFromState(st);
installAugment(game.engine, conjureDraw, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
let s = flow.begin();
if (s.kind !== "awaiting") throw new Error("no prompt");

const opts = s.prompts.find((x) => x.player === "p0")?.options ?? [];
console.log("리치 중 p0 옵션:", [...new Set(opts.map((o) => o.type))].join(","));
const conj = opts.filter((o) => o.type === "conjure_tsumo");
console.log(`conjure_tsumo 후보 = ${conj.length}  ← 리치 중인데 발동 가능`);

// 단기 대기패(5s)를 지목한다
const target = conj.find((o) => {
  const id = (o.payload as { tileId: TileId }).tileId;
  return kindKey(kindOf(st, id)) === "sou5";
});
if (target === undefined) throw new Error("no 5s option");
s = flow.submit("p0", target as { type: string; payload: unknown });
console.log("소환 대상:", "sou5 (단기 대기패)");

// 쯔모기리로 순을 넘기고 한 바퀴 돌아 p0의 다음 쯔모까지 간다
const drawn = game.engine.state.round.lastDrawnTile as TileId;
s = flow.submit("p0", { type: "discard", payload: { tileId: drawn } });
for (let i = 0; i < 40 && s.kind === "awaiting"; i++) {
  const pr = s.prompts[0];
  if (pr === undefined) break;
  if (pr.player === "p0" && !pr.options.some((o) => o.type === "pass")) break; // p0의 다음 턴 도달
  const pass = pr.options.find((o) => o.type === "pass");
  if (pass !== undefined) { s = flow.submit(pr.player, pass as never); continue; }
  const d = pr.options.find((o) => o.type === "discard");
  if (d === undefined) break;
  s = flow.submit(pr.player, d as never);
}
const st2 = game.engine.state;
const d2 = st2.round.lastDrawnTile;
console.log(`p0의 다음 쯔모 = ${d2 === null ? "null" : kindKey(kindOf(st2, d2))} (conjured=${d2 === null ? "-" : st2.tiles[d2]?.attrs.conjured === true})`);
const mine = s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0") : undefined;
console.log(`화료(win) 제시 = ${mine?.options.some((o) => o.type === "win") === true}`);
console.log(
  mine?.options.some((o) => o.type === "win") === true
    ? "🟡 확정: 리치 중 소환으로 다음 쯔모가 확정 오름패가 된다 (계열 규약에서 혼자 벗어나 있다)"
    : "재현 실패",
);
void handIds;
