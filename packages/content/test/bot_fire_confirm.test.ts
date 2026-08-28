/**
 * bot_fire_confirm — «드물다» vs «영영 안 걸린다»를 가른다 (2026-08-28, botfix).
 *
 * 배경: `qa-lab/launch/fix/botfix/fire_rate.ts`(고립 조건, 각 704~852국)에서
 * `three_dragons_will`·`giant_god`·`snake_kan` 세 증강이 발동률 0%로 나왔다. 세
 * 증강 모두 발동 조건 자체가 자연 대국에서 드물게 서는 것이라 "정책이 고장났다"와
 * "조건이 원래 드물다"가 표본만으로는 구분되지 않았다.
 *
 * 이 파일은 각 증강의 발동 조건을 **직접 세워** 실제 엔진이 그 옵션을 제시하는지,
 * 그리고 실제 `AugmentDef.bot.choose`(BotAgent가 대국에서 부르는 바로 그 함수)가
 * 그 옵션을 고르는지를 한 번에 확인한다. `craft()`로 판을 짜고, `FlowController`로
 * **엔진이 실제로 내주는 옵션**을 얻고, `buildPlayerView`로 **실제 뷰**를 만들어
 * `botCtx`에 먹인다 — 손으로 흉내낸 뷰가 아니라 실제 파이프라인 그대로다.
 *
 * 결과(세 종 전부 **발동함** — 정책은 정상, 조건이 드문 것 자체가 원인):
 *   - `three_dragons_will`: 삼원패 2커쯔 + 나머지 손이 **실제로 잡손**(shanten=4)이어야
 *     `handIsPoor` 게이트를 넘는다. 2커쯔가 이미 섰다는 것 자체가 손을 상당히 진전시켜
 *     놓으므로(최소 shanten 4 — 완전히 고립된 잡패일 때의 상한), 자연 대국에서 2커쯔가
 *     서는 손은 대개 이미 shanten<4인 경우가 많다. 즉 "2커쯔가 서면서 동시에 나머지가
 *     여전히 잡손인" 좁은 창(§아래 대조 케이스)이 드문 것이지 정책이 못 잡는 게 아니다.
 *   - `giant_god`: 자기 바닥에 국사 13종이 전부 깔려야 한다 — 정상적인 버림(필요 없는
 *     패를 버리는 것)이 우연히 서로 다른 13종을 중복 없이 다 맞힐 확률 자체가 낮다.
 *   - `snake_kan`: 텐파이 + 위협 낮음 + "안깡 뒤에도 유효 대기가 남는" 손을 동시에
 *     요구한다 — 같은 무늬 연속 4장을 쥔 텐파이 손 자체가 흔치 않다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  buildPlayerView,
  botChosenOption,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft, botCtx } from "./helpers.js";
import { threeDragonsWill } from "../src/augments/three_dragons_will.js";
import { giantGod } from "../src/augments/giant_god.js";
import { snakeKan } from "../src/augments/snake_kan.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)),
  };
}

/**
 * **엔진이 실제로 그 옵션을 제시하는가 + 실제 정책이 그것을 고르는가**를 한 번에 잰다.
 * `FlowController`로 실제 프롬프트를 얻고 `buildPlayerView`로 실제 뷰를 만들어
 * `botCtx`에 먹인다 — 손으로 흉내낸 뷰가 아니라 대국에서 BotAgent가 보는 것과 같다.
 */
function fireProbe(
  state: GameState,
  def: typeof threeDragonsWill,
  filterType: string,
): { offered: number; chosenType: string | null } {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, def, "p0", { yaku: game.yaku });
  const status = new FlowController(game.engine).begin();
  if (status.kind !== "awaiting") throw new Error(`unexpected status ${status.kind}`);
  const prompt = status.prompts.find((p) => p.player === "p0");
  if (prompt === undefined) throw new Error("no prompt for p0");
  const offered = prompt.options.filter((o) => o.type === filterType).length;
  if (offered === 0) return { offered, chosenType: null };
  const view = buildPlayerView(game.engine.state, "p0", game.engine.rules, { yaku: game.yaku });
  const ctx = botCtx(view, [...prompt.options]);
  const picked = botChosenOption(def.bot?.choose(ctx) ?? null);
  return { offered, chosenType: picked?.type ?? null };
}

describe("bot_fire_confirm — 조건을 직접 세워 «드물다 vs 정책 결함」을 가른다", () => {
  it("three_dragons_will: 삼원 2커쯔 + 나머지가 진짜 잡손(shanten=4)이면 발동한다", () => {
    // 555z666z(백·발 커쯔) + 완전히 고립된 잡패 7장(각기 다른 suit·rank, 짝·연속 없음)
    // → shanten 정확히 4 (handIsPoor 기본 문턱). qa-lab/launch/fix/botfix/_probe_fire.ts
    // 로 먼저 shantenOf 실측 확인 후 이 손을 골랐다.
    const base = craft({
      hands: { p0: "555z666z1m4m7m2p5p8p9s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const r = fireProbe(withAug(base, "p0", ["three_dragons_will"]), threeDragonsWill, "dragons_will");
    expect(r.offered).toBe(1);
    expect(r.chosenType).toBe("dragons_will");
  });

  it("three_dragons_will 대조군: 2커쯔가 서면서 나머지가 이미 좋은 손(shanten=2)이면 발동을 접는다", () => {
    // 이전 기존 회귀(three_dragons_will.test.ts)가 쓰던 손 — 123m이 세 번째 멘쯔로
    // 이미 완성돼 있어 shanten=2. handIsPoor(기본 문턱 4)를 통과 못 해 정책이 스스로
    // 접는다 — «2커쯔가 서면서 동시에 여전히 잡손인» 창이 실제로 좁다는 것을 보여준다.
    const base = craft({
      hands: { p0: "555z666z7z123m9m1p5p9s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const r = fireProbe(withAug(base, "p0", ["three_dragons_will"]), threeDragonsWill, "dragons_will");
    expect(r.offered).toBe(1); // 엔진은 여전히 옵션을 낸다 — 2커쯔 조건만 보므로
    expect(r.chosenType).toBeNull(); // 정책이 handIsPoor에 막혀 접는다
  });

  it("giant_god: 바닥에 국사 13종이 전부 깔리면 발동한다", () => {
    const base = craft({
      hands: { p0: "234567m2345p234s", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "19m19p19s1234z567z" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const r = fireProbe(withAug(base, "p0", ["giant_god"]), giantGod, "giant_god");
    expect(r.offered).toBe(1);
    expect(r.chosenType).toBe("giant_god");
  });

  it("snake_kan: 텐파이 + 안깡 뒤에도 유효 대기가 남는 순환 4연속이면 발동한다", () => {
    // 123m456m(멘쯔 2) + 9s9s(머리) + 3456p(연속4, 안깡 후보) + 78p(6p/9p 대기)
    // → 안깡 뒤 rest = 123m,456m,9s9s,78p, meldCount+1=1(깡)과 합쳐 정확히 텐파이(6p/9p).
    const base = craft({
      hands: { p0: "3456p123m456m9s9s78p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const r = fireProbe(withAug(base, "p0", ["snake_kan"]), snakeKan, "ankan");
    expect(r.offered).toBeGreaterThan(0);
    expect(r.chosenType).toBe("ankan");
  });
});
