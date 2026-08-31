/**
 * 스텔스 리치(은닉)와 **conflicts로 막혀 있지 않은** 카드를 함께 들었을 때
 * 상대 뷰·전원 공개 채널에 무엇이 새는가.
 *
 * stealth_riichi.conflicts = riichi_seal · open_riichi_reveal · all_or_nothing ·
 *   soul_strike · off_by_one · palm_flip · riichi_upgrade · silent_swap
 * → 그 밖의 카드는 전부 함께 들 수 있다.
 */
import {
  craft, mkGame, setIndicators, withAugments, optionsFor, FlowController,
} from "./lib.js";
import { buildPlayerView } from "@majak/core";
import type { ActionOption, GameState, PlayerId } from "@majak/core";

function scene(p0augs: string[]): GameState {
  let s = craft({
    hands: { p0: "123m456m789m222p1s9s", p1: "234567m123p4455z", p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "67z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  return withAugments(s, { p0: p0augs });
}

function publicKeys(state: GameState): string[] {
  return Object.entries(state.augmentData)
    .filter(([k, v]) => k.startsWith("view:*:") && v !== "" && v !== false && v != null)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
}

function run(p0augs: string[]): void {
  const st = scene(p0augs);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  const before = publicKeys(game.engine.state);
  const opt = optionsFor(status, "p0").find((o) => {
    if (o.type !== "stealth_riichi") return false;
    const k = game.engine.state.tiles[(o.payload as { tileId: number }).tileId]!.kind;
    return k.suit === "sou" && k.rank === 9;
  });
  if (opt === undefined) {
    console.log(`${p0augs.join("+").padEnd(42)} 스텔스 선언 불가`);
    return;
  }
  status = flow.submit("p0", opt);
  const st2 = game.engine.state;
  const v1 = buildPlayerView(st2, "p1", game.engine.rules);
  const seen = v1.round.byPlayer["p0"]?.riichiDeclared;
  const after = publicKeys(st2).filter((k) => !before.includes(k));
  console.log(
    `${p0augs.join("+").padEnd(42)} p1이 보는 p0 리치=${String(seen).padEnd(5)} 새 공개채널=[${after.join(" ")}]`,
  );
}

console.log("=== 스텔스 리치 선언 직후, 전원 공개 채널에 새로 생긴 것 ===");
run(["stealth_riichi"]);
run(["stealth_riichi", "no_ron_pact"]);
run(["stealth_riichi", "free_riichi_discard"]);
run(["stealth_riichi", "late_double"]);
run(["stealth_riichi", "no_retreat"]);
run(["stealth_riichi", "siege_riichi"]);
run(["stealth_riichi", "hidden_blade"]);
run(["stealth_riichi", "ura_peek"]);
run(["stealth_riichi", "last_stand"]);
run(["stealth_riichi", "push_riichi"]);
run(["stealth_riichi", "peek_riichi_waits"]);
run(["stealth_riichi", "silent_pact"]);
run(["stealth_riichi", "meld_dissolve"]);
run(["stealth_riichi", "regret"]);
run(["stealth_riichi", "counter"]);
