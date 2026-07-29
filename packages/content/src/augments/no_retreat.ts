/**
 * 물러설 수 없는 선언 (no_retreat, prism).
 * "불변으로써 만변에 응한다 — 그것이 리치의 극의."
 * 첫 패를 받은 자기 첫 턴에만 액티브 버튼이 활성화되며, 2국에 1회 선언할 수 있다.
 * 선언한 국 동안 리치 공탁금(1000)을 내지 않고, 리치·일발·뒷도라가 각각 2판으로
 * 계산된다.
 *
 * 구현(전부 국 단위 게이팅 — declared=roundKey일 때만):
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
/** 마지막으로 선언한 국의 roundKey (효과 게이팅 + 쿨다운 기준) */
const declaredKey = (h: PlayerId): string => `${ID}:round:${h}`;

/** 이번 국에 no_retreat를 선언한 상태인가 (효과는 선언한 그 국에만 적용) */
function declaredThisRound(state: GameState, holder: PlayerId): boolean {
  return stringOf(state, declaredKey(holder)) === roundKey(state);
}

/**
 * roundKey "pw-rn-honba" → 정렬 가능한 국 순서값.
 *
 * ⚠ **본장을 반드시 센다.** 예전에는 `(pw-1)*4 + rn`으로 본장을 버렸는데, 오야가 연장하면
 * 동1-0본장 → 동1-3본장이 전부 같은 값이라 **쿨다운이 영영 풀리지 않았다**(2026-07-29 감사).
 * 자리 수를 넉넉히 잡아(본장 100 미만) 국 → 본장 순으로 단조 증가하게 만든다.
 * 좌석 수도 4로 하드코딩하지 않고 호출자가 넘긴다.
 */
function absRoundOf(key: string, seats: number): number {
  const parts = key.split("-").map(Number);
  const pw = parts[0] ?? 0;
  const rn = parts[1] ?? 0;
  const honba = parts[2] ?? 0;
  return ((pw - 1) * seats + rn) * 100 + Math.min(honba, 99);
}

/**
 * 선언 가능 여부 — 2국에 1회. 선언 이력이 없거나, 마지막 선언 국으로부터
 * 2국 이상 지났을 때만 다시 선언할 수 있다(선언한 국·바로 다음 국은 쿨다운).
 */
function canDeclare(state: GameState, holder: PlayerId): boolean {
  const last = stringOf(state, declaredKey(holder));
  if (last === null) return true;
  const seats = state.players.length;
  // 본장 단위까지 세므로 "2국 뒤"는 100×2 = 200이다
  return absRoundOf(roundKey(state), seats) - absRoundOf(last, seats) >= 200;
}

const declareAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no no_retreat augment";
    }
    // 2국에 1회 — 선언한 국·바로 다음 국은 쿨다운
    if (!canDeclare(state, req.player)) return "on cooldown";
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
    augmentDataSet(declaredKey(req.player), roundKey(state)),
  ],
};

export const noRetreat: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  name: "물러설 수 없는 선언",
  description:
    "(2국에 1회) 국의 첫 순에 액티브 버튼이 활성화되며, 선언하면 그 국에는 리치 공탁금을 내지 않고 리치·일발·뒷도라가 각각 2판으로 계산된다.",
  detail:
    "(2국에 1회) 아직 버리지도 울지도 않은 국의 첫 순에만 선언할 수 있다. 그 국에는 공탁금 없이 리치를 걸 수 있고, 화료 시 리치·일발·뒷도라가 각각 2판으로 계산된다(뒷도라는 장수만큼 두 배). 역만 손에는 추가 판이 적용되지 않는다.",
  install(ctx) {
    const { engine, holder, layer, instanceId } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(declareAction);
    }

    // 48차 무페널티: "리치를 안 걸면 전 역 봉인(=화료 불가)"이라는 배수진을 삭제했다.
    // 선언은 이제 순수한 상향 — 공탁 면제 + 리치·일발·뒷도라 2배만 남는다.

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
        // "리치 성분을 2판으로" — 더블리치는 이미 2판이므로 더하지 않는다.
        // 예전에는 둘 다 +1을 줘서 뒤늦은 출진(더블리치 강제)과 겹치면 3판이 됐다
        // (안내 문구와 결과가 어긋남, 2026-07-29 감사).
        if (has("riichi") && !has("double_riichi")) bonus += 1; // 리치 1→2
        if (has("ippatsu")) bonus += 1; // 일발 1→2
        return cur + bonus;
      },
    });

    // 첫 턴에만 선언 버튼 노출 (합법성은 validate가 최종 판정)
    // 2국에 1회 — 쿨다운 중이면 숨긴다.
    ctx.holderTurnOptions((state) =>
      canDeclare(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );
  },
  // 첫 턴 선언은 리치 공탁이 공짜가 되고 리치·일발·뒷도라가 2판이 되는 순수 이득
  // (선언만 해도 잃는 것이 없다) — 제시되면 무조건 선언한다.
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
});
