/**
 * 위압감 (intimidate, prism) — 리치 한 번에 테이블이 얼어붙는다.
 *
 * (2국에 1회) 이 증강으로 리치를 걸면, 나를 뺀 타가 전원이 **다음 1순** 동안 쯔모한 패만
 * 버릴 수 있다. 이미 리치 중인 사람은 원래 쯔모기리라 걸지 않는다.
 *
 * ## 구현
 * - 액션 `intimidate_riichi {tileId}` — 표준 리치 액션의 검증과 이벤트를 **그대로** 빌려 쓴다
 *   (멘젠·텐파이·공탁·패산 잔량·리치 봉인·봉인된 패). 공탁 1000점도 평소대로 낸다.
 * - 강제 쯔모기리는 `forcedTsumogiri.ts`(늪과 공용). 버림보다 먼저 걸어 둬야 바로 다음
 *   사람의 쯔모부터 잡힌다.
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";
import { plan } from "./botPlan.js";
import {
  forceTsumogiriEvents,
  installForcedTsumogiri,
} from "./forcedTsumogiri.js";

const ID = "intimidate";
const ACTION = "intimidate_riichi";
/** 쿨다운 — 한 번 쓰면 이만큼 국이 지나야 다시 열린다 */
const COOLDOWN_ROUNDS = 2;
/** 타가가 쯔모기리해야 하는 순 수 */
const INTIMIDATE_TURNS = 1;

function reject(state: GameState, player: PlayerId): string | null {
  const me = state.players.find((p) => p.id === player);
  if (me === undefined || !me.augments.includes(ID))
    return "no intimidate augment";
  if (state.round.phase !== "turn.act") return "not in act phase";
  if (playerAtSeat(state, state.round.turnSeat).id !== player)
    return "not your turn";
  if (!cooldownReady(state, ID, player, COOLDOWN_ROUNDS)) return "on cooldown";
  return null;
}

/** 표준 리치 액션의 검증·이벤트를 그대로 빌린 증강 리치 */
function makeRiichiAction(
  core: ActionDef<{ tileId: TileId }>,
): ActionDef<{ tileId: TileId }> {
  return {
    type: ACTION,
    validate: (req, ctx) => {
      const own = reject(ctx.state, req.player);
      if (own !== null) return own;
      return core.validate({ ...req, type: "riichi" }, ctx);
    },
    toEvents: (req, ctx) => {
      const { state } = ctx;
      const pressed = state.players
        .filter(
          (p) =>
            p.id !== req.player && state.round.byPlayer[p.id]?.riichi == null,
        )
        .flatMap((p) =>
          forceTsumogiriEvents(state, ID, req.player, p.id, INTIMIDATE_TURNS),
        );
      return [
        ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
        augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), true),
        ...pressed,
        ...core.toEvents({ ...req, type: "riichi" }, ctx),
      ];
    },
  };
}

export const intimidate: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  complexity: 1,
  name: "위압감",
  description:
    "(2국에 1회) 이 증강으로 리치를 걸면 타가 전원은 다음 1순 동안 쯔모기리만 할 수 있다.",
  detail:
    "이 증강으로 리치를 걸면 나를 제외한 타가 전원이 다음 1순 동안 쯔모한 패만 버릴 수 있다. 쯔모 화료·깡·후로는 할 수 있다.\n\n이미 리치 중인 타가에게는 걸리지 않는다. 공탁금 1,000점은 평소대로 낸다.",
  install(ctx) {
    const { engine, holder } = ctx;
    if (!engine.actions.has(ACTION)) {
      const core = engine.actions.get("riichi");
      if (core === undefined)
        throw new Error("riichi action is not registered");
      engine.actions.register(
        makeRiichiAction(core as ActionDef<{ tileId: TileId }>),
      );
    }

    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);
    installForcedTsumogiri(ctx, ID);

    // 표준 리치를 걸 수 있는 패마다 하나씩 (합법성 최종 판정은 validate)
    ctx.holderTurnOptions((state) => {
      if (reject(state, holder) !== null) return [];
      if (state.round.byPlayer[holder]?.riichi != null) return [];
      return handIdsOf(state, holder).map((tileId) => ({
        type: ACTION,
        payload: { tileId },
      }));
    });
  },
  /** 텐파이면 이 버튼으로 리치를 건다 — 쯔모패로 걸 수 있으면 그 패로 */
  bot: plan({
    intent: "disrupt",
    fleeting: true,
    pick: ({ options, view, tenpai }) => {
      if (!tenpai) return null;
      const mine = options.filter((o) => o.type === ACTION);
      const drawn = view.round.myDrawnTile;
      return (
        mine.find((o) => (o.payload as { tileId?: number }).tileId === drawn) ??
        mine[0] ??
        null
      );
    },
  }),
});
