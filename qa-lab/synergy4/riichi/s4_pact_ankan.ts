/**
 * synergy4 / riichi — S4. 불가침 조약(no_ron_pact) × 밀실의 도라(ankan_dora).
 *
 * 두 장 다 `menzen` 축이라 시너지 표가 함께 띄운다(synergy.ts).
 * 그런데 밀실의 도라의 **유일한 발동 경로가 안깡**이고, 안깡은 조약의 파기 사유다
 * (no_ron_pact.ts:107 `rs.melds.length > 0` — detail에 "안깡도 파기"라고 적혀 있다).
 * → 한 장을 쓰면 다른 한 장이 그 국 내내 죽는다.
 *
 * 재는 것: 안깡 전/후의 `win.ronImmune` 과 조약 배너.
 */
import {
  craft, mkGame, setIndicators, withAugments, optionsFor, FlowController,
} from "./lib.js";
import type { ActionOption, GameState, PlayerId } from "@majak/core";

// 5m 4장 = 안깡 가능. 나머지는 대충 텐파이가 아니어도 된다.
const P0_HAND = "5555m123p456p789p1s";

function scene(augs: string[]): GameState {
  let s = craft({
    hands: { p0: P0_HAND, p1: "*", p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  return withAugments(s, { p0: augs });
}

function ronImmune(game: ReturnType<typeof mkGame>, who: PlayerId): boolean {
  return game.engine.rules.resolve<boolean>("win.ronImmune", {
    playerId: who, state: game.engine.state,
  });
}
function banner(game: ReturnType<typeof mkGame>): string {
  const d = game.engine.state.augmentData;
  return Object.entries(d).filter(([k]) => k.includes("no_ron_pact") || k.includes("pact"))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" | ") || "(없음)";
}

function probe(label: string, augs: string[], doAnkan: boolean): void {
  const game = mkGame(scene(augs));
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  console.log(`\n### ${label} (안깡=${doAnkan})`);
  console.log(`  안깡 전: ronImmune=${ronImmune(game, "p0")}  ${banner(game)}`);
  if (doAnkan) {
    const k = optionsFor(status, "p0").find((o) => o.type === "ankan");
    if (k === undefined) {
      console.log(`  !! ankan 없음 (있는 것: ${[...new Set(optionsFor(status, "p0").map((o) => o.type))].join(",")})`);
      return;
    }
    status = flow.submit("p0", k);
    console.log(`  안깡 후: ronImmune=${ronImmune(game, "p0")}  ${banner(game)}`);
    console.log(`  안깡 도라 데이터: ${Object.entries(game.engine.state.augmentData).filter(([kk]) => kk.includes("ankan_dora")).map(([kk, v]) => `${kk}=${JSON.stringify(v)}`).join(" | ") || "(없음)"}`);
    // 안깡 뒤 버림까지
    const d = optionsFor(status, "p0").filter((o) => o.type === "discard");
    if (d.length > 0) status = flow.submit("p0", d[d.length - 1] as ActionOption);
    console.log(`  버림 후: ronImmune=${ronImmune(game, "p0")}  ${banner(game)}`);
  }
}

probe("0 no_ron_pact 단독", ["no_ron_pact"], false);
probe("0 no_ron_pact 단독", ["no_ron_pact"], true);
probe("A ankan_dora 단독", ["ankan_dora"], true);
probe("A+B ankan_dora + no_ron_pact", ["ankan_dora", "no_ron_pact"], true);
probe("A+B (안깡 안 함)", ["ankan_dora", "no_ron_pact"], false);
