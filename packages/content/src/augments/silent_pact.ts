/**
 * 묵계 (silent_pact, prism) — "울고도 멘젠이 살아있다".
 *
 * 국당 1회, **멘젠이 깨지지 않는 퐁**을 한다. 몸통은 눈에 보이게 눕지만, 리치·멘젠쯔모·
 * 멘젠 론 부수(+10부)가 그대로 유지된다. 후로의 속도와 멘젠의 화력을 동시에 갖는다.
 *
 * 구현: 표준 펑과 동일하지만 CALL_MADE payload에 `silent:true`를 실어 후로에 표식을 단다.
 * 코어의 멘젠 판정 세 곳(리치 validate의 openMeldCountOf · 채점 buildVariants의 isClosed ·
 * 유요구 텐파이 isOpen)이 전부 `m.silent === true`를 안깡처럼 취급해 손을 열지 않는다.
 * open_kokushi·허장성세와 같은 `registerReactionOptions` 커스텀 리액션 콜(펑·치 사이 우선순위).
 * 국당 1회.
 *
 * ⚠ 핑후는 여전히 성립하지 않는다 — 커쯔(펑)가 하나 있으면 '전부 슌쯔'가 깨지기 때문이다.
 * 묵계가 되살리는 것은 **멘젠 게이트**(리치·멘젠쯔모·멘젠 론 +10부)이지 슌쯔 구성 요건이 아니다.
 */

import {
  CALL_MADE,
  augmentDataSet,
  augmentInstanceId,
  defineAugment,
  handIdsOf,
  isSourceDisarmed,
  kindOf,
  mixedTripletsFor,
  polarEndsFor,
  sameCallBody,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
  TileKind,
} from "@majak/core";
import { flagOf, publishUsesLeft, roundViewKey } from "../util.js";
import { isYakuhaiFor, lastDiscardKind } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "silent_pact";
const ACTION = "silent_pon";

const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);

const wallLen = (state: GameState): number =>
  state.zones["wall"]?.tileIds.length ?? 0;

/**
 * 목표패(버림패)와 **한 규칙 안에서 커쯔가 되는** 손패 두 장 (tileId 오름차순).
 *
 * 예전에는 `kindKey` 완전 일치로만 셌다. 그런데 표준 펑은 `sameCallKind`를 타서
 * 동수의 결속(혼색 커쯔)·양극을 존중하므로, **결속이 열어 준 바로 그 퐁에서만 묵계가
 * 사라졌다** — 1만+1통을 들고 1삭 버림에 뜨는 것은 평범한 펑뿐이었고, 홀더는 "혼색
 * 커쯔를 부르면 손이 열린다"를 어디서도 알 수 없었다(QA synergy3 relax 확정 5,
 * 2026-08-23). 세 장을 한 번에 보는 `sameCallBody`를 쓰므로 양극+결속을 함께 든
 * 사람에게도 잡종 펑이 열리지 않는다(shape 확정 2와 같은 기준).
 */
function matchingPair(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  target: TileKind,
): [TileId, TileId] | null {
  const mixedTri = mixedTripletsFor(state, rules, holder);
  const polar = polarEndsFor(state, rules, holder);
  const ids = [...handIdsOf(state, holder)].sort((a, b) => a - b);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i] as TileId;
      const b = ids[j] as TileId;
      if (sameCallBody(target, kindOf(state, a), kindOf(state, b), mixedTri, polar)) {
        return [a, b];
      }
    }
  }
  return null;
}

const silentPonAction: ActionDef<{ tileIds: [TileId, TileId] }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no silent_pact augment";
    }
    if (state.round.phase !== "reaction") return "not in reaction phase";
    // 무장해제된 증강의 콜은 성립하지 않는다 (버튼은 holderReactionOptions가 이미 가리지만,
    // 제출 경로에서도 최종 차단한다).
    if (isSourceDisarmed(state, augmentInstanceId(req.player, ID))) {
      return "augment is disarmed";
    }
    // 후로 봉인(함구령 등)을 우회하지 않는다 — 커스텀 콜도 표준 펑과 같은 규칙을 탄다.
    if (rules.resolve<boolean>("call.blocked", { playerId: req.player, state })) {
      return "calls are sealed";
    }
    if (!rules.resolve<boolean>("call.pon.enabled", { playerId: req.player, state })) {
      return "pon is disabled";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    const last = state.round.lastDiscard;
    if (last === null) return "nothing to call";
    if (last.player === req.player) return "cannot call own discard";
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    if (wallLen(state) === 0) return "no calls on the last discard";
    const [a, b] = req.payload.tileIds;
    if (a === b) return "duplicate tile ids";
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(a) || !hand.includes(b)) return "tiles not in hand";
    // 표준 펑과 같은 "같은 패" 정의를 쓴다 — 동수의 결속·양극을 존중하되
    // 세 장이 한 규칙 안에서 닫혀야 한다(matchingPair 주석).
    if (
      !sameCallBody(
        kindOf(state, last.tileId),
        kindOf(state, a),
        kindOf(state, b),
        mixedTripletsFor(state, rules, req.player),
        polarEndsFor(state, rules, req.player),
      )
    ) {
      return "tiles do not match the discard";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const last = state.round.lastDiscard as { player: PlayerId; tileId: TileId };
    return [
      {
        type: CALL_MADE,
        payload: {
          caller: req.player,
          from: last.player,
          meldKind: "pon",
          handTileIds: [...req.payload.tileIds],
          calledTileId: last.tileId,
          silent: true,
        },
      },
      augmentDataSet(usedKey(state, req.player), true),
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), true),
    ];
  },
};

export const silentPact: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "call",
  complexity: 3,
  name: "묵계",
  description:
    "멘젠을 깨지않는 후로 1회를 할 수 있다. 이후 평범한 퐁,치,대명깡을 더 하면 멘젠은 깨진다.",
  detail:
    "부른 몸통은 눈에 보이게 눕지만 손은 멘젠으로 남아, 그 뒤로도 리치를 걸 수 있고 멘젠쯔모와 멘젠 론 부수가 그대로 붙는다. 다만 커쯔가 생기므로 핑후는 성립하지 않는다.\n\n같은 국에 **평범한 퐁·치·대명깡을 하나라도 더 하면 멘젠이 그 자리에서 깨진다.** 안깡은 예외다.",
  /**
   * 봇: 부르는 패가 **역패**일 때만 운다. 멘젠이 유지되므로 리치 가능성을 잃지 않고
   * 역패 커쯔 하나로 역이 확정된다 — 자해 위험이 없는 확실 이득 구간이다.
   */
  bot: plan({
    intent: "disrupt",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder }) => {
      const opt = options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      const kind = lastDiscardKind(view);
      if (kind === undefined || !isYakuhaiFor(view, holder, kind)) return null;
      return opt;
    },
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // "이번 국 1회"는 이미 썼는지가 화면 어디에도 없어서, 액티브 버튼이 사라지고
    // 나서야 소진을 알 수 있었다(2026-08-15 사용자 지적: "횟수류 전부 안 나온다").
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(silentPonAction);
    }

    // 리액션 프롬프트에 silent_pon 후보를 노출(합법성은 validate가 최종 판정).
    ctx.holderReactionOptions((state, discard) => {
      if (flagOf(state, usedKey(state, holder))) return [];
      if (state.round.byPlayer[holder]?.riichi != null) return [];
      const pair = matchingPair(
        state,
        ctx.engine.rules,
        holder,
        kindOf(state, discard.tileId),
      );
      if (pair === null) return []; // 정상 펑처럼 몸통이 되는 두 장이 있어야 한다
      return [{ type: ACTION, payload: { tileIds: pair } }];
    });
  },
});
