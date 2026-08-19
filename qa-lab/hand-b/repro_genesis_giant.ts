/**
 * 확정 재현: 개벽(genesis) → 같은 순에 거신병(giant_god)
 *
 * 개벽은 패산 실물과 맞바꾼 패를 손패 **끝에** 붙이고, 패산이 모자라 그 자리에서 종류만
 * 바뀐 패(mutation)는 원래 자리에 남는다. 그래서 개벽 직후 **쯔모패가 손패 배열의 마지막이
 * 아니게 될 수 있다**.
 *
 * 거신병은 `handIdsOf(...).slice(0, 13)`을 그대로 바닥으로 내던지므로 이때 쯔모패가
 * 바닥으로 나간다 — round.lastDrawnTile이 손에 없는 패를 가리킨다.
 * (밥상 뒤엎기는 같은 위험을 리듀서 주석에 명시하고 replaceDrawnTile로 막는다.)
 */
import {
  FlowController,
  WALL,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { giantGod } from "../../packages/content/src/augments/giant_god.js";
import { genesis } from "../../packages/content/src/augments/genesis.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});

const isHonorId = (st: GameState, id: TileId): boolean => {
  const k = kindOf(st, id);
  return k.suit === "wind" || k.suit === "dragon";
};

/** 패산의 자패 수를 정확히 keep장으로 맞춘다 — 나머지는 p3 손패의 수패와 맞바꾼다 */
function limitWallHonors(st: GameState, keep: number): GameState {
  const wall = [...(st.zones[WALL]?.tileIds ?? [])];
  const p3 = [...(st.zones[handZone("p3")]?.tileIds ?? [])];
  const wallHonorIdx = wall.map((id, i) => (isHonorId(st, id) ? i : -1)).filter((i) => i >= 0);
  const p3NumIdx = p3.map((id, i) => (isHonorId(st, id) ? -1 : i)).filter((i) => i >= 0);
  let swapped = 0;
  for (const wi of wallHonorIdx) {
    if (wallHonorIdx.length - swapped <= keep) break;
    const pi = p3NumIdx[swapped];
    if (pi === undefined) break;
    const a = wall[wi] as TileId;
    const b = p3[pi] as TileId;
    wall[wi] = b;
    p3[pi] = a;
    swapped++;
  }
  return {
    ...st,
    zones: {
      ...st.zones,
      [WALL]: { ...(st.zones[WALL] as never), tileIds: wall },
      [handZone("p3")]: { ...(st.zones[handZone("p3")] as never), tileIds: p3 },
    },
  };
}

function scene(wallHonors: number): GameState {
  const st = craft({
    hands: {
      p0: "2345678m2345678p", // 14장 전부 수패 (쯔모 직후)
      p1: "*",
      p2: "*",
      p3: "*",
    },
    discards: { p0: "19m19p19s1234z567z" }, // 국사 13종
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAug(limitWallHonors(st, wallHonors), "p0", ["genesis", "giant_god"]);
}

function run(wallHonors: number): void {
  const st0 = scene(wallHonors);
  const actualHonors = (st0.zones[WALL]?.tileIds ?? []).filter((id) => isHonorId(st0, id)).length;
  const game = createStandardGameFromState(st0);
  installAugment(game.engine, genesis, "p0", { yaku: game.yaku });
  installAugment(game.engine, giantGod, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  if (s.kind !== "awaiting") throw new Error("no prompt");
  const drawn0 = game.engine.state.round.lastDrawnTile as TileId;

  const gopt = s.prompts.find((x) => x.player === "p0")?.options.find((o) => o.type === "genesis_flip");
  if (gopt === undefined) { console.log(`wallHonors=${actualHonors}: genesis 옵션 없음`); return; }
  s = flow.submit("p0", gopt as { type: string; payload: unknown });

  const st1 = game.engine.state;
  const hand1 = st1.zones[handZone("p0")]?.tileIds ?? [];
  const drawn1 = st1.round.lastDrawnTile as TileId;
  const idx = hand1.indexOf(drawn1);
  console.log(
    `패산자패=${actualHonors}: 개벽 후 손패=${hand1.length}장, 쯔모패(${drawn0}→${drawn1}) 위치=${idx}` +
      (idx >= 0 && idx < 13 ? "  ← 마지막이 아니다" : ""),
  );
  if (idx < 0 || idx >= 13) return;

  if (s.kind !== "awaiting") return;
  const kopt = s.prompts.find((x) => x.player === "p0")?.options.find((o) => o.type === "giant_god");
  if (kopt === undefined) { console.log("   거신병 옵션 없음"); return; }
  s = flow.submit("p0", kopt as { type: string; payload: unknown });
  const st2 = game.engine.state;
  const hand2 = st2.zones[handZone("p0")]?.tileIds ?? [];
  const pond2 = st2.zones[discardsZone("p0")]?.tileIds ?? [];
  const d = st2.round.lastDrawnTile as TileId;
  console.log(`   거신병 후 손패=${hand2.length} 바닥=${pond2.length}`);
  console.log(`   lastDrawnTile=${d}  손에 있는가=${hand2.includes(d)}  바닥에 있는가=${pond2.includes(d)}`);
  console.log(`   손패: ${hand2.map((i) => kindKey(kindOf(st2, i))).join(" ")}`);
  const opts2 = s.kind === "awaiting" ? (s.prompts.find((x) => x.player === "p0")?.options ?? []) : [];
  console.log(`   프롬프트 옵션종류=${[...new Set(opts2.map((o) => o.type))].join(",")}`);
  console.log(`   화료(win) 제시=${opts2.some((o) => o.type === "win")}  / lastDrawnTile의 kind=${kindKey(kindOf(st2, d))}`);
  if (!hand2.includes(d)) {
    console.log("   🔴 확정: round.lastDrawnTile이 손에 없다 (바닥에 있다)");
    console.log(`   → 쯔모 화료 판정(buildWinContext)은 손패 ${hand2.length}장 + 화료패 1장 = ${hand2.length + 1}장으로 센다`);
  }
}

for (const n of [0, 2, 8, 13, 20]) run(n);

// ── 대조군: 같은 손패에서 lastDrawnTile만 손패 안의 같은 종류로 되돌리면 화료가 뜬다 ──
{
  const st = craft({
    hands: { p0: "19m19p19s1234567z2z", p1: "*", p2: "*", p3: "*" }, // 국사 완성형 14장
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const game = createStandardGameFromState(st);
  const flow = new FlowController(game.engine);
  const s = flow.begin();
  const o = s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0")?.options ?? [] : [];
  console.log(`\n[대조군] 같은 국사 완성형 · 쯔모패가 손 안: 화료 제시=${o.some((x) => x.type === "win")}`);
}
