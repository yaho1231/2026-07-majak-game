/**
 * F — 예고형 증강 × 패산을 다르게 뽑는 증강
 *   F1 triple_peek × bottom_deal (같은 좌석)   F2 triple_peek × 다른 좌석의 bottom_deal
 */
import { craft, setup, FlowController, kindKey, kindOf, WALL, table } from "./lib.js";
import type { GameState, PlayerId } from "./lib.js";
import { triplePeek } from "../../../packages/content/src/augments/triple_peek.js";
import { bottomDeal } from "../../../packages/content/src/augments/bottom_deal.js";
import { northTrader } from "../../../packages/content/src/augments/north_trader.js";

const DEFS: Record<string, any> = { triple_peek: triplePeek, bottom_deal: bottomDeal, north_trader: northTrader };

/** 패산을 결정론적으로 섞는다 — craft의 패산은 정렬돼 있어 이웃이 같은 종류다 */
function shuffleWall(st: GameState): GameState {
  const ids = [...st.zones[WALL]!.tileIds];
  let seed = 12345;
  for (let i = ids.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return { ...st, zones: { ...st.zones, [WALL]: { ...st.zones[WALL]!, tileIds: ids } } };
}

function scene(): GameState {
  return shuffleWall(craft({
    hands: { p0: "123456789m234p5s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  }));
}

/** p0가 triple_peek을 선언하고, 이어서 지정한 좌석이 bottom_deal을 선언한 뒤 4바퀴 돌린다 */
function run(label: string, bottomSeat: PlayerId | null) {
  const installs: any[] = [{ def: triplePeek, holder: "p0" }];
  if (bottomSeat) installs.push({ def: bottomDeal, holder: bottomSeat });
  const game = setup(scene(), installs);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const say = (p: PlayerId, type: string) => {
    if (status.kind !== "awaiting") return false;
    const pr = status.prompts.find((x) => x.player === p);
    const o = pr?.options.find((x) => x.type === type);
    if (!o) return false;
    status = flow.submit(p, o as any);
    return true;
  };
  say("p0", "triple_peek_use");
  const predicted = [...((game.engine.state.augmentData[`view:p0:triple_peek#round`] as string[]) ?? [])];
  let bd0 = bottomSeat === "p0" && say("p0", "bottom_deal") ? 1 : 0;
  // p0 버림 → 세 좌석이 돌아 p0에게 다시 온다
  const actual: string[] = [];
  let bdUsed = 0;
  for (let step = 0; step < 60 && actual.length < 3; step++) {
    if (status.kind !== "awaiting") break;
    const pr = status.prompts[0]!;
    const p = pr.player;
    if (bottomSeat && p === bottomSeat && pr.options.some((o) => o.type === "bottom_deal") && p !== "p0") {
      status = flow.submit(p, pr.options.find((o) => o.type === "bottom_deal") as any);
      bdUsed++;
      continue;
    }
    const d = pr.options.find((o) => o.type === "discard") ?? pr.options.find((o) => o.type === "pass") ?? pr.options[0];
    status = flow.submit(p, d as any);
    const s = game.engine.state;
    if (s.round.lastDrawnTile !== null && s.round.turnSeat === 0 && s.round.phase === "turn.act") {
      const k = kindKey(kindOf(s, s.round.lastDrawnTile));
      if (actual.length === 0 || actual[actual.length - 1] !== k) actual.push(k);
      if (bottomSeat === "p0" && actual.length < 3) {
        const o = status.kind === "awaiting" ? status.prompts.find((x) => x.player === "p0")?.options.find((x) => x.type === "bottom_deal") : undefined;
        if (o) { status = flow.submit("p0", o as any); bd0++; }
      }
    }
  }
  return { 조합: label, "triple_peek 예고": predicted.join(" "), "실제 쯔모": actual.join(" "), 밑장빼기횟수: bdUsed + bd0, 일치: predicted.slice(0, actual.length).join(" ") === actual.join(" ") };
}

table("F1: triple_peek(p0) × bottom_deal", [
  run("triple_peek만", null),
  run("+ p0가 매 순 밑장빼기", "p0"),
  run("+ p1(하가)이 밑장빼기", "p1"),
]);
