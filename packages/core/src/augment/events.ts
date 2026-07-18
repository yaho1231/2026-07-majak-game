/**
 * augment events — 증강 시스템이 쓰는 이벤트·규칙·액션의 등록.
 *
 * ScoreChanged: 증강이 점수를 더하는 공용 이벤트.
 * AugmentDrafted: 드래프트 픽 결과 (state.augments가 SSOT).
 * draftPick: 픽을 제출하는 액션.
 *
 * 설계: docs/10_AUGMENT_SYSTEM.md §4
 */

import type { ActionDef } from "../engine/actions/ActionRegistry.js";
import type { GameEngine } from "../engine/GameEngine.js";
import type { ProposedEvent } from "../engine/events/GameEvent.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import type { TileAttrs, TileId, TileKind } from "../mahjong/tiles/Tile.js";

export const SCORE_CHANGED = "ScoreChanged";
export const AUGMENT_DRAFTED = "AugmentDrafted";
export const AUGMENT_DATA_SET = "AugmentDataSet";
export const TILE_KIND_CHANGED = "TileKindChanged";

export interface ScoreChangedPayload {
  player: PlayerId;
  delta: number;
  /** 표시용 사유 (예: 증강 id) */
  reason?: string;
}

export interface AugmentDraftedPayload {
  player: PlayerId;
  augmentId: string;
}

export interface AugmentDataSetPayload {
  key: string;
  value: unknown;
}

/** 패의 종류·속성 변경 (수패 통일, 아카도라 부여 등 — Issue 002의 실전 활용) */
export interface TileKindChangedPayload {
  changes: {
    tileId: TileId;
    /** 생략하면 kind 유지 */
    kind?: TileKind;
    /** 기존 attrs에 병합 (undefined 값은 키 제거) */
    attrs?: TileAttrs;
  }[];
  /** 난수를 소비했다면 전진된 PRNG 상태 (결정론 유지) */
  prngState?: number;
}

export function tileKindChanged(
  changes: TileKindChangedPayload["changes"],
  prngState?: number,
): ProposedEvent<typeof TILE_KIND_CHANGED, TileKindChangedPayload> {
  return {
    type: TILE_KIND_CHANGED,
    payload:
      prngState === undefined ? { changes } : { changes, prngState },
  };
}

export function scoreChanged(
  player: PlayerId,
  delta: number,
  reason?: string,
): ProposedEvent<typeof SCORE_CHANGED, ScoreChangedPayload> {
  return {
    type: SCORE_CHANGED,
    payload: reason === undefined ? { player, delta } : { player, delta, reason },
  };
}

/** 증강 전용 저장소(state.augmentData)에 값을 쓴다 (순수 Reducer로만 변경) */
export function augmentDataSet(
  key: string,
  value: unknown,
): ProposedEvent<typeof AUGMENT_DATA_SET, AugmentDataSetPayload> {
  return { type: AUGMENT_DATA_SET, payload: { key, value } };
}

/** 특정 플레이어가 특정 스테이지의 드래프트를 마쳤음을 나타내는 상태 키. */
export function draftDoneKey(stage: string, player: PlayerId): string {
  return `draft:done:${stage}:${player}`;
}

/**
 * 드래프트 픽.
 * payload.markStage가 있으면(정식 픽) 그 스테이지 완료 플래그도 함께 기록한다 —
 * 진행 상태를 보유 증강 '수'로 세지 않게 해 도박사(한 턴에 2개 획득)에도 견고하다.
 * (도박사가 지급하는 픽은 markStage 없이 호출되어 플래그를 건드리지 않는다.)
 */
const draftPickAction: ActionDef<{ augmentId: string; markStage?: string }> = {
  type: "draftPick",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (player.augments.includes(req.payload.augmentId)) {
      return "already owns this augment";
    }
    return null;
  },
  toEvents: (req) => {
    const events: ProposedEvent<string, unknown>[] = [
      {
        type: AUGMENT_DRAFTED,
        payload: { player: req.player, augmentId: req.payload.augmentId },
      },
    ];
    if (req.payload.markStage !== undefined) {
      events.push(
        augmentDataSet(draftDoneKey(req.payload.markStage, req.player), true),
      );
    }
    return events;
  },
};

/**
 * 증강 시스템의 공용 이벤트·규칙·액션을 엔진에 등록한다.
 * createStandardGame이 항상 호출한다 (증강 미사용 게임에도 무해).
 */
export function registerAugmentSupport(engine: GameEngine): void {
  engine.reducers.register(SCORE_CHANGED, (state, event) => {
    const p = event.payload as ScoreChangedPayload;
    return {
      ...state,
      players: state.players.map((pl) =>
        pl.id === p.player ? { ...pl, score: pl.score + p.delta } : pl,
      ),
    };
  });

  engine.reducers.register(AUGMENT_DRAFTED, (state, event) => {
    const p = event.payload as AugmentDraftedPayload;
    return {
      ...state,
      players: state.players.map((pl) =>
        pl.id === p.player && !pl.augments.includes(p.augmentId)
          ? { ...pl, augments: [...pl.augments, p.augmentId] }
          : pl,
      ),
    };
  });

  engine.reducers.register(AUGMENT_DATA_SET, (state, event) => {
    const p = event.payload as AugmentDataSetPayload;
    return { ...state, augmentData: { ...state.augmentData, [p.key]: p.value } };
  });

  engine.reducers.register(TILE_KIND_CHANGED, (state, event) => {
    const p = event.payload as TileKindChangedPayload;
    const tiles = { ...state.tiles };
    for (const c of p.changes) {
      const tile = tiles[c.tileId];
      if (tile === undefined) throw new Error(`Unknown tile: ${c.tileId}`);
      tiles[c.tileId] = {
        ...tile,
        kind: c.kind ?? tile.kind,
        attrs: c.attrs === undefined ? tile.attrs : { ...tile.attrs, ...c.attrs },
      };
    }
    return {
      ...state,
      tiles,
      ...(p.prngState !== undefined ? { prngState: p.prngState } : {}),
    };
  });

  engine.actions.register(draftPickAction);

  engine.rules.define("augment.draft.weight.silver", 60);
  engine.rules.define("augment.draft.weight.gold", 30);
  engine.rules.define("augment.draft.weight.prism", 10);
  engine.rules.define("augment.draft.choices", 3);
}
