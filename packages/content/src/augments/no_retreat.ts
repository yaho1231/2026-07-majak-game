/**
 * 물러설 수 없는 선언 (no_retreat, prism).
 * "불변으로써 만변에 응한다 — 그것이 리치의 극의."
 * 첫 패를 받은 자기 첫 턴에만 액티브 버튼이 활성화되며, 게임당 1회 사용한다.
 * 사용한 국 동안 플레이어는 반드시 "리치를 포함한 화료"만 할 수 있다. 그 대신
 * 리치 공탁금(1000)을 내지 않고, 리치·일발·뒷도라가 각각 2판으로 계산된다.
 *
 * 구현(전부 국 단위 게이팅 — declared=roundKey일 때만):
 * - win.blockedYaku: 리치 중이 아니면 모든 역을 봉인 → 역 없음으로 화료 불가.
 *   (리치를 선언하면 봉인이 풀려 정상 화료 — "리치 포함 화료만" 강제.)
 * - riichi.cost: 0 (공탁 미지불 — 리치 선언패의 riichiCost가 0이 되어 봉·차감 없음).
 * - score.extraHan: 화료 시 실제 채점을 재구성해 뒷도라(uraHan)만큼 한 번 더 더하고
 *   (2배), 리치·일발이 있으면 각 +1(1→2판). 역만에는 적용하지 않는다.
 */

import {
  augmentDataSet,
  buildWinContext,
  defineAugment,
  evaluateWin,
  meldCountOf,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { roundKey, stringOf } from "../util.js";

const ID = "no_retreat";
const ACTION = "declare_no_retreat";
/** 게임당 1회 사용 플래그 */
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
/** 선언한 국의 roundKey (국이 바뀌면 자동 만료) */
const declaredKey = (h: PlayerId): string => `${ID}:round:${h}`;

/** 이번 국에 no_retreat를 선언한 상태인가 */
function declaredThisRound(state: GameState, holder: PlayerId): boolean {
  return stringOf(state, declaredKey(holder)) === roundKey(state);
}

const declareAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no no_retreat augment";
    }
    if (state.augmentData[usedKey(req.player)] === true) return "already used";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 첫 패를 받은 첫 턴 — 아직 버리지도, 울지도 않은 상태
    if ((state.round.byPlayer[req.player]?.discardedKinds.length ?? 0) > 0) {
      return "not your first turn";
    }
    if (meldCountOf(state, req.player) > 0) return "not your first turn";
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(usedKey(req.player), true),
    augmentDataSet(declaredKey(req.player), roundKey(state)),
  ],
};

export const noRetreat: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  name: "물러설 수 없는 선언",
  description:
    "첫 턴에 선언(게임당 1회)하면, 그 국에는 반드시 리치를 포함해야만 화료할 수 있다. 그 대신 리치 공탁금을 내지 않고 리치·일발·뒷도라가 각각 2판으로 계산된다.",
  install(ctx) {
    const { engine, holder, layer, instanceId } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(declareAction);
    }

    // 리치 중이 아니면 모든 역 봉인 → "리치 포함 화료만" 강제
    engine.rules.addModifier<string[]>("win.blockedYaku", {
      source: instanceId,
      layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined || !declaredThisRound(state, holder)) return cur;
        if (state.round.byPlayer[holder]?.riichi != null) return cur; // 리치 → 해제
        const allIds = (ctx.yaku?.all() ?? []).map((y) => y.id);
        return [...cur, ...allIds];
      },
    });

    // 리치 공탁금 면제 (선언한 국 동안)
    engine.rules.addModifier<number>("riichi.cost", {
      source: instanceId,
      layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined || !declaredThisRound(state, holder)) return cur;
        return 0;
      },
    });

    // 리치·일발 +1판, 뒷도라 2배 — 실제 채점을 재구성해 정확히 얹는다
    engine.rules.addModifier<number>("score.extraHan", {
      source: instanceId,
      layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined || !declaredThisRound(state, holder)) return cur;
        if (ctx.yaku === undefined) return cur;

        // 화료 시점의 화료패·화료종류를 현재 페이즈에서 복원
        const phase = state.round.phase;
        let winType: "tsumo" | "ron";
        let tileId: TileId | null;
        if (phase === "turn.act") {
          winType = "tsumo";
          tileId = state.round.lastDrawnTile;
        } else if (phase === "reaction") {
          winType = "ron";
          tileId =
            state.round.lastDiscard?.tileId ??
            state.round.chankan?.tileId ??
            null;
        } else {
          return cur;
        }
        if (tileId === null) return cur;

        const wctx = buildWinContext(state, holder, winType, tileId, {
          includeUra: true,
          rules: engine.rules,
        });
        const ev = evaluateWin(wctx, ctx.yaku);
        if (ev === null || !ev.ok || ev.yakumanCount > 0) return cur;

        const has = (id: string): boolean => ev.yaku.some((y) => y.id === id);
        let bonus = ev.uraHan; // 뒷도라 한 번 더 = 2배
        if (has("riichi") || has("double_riichi")) bonus += 1; // 리치 1→2
        if (has("ippatsu")) bonus += 1; // 일발 1→2
        return cur + bonus;
      },
    });

    // 첫 턴에만 선언 버튼 노출 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) =>
      state.augmentData[usedKey(holder)] === true
        ? []
        : [{ type: ACTION, payload: {} }],
    );
  },
});
