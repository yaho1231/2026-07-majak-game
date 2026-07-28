/**
 * 모 아니면 도 (all_or_nothing, prism).
 * 동풍전 1·반장전 2회, 리치 선언 시 '올인'을 함께 선언해 현재 점수의 절반(1000점 단위 내림)을
 * 추가 공탁한다. 그 리치로 화료하면 공탁금을 돌려받고 같은 금액을 뱅크에서 추가로
 * 받으며, 화료하지 못하면(유국·타가 화료 포함) 공탁금은 전부 뱅크로 사라진다.
 *
 * 구현: 표준 리치와 같은 검증 + 올인 금액을 즉시 차감(ScoreChanged)하고 국·금액을
 * 기록하는 커스텀 액션. ROUND_SETTLED reaction에서 화료 시 +2×올인, 실패 시 소멸.
 */

import {
  ROUND_SETTLED,
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindOf,
  meldCountOf,
  playerAtSeat,
  playerOf,
  scoreChanged,
  scoringOptionsOf,
  winningKinds,
  WALL,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { counterOf, matchUses, roundKey, stringOf, viewKey } from "../util.js";
import { pickIsolatedDiscard } from "./botHelpers.js";

const ID = "all_or_nothing";
const ACTION = "all_in_riichi";
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);
/** 진행 중 올인의 금액과 국 (roundKey|amount) */
const activeKey = (h: PlayerId): string => `${ID}:active:${h}`;

const wallLen = (state: GameState): number =>
  state.zones[WALL]?.tileIds.length ?? 0;

/** 올인 금액 = 현재 점수 절반(1000 단위 내림) */
function allInAmount(state: GameState, h: PlayerId): number {
  const score = playerOf(state, h).score;
  return Math.max(0, Math.floor(score / 2 / 1000) * 1000);
}

const allInRiichiAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no all_or_nothing augment";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    const rs = state.round.byPlayer[req.player];
    if (rs?.riichi != null) return "already riichi";
    if (rules.resolve<boolean>("riichi.blocked", { playerId: req.player, state })) {
      return "riichi is sealed this round";
    }
    if (
      rules.resolve<boolean>("riichi.requiresClosed", { playerId: req.player }) &&
      meldCountOf(state, req.player) > 0
    ) {
      return "riichi requires a closed hand";
    }
    const allIn = allInAmount(state, req.player);
    if (allIn <= 0) return "not enough points to go all-in";
    const cost = rules.resolve<number>("riichi.cost", { playerId: req.player, state });
    if (playerOf(state, req.player).score < cost) return "not enough points";
    if (wallLen(state) < rules.resolve<number>("riichi.minWallTiles")) {
      return "not enough wall tiles";
    }
    const handIds = handIdsOf(state, req.player);
    if (!handIds.includes(req.payload.tileId)) return "tile not in hand";
    const after = handIds
      .filter((t) => t !== req.payload.tileId)
      .map((t) => kindOf(state, t));
    const opts = scoringOptionsOf(state, rules, req.player);
    if (winningKinds(after, meldCountOf(state, req.player), undefined, opts).length === 0) {
      return "not tenpai after discard";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const allIn = allInAmount(state, req.player);
    return [
      {
        type: TILE_DISCARDED,
        payload: {
          player: req.player,
          tileId: req.payload.tileId,
          riichi: true,
          riichiCost: rules.resolve<number>("riichi.cost", {
            playerId: req.player,
            state,
          }),
        },
      },
      // 48차 무페널티: 걸어 두는 금액을 차감하지 않는다 — 빗나가도 잃는 것은 없다.
      // 기록만 남기고(동풍전 1·반장전 2회 소진), 화료하면 그 금액만큼 뱅크에서 받는다.
      augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
      augmentDataSet(activeKey(req.player), `${roundKey(state)}|${allIn}`),
      augmentDataSet(viewKey("*", `${ID}:${req.player}`), allIn),
    ];
  },
};

export const allOrNothing: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  name: "모 아니면 도",
  description:
    "(동풍전 1회 · 반장전 2회) 리치를 선언할 때 '올인'을 함께 걸어 현재 점수의 절반을 판돈으로 내건다(전원 공개). 그 리치로 화료하면 판돈만큼을 통째로 더 받으며, 빗나가도 잃는 것은 없다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 리치 선언과 동시에 올인을 건다. 현재 점수의 절반(1000점 단위 내림)이 판돈으로 전원에게 공개되고, 그 리치로 화료하면 판돈과 같은 금액을 뱅크에서 추가로 받는다. 유국이나 타가 화료로 국이 끝나도 점수는 한 푼도 줄지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(allInRiichiAction);
    }

    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const raw = stringOf(rc.state, activeKey(holder));
      if (raw === null) return;
      const [rk, amtStr] = raw.split("|");
      if (rk !== roundKey(rc.state)) return; // 다른 국의 잔재 방어
      const allIn = Number(amtStr) || 0;
      const p = event.payload as RoundSettledPayload;
      const won =
        p.outcome === "win" && (p.winInfos ?? []).some((w) => w.winner === holder);
      // 화료하면 건 금액만큼 뱅크에서 받는다. 빗나가면 아무 일도 일어나지 않는다.
      if (won && allIn > 0) rc.emit(scoreChanged(holder, allIn, ID));
      rc.emit(augmentDataSet(activeKey(holder), ""));
    });

    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      return handIdsOf(state, holder).map((tileId) => ({
        type: ACTION,
        payload: { tileId },
      }));
    });
  },
  // 리치에 올인을 얹는다 — 빗나가도 잃는 것이 없는 순수 상방 도박이라, 텐파이면
  // 발동한다. 남은 손의 대기를 가장 덜 해치는(가장 고립된) 패로 선언한다.
  bot: {
    choose({ options, view, holder, tenpai }) {
      if (!tenpai) return null;
      return pickIsolatedDiscard(view, holder, options, ACTION);
    },
  },
});
