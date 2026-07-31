/**
 * 허장성세 (bluff_pretense, prism) — 국당 1회, 손에 같은 패가 1장뿐이어도 펑!
 * 부족한 세 번째 장은 손패의 잡패 하나를 그 패로 바꿔(conjured) 채운다.
 *
 * 부수는 상식: 펑은 손에 같은 패 2장이 있어야 한다 — 부족한 한 장이 생성패로 소환된다.
 *
 * 도파민 순간: 白을 1장만 쥔 홀더가 '펑!'을 외치자 세 번째 白이 물질화 — "너 그거
 * 한 장이었잖아?!" 이제 홀더 앞에서는 패 셈 자체가 안 통한다.
 *
 * 대응: 전원 공개라 역패·중장패를 한 단계 더 아껴 쥔다. 국당 1회이니 싼 패로 발동을
 * 유도해 소진시켜라. (생성패는 conjured 표식 — 밸런스상 도라 제외는 추후 조정 여지)
 *
 * 구현: 엔진은 실물 없는 새 tileId를 만들 수 없다 → **손패의 잡패 1장을 목표패로 변환**
 * (`tileKindChanged`, conjured)한 뒤 **표준 펑**(meldKind:"pon")을 낸다. 손 2장 소비(진짜 1 +
 * 잡패 1) + 버림 1장 = 커쯔 3장이라 손패 산술·화료 분해가 정확히 맞는다. 희생할 잡패는
 * 가장 고립된 패를 자동 선택한다. open_kokushi식 커스텀 리액션 콜(펑과 치 사이 우선순위).
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
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { flagOf, roundKey, roundViewKey } from "../util.js";
import { isYakuhaiFor, lastDiscardKind } from "./botHelpers.js";

const ID = "bluff_pretense";
const ACTION = "bluff_pon";

const usedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:used:${roundKey(state)}:${h}`;

const wallLen = (state: GameState): number =>
  state.zones["wall"]?.tileIds.length ?? 0;

/** 손패에서 목표패(discard kind)와 같은 종류인 tileId 목록 */
function matchingIds(state: GameState, holder: PlayerId, targetKey: string): TileId[] {
  return handIdsOf(state, holder).filter((id) => kindKey(kindOf(state, id)) === targetKey);
}

/**
 * 희생할 잡패 하나를 고른다 — 가장 고립된 패(주변에 이어지는 손패가 가장 적은 패).
 * 진짜 매칭 패(realId)와 화료패 kind는 제외. 결정적(동점은 tileId 오름차순).
 */
function pickSacrifice(
  state: GameState,
  holder: PlayerId,
  realId: TileId,
  targetKey: string,
): TileId | undefined {
  const hand = handIdsOf(state, holder).filter(
    (id) => id !== realId && kindKey(kindOf(state, id)) !== targetKey,
  );
  if (hand.length === 0) return undefined;
  const kinds = hand.map((id) => kindOf(state, id));
  const usefulness = (i: number): number => {
    const k = kinds[i]!;
    let n = 0;
    for (let j = 0; j < hand.length; j++) {
      if (j === i) continue;
      const o = kinds[j]!;
      if (o.suit === k.suit) {
        if (o.rank === k.rank) n += 2; // 같은 패(또이쯔 씨앗)
        else if (
          (k.suit === "man" || k.suit === "pin" || k.suit === "sou") &&
          Math.abs(o.rank - k.rank) <= 2
        ) {
          n += 1; // 슌쯔로 이어질 수 있는 이웃
        }
      }
    }
    return n;
  };
  let best = 0;
  for (let i = 1; i < hand.length; i++) {
    if (usefulness(i) < usefulness(best)) best = i;
  }
  return hand[best];
}

const bluffPonAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no bluff_pretense augment";
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
    const targetKey = kindKey(kindOf(state, last.tileId));
    const matches = matchingIds(state, req.player, targetKey);
    // 허장성세는 "1장뿐일 때"만 — 2장 이상이면 표준 펑을 쓰면 된다
    if (matches.length !== 1) return "bluff pon needs exactly one matching tile";
    if (matches[0] !== req.payload.tileId) return "tile is not the matching one";
    if (pickSacrifice(state, req.player, req.payload.tileId, targetKey) === undefined) {
      return "no tile to sacrifice";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const last = state.round.lastDiscard as { player: PlayerId; tileId: TileId };
    const targetKind = kindOf(state, last.tileId);
    const targetKey = kindKey(targetKind);
    const sacrifice = pickSacrifice(state, req.player, req.payload.tileId, targetKey) as TileId;
    return [
      // ① 잡패를 목표패로 변환(conjured) — 세 번째 장 생성
      tileKindChanged([
        { tileId: sacrifice, kind: targetKind, attrs: { conjured: true } },
      ]),
      // ② 변환된 잡패 + 진짜 1장 + 버림 1장으로 표준 펑
      {
        type: CALL_MADE,
        payload: {
          caller: req.player,
          from: last.player,
          meldKind: "pon",
          handTileIds: [req.payload.tileId, sacrifice],
          calledTileId: last.tileId,
        },
      },
      // ③ 국당 1회 소진 + 전원 공개
      augmentDataSet(usedKey(state, req.player), true),
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), true),
    ];
  },
};

export const bluffPretense: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "call",
  name: "허장성세",
  description:
    "(매 국 1회) 상대가 버린 패에 대해, 손에 같은 패가 1장뿐이어도 펑을 선언할 수 있다. 부족한 세 번째 장은 손패의 잡패 하나가 그 패로 변신해 채운다.",
  detail:
    "(매 국 1회) 같은 패를 1장만 쥐고 있어도 펑을 선언할 수 있다. 부족한 세 번째 장은 손패에서 가장 고립된 잡패 하나가 그 패로 변신(생성패)해 채우며, 진짜 1장 + 변신한 잡패 1장 + 버림패 1장으로 정상 커쯔가 된다. 손패 장수는 표준 펑과 똑같이 맞아떨어진다. 발동은 전원에게 공개된다.",
  /**
   * 봇: 잡패 한 장을 태워 커쯔를 만드는 콜이라, **역패**(그 커쯔 자체가 역)일 때만 쓴다.
   * 수패로 부르면 손만 열리고 역이 안 서는 일이 잦다.
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
      engine.actions.register(bluffPonAction);
    }

    // 리액션 프롬프트에 bluff_pon 후보를 노출(합법성은 validate가 최종 판정).
    // 표준 펑/치 사이 우선순위로 처리되는 커스텀 콜(24차).
    ctx.holderReactionOptions((state, discard) => {
      if (flagOf(state, usedKey(state, holder))) return [];
      if (state.round.byPlayer[holder]?.riichi != null) return [];
      const targetKey = kindKey(kindOf(state, discard.tileId));
      const matches = matchingIds(state, holder, targetKey);
      if (matches.length !== 1) return []; // 정확히 1장일 때만
      if (pickSacrifice(state, holder, matches[0] as TileId, targetKey) === undefined) {
        return [];
      }
      return [{ type: ACTION, payload: { tileId: matches[0] as TileId } }];
    });
  },
});
