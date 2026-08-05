/**
 * 자유 선언 (free_riichi_discard, gold) — 리치를 걸면 그 순간의 손패를 스냅샷으로
 * 고정하고, 이후 자기 턴마다 손패에서 아무 패나 골라 버릴 수 있다.
 *
 * 핵심: 리치 이후 대기(오름패)·화료형·후리텐·텐파이는 모두 "첫 리치 때의 손패"로
 * 판정한다. 물리 손패를 자유롭게 바꿔도 오름패는 고정이고, 화료 시 보여지는 손패도
 * 첫 리치 때의 모습이다.
 *
 * 구현 지점:
 * - 리치 선언(TILE_DISCARDED riichi:true) 순간 손패 13장 id를 스냅샷으로 저장하고,
 *   그 손패의 대기패를 보유자 전용 뷰 채널(free_declare_waits)로 노출한다.
 * - 코어 규칙 `hand.winTileIds`를 보유자에게만 스냅샷으로 덮어써, buildWinContext·
 *   isFuriten·유국 텐파이·후리텐 마킹·결과 손패 공개가 전부 스냅샷을 쓰게 한다.
 * - 커스텀 액션 "free_discard" {tileId}: 리치 중 자기 턴에 쯔모패가 아닌 손패를
 *   조건 없이 버린다(대기 보존 검사 없음, 횟수 제한 없음). 표준 TILE_DISCARDED
 *   (riichi:false)로 처리 — 새 이벤트·Reducer 불필요.
 */

import {
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindKey,
  meldCountOf,
  playerAtSeat,
  winningKinds,
  scoringOptionsOf,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileDiscardedPayload,
  TileId,
} from "@majak/core";
import { roundKey, roundViewKey } from "../util.js";
import { pickSafestDiscard } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const AUGMENT_ID = "free_riichi_discard";

/** 국 단위 손패 스냅샷 키 (리치 시점의 손패 13장 id) — 국이 바뀌면 자동 만료 */
const snapKey = (state: GameState, player: PlayerId): string =>
  `${AUGMENT_ID}:snap:${roundKey(state)}:${player}`;

/** augmentData에서 스냅샷 손패 id 목록을 읽는다 (없으면 null) */
function snapshotOf(state: GameState, player: PlayerId): TileId[] | null {
  const raw = state.augmentData[snapKey(state, player)];
  return Array.isArray(raw) ? (raw as TileId[]) : null;
}

const freeDiscardAction: ActionDef<{ tileId: TileId }> = {
  type: "free_discard",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(AUGMENT_ID)) {
      return "no free_riichi_discard augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi == null) {
      return "not in riichi";
    }
    const drawn = state.round.lastDrawnTile;
    if (drawn !== null && req.payload.tileId === drawn) {
      return "drawn tile must use the normal discard";
    }
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    // 대기 보존 검사 없음 — 리치 손패는 스냅샷으로 고정돼 있어 무엇을 버려도
    // 오름패·화료형은 변하지 않는다. 자기 대기패를 버리면 후리텐이 될 뿐이다.
    return null;
  },
  toEvents: (req) => [
    {
      type: TILE_DISCARDED,
      payload: {
        player: req.player,
        tileId: req.payload.tileId,
        riichi: false,
        riichiCost: 0,
      },
    },
  ],
};

export const freeRiichiDiscard: AugmentDef = defineAugment({
  id: AUGMENT_ID,
  tier: "gold",
  category: "riichi",
  name: "자유 선언",
  description:
    "(상시) 리치를 걸면 그 순간의 손패로 오름패가 고정되고, 이후 자기 순마다 손패에서 아무 패나 자유롭게 버릴 수 있다. 화료 시 손패는 첫 리치 때의 모습으로 남는다.",
  detail:
    "(상시) 리치를 선언한 순간의 손패가 고정되어 오름패·화료형·텐파이·후리텐 판정이 모두 그 손패 기준이 된다. 그 뒤로는 자기 순마다 쯔모패가 아닌 손패도 조건 없이 버릴 수 있어, 물리 손패를 자유롭게 바꿔도 오름패는 변하지 않는다. 화료 시 공개되는 손패도 첫 리치 때의 모습이다. 다만 대기패를 버리면 후리텐은 그대로 걸리며, 고정된 손패와 어긋나지 않도록 리치 뒤에는 깡을 칠 수 없다.",
  // A급 파괴(docs/25 §conflicts): 리치를 취소해도 선언 시점 손패 스냅샷이 남아
  // hand.winTileIds를 그 국 내내 덮는다 → 화료·후리텐·유국 텐파이가 옛 손으로
  // 계산되어 **그 국이 통째로 벽돌**이 된다. 리치를 푸는 두 증강을 배제한다.
  conflicts: [
    "last_stand", // cancel_riichi로 리치 해제 → 스냅샷만 남는다
    "palm_flip", // RiichiFlipped로 리치 해제 → 동일
  ],
  install(ctx) {
    const { engine, holder, layer, instanceId } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has("free_discard")) {
      engine.actions.register(freeDiscardAction);
    }

    // 리치 선언 순간 손패 13장을 스냅샷으로 고정하고, 그 손패의 대기패를
    // 보유자 전용 뷰 채널로 노출한다 (클라 "내 오름패" 배지가 고정 대기를 쓴다).
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.player !== holder || p.riichi !== true) return;
      if (snapshotOf(rc.state, holder) !== null) return; // 이미 스냅샷됨
      const handIds = [...handIdsOf(rc.state, holder)];
      const waits = winningKinds(
        handIds.map((id) => rc.state.tiles[id]!.kind),
        meldCountOf(rc.state, holder),
        undefined,
        scoringOptionsOf(rc.state, engine.rules, holder),
      ).map(kindKey);
      rc.emit(augmentDataSet(snapKey(rc.state, holder), handIds));
      rc.emit(
        augmentDataSet(roundViewKey(holder, `free_declare_waits:${holder}`), waits),
      );
    });

    /*
     * 스냅샷이 살아 있는 동안 보유자는 깡을 칠 수 없다.
     *
     * 스냅샷은 손패 **id 목록**만 고정한다 — 멘쯔 수는 고정하지 않는다. 그래서 리치 뒤에
     * 안깡(또는 오픈 리치 + 가깡)을 치면 코어가 "스냅샷 13장 + 살아 있는 멘쯔 1개"로
     * 분해를 돌려 장수 방정식이 깨지고, **대기가 통째로 사라져** 화료·후리텐 마킹·유국
     * 텐파이가 전부 조용히 죽는다(2026-07-29 감사, 실측 재현). 코어의 리치 안깡 안전성
     * 검사(isRiichiSafeAnkan)는 물리 손패를 보므로 이 어긋남을 잡지 못한다.
     */
    engine.rules.addModifier<boolean>("call.kan.enabled", {
      source: instanceId,
      layer,
      apply: (current, rctx) => {
        if (rctx.playerId !== holder) return current;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return current;
        return snapshotOf(state, holder) === null ? current : false;
      },
    });

    // 화료·대기·후리텐·텐파이 판정에 쓰는 손패를 보유자에 한해 스냅샷으로 덮어쓴다.
    engine.rules.addModifier<readonly TileId[] | null>("hand.winTileIds", {
      source: instanceId,
      layer,
      apply: (current, rctx) => {
        if (rctx.playerId !== holder) return current;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return current;
        return snapshotOf(state, holder) ?? current;
      },
    });

    // 리치 중 자기 턴에 쯔모패 이외의 손패를 후보로 노출 (합법성은 validate가 판정)
    ctx.holderTurnOptions((state) => {
      if (state.round.byPlayer[holder]?.riichi == null) return [];
      const drawn = state.round.lastDrawnTile;
      return handIdsOf(state, holder)
        .filter((tileId) => tileId !== drawn)
        .map((tileId) => ({ type: "free_discard", payload: { tileId } }));
    });
  },
  /**
   * 이 증강의 값어치는 통째로 **안전패 선택**에 있다. 리치를 걸면 오름패가 스냅샷으로
   * 고정되므로 손패를 무엇으로 바꾸든 화료력은 그대로고, 남는 것은 "지금 무엇을 버리는
   * 것이 덜 위험한가"뿐이다.
   *
   * 그래서 다른 사람이 리치를 걸었을 때(위협이 있을 때)만 켜고, **쯔모패를 그냥
   * 버리는 것보다 확실히 안전한 손패가 있을 때만** 그 패를 낸다. 위협이 없으면 발동하지
   * 않는다 — 손패를 헤집어 봐야 얻는 게 없다.
   */
  bot: plan({
    intent: "defend",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: (ctx) => {
      if (ctx.threat <= 0) return null;
      const drawn = ctx.view.round.myDrawnTile;
      const drawnKind = drawn !== null ? ctx.view.tiles[drawn]?.kind : undefined;
      // 쯔모기리가 이미 안전하면 굳이 손패를 열지 않는다
      const drawnSafety = drawnKind !== undefined ? ctx.safety(drawnKind) : 0;
      if (drawnSafety >= 0.95) return null;
      const safest = pickSafestDiscard(ctx, "free_discard");
      if (safest === null) return null;
      const tileId = (safest.payload as { tileId?: TileId }).tileId;
      const kind = tileId !== undefined ? ctx.view.tiles[tileId]?.kind : undefined;
      if (kind === undefined) return null;
      // 확실히 더 안전할 때만 (근소한 차이로 손패를 바꾸지는 않는다)
      return ctx.safety(kind) > drawnSafety + 0.1 ? safest : null;
    },
  }),
});
