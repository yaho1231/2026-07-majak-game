/**
 * 묵계 (silent_pact, prism) — "울고도 멘젠이 살아있다".
 *
 * 국당 1회, **멘젠이 깨지지 않는 퐁**을 한다. 멘쯔는 눈에 보이게 눕지만, 리치·멘젠쯔모·
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
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { flagOf, roundKey, viewKey } from "../util.js";
import { isYakuhaiFor, lastDiscardKind } from "./botHelpers.js";

const ID = "silent_pact";
const ACTION = "silent_pon";

const usedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:used:${roundKey(state)}:${h}`;

const wallLen = (state: GameState): number =>
  state.zones["wall"]?.tileIds.length ?? 0;

/** 손패에서 목표패(discard kind)와 같은 종류인 tileId 목록 (tileId 오름차순) */
function matchingIds(state: GameState, holder: PlayerId, targetKey: string): TileId[] {
  return handIdsOf(state, holder)
    .filter((id) => kindKey(kindOf(state, id)) === targetKey)
    .sort((a, b) => a - b);
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
    const targetKey = kindKey(kindOf(state, last.tileId));
    if (kindKey(kindOf(state, a)) !== targetKey || kindKey(kindOf(state, b)) !== targetKey) {
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
      augmentDataSet(viewKey("*", `${ID}:${req.player}`), true),
    ];
  },
};

export const silentPact: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "call",
  name: "묵계",
  description:
    "(매 국 1회) 멘젠이 깨지지 않는 퐁을 한다 — 울고도 리치·멘젠쯔모·멘젠 론 부수가 그대로 살아 있다.",
  detail:
    "(매 국 1회) 남의 버림패로 퐁을 하되 멘젠(닫힌 손)이 깨지지 않는다. 멘쯔는 눈에 보이게 눕지만 그 뒤로도 리치를 걸 수 있고 멘젠쯔모·멘젠 론 부수가 그대로 붙는다. 다만 커쯔가 하나 생기므로 핑후는 성립하지 않는다.",
  /**
   * 봇: 부르는 패가 **역패**일 때만 운다. 멘젠이 유지되므로 리치 가능성을 잃지 않고
   * 역패 커쯔 하나로 역이 확정된다 — 자해 위험이 없는 확실 이득 구간이다.
   */
  bot: {
    choose({ options, view, holder }) {
      const opt = options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      const kind = lastDiscardKind(view);
      if (kind === undefined || !isYakuhaiFor(view, holder, kind)) return null;
      return opt;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(silentPonAction);
    }

    // 리액션 프롬프트에 silent_pon 후보를 노출(합법성은 validate가 최종 판정).
    ctx.holderReactionOptions((state, discard) => {
      if (flagOf(state, usedKey(state, holder))) return [];
      if (state.round.byPlayer[holder]?.riichi != null) return [];
      const targetKey = kindKey(kindOf(state, discard.tileId));
      const matches = matchingIds(state, holder, targetKey);
      if (matches.length < 2) return []; // 정상 펑처럼 2장 이상 필요
      return [
        {
          type: ACTION,
          payload: { tileIds: [matches[0] as TileId, matches[1] as TileId] },
        },
      ];
    });
  },
});
