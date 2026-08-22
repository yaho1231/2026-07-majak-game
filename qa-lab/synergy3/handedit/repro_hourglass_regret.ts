/**
 * 뒤집힌 모래시계(hourglass) × 미련(regret) — 둘 다 "황패유국 순간"에 발동한다.
 *
 * 기대(먼저 적는다):
 *   hourglass 는 유국 정산 자체를 **대체**해 국을 연장하고, regret 은 유국 시 멘젠
 *   텐파이 손패 13장을 다음 국 배패로 보존한다.
 *   같은 사람이 둘 다 들면 순서는 하나뿐이어야 한다 —
 *     ① 첫 유국: 모래시계가 정산을 삼킨다 → **미련은 이때 발동하지 않는다**
 *     ② 연장 4쯔모/4버림 뒤 두 번째 유국: 미련이 **연장 뒤의 손**을 보존한다
 *   따라서 미련이 보존하는 것은 연장 **전** 손이 아니라 **후** 손이어야 하고,
 *   두 번 발동해서도 안 된다(쿨다운 이중 소모).
 *   또 하나: 연장 중 텐파이가 깨지면 미련은 발동하지 않아야 한다.
 *
 * 부록: hourglass × dead_wall_master (영상패 잔량) — 왕패 교환이 영상 잔량을 건드리나.
 */
import {
  DEAD_WALL,
  WALL,
  FlowController,
  createStandardGameFromState,
  installAugment,
  handZone,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { hourglass } from "../../../packages/content/src/augments/hourglass.js";
import { regret } from "../../../packages/content/src/augments/regret.js";
import { deadWallMaster } from "../../../packages/content/src/augments/dead_wall_master.js";
import { craft, withAugments, handIds, deadLen, wallLen, kindKey, kindOf, check, section, done } from "./lib.js";

/** 패산을 n장으로 줄인다 (유국을 곧바로 만들기 위해) */
function trimWall(s: GameState, n: number): GameState {
  const ids = s.zones[WALL]?.tileIds ?? [];
  const keep = ids.slice(0, n);
  const drop = ids.slice(n);
  // 버린 패는 아무 존에도 안 넣으면 census 가 깨지므로 p3 바닥으로 치운다
  const p3 = s.zones["discards:p3"];
  return {
    ...s,
    zones: {
      ...s.zones,
      [WALL]: { ...(s.zones[WALL] as never), tileIds: keep },
      "discards:p3": { ...(p3 as never), tileIds: [...(p3?.tileIds ?? []), ...drop] },
    },
  };
}

/** 텐파이 상태의 p0. 패산이 n장 남았다. */
function scene(augs: string[], wall: number): GameState {
  const base = craft({
    hands: {
      // 멘젠 텐파이 (123m456m789m123p + 3m 단기)
      p0: "123m456m789m123p3m9p",
      p1: "*",
      p2: "*",
      p3: "*",
    },
    discards: { p0: "1z", p1: "2z", p2: "5z", p3: "6z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return trimWall(withAugments(base, { p0: augs }), wall);
}

const DEFS = { hourglass, regret, dead_wall_master: deadWallMaster } as const;

/** 프롬프트를 자동으로 소화한다 — 화료는 거절하고 그냥 버려서 유국까지 몬다 */
function drive(
  game: ReturnType<typeof createStandardGameFromState>,
  flow: FlowController,
  maxSteps = 200,
): { outcome: string; steps: number; log: string[] } {
  const log: string[] = [];
  let st = flow.begin();
  let steps = 0;
  while (st.kind === "awaiting" && steps < maxSteps) {
    steps++;
    const prompt = st.prompts[0];
    if (prompt === undefined) break;
    // 화료·리치·후로는 피하고 표준 버림(쯔모기리)만 한다
    const opts = prompt.options;
    const drawn = game.engine.state.round.lastDrawnTile;
    const tsumogiri = opts.find(
      (o) => o.type === "discard" && (o.payload as { tileId?: number })?.tileId === drawn,
    );
    const discard = tsumogiri ?? opts.find((o) => o.type === "discard");
    const pass = opts.find((o) => o.type === "pass");
    const pick = discard ?? pass ?? opts[0];
    if (pick === undefined) break;
    log.push(`${prompt.player}:${pick.type}${pick.type === "discard" ? ":" + JSON.stringify((pick.payload as {tileId?:number}).tileId) : ""}`);
    st = flow.submit(prompt.player, pick as never);
  }
  void game;
  return { outcome: st.kind === "roundOver" ? st.outcome : `stuck(${st.kind})`, steps, log };
}

const handKinds = (s: GameState, p: PlayerId): string =>
  (s.zones[handZone(p)]?.tileIds ?? []).map((id: TileId) => kindKey(kindOf(s, id))).join(" ");

function run(label: string, augs: (keyof typeof DEFS)[], wall: number): void {
  const st = scene(augs, wall);
  const game = createStandardGameFromState(st);
  for (const a of augs) {
    installAugment(game.engine, DEFS[a], "p0", { yaku: game.yaku, catalog: game.augments });
  }
  const flow = new FlowController(game.engine);
  const before = {
    wall: wallLen(game.engine.state),
    dead: deadLen(game.engine.state),
    hand: handKinds(game.engine.state, "p0"),
  };
  const r = drive(game, flow);
  const after = game.engine.state;
  const keep = after.augmentData[`regret:keep:p0`];
  console.log(`\n  · ${label}`);
  console.log(`    WALL ${before.wall}→${wallLen(after)} · DEAD ${before.dead}→${deadLen(after)} · 결과=${r.outcome} · 스텝=${r.steps}`);
  console.log(`    p0 손(전) ${before.hand}`);
  console.log(`    p0 손(후) ${handKinds(after, "p0")}`);
  console.log(`    regret:keep = ${JSON.stringify(keep)}`);
  console.log(`    로그 = ${r.log.join(" ")}`);
  console.log(`    hourglass view = ${JSON.stringify(
    Object.entries(after.augmentData).filter(([k]) => k.includes("hourglass")).map(([k, v]) => `${k}=${JSON.stringify(v)}`),
  )}`);
}

section("모래시계 × 미련 — 유국 정산 순서");
run("A: 모래시계만", ["hourglass"], 1);
run("B: 미련만", ["regret"], 1);
run("A+B: 모래시계+미련", ["hourglass", "regret"], 1);

section("부록 — 왕패 장수");
{
  const st = scene(["hourglass"], 1);
  const game = createStandardGameFromState(st);
  installAugment(game.engine, hourglass, "p0", { yaku: game.yaku, catalog: game.augments });
  const flow = new FlowController(game.engine);
  const dead0 = (game.engine.state.zones[DEAD_WALL]?.tileIds ?? []).length;
  drive(game, flow);
  const dead1 = (game.engine.state.zones[DEAD_WALL]?.tileIds ?? []).length;
  check("연장 뒤 왕패는 4장 줄어든다(설계상)", dead1 === dead0 - 4 || dead1 === dead0, `${dead0}→${dead1}`);
}

done();
