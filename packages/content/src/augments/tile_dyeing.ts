/**
 * 염색 (tile_dyeing, gold).
 * 국당 1회, 자기 턴에 손패의 수패 1장을 같은 숫자의 다른 무늬로 바꾼다(3만→3통).
 * 변환은 전원 공개, 리치 중에도 사용할 수 있다. 혼일색·삼색 빌드의 윤활유.
 *
 * 구현: red_five_touch/suit_unify 패턴. holderTurnOptions로 손패 수패×다른 무늬
 * 후보(≤26)를 열거, TileKindChanged(conjured)로 변환. roundKey 국당 1회 플래그.
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isNumberSuit,
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
import { flagOf, roundKey } from "../util.js";
import { handKindsOf, tileSwapImproves } from "./botHelpers.js";

const ID = "tile_dyeing";
const ACTION = "tile_dye";
const SUITS = ["man", "pin", "sou"] as const;
type NumSuit = (typeof SUITS)[number];
const usedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:used:${roundKey(state)}:${h}`;

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
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
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
      augmentDataSet(usedKey(state, req.player), true),
    ];
  },
};

export const tileDyeing: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "hand",
  name: "염색",
  description:
    "(매 국 1회) 자기 순에 손패의 수패 1장을 같은 숫자의 다른 무늬로 바꾼다(예: 3만 → 3통). 리치 중에도 쓸 수 있다.",
  detail:
    "(매 국 1회) 자기 순에 손패의 수패 1장을 숫자는 그대로 둔 채 다른 무늬로 바꾼다. 리치 중에도 쓸 수 있다. 바뀐 패는 전원에게 공개되고 자패는 대상이 아니다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(dyeAction);
    }

    ctx.holderTurnOptions((state) => {
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
  // 수패 1장의 무늬를 바꿔 고립패를 짝·슌쯔(또는 혼일·청일)에 붙인다(국당 1회).
  // 실제로 손이 나아지는 변경이 있을 때만 발동한다.
  bot: {
    choose({ options, view, holder }) {
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
  },
});
