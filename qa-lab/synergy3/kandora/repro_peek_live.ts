/**
 * F1' — triple_peek의 **실시간** 채널이 실제 쯔모와 어긋나는가.
 * 매번 p0의 쯔모 직전에 채널 첫 항목을 읽고, 실제로 뽑힌 패와 대조한다.
 */
import { craft, setup, FlowController, kindKey, kindOf, WALL, table } from "./lib.js";
import type { GameState, PlayerId } from "./lib.js";
import { triplePeek } from "../../../packages/content/src/augments/triple_peek.js";
import { bottomDeal } from "../../../packages/content/src/augments/bottom_deal.js";

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

function run(label: string, bottomSeat: PlayerId | null) {
  const st = shuffleWall(craft({
    hands: { p0: "123456789m234p5s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  }));
  const installs: any[] = [{ def: triplePeek, holder: "p0" }];
  if (bottomSeat) installs.push({ def: bottomDeal, holder: bottomSeat });
  const game = setup(st, installs);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const sub = (p: PlayerId, o: any) => { status = flow.submit(p, o); };
  const pr0 = status.kind === "awaiting" ? status.prompts.find((x) => x.player === "p0") : undefined;
  sub("p0", pr0!.options.find((o) => o.type === "triple_peek_use"));

  const chan = () => ((game.engine.state.augmentData["view:p0:triple_peek#round"] as string[]) ?? []);
  let checks = 0, mismatch = 0;
  const detail: string[] = [];
  let expectNext: string | null = null;
  for (let step = 0; step < 200 && checks < 4; step++) {
    if (status.kind !== "awaiting") break;
    const s = game.engine.state;
    // p0가 곧 뽑는다면 지금의 채널 첫 항목이 그 패여야 한다
    if (s.round.phase === "turn.act" && s.round.turnSeat === 0 && expectNext === null) {
      // p0의 행동 차례 — 여기서 예고를 읽는다(이 뒤 세 좌석을 지나 내 쯔모가 온다)
      expectNext = chan()[0] ?? null;
    }
    const pr = status.prompts[0]!;
    const p = pr.player;
    if (bottomSeat && p === bottomSeat && pr.options.some((o) => o.type === "bottom_deal")) {
      sub(p, pr.options.find((o) => o.type === "bottom_deal"));
      continue;
    }
    const o = pr.options.find((x) => x.type === "discard") ?? pr.options.find((x) => x.type === "pass") ?? pr.options[0];
    sub(p, o);
    const s2 = game.engine.state;
    if (s2.round.phase === "turn.act" && s2.round.turnSeat === 0 && s2.round.lastDrawnTile !== null && expectNext !== null) {
      const got = kindKey(kindOf(s2, s2.round.lastDrawnTile));
      checks++;
      if (got !== expectNext) { mismatch++; detail.push(`예고 ${expectNext} → 실제 ${got}`); }
      expectNext = null;
    }
  }
  return { 조합: label, 검사: checks, 불일치: mismatch, 사례: detail.join(" / ") || "-" };
}

table("F1': triple_peek 실시간 채널 vs 실제 쯔모", [
  run("triple_peek만", null),
  run("+ p0 자신이 밑장빼기", "p0"),
  run("+ p1(하가)이 밑장빼기", "p1"),
  run("+ p2(대면)이 밑장빼기", "p2"),
]);
