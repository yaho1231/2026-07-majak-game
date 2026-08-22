/**
 * 공탁을 0으로 만드는 리치(stealth_riichi · no_retreat) × 승부수(last_stand, 리치봉 반환) ×
 * 카운터(counter, 공탁 대납) — 공탁이 이중 지불되거나 없던 점수가 생기는가.
 *
 * 장면: p1이 먼저 표준 리치(공탁 1000 → 판 위의 리치봉 1000). 그 뒤 p0가 각 방식으로
 *       리치를 걸고, 곧바로 승부수로 취소한다.
 */
import {
  craft, mkGame, setIndicators, withAugments, withRiichi, optionsFor, FlowController,
} from "./lib.js";
import type { ActionOption, GameState } from "@majak/core";

function scene(p0augs: string[]): GameState {
  let s = craft({
    hands: { p0: "123m456m789m222p1s9s", p1: "234567m123p4455z", p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "67z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  s = withAugments(s, { p0: p0augs });
  // p1은 이미 리치 — 공탁 1000이 판 위에 있다
  s = withRiichi(s, "p1", { cost: 1000 });
  return {
    ...s,
    players: s.players.map((p) => (p.id === "p1" ? { ...p, score: p.score - 1000 } : p)),
    round: { ...s.round, riichiPot: 1000 },
  };
}

function run(p0augs: string[], action: string, cancel: boolean): void {
  const st = scene(p0augs);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  const before = { p0: st.players[0]!.score, p1: st.players[1]!.score, pot: st.round.riichiPot };
  const is9s = (o: ActionOption): boolean => {
    const id = (o.payload as { tileId?: number }).tileId;
    if (id === undefined) return false;
    const k = game.engine.state.tiles[id]!.kind;
    return k.suit === "sou" && k.rank === 9;
  };
  const d = optionsFor(status, "p0").find((o) => o.type === action && is9s(o));
  if (d === undefined) {
    console.log(`${[...p0augs, action].join("+").padEnd(46)} 선언 불가`);
    return;
  }
  status = flow.submit("p0", d);
  const mid = {
    p0: game.engine.state.players[0]!.score,
    p1: game.engine.state.players[1]!.score,
    pot: game.engine.state.round.riichiPot,
  };
  let after = mid;
  if (cancel) {
    // 다음 p0 차례까지 진행
    for (let i = 0; i < 12; i++) {
      const s = status as { kind: string; prompts?: { player: string; options: ActionOption[] }[] };
      if (s.kind !== "awaiting") break;
      const pr = s.prompts?.[0];
      if (pr === undefined) break;
      if (pr.player === "p0" && pr.options.some((o) => o.type === "cancel_riichi")) break;
      const pass = pr.options.find((o) => o.type === "pass");
      if (pass !== undefined) {
        status = flow.submit(pr.player as never, pass);
        continue;
      }
      const dd = pr.options.filter((o) => o.type === "discard");
      if (dd.length === 0) break;
      status = flow.submit(pr.player as never, dd[dd.length - 1] as ActionOption);
    }
    const c = optionsFor(status, "p0").find((o) => o.type === "cancel_riichi");
    if (c === undefined) {
      console.log(`${[...p0augs, action].join("+").padEnd(46)} 취소 버튼 없음`);
      return;
    }
    status = flow.submit("p0", c);
    after = {
      p0: game.engine.state.players[0]!.score,
      p1: game.engine.state.players[1]!.score,
      pot: game.engine.state.round.riichiPot,
    };
  }
  console.log(
    `${[...p0augs, action].join("+").padEnd(46)} 선언전 p0=${before.p0} pot=${before.pot} → 선언후 p0=${mid.p0} p1=${mid.p1} pot=${mid.pot}` +
      (cancel ? ` → 취소후 p0=${after.p0} p1=${after.p1} pot=${after.pot}` : ""),
  );
}

console.log("=== 선언만 ===");
run(["last_stand"], "riichi", false);
run(["stealth_riichi", "last_stand"], "stealth_riichi", false);
run(["no_retreat", "last_stand"], "no_retreat_riichi", false);
run(["all_or_nothing", "last_stand"], "all_in_riichi", false);
console.log("\n=== 선언 후 승부수로 취소 ===");
run(["last_stand"], "riichi", true);
run(["stealth_riichi", "last_stand"], "stealth_riichi", true);
run(["no_retreat", "last_stand"], "no_retreat_riichi", true);
run(["all_or_nothing", "last_stand"], "all_in_riichi", true);
console.log("\n=== 카운터(대납) — p1이 먼저 리치 ===");
run(["counter"], "riichi", false);
run(["counter", "stealth_riichi"], "stealth_riichi", false);
run(["counter", "no_retreat"], "no_retreat_riichi", false);
run(["counter", "all_or_nothing"], "all_in_riichi", false);
console.log("\n=== 카운터 + 승부수 취소 (대납 환수) ===");
run(["counter", "no_retreat", "last_stand"], "no_retreat_riichi", true);
run(["counter", "last_stand"], "riichi", true);
