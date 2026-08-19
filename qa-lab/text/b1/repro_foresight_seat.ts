/**
 * 예지(foresight) — detail: "이 4장은 하가·대면·상가·나의 다음 쯔모이며 **네 번째가 내 쯔모다**".
 * 누군가 퐁을 하면 그 배정이 통째로 밀리는데 문구도 표시도 그대로다.
 * (삼세 예지는 같은 상황을 실시간 재계산으로 약속하지만, 예지는 재계산을 하지 않는다.)
 */
import { FlowController, WALL, createStandardGameFromState, installAugment, kindKey } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { foresight } from "../../../packages/content/src/augments/foresight.js";

const key = (s: GameState, t: number): string => kindKey(s.tiles[t]!.kind);
const SOU5 = kindKey({ suit: "sou", rank: 5 });

function give(state: GameState, player: PlayerId, id: string): GameState {
  return { ...state, players: state.players.map((p) => (p.id === player ? { ...p, augments: [...p.augments, id] } : p)) };
}

function run(pon: boolean): void {
  let s = craft({
    hands: {
      p0: "111m222m333m44m55m5s",   // 14장, 마지막 5s = 쯔모패
      p1: "5s5s159m159p12345z",     // 5s 퐁 가능
      p2: "*",
      p3: "*",
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = give(s, "p0", "foresight");
  const game = createStandardGameFromState(s);
  installAugment(game.engine, foresight, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  let cur: any = flow.begin();

  const st0: GameState = game.engine.state;
  const wall0 = st0.zones[WALL]!.tileIds.slice(0, 4);
  console.log(`\n[퐁 ${pon ? "있음" : "없음"}] 패산 앞 4장 = ${wall0.map((t) => key(st0, t)).join(", ")}`);
  cur = flow.submit("p0", { type: "foresight_reveal", payload: {} });
  const shown = game.engine.state.augmentData["view:p0:foresight_peek#round"] as string[];
  console.log(`  발동 후 p0 채널 = ${JSON.stringify(shown)}  → 문구상 "네 번째(${shown[3]})가 내 쯔모"`);

  // p0가 5s를 버린다
  const s1: GameState = game.engine.state;
  const five = s1.zones["hand:p0"]!.tileIds.find((t) => key(s1, t) === SOU5)!;
  // 재배열 후보가 떠 있으면 항등으로 넘긴다
  if (cur.kind === "awaiting") {
    const pr = cur.prompts.find((p: any) => p.player === "p0");
    if (!pr.options.some((o: any) => o.type === "discard" && o.payload.tileId === five)) {
      cur = flow.submit("p0", { type: "foresight_order", payload: { order: [0, 1, 2, 3] } });
    }
  }
  cur = flow.submit("p0", { type: "discard", payload: { tileId: five } });

  // 퐁 또는 전원 패스
  for (const p of [...(cur.prompts ?? [])]) {
    if (!flowPending(flow, p.player)) continue;
    const ponOpt = p.options.find((o: any) => o.type === "pon");
    const pass = p.options.find((o: any) => o.type === "pass");
    cur = flow.submit(p.player, pon && p.player === "p1" && ponOpt !== undefined ? ponOpt : pass);
  }

  // p0가 다시 쯔모할 때까지 아무 버림이나 진행
  let guard = 0;
  let p0Drew: number | null = null;
  while (cur.kind === "awaiting" && guard++ < 30) {
    const p = cur.prompts[0];
    const s: GameState = game.engine.state;
    if (p.player === "p0" && s.round.lastDrawnTile !== null && s.round.phase === "turn.act") {
      p0Drew = s.round.lastDrawnTile;
      break;
    }
    const d = p.options.find((o: any) => o.type === "discard") ?? p.options.find((o: any) => o.type === "pass") ?? p.options[0];
    cur = flow.submit(p.player, d);
  }
  const sN: GameState = game.engine.state;
  const chan = sN.augmentData["view:p0:foresight_peek#round"] as string[];
  const at = p0Drew === null ? -1 : wall0.indexOf(p0Drew);
  console.log(
    `  p0가 실제로 쯔모한 패 = ${p0Drew === null ? "?" : key(sN, p0Drew)} (tileId=${p0Drew})` +
      `  → 예고 4장 중 **${at + 1}번째**  (문구는 4번째를 약속)  일치=${at === 3}`,
  );
  console.log(`  이 시점 p0 채널 = ${JSON.stringify(chan)}`);
}

function flowPending(flow: FlowController, p: PlayerId): boolean {
  return flow.isPending(p);
}

run(false);
run(true);
