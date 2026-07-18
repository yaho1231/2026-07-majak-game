/**
 * Augment — 증강의 정의와 설치 문맥.
 *
 * 증강은 데이터 + install 함수다. install은 획득 시 각 Registry에 능력을 등록한다.
 * 새 증강을 추가하는 데 엔진 코드를 고쳐선 안 된다 — install은 등록 API만 쓴다.
 *
 * 설계: docs/10_AUGMENT_SYSTEM.md §1
 */

import type { GameEngine } from "../engine/GameEngine.js";
import type { GameState } from "../engine/state/GameState.js";
import type {
  Interceptor,
  Reaction,
} from "../engine/effects/EffectRegistry.js";
import { RuleLayer } from "../engine/rules/RuleRegistry.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import type { YakuRegistry } from "../mahjong/scoring/YakuRegistry.js";

export type AugmentTier = "silver" | "gold" | "prism";

export const TIER_LAYER: Record<AugmentTier, RuleLayer> = {
  silver: RuleLayer.Silver,
  gold: RuleLayer.Gold,
  prism: RuleLayer.Prism,
};

/** install이 받는 도구 상자. 뒤에서 전부 source=instanceId로 등록된다 */
export interface AugmentContext {
  holder: PlayerId;
  instanceId: string;
  layer: RuleLayer;
  engine: GameEngine;
  /**
   * 역 레지스트리 — 새 역 등록·기존 역 교체용.
   * StandardGame 경로(DraftController·리플레이 재구성)에서는 항상 제공된다.
   */
  yaku?: YakuRegistry;

  /** 보유자에게만 규칙 값을 고정한다 (다른 플레이어는 원래 값) */
  setHolderRule(rule: string, value: unknown): void;
  /** 이벤트 후 반응 (새 이벤트 방출) */
  reaction(on: string, react: Reaction<GameState>): void;
  /** 이벤트를 수정·취소·대체 */
  interceptor(on: string, intercept: Interceptor<GameState>): void;
  /**
   * 보유자의 턴에 추가 선택지를 프롬프트에 노출한다.
   * build는 후보 목록을 만들고, FlowController가 각 후보를 validate로 걸러 제시한다.
   * (새 액션 자체는 engine.actions.register로 별도 등록해야 한다)
   */
  holderTurnOptions(
    build: (state: GameState) => { type: string; payload: unknown }[],
  ): void;
}

export interface AugmentDef {
  id: string;
  tier: AugmentTier;
  name: string;
  description: string;
  /**
   * 이 증강이 제시될 수 있는 드래프트 스테이지 제한.
   * 생략하면 모든 스테이지에서 제시된다. (예: 게임 전체에 걸쳐 성장해야
   * 의미가 있는 증강은 ["gameStart"]로 제한한다)
   */
  draftStages?: readonly ("gameStart" | "southEntry")[];
  /**
   * 드래프트 픽 시 이 등급의 무작위 증강을 하나 함께 지급한다 (도박사 계열).
   * 지급은 DraftController.pick에서 처리되어 state.players[].augments에 기록되므로
   * 리플레이·재개에서 재추첨 없이 복원된다. install은 부수효과가 없어야 한다.
   * 지급된 증강이 또 grantsRandomTier를 가지면 연쇄된다(도박사→전문 도박사→프리즘).
   */
  grantsRandomTier?: AugmentTier;
  install(ctx: AugmentContext): void;
}

const ID_PATTERN = /^[a-z0-9_]+$/;

export function defineAugment(def: AugmentDef): AugmentDef {
  if (!ID_PATTERN.test(def.id)) {
    throw new Error(`Augment id must be snake_case: ${def.id}`);
  }
  if (!(def.tier in TIER_LAYER)) {
    throw new Error(`Unknown augment tier: ${def.tier}`);
  }
  return def;
}

export function augmentInstanceId(holder: PlayerId, augmentId: string): string {
  return `aug:${holder}:${augmentId}`;
}

/** installAugment에 넘길 수 있는 부가 도구 (StandardGame이 제공) */
export interface AugmentExtras {
  yaku?: YakuRegistry;
}

/** 획득 시 증강 능력을 엔진 Registry에 등록한다 (부수효과 — DraftController가 호출) */
export function installAugment(
  engine: GameEngine,
  def: AugmentDef,
  holder: PlayerId,
  extras: AugmentExtras = {},
): void {
  const instanceId = augmentInstanceId(holder, def.id);
  const layer = TIER_LAYER[def.tier];
  const ctx: AugmentContext = {
    holder,
    instanceId,
    layer,
    engine,
    ...(extras.yaku !== undefined ? { yaku: extras.yaku } : {}),
    setHolderRule(rule, value) {
      engine.rules.addModifier(rule, {
        source: instanceId,
        layer,
        apply: (current, c) => (c.playerId === holder ? value : current),
      });
    },
    reaction(on, react) {
      engine.effects.register({ source: instanceId, layer, on, react });
    },
    interceptor(on, intercept) {
      engine.effects.register({ source: instanceId, layer, on, intercept });
    },
    holderTurnOptions(build) {
      engine.registerTurnOptions((state, player) =>
        player === holder ? build(state) : [],
      );
    },
  };
  def.install(ctx);
}

/** 증강 파괴 시 규칙·훅을 한 번에 제거 (Prism 확장용) */
export function uninstallAugment(
  engine: GameEngine,
  def: AugmentDef,
  holder: PlayerId,
): void {
  const instanceId = augmentInstanceId(holder, def.id);
  engine.rules.removeBySource(instanceId);
  engine.effects.removeBySource(instanceId);
}
