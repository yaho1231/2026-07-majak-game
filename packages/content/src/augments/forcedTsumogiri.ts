/**
 * **강제 쯔모기리** 공용 배선 — 늪(`swamp`) · 위압감(`intimidate`)이 함께 쓴다.
 *
 * 대상은 **다음 N번의 자기 쯔모 순**에 방금 뽑은 패만 버릴 수 있다(2026-09-24 사용자 확정:
 * "버림만 쯔모패로 고정"). 쯔모 화료·안깡·가깡·쯔모패로 거는 리치·후로는 그대로 된다.
 *
 * ## 순 세기
 * - 대상이 **패산에서 쯔모**하면(영상패 제외) 남은 순을 하나 쓰고 "이번 순은 강제" 표식을 세운다.
 * - 대상이 패를 버리면 표식을 내린다.
 * - 후로 직후의 버림은 쯔모가 없으므로 자유이고 순도 쓰지 않는다. 대명깡 뒤 영상패도 같다.
 * - 강제 순 안에서 깡을 하면 영상패가 새 쯔모패가 되고, 표식은 그대로라 그 패만 버릴 수 있다.
 *
 * ## 잠금
 * `discard.blockedTileIds`에 «쯔모패를 뺀 손패 전부»를 얹는다. 리치 예외·소프트락 예외는
 * 코어 `lockedDiscardIds`가 그대로 처리하고, 표준 리치·증강 리치도 같은 판정을 탄다.
 *
 * ## 표시
 * 남은 순을 전원 공개 채널 `forcedTsumogiri:{증강}:{보유자}:{대상}`에 싣는다(국 스코프).
 * 이번 순이 강제 중이면 그 순도 센다. 0이 되면 ""로 비워 화면에서 내린다.
 */

import {
  TILE_DISCARDED,
  TILE_DRAWN,
  augmentDataSet,
  handIdsOf,
} from "@majak/core";
import type {
  AugmentContext,
  GameState,
  PlayerId,
  ProposedEvent,
  TileDrawnPayload,
  TileId,
} from "@majak/core";
import { counterOf, flagOf, roundViewKey } from "../util.js";
import { roundScopedKey } from "./roundScope.js";

/** 남은 강제 순 (대상별 · 보유자별) */
const leftKey = (
  augmentId: string,
  state: GameState,
  holder: PlayerId,
  victim: PlayerId,
): string => roundScopedKey(augmentId, `ftLeft:${victim}`, state, holder);
/** 지금 순이 강제 순인가 */
const activeKey = (
  augmentId: string,
  state: GameState,
  holder: PlayerId,
  victim: PlayerId,
): string => roundScopedKey(augmentId, `ftActive:${victim}`, state, holder);

/** 공개 채널 이름 (뷰에서는 국 표식이 떨어져 이 이름 그대로다) */
export const forcedTsumogiriChannel = (
  augmentId: string,
  holder: PlayerId,
  victim: PlayerId,
): string => `forcedTsumogiri:${augmentId}:${holder}:${victim}`;

/** 화면에 보일 남은 순 — 강제 중인 이번 순을 포함한다 */
function shownTurns(left: number, active: boolean): number {
  return left + (active ? 1 : 0);
}

function publish(
  augmentId: string,
  holder: PlayerId,
  victim: PlayerId,
  turns: number,
): ProposedEvent {
  return augmentDataSet(
    roundViewKey("*", forcedTsumogiriChannel(augmentId, holder, victim)),
    turns > 0 ? turns : "",
  );
}

/** 이 대상이 지금 강제 쯔모기리 순인가 (보유자 한 명 기준) */
export function forcedTsumogiriActive(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
  victim: PlayerId,
): boolean {
  return flagOf(state, activeKey(augmentId, state, holder, victim));
}

/** 남은 강제 순 (이번 순 포함) */
export function forcedTsumogiriTurns(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
  victim: PlayerId,
): number {
  return shownTurns(
    counterOf(state, leftKey(augmentId, state, holder, victim)),
    forcedTsumogiriActive(state, augmentId, holder, victim),
  );
}

/**
 * 대상에게 **앞으로 `turns`순** 강제 쯔모기리를 건다. 이미 걸려 있으면 `turns`로 새로 건다
 * (쌓이지 않는다). 지금 강제 중인 순은 그대로 끝까지 간다.
 */
export function forceTsumogiriEvents(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
  victim: PlayerId,
  turns: number,
): ProposedEvent[] {
  const active = forcedTsumogiriActive(state, augmentId, holder, victim);
  return [
    augmentDataSet(leftKey(augmentId, state, holder, victim), turns),
    publish(augmentId, holder, victim, shownTurns(turns, active)),
  ];
}

/** `install`에서 한 번 부른다 — 순 세기 리액션과 버림 잠금을 붙인다 */
export function installForcedTsumogiri(
  ctx: AugmentContext,
  augmentId: string,
): void {
  const { engine, holder } = ctx;

  ctx.reaction(TILE_DRAWN, (event, rc) => {
    const p = event.payload as TileDrawnPayload;
    if (p.player === holder || p.rinshan === true) return;
    const state = rc.state;
    const left = counterOf(state, leftKey(augmentId, state, holder, p.player));
    if (left <= 0) return;
    rc.emit(
      augmentDataSet(leftKey(augmentId, state, holder, p.player), left - 1),
    );
    rc.emit(
      augmentDataSet(activeKey(augmentId, state, holder, p.player), true),
    );
    // 이번 순 포함이라 쓰기 전과 같은 값이다 — 버리는 순간 줄어든다
    rc.emit(publish(augmentId, holder, p.player, left));
  });

  ctx.reaction(TILE_DISCARDED, (event, rc) => {
    const p = event.payload as { player: PlayerId };
    const state = rc.state;
    if (!forcedTsumogiriActive(state, augmentId, holder, p.player)) return;
    rc.emit(
      augmentDataSet(activeKey(augmentId, state, holder, p.player), false),
    );
    const left = counterOf(state, leftKey(augmentId, state, holder, p.player));
    rc.emit(publish(augmentId, holder, p.player, left));
  });

  engine.rules.addModifier<TileId[]>("discard.blockedTileIds", {
    source: ctx.instanceId,
    layer: ctx.layer,
    apply: (current, rctx) => {
      const victim = rctx.playerId;
      if (victim === undefined || victim === holder) return current;
      const state = rctx.state as GameState | undefined;
      if (state === undefined) return current;
      if (!forcedTsumogiriActive(state, augmentId, holder, victim))
        return current;
      const drawn = state.round.lastDrawnTile;
      if (drawn === null) return current;
      const hand = handIdsOf(state, victim);
      if (!hand.includes(drawn)) return current;
      return [...current, ...hand.filter((id) => id !== drawn)];
    },
  });
}
