/**
 * ReplayReader — JSONL 리플레이 재생 도구.
 *
 * __init__ 라인으로 초기 GameState를 만들고, 이후 확정 GameEvent를
 * Reducer에 순서대로 적용한다. 리플레이 파일은 이미 확정 이벤트 로그이므로
 * Action validate나 Effect 재실행을 하지 않는다.
 */

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
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
  StandardGame,
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
        installAugment(game.engine, def, p.player, { yaku: game.yaku });
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
  rebuildAugments(game.engine, game.augments, { yaku: game.yaku });
  return buildPlayerView(state, viewer, game.engine.rules);
}

// ─────────────────────────── 이어하기(resume) 재구성 ───────────────────────────

export interface ResumeReconstruction {
  /** 최종 상태 + 증강 재설치 + 로그 시드까지 끝나 바로 이어 돌릴 수 있는 게임 */
  game: StandardGame;
  /** 재구성에 사용한 확정 이벤트 수 (= 엔진 로그 시드 길이) */
  eventCount: number;
}

/**
 * 리플레이 JSONL 라인들로 "이어 돌릴 수 있는" StandardGame을 재구성한다 (동기).
 *
 * 1) 리듀서로 최종 GameState를 재구성한다 (PRNG·왕패·손패 전부 상태에 담김).
 * 2) 그 최종 상태로 엔진을 만들고 로그를 과거 이벤트로 시드한다 (새 이벤트만 append).
 * 3) state.players[].augments 기준으로 증강 효과를 재설치한다 (rebuildAugments).
 *
 * 이후 HanchanController.resume(game)이 FlowController로 현재 페이즈에서 이어간다.
 */
export function reconstructGame(
  lines: readonly string[],
  extraAugments?: readonly AugmentDef[],
): ResumeReconstruction {
  const clean = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (clean.length === 0) throw new Error("Replay is empty");
  const init = JSON.parse(clean[0] as string) as ReplayInitLine;
  if (init.type !== "__init__") throw new Error("Replay first line must be __init__");

  // 1차: 임시 게임의 리듀서로 최종 상태를 계산 (엔진 상태는 건드리지 않는다)
  let state = createInitialGameState(init.payload.config, init.payload.options);
  const tmp = createStandardGameFromState(state, undefined, extraAugments);
  const events: GameEvent[] = [];
  for (const line of clean.slice(1)) {
    const event = JSON.parse(line) as GameEvent;
    state = tmp.engine.reducers.dispatch(state, event);
    state = { ...state, lastEventSeq: event.seq };
    events.push(event);
  }

  // 2차: 최종 상태를 담은 재개용 엔진 + 로그 시드 + 증강 재설치
  const game = createStandardGameFromState(state, undefined, extraAugments, events);
  rebuildAugments(game.engine, game.augments, { yaku: game.yaku });
  return { game, eventCount: events.length };
}

/** 리플레이 파일을 동기로 읽어 재구성한다 (resume 트리거는 레이스 방지를 위해 동기 처리) */
export function reconstructGameFromFile(
  path: string,
  extraAugments?: readonly AugmentDef[],
): ResumeReconstruction {
  const text = readFileSync(path, "utf-8");
  return reconstructGame(text.split(/\r?\n/), extraAugments);
}
