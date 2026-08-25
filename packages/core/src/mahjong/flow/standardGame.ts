/**
 * standardGame — 표준 리치마작 게임 조립 팩토리.
 * 엔진 + 표준 이벤트/액션/역/규칙을 등록해서 바로 돌릴 수 있는 게임을 만든다.
 *
 * 증강은 이 팩토리가 돌려주는 engine/yaku의 등록 API로 끼어든다.
 */

import { GameEngine } from "../../engine/GameEngine.js";
import { RuleLayer } from "../../engine/rules/RuleRegistry.js";
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
import type { VisibilityRule } from "../../information/PlayerView.js";
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
export interface HouseRuleOptions {
  /**
   * 쿠이탕(후로 탕야오) 허용 (기본 true). false면 탕야오가 **멘젠 전용**이 된다 —
   * 역 정의 자체를 갈아 끼우므로, 화료 판정·봇의 역 계산·정산이 한 곳에서 갈린다.
   */
  kuitan?: boolean;
  /**
   * 손패 공개 (기본 false). true면 손패 Zone의 가시성이 `public`이 되어
   * 네 사람의 손패가 서로에게 보인다 (연습·강습용).
   */
  openHands?: boolean;
}

/**
 * 방 상세설정(쿠이탕·손패 공개)을 이미 만들어진 게임에 입힌다.
 *
 * 규칙 레지스트리와 역 레지스트리를 **만든 직후에** 손보는 자리다 — 나중에
 * 증강이 얹는 Modifier는 이 위에 그대로 쌓인다(가시성은 Modifier가 이기므로
 * 투시·엿보기 증강도 손패 공개와 충돌하지 않는다).
 */
function applyHouseRules(game: StandardGame, house: HouseRuleOptions | undefined): void {
  if (house === undefined) return;
  if (house.kuitan === false) {
    const tanyao = game.yaku.get("tanyao");
    if (tanyao !== undefined) {
      game.yaku.remove("tanyao");
      game.yaku.register({ ...tanyao, openHan: null });
    }
  }
  if (house.openHands === true) {
    // `define`은 다시 정의하면 던진다(그게 옳다 — 오타를 잡는 그물이다). 그래서
    // 기본값을 갈아 끼우는 대신 **가장 낮은 층**의 Modifier로 얹는다: 증강이 얹는
    // Silver 이상 층이 이 위에 그대로 쌓여, 투시·엿보기·안개가 종전대로 이긴다.
    game.engine.rules.addModifier<VisibilityRule>("visibility.hand", {
      source: "house:openHands",
      layer: RuleLayer.Base,
      priority: -1,
      apply: () => "public",
    });
  }
}

export function createStandardGameFromState(
  state: GameState,
  processor?: ProcessorOptions,
  extraAugments?: readonly AugmentDef[],
  log?: readonly GameEvent[],
  house?: HouseRuleOptions,
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
  const game: StandardGame = { engine, yaku, augments };
  applyHouseRules(game, house);
  return game;
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
  /** 쿠이탕 허용 (기본 true). false면 탕야오가 멘젠 전용이 된다. */
  kuitan?: boolean;
  /** 손패 공개 (기본 false). true면 모든 손패가 전원에게 보인다. */
  openHands?: boolean;
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
    undefined,
    {
      ...(options.kuitan !== undefined ? { kuitan: options.kuitan } : {}),
      ...(options.openHands !== undefined ? { openHands: options.openHands } : {}),
    },
  );
  // 티어 자동 조정 결과를 이 게임의 드래프트에만 건다 (카탈로그는 게임마다 새것)
  if (options.augmentWeights !== undefined) {
    game.augments.setWeightOverrides(options.augmentWeights);
  }
  return game;
}
