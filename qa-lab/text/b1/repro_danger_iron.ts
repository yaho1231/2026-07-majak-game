/** danger_sense × iron_wall: 후리텐 상대를 위험 계산에서 통째로 빼서 "쏘이는 패"를 안전으로 표시한다 */
import {
  FlowController, createStandardGameFromState, installAugment, kindKey,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { dangerSense } from "../../../packages/content/src/augments/danger_sense.js";
import { standardAugments } from "@majak/core";
const ironWall = standardAugments.find((a: any) => a.id === "iron_wall")!;

const MAN3 = kindKey({ suit: "man", rank: 3 });

function give(state: GameState, player: PlayerId, id: string): GameState {
  return { ...state, players: state.players.map((p) => p.id === player ? { ...p, augments: [...p.augments, id] } : p) };
}

function scene(p1Furiten: boolean, p1IronWall: boolean): GameState {
  let s = craft({
    hands: {
      p0: "3m123p456p789p11s7z7z",
      p1: "123m456m789m123p3m",   // 3m 탄키 텐파이
      p2: "159m159p159s1234z",
      p3: "147m147p147s1234z",
    },
    // p1이 3m을 이미 버려 두면 후리텐
    discards: p1Furiten ? { p0: "", p1: "3m", p2: "", p3: "" } as any : undefined,
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = give(s, "p0", "danger_sense");
  if (p1IronWall) s = give(s, "p1", "iron_wall");
  return s;
}

function run(label: string, furiten: boolean, iron: boolean): void {
  const state = scene(furiten, iron);
  const game = createStandardGameFromState(state);
  installAugment(game.engine, dangerSense, "p0", { yaku: game.yaku });
  if (iron) installAugment(game.engine, ironWall as any, "p1", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const st = flow.begin();
  if (st.kind !== "awaiting") throw new Error("not awaiting");
  flow.submit("p0", { type: "danger_sense_use", payload: {} });
  const v = game.engine.state.augmentData["view:p0:danger_sense#round"] as { kinds: string[] };
  console.log(`${label}: kinds=${JSON.stringify(v.kinds)}  3m위험표시=${v.kinds.includes(MAN3)}`);
}

run("A 후리텐X · 철벽X", false, false);
run("B 후리텐O · 철벽X (표시 안 되는 게 맞음)", true, false);
run("C 후리텐O · 철벽O (론 가능한데?)", true, true);

// C에서 실제로 p1이 론할 수 있는지 확인 (철벽 = 후리텐 무시)
{
  const state = scene(true, true);
  const game = createStandardGameFromState(state);
  installAugment(game.engine, dangerSense, "p0", { yaku: game.yaku });
  installAugment(game.engine, ironWall as any, "p1", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  flow.begin();
  const hand = game.engine.state.zones["hand:p0"]!.tileIds;
  const m3 = hand.find((t) => kindKey(game.engine.state.tiles[t]!.kind) === MAN3)!;
  const st = flow.submit("p0", { type: "discard", payload: { tileId: m3 } });
  const p1 = (st as any).prompts?.find((p: any) => p.player === "p1");
  console.log("D 3m 버린 뒤 p1 옵션:", p1?.options.map((o: any) => o.type));
}
