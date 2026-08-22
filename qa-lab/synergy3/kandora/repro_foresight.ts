/**
 * F2 — foresight(예지) × bottom_deal(밑장빼기)
 * 카드: "공개된 4장은 지금 차례 기준으로 하가·대면·상가·나에게 차례로 배정된다.
 *        중간에 누가 퐁·치를 하면 배정이 한 칸씩 당겨진다."
 * 기대: 밑장빼기는 패산 **앞**을 소모하지 않으므로 4장은 그대로 있어야 하고,
 *       배정만 한 칸 밀린다.
 */
import { craft, setup, FlowController, kindKey, kindOf, WALL, table } from "./lib.js";
import type { GameState, PlayerId } from "./lib.js";
import { foresight } from "../../../packages/content/src/augments/foresight.js";
import { bottomDeal } from "../../../packages/content/src/augments/bottom_deal.js";

function shuffleWall(st: GameState): GameState {
  const ids = [...st.zones[WALL]!.tileIds];
  let seed = 999;
  for (let i = ids.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return { ...st, zones: { ...st.zones, [WALL]: { ...st.zones[WALL]!, tileIds: ids } } };
}

function run(label: string, bottomSeat: PlayerId | null, bottomTimes: number) {
  const st = shuffleWall(craft({
    hands: { p0: "123456789m234p5s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  }));
  const installs: any[] = [{ def: foresight, holder: "p0" }];
  if (bottomSeat) installs.push({ def: bottomDeal, holder: bottomSeat });
  const game = setup(st, installs);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const sub = (p: PlayerId, o: any) => { status = flow.submit(p, o); };
  sub("p0", (status as any).prompts.find((x: any) => x.player === "p0").options.find((o: any) => o.type === "foresight_reveal"));
  const revealed = [...((game.engine.state.augmentData["view:p0:foresight_peek#round"] as string[]) ?? [])];
  const frontAtReveal = game.engine.state.zones[WALL]!.tileIds.slice(0, 4)
    .map((id) => kindKey(kindOf(game.engine.state, id)));

  let bdLeft = bottomTimes;
  const drawnBy: Record<string, string[]> = { p0: [], p1: [], p2: [], p3: [] };
  for (let step = 0; step < 40; step++) {
    if (status.kind !== "awaiting") break;
    const pr = status.prompts[0]!;
    const p = pr.player;
    if (bottomSeat && p === bottomSeat && bdLeft > 0 && pr.options.some((o) => o.type === "bottom_deal")) {
      sub(p, pr.options.find((o) => o.type === "bottom_deal"));
      bdLeft--;
      continue;
    }
    const o = pr.options.find((x) => x.type === "discard") ?? pr.options.find((x) => x.type === "pass") ?? pr.options[0];
    const before = game.engine.state.round.lastDrawnTile;
    sub(p, o);
    const s = game.engine.state;
    if (s.round.lastDrawnTile !== null && s.round.lastDrawnTile !== before && s.round.phase === "turn.act") {
      const who = s.players.find((x) => x.seat === s.round.turnSeat)!.id;
      drawnBy[who]!.push(kindKey(kindOf(s, s.round.lastDrawnTile)));
    }
    if (Object.values(drawnBy).reduce((a, b) => a + b.length, 0) >= 4) break;
  }
  const order = ["p1", "p2", "p3", "p0"].map((p) => drawnBy[p]![0] ?? "-");
  const chanAfter = [...((game.engine.state.augmentData["view:p0:foresight_peek#round"] as string[]) ?? [])];
  const frontAfter = game.engine.state.zones[WALL]!.tileIds.slice(0, 4).map((id) => kindKey(kindOf(game.engine.state, id)));
  return {
    조합: label,
    "예지 공개 4장": revealed.join(" "),
    "실제 하가·대면·상가·나": order.join(" "),
    일치: revealed.join(" ") === order.join(" "),
    "남은 예언 채널": chanAfter.join(" ") || "(빔)",
    "지금 패산 앞": frontAfter.join(" "),
  };
}

table("F2: foresight × bottom_deal", [
  run("foresight만", null, 0),
  run("+ p1(하가)이 1회 밑장빼기", "p1", 1),
  run("+ p0(나) 자신이 1회 밑장빼기", "p0", 1),
]);

// ── F2b: 밑장빼기 쯔모 한 번으로 예언 창이 한 칸 줄어드는가 (패산 앞은 그대로인데) ──
{
  const st = shuffleWall(craft({
    hands: { p0: "123456789m234p5s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  }));
  const game = setup(st, [{ def: foresight, holder: "p0" }, { def: bottomDeal, holder: "p0" }]);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  const opt = (p: string, t: string) => status.prompts.find((x: any) => x.player === p)?.options.find((o: any) => o.type === t);
  status = flow.submit("p0", opt("p0", "foresight_reveal"));
  const chan0 = [...((game.engine.state.augmentData["view:p0:foresight_peek#round"] as string[]) ?? [])];
  const front0 = game.engine.state.zones[WALL]!.tileIds.slice(0, 4).map((id) => kindKey(kindOf(game.engine.state, id)));
  status = flow.submit("p0", opt("p0", "bottom_deal"));
  // p0 버림 → p1·p2·p3 각 1회 쯔모/버림 → p0 쯔모(밑장)
  for (let i = 0; i < 12; i++) {
    if (status.kind !== "awaiting") break;
    const pr = status.prompts[0];
    const o = pr.options.find((x: any) => x.type === "discard") ?? pr.options.find((x: any) => x.type === "pass") ?? pr.options[0];
    status = flow.submit(pr.player, o);
    const s = game.engine.state;
    if (s.round.turnSeat === 0 && s.round.phase === "turn.act" && s.round.lastDrawnTile !== null) break;
  }
  const s = game.engine.state;
  console.log("\n--- F2b: 예언 4장 중 밑장빼기 쯔모가 한 칸을 잘못 깎는가");
  console.log("   발동 직후 채널  =", chan0.join(" "));
  console.log("   발동 직후 패산앞=", front0.join(" "));
  console.log("   밑장 쯔모 뒤 채널  =", ((s.augmentData["view:p0:foresight_peek#round"] as string[]) ?? []).join(" "));
  console.log("   밑장 쯔모 뒤 패산앞=", s.zones[WALL]!.tileIds.slice(0, 4).map((id) => kindKey(kindOf(s, id))).join(" "));
  console.log("   (패산 앞 3장이 남 3명에게 뽑혀 나가므로, 예언 창은 '내 몫 1장'이 남아야 정상)");
}
