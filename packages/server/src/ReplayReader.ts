/**
 * ReplayReader — JSONL 리플레이 재생 도구.
 *
 * __init__ 라인으로 초기 GameState를 만들고, 이후 확정 GameEvent를
 * Reducer에 순서대로 적용한다. 리플레이 파일은 이미 확정 이벤트 로그이므로
 * Action validate나 Effect 재실행을 하지 않는다.
 */

import { readFile } from "node:fs/promises";
import {
  AUGMENT_DRAFTED,
  buildPlayerView,
  createInitialGameState,
  createStandardGameFromState,
  installAugment,
  rebuildAugments,
} from "@majak/core";
import type {
  AugmentDef,
  GameConfig,
  GameEvent,
  GameState,
  InitialStateOptions,
  PlayerId,
} from "@majak/core";

export interface ReplayInitLine {
  type: "__init__";
  payload: {
    config: GameConfig;
    options: InitialStateOptions;
  };
}

export interface ReplayResult {
  path: string;
  state: GameState;
  events: GameEvent[];
  summary: ReplaySummary;
}

export interface ReplaySummary {
  eventCount: number;
  lastSeq: number;
  phase: string;
  wind: number;
  roundNumber: number;
  honba: number;
  riichiPot: number;
  scores: Record<PlayerId, number>;
}

export async function replayFile(
  path: string,
  extraAugments?: readonly AugmentDef[],
): Promise<ReplayResult> {
  const text = await readFile(path, "utf-8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error(`Replay is empty: ${path}`);
  }

  const init = JSON.parse(lines[0] as string) as ReplayInitLine;
  if (init.type !== "__init__") {
    throw new Error("Replay first line must be __init__");
  }

  let state = createInitialGameState(init.payload.config, init.payload.options);
  const game = createStandardGameFromState(state, undefined, extraAugments);
  const events: GameEvent[] = [];

  for (const line of lines.slice(1)) {
    const event = JSON.parse(line) as GameEvent;
    state = game.engine.reducers.dispatch(state, event);
    state = { ...state, lastEventSeq: event.seq };
    // 증강이 새 이벤트 타입(예: RecallPerformed)의 Reducer를 등록하므로,
    // 드래프트되는 순간 해당 증강을 설치해 이후 이벤트를 재구성할 수 있게 한다.
    if (event.type === AUGMENT_DRAFTED) {
      const p = event.payload as { player: PlayerId; augmentId: string };
      const def = game.augments.get(p.augmentId);
      if (def !== undefined) {
        installAugment(game.engine, def, p.player, {
          yaku: game.yaku,
          catalog: game.augments,
        });
      }
    }
    events.push(event);
  }

  return {
    path,
    state,
    events,
    summary: summarizeReplay(state, events),
  };
}

export function summarizeReplay(state: GameState, events: readonly GameEvent[]): ReplaySummary {
  return {
    eventCount: events.length,
    lastSeq: state.lastEventSeq,
    phase: state.round.phase,
    wind: state.round.prevalentWind,
    roundNumber: state.round.roundNumber,
    honba: state.round.honba,
    riichiPot: state.round.riichiPot,
    scores: Object.fromEntries(state.players.map((p) => [p.id, p.score])),
  };
}

export function buildReplayView(
  state: GameState,
  viewer: PlayerId,
  extraAugments?: readonly AugmentDef[],
) {
  const game = createStandardGameFromState(state, undefined, extraAugments);
  // 가시성 증강("상대 패 확인" 등)의 Rule Modifier를 뷰에 반영
  rebuildAugments(game.engine, game.augments, {
    yaku: game.yaku,
    catalog: game.augments,
  });
  return buildPlayerView(state, viewer, game.engine.rules);
}

/*
 * ─────────────────────────── 이어하기(resume) 재구성 — 제거됨 ───────────────────────────
 *
 * `ResumeReconstruction` · `reconstructGame` · `reconstructGameFromFile` 과 그 테스트
 * (`test/Resume.test.ts`)를 **임시로 들어냈다** (2026-08-12, 사용자 결정).
 *
 * 구현도 테스트도 있었지만 **프로덕션에서 한 번도 불린 적이 없다** — `git log -S`로
 * 확인한 결과 호출 지점이 추가된 적도 제거된 적도 없는, 배선되지 않은 미완성 기능이었다.
 * 지금 켤 수도 없었다. 라이브 경로가 하는 일 중 재개 경로에 없는 것들:
 *
 *   - 리플레이 `__init__` 줄에 `HanchanConfig`가 없다 (uma·oka·서입·`draftSchedules`).
 *     그런데 `HanchanController.resume()`은 `draftSchedules`를 읽어 어느 드래프트가
 *     끝났는지 판단한다.
 *   - `createStandardGameFromState`가 `setWeightOverrides`를 부르지 않는다 →
 *     재개한 판은 실적 반영 없는 정적 티어표로 드래프트한다.
 *   - `processor: { onEffectError }`가 안 실려 증강 훅 예외가 로그 없이 삼켜진다.
 *   - `ReplayWriter`에 append 모드가 없고 `StatsTracker`는 빈 상태로 다시 시작한다.
 *   - 방·좌석·에이전트·재접속 토큰·관전자가 어디에도 영속되지 않는다 (DB에 방 테이블 없음).
 *
 * 그래서 유지비(단독 실행 100~200초짜리 테스트)만 계속 나가고 있었다.
 * **되살리려면** `git log --diff-filter=D -- packages/server/test/Resume.test.ts` 로
 * 이 커밋을 찾아 되돌리고, 위 다섯 가지를 먼저 채워야 한다.
 *
 * 엔진 쪽 `HanchanController.resume()` 자체는 **남겨 두었다** — 코어 API이고
 * `packages/core/test/Hanchan.test.ts`가 독립적으로 덮고 있다.
 */
