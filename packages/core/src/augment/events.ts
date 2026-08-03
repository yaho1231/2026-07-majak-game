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
export const AUGMENT_OFFERED = "AugmentOffered";
export const AUGMENT_DATA_SET = "AugmentDataSet";
export const TILE_KIND_CHANGED = "TileKindChanged";
export const AUGMENT_DISARMED = "AugmentDisarmed";

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

/**
 * 드래프트에서 한 플레이어에게 제시된 3지선다(오퍼). 픽률(offered 대비 picked)
 * 통계용으로 로그에 남긴다. 게임 상태는 바꾸지 않는(no-op reducer) 순수
 * 정보 이벤트이며, 시드에서 결정적으로 재현되므로 리플레이·재개에서도 동일하다.
 */
export interface AugmentOfferedPayload {
  player: PlayerId;
  augmentIds: string[];
}

export interface AugmentDataSetPayload {
  key: string;
  value: unknown;
}

/**
 * 증강 하나가 무장해제로 잠기는 순간 (무장해제 증강이 낸다).
 *
 * **왜 별도 이벤트인가** — 무장해제는 규칙·효과·액티브 버튼을 전부 잠그지만,
 * 그 증강이 **이미 만들어 놓은 물리적 상태**(진짜 용의 16장 배패처럼)는 되돌리지
 * 못한다. 규칙만 꺼지면 "손패 17장인데 화료형은 14장"이라는 성립 불가능한 손이 남는다.
 *
 * 그래서 잠그기 **직전에** 이 이벤트를 먼저 낸다. 대상 증강은 이 이벤트에 반응해
 * 자기가 바꿔 놓은 상태를 스스로 원상복구한다(진짜 용 → 손패 3장을 패산으로 반납).
 * 아직 DISARMED_SOURCES_KEY에 들어가기 전이라 대상 증강의 Reaction이 정상 작동한다 —
 * **순서가 계약이다**(무장해제의 toEvents가 이 이벤트를 목록 갱신보다 먼저 둔다).
 */
export interface AugmentDisarmedPayload {
  /** 잠기는 증강의 보유자 */
  target: PlayerId;
  augmentId: string;
  /** 잠기는 인스턴스 id (augmentInstanceId(target, augmentId)) */
  source: string;
}

/** 증강 무장해제 통보 (상태를 바꾸지 않는 순수 신호 — 되돌리기는 대상 증강이 emit한다) */
export function augmentDisarmed(
  payload: AugmentDisarmedPayload,
): ProposedEvent<typeof AUGMENT_DISARMED, AugmentDisarmedPayload> {
  return { type: AUGMENT_DISARMED, payload };
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

/** 변경이 종류를 실제로 바꾸는가 (kind 생략이거나 같은 종류면 false) */
function kindDiffers(current: TileKind, next: TileKind | undefined): boolean {
  return next !== undefined && (next.suit !== current.suit || next.rank !== current.rank);
}

/**
 * 적도라 표식을 뗀 attrs. 적도라는 "이 무늬의 5"라는 뜻이라 종류가 바뀌면
 * 의미를 잃는다 — 남겨 두면 존재할 수 없는 패(적도라 東, 적4, 적5통 2장)가 생긴다.
 */
function withoutRed(attrs: TileAttrs): TileAttrs {
  if (attrs.red === undefined && attrs.redFor === undefined) return attrs;
  const { red: _red, redFor: _redFor, ...rest } = attrs;
  return rest;
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
 * 특정 증강이 '어느 드래프트 스테이지에서 획득됐는지'를 담는 상태 키.
 * 정식 픽에서만 기록된다(markStage 있는 경우). 스택형 증강이 뒤쪽 스테이지로
 * 늦게 들어와 축적할 국이 적을 때 보강 여부를 결정하는 데 쓴다 — install 시점의
 * 클로저가 아니라 상태에서 읽어야 리플레이·재개(rebuildAugments)에서 결정적이다.
 */
export function augmentStageKey(player: PlayerId, augmentId: string): string {
  return `augment:stage:${player}:${augmentId}`;
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
        // 이 증강이 어느 스테이지에서 왔는지도 상태에 남긴다 (스택형 2번째-픽 보강 판정용)
        augmentDataSet(
          augmentStageKey(req.player, req.payload.augmentId),
          req.payload.markStage,
        ),
      );
    }
    return events;
  },
};

/**
 * 드래프트 오퍼 기록. 상태를 바꾸지 않고 AUGMENT_OFFERED 이벤트만 로그에 남긴다
 * (통계 전용). DraftController.recordOffer가 픽보다 먼저, 고정 순서로 제출한다.
 */
const draftOfferAction: ActionDef<AugmentOfferedPayload> = {
  type: "draftOffer",
  validate: (req, { state }) =>
    state.players.some((p) => p.id === req.player) ? null : "unknown player",
  toEvents: (req) => [{ type: AUGMENT_OFFERED, payload: req.payload }],
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

  // 오퍼는 순수 정보 이벤트 — 상태를 바꾸지 않는다 (통계 소비 전용).
  engine.reducers.register(AUGMENT_OFFERED, (state) => state);

  // 무장해제 통보도 순수 신호다 — 실제 되돌리기는 대상 증강의 Reaction이 emit한다.
  engine.reducers.register(AUGMENT_DISARMED, (state) => state);

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
      // 적도라 표식은 (무늬, 랭크)에 묶인 속성이다 — 종류가 바뀌면 따라가면 안 된다.
      // 예전에는 attrs를 그대로 병합해서 '적도라 東', '적4·적6', 심지어 **적5통 2장**
      // 같은 것이 생겼다(docs/25 P1, 6종). 이제 종류가 실제로 바뀌는 변경에서는
      // red/redFor를 기본으로 떼고, 변경 주체가 명시하면 그쪽이 이긴다.
      const base = kindDiffers(tile.kind, c.kind) ? withoutRed(tile.attrs) : tile.attrs;
      tiles[c.tileId] = {
        ...tile,
        kind: c.kind ?? tile.kind,
        attrs: c.attrs === undefined ? base : { ...base, ...c.attrs },
      };
    }
    return {
      ...state,
      tiles,
      ...(p.prngState !== undefined ? { prngState: p.prngState } : {}),
    };
  });

  engine.actions.register(draftPickAction);
  engine.actions.register(draftOfferAction);

  engine.rules.define("augment.draft.choices", 3);
}
