/**
 * standardGame — 표준 리치마작 게임 조립 팩토리.
 * 엔진 + 표준 이벤트/액션/역/규칙을 등록해서 바로 돌릴 수 있는 게임을 만든다.
 *
 * 증강은 이 팩토리가 돌려주는 engine/yaku의 등록 API로 끼어든다.
 */

import { GameEngine } from "../../engine/GameEngine.js";
import type { ProcessorOptions } from "../../engine/effects/EventProcessor.js";
import type { GameEvent } from "../../engine/events/GameEvent.js";
import { TILES_MOVED, tilesMovedReducer } from "../../engine/events/TilesMoved.js";
import { createInitialGameState } from "../../engine/state/GameState.js";
import type { GameState } from "../../engine/state/GameState.js";
import type { PlayerId } from "../../engine/zones/Zone.js";
import { AugmentRegistry } from "../../augment/AugmentRegistry.js";
import type { AugmentDef } from "../../augment/Augment.js";
import { registerAugmentSupport } from "../../augment/events.js";
import { standardAugments } from "../../augment/standardAugments.js";
import { defineVisibilityRules } from "../../information/PlayerView.js";
import { YakuRegistry } from "../scoring/YakuRegistry.js";
import { registerStandardYaku } from "../scoring/standardYaku.js";
import { registerFlowReducers } from "./flowEvents.js";
import {
  defineStandardFlowRules,
  registerStandardActions,
} from "./standardActions.js";

export interface StandardGame {
  engine: GameEngine;
  yaku: YakuRegistry;
  /** 사용 가능한 증강 카탈로그 (기본: 표준 6종) */
  augments: AugmentRegistry;
}

/**
 * 이미 만들어진 상태(테스트·리플레이 복원·이어하기)에 표준 콘텐츠를 등록한다.
 * `log`를 주면 엔진 로그를 과거 이벤트로 시드한다 (resume: 새 이벤트만 append).
 */
export function createStandardGameFromState(
  state: GameState,
  processor?: ProcessorOptions,
  extraAugments?: readonly AugmentDef[],
  log?: readonly GameEvent[],
): StandardGame {
  const engine = new GameEngine({
    state,
    ...(processor !== undefined ? { processor } : {}),
    ...(log !== undefined ? { log } : {}),
  });
  engine.reducers.register(TILES_MOVED, tilesMovedReducer);
  defineStandardFlowRules(engine.rules);
  registerFlowReducers(engine.reducers, engine.rules); // deal.handSize 반영
  defineVisibilityRules(engine.rules); // 가시성 규칙 — 없으면 모든 Zone이 hidden 폴백
  registerAugmentSupport(engine);
  const yaku = new YakuRegistry();
  registerStandardYaku(yaku);
  registerStandardActions(engine.actions, yaku);
  const augments = new AugmentRegistry();
  augments.addAll(standardAugments);
  if (extraAugments !== undefined) augments.addAll(extraAugments);
  return { engine, yaku, augments };
}

export interface StandardGameOptions {
  seed: number;
  playerIds?: PlayerId[];
  startScore?: number;
  redFivesPerSuit?: number;
  processor?: ProcessorOptions;
  /** 콘텐츠 팩(@majak/content 등)의 추가 증강 카탈로그 */
  extraAugments?: readonly AugmentDef[];
  /** 자리별 표시 정보(닉네임·봇). 없으면 id·비봇 폴백. */
  playerMeta?: import("../../engine/state/GameState.js").GameConfig["playerMeta"];
  /** 게임 모드(반장전/동풍전). 없으면 hanchan 폴백. state.config.mode로 관통된다. */
  mode?: import("../../engine/state/GameState.js").GameMode;
  /**
   * 드래프트 가중치 덮어쓰기 (티어 자동 조정 결과). 없으면 정적 티어표를 쓴다.
   * 카탈로그 인스턴스에 실리므로 방마다 독립이다.
   */
  augmentWeights?: Readonly<Record<string, number>>;
}

export function createStandardGame(options: StandardGameOptions): StandardGame {
  const state = createInitialGameState(
    {
      seed: options.seed,
      playerIds: options.playerIds ?? ["p0", "p1", "p2", "p3"],
      ...(options.playerMeta !== undefined ? { playerMeta: options.playerMeta } : {}),
      ...(options.mode !== undefined ? { mode: options.mode } : {}),
    },
    {
      startScore: options.startScore ?? 25000,
      redFivesPerSuit: options.redFivesPerSuit ?? 1,
    },
  );
  const game = createStandardGameFromState(
    state,
    options.processor,
    options.extraAugments,
  );
  // 티어 자동 조정 결과를 이 게임의 드래프트에만 건다 (카탈로그는 게임마다 새것)
  if (options.augmentWeights !== undefined) {
    game.augments.setWeightOverrides(options.augmentWeights);
  }
  return game;
}
