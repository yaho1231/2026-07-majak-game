/**
 * 친 카드끼리 — pseudo_dealer(오야 강탈) × seat_swap(자리 교환)을 같은 순에 연달아.
 * 오야는 «자리»에 붙는다. 강탈 뒤 자리를 바꾸면 빼앗은 오야가 상대에게 넘어가는가?
 */
import { craft, mkGame, withAugments, optionsFor, FlowController } from "./lib.js";
import type { GameState, PlayerId } from "@majak/core";

function show(s: GameState, tag: string): void {
  console.log(
    `  ${tag}: dealerSeat=${s.round.dealerSeat} | ` +
    s.players.map((p) => `${p.id}@seat${p.seat}`).join(" "),
  );
}

function run(order: ("claim" | "swap")[]): void {
  let s: GameState = craft({
    hands: { p0: "123m456m789m99p2s3s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 2,
    drawnLastFor: "p2",
  });
  s = { ...s, round: { ...s.round, dealerSeat: 0 } };
  s = withAugments(s, { p2: ["pseudo_dealer", "seat_swap"] });
  const game = mkGame(s);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  console.log(`순서 ${order.join(" → ")}`);
  show(game.engine.state, "시작 (오야=seat0=p0)");
  for (const step of order) {
    const t = step === "claim" ? "claim_dealer" : "seat_swap";
    const o = optionsFor(status, "p2").find(
      (x) => x.type === t && (t !== "seat_swap" || (x.payload as { target: PlayerId }).target === "p3"),
    );
    if (o === undefined) { console.log(`  ${t} 후보 없음`); continue; }
    status = flow.submit("p2", o);
    show(game.engine.state, `${t} 후`);
  }
  console.log("");
}

run(["claim", "swap"]);
run(["swap", "claim"]);
