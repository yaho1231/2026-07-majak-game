/**
 * 염색 (tile_dyeing, gold).
 * 게임 전체 5회, 자기 턴에 손패의 수패 1장을 같은 숫자의 다른 무늬로 바꾼다(3만→3통).
 * 변환은 전원 공개, 리치 중에도 사용할 수 있다. 혼일색·삼색 빌드의 윤활유.
 *
 * 구현: 연금술사(alchemist)와 같은 자원 구조 — 게임 단위 카운터 5회 + 한 순 1회 제한 +
 * 남은 횟수 뷰 채널. holderTurnOptions로 손패 수패×다른 무늬 후보(≤26)를 열거,
 * TileKindChanged(conjured)로 변환한다.
 */

import {
  TILE_DRAWN,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isNumberSuit,
  kindKey,
  kindOf,
  playerAtSeat,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { counterOf, roundKey, roundViewKey, viewKey } from "../util.js";
import { handKindsOf, tileSwapImproves } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "tile_dyeing";
const ACTION = "tile_dye";
const MAX_USES = 5;
const SUITS = ["man", "pin", "sou"] as const;
type NumSuit = (typeof SUITS)[number];

/** 게임 전체 사용 횟수 (국을 넘어 누적된다) */
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
/** 마지막으로 사용한 '턴'의 서명 (한 턴에 한 번만 쓰게 막는다) */
const turnUsedKey = (h: PlayerId): string => `${ID}:turn:${h}`;
/** 남은 횟수를 보유자 화면에 노출하는 채널 — 게임 스코프라 국 스코프 키를 쓰지 않는다. */
const leftViewKey = (h: PlayerId): string => viewKey(h, `${ID}:left`);
/**
 * 전원 공개: 이번 국에 무엇을 무엇으로 바꿨는가 ("man3→pin3").
 *
 * 설명이 "바뀐 패는 전원에게 공개되고"라고 약속하는데, 실제로는 손패 안에서 kind만
 * 갈리고(숨은 정보) 남은 횟수만 보유자에게 나갔다 — 상대는 무엇이 바뀌었는지도,
 * 바뀌었다는 사실조차도 알 수 없었다(Rule #2). 분열(tile_split)이 쓰는 것과 같은
 * 국 스코프 공개 채널로 맞춘다.
 */
const revealViewKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);
const usesLeft = (state: GameState, h: PlayerId): number =>
  Math.max(0, MAX_USES - counterOf(state, usedKey(h)));

/**
 * 이 국에서 보유자의 현재 턴을 식별하는 서명 (연금술사와 동일).
 * 매 턴은 정확히 버림 한 번으로 끝나므로 (국 + 버림 수)로 턴을 유일하게 식별한다.
 */
function currentTurnSig(state: GameState, h: PlayerId): string {
  const discards = state.round.byPlayer[h]?.discardCount ?? 0;
  return `${roundKey(state)}:${discards}`;
}

/** 보유자가 이번 턴에 이미 염색을 썼는가 */
function usedThisTurn(state: GameState, h: PlayerId): boolean {
  return state.augmentData[turnUsedKey(h)] === currentTurnSig(state, h);
}

const dyeAction: ActionDef<{ tileId: TileId; suit: NumSuit }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no tile_dyeing augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 48차 무페널티: 리치 중 사용 금지 해제 — 리치 여부는 더 이상 보지 않는다.
    // (검사를 return null로 바꾸면 아래 한도·손패 검증이 통째로 건너뛰어지므로 삭제한다.)
    if (counterOf(state, usedKey(req.player)) >= MAX_USES) return "no uses left";
    if (usedThisTurn(state, req.player)) return "already used this turn";
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    const k = kindOf(state, req.payload.tileId);
    if (!isNumberSuit(k)) return "not a number tile";
    if (k.suit === req.payload.suit) return "same suit";
    return null;
  },
  toEvents: (req, { state }) => {
    const k = kindOf(state, req.payload.tileId);
    return [
      tileKindChanged([
        {
          tileId: req.payload.tileId,
          kind: { suit: req.payload.suit, rank: k.rank },
          attrs: { conjured: true },
        },
      ]),
      augmentDataSet(usedKey(req.player), counterOf(state, usedKey(req.player)) + 1),
      // 이번 턴에 썼음을 기록 → 같은 턴 재사용 차단 (버림으로 턴이 넘어가면 자동 해제)
      augmentDataSet(turnUsedKey(req.player), currentTurnSig(state, req.player)),
      // 남은 횟수 갱신 (위 usedKey 증가를 반영해 -1)
      augmentDataSet(leftViewKey(req.player), usesLeft(state, req.player) - 1),
      // 전원 공개 — 무엇이 무엇으로 물들었는지. 문자열이라 클라이언트 폴백이 그대로 읽는다.
      augmentDataSet(
        revealViewKey(req.player),
        `${kindKey(k)}→${kindKey({ suit: req.payload.suit, rank: k.rank })}`,
      ),
    ];
  },
};

export const tileDyeing: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "hand",
  complexity: 1,
  name: "염색",
  description:
    "(게임 내 5회) 자기 순에 한 번, 손패의 수패 1장을 같은 숫자의 다른 무늬로 바꾼다(예: 3만 → 3통). 리치 중에도 쓸 수 있다.",
  detail:
    "(게임 내 5회 — 남은 횟수는 증강 표식에 상시 표시된다) 자기 순에 손패의 수패 1장을 숫자는 그대로 둔 채 다른 무늬로 바꾼다. 한 순에 한 번까지만 쓸 수 있고 리치 중에도 발동할 수 있다. 자패는 대상이 아니다.\n\n무엇을 무엇으로 바꿨는지는 전원에게 공개된다(그 국 동안, 가장 최근 한 번). 패 자체는 손패 안에 남으므로 상대가 보는 것은 '무엇이 무엇이 됐다'는 사실이지 그 패가 손패 어디에 있는지는 아니다.\n\n⚠ **적도라(빨간 5)를 물들이면 그 빨간색은 사라진다** — 적도라는 '그 무늬의 5'라는 뜻이라 무늬가 바뀌면 성립하지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(dyeAction);
    }

    // 남은 횟수 채널 동기화 — 연금술사와 같은 이유로 ROUND_STARTED가 아니라 쯔모에 건다
    // (게임 시작 드래프트는 1국 배패 뒤에 설치돼 첫 국 내내 채널이 비어 버린다).
    ctx.reaction(TILE_DRAWN, (_event, rc) => {
      const left = usesLeft(rc.state, holder);
      if (rc.state.augmentData[leftViewKey(holder)] === left) return;
      rc.emit(augmentDataSet(leftViewKey(holder), left));
    });

    ctx.holderTurnOptions((state) => {
      if (counterOf(state, usedKey(holder)) >= MAX_USES) return [];
      if (usedThisTurn(state, holder)) return []; // 한 턴에 한 번만

      const opts: { type: string; payload: { tileId: TileId; suit: NumSuit } }[] = [];
      for (const id of handIdsOf(state, holder)) {
        const k = kindOf(state, id);
        if (!isNumberSuit(k)) continue;
        for (const suit of SUITS) {
          if (suit !== k.suit) opts.push({ type: ACTION, payload: { tileId: id, suit } });
        }
      }
      return opts;
    });
  },
  // 수패 1장의 무늬를 바꿔 고립패를 짝·슌쯔(또는 혼일·청일)에 붙인다(게임당 5회).
  // 실제로 손이 나아지는 변경이 있을 때만 발동한다.
  bot: plan({
    intent: "advance",
    // 게임 내 5회뿐이다 — 회수할 순목이 남아 있을 때만 태운다(연금술사와 같은 이유).
    pick: ({ options, view, holder }) => {
      const kinds = handKindsOf(view, holder);
      for (const o of options) {
        if (o.type !== ACTION) continue;
        const p = o.payload as { tileId?: number; suit?: string };
        if (p.tileId === undefined || p.suit === undefined) continue;
        const orig = view.tiles[p.tileId]?.kind;
        if (orig === undefined) continue;
        const next = { suit: p.suit as typeof orig.suit, rank: orig.rank };
        if (tileSwapImproves(kinds, orig, next)) return o;
      }
      return null;
    },
  }),
});
