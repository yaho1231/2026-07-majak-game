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
  hanchanConfigForMode,
  installAugment,
  rebuildAugments,
  DEFAULT_HANCHAN_CONFIG,
} from "@majak/core";
import type {
  AugmentDef,
  GameConfig,
  GameEvent,
  GameState,
  InitialStateOptions,
  PlayerId,
  ProcessorOptions,
  ResumableHanchanConfig,
  StandardGame,
} from "@majak/core";

export interface ReplayInitLine {
  type: "__init__";
  payload: {
    config: GameConfig;
    options: InitialStateOptions;
    /**
     * 이어하기가 읽는 진행 설정 (우마·오카·서입·드래프트 스케줄 등).
     *
     * **없을 수 있다** — 2026-08-18 이전에 시작된 판의 파일에는 이 필드가 없다.
     * 그때는 모드에서 한 벌을 다시 만든다(`hanchanConfigForMode`). 우마·오카가
     * 기본값이 아닌 방을 운영한 적이 없으므로 그 복원은 정확하다.
     */
    hanchan?: ResumableHanchanConfig;
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

// ─────────────────────────── 이어하기(resume) 재구성 ───────────────────────────

/*
 * 이 블록은 2026-08-12에 **일부러 들어냈다가** 2026-08-18에 되살린 것이다.
 *
 * 들어낸 이유는 "배선되지 않은 미완성 기능"이었다 — 구현도 테스트도 있었지만
 * 프로덕션 호출자가 한 번도 없었고, 켜려면 다섯 가지가 선행돼야 했다. 그 다섯
 * 가지를 이번에 전부 채웠으므로(감사 §2-10, 사용자 결정 "완전 이어하기"),
 * 무엇을 어떻게 채웠는지 여기 남긴다. 다음에 이 자리를 의심하는 사람이 있으면
 * 이 목록부터 확인하면 된다.
 *
 *   1. 리플레이 `__init__`에 `HanchanConfig`가 없었다
 *      → `resumableHanchanConfig`가 우마·오카·서입·`draftSchedules`를 싣는다.
 *        옛 파일에는 없으므로 모드에서 되만든다(`resumeConfigOf`).
 *   2. `setWeightOverrides`를 안 불러 정적 티어표로 드래프트했다
 *      → 재개 쪽(`RoomManager.restoreLiveGames`)이 살아 있는 실적 가중치를 건다.
 *        **파일에 굳혀 담지 않는다** — 티어는 20판마다 움직이는 값이라, 재개한
 *        판만 몇 시간 전 표를 쓰는 편이 오히려 어긋난다.
 *   3. `processor: { onEffectError }`가 안 실려 증강 훅 예외가 조용히 사라졌다
 *      → `reconstructGame(… , { processor })`로 받는다.
 *   4. `ReplayWriter`에 append 모드가 없고 `StatsTracker`가 빈 상태로 시작했다
 *      → 같은 파일을 이어 쓴다(`ReplayWriter.reopen`), 통계는 읽은 줄을 그대로
 *        `tracker.consume`에 다시 먹여 되세운다(그 메서드의 계약이다).
 *   5. 방·좌석이 어디에도 영속되지 않았다
 *      → `live_games` 테이블(SiteDb). 좌석 이름·봇 여부·원형까지 담는다.
 */

export interface ResumeReconstruction {
  /** 최종 상태 + 증강 재설치 + 로그 시드까지 끝나 바로 이어 돌릴 수 있는 게임 */
  game: StandardGame;
  /** 재구성에 사용한 확정 이벤트 수 (= 엔진 로그 시드 길이) */
  eventCount: number;
  /** 이 판의 진행 설정 (파일에 없으면 모드에서 되만든 것) */
  hanchan: ResumableHanchanConfig;
  /** 읽은 이벤트 줄 원본 — 누적 통계(StatsTracker)를 되세우는 데 그대로 쓴다 */
  eventLines: string[];
}

/** `__init__`에 진행 설정이 없는 옛 파일을 위해 모드에서 한 벌을 되만든다. */
function resumeConfigOf(init: ReplayInitLine): ResumableHanchanConfig {
  const saved = init.payload.hanchan;
  if (saved !== undefined) return saved;
  const mode = init.payload.config.mode ?? "hanchan";
  return {
    ...DEFAULT_HANCHAN_CONFIG,
    ...hanchanConfigForMode(mode),
    startScore: init.payload.options.startScore ?? DEFAULT_HANCHAN_CONFIG.startScore,
    ...(init.payload.options.redFivesPerSuit !== undefined
      ? { redFivesPerSuit: init.payload.options.redFivesPerSuit }
      : {}),
  };
}

/**
 * 리플레이 JSONL 라인들로 "이어 돌릴 수 있는" StandardGame을 재구성한다 (동기).
 *
 * 1) 리듀서로 최종 GameState를 재구성한다 (PRNG·왕패·손패 전부 상태에 담김).
 * 2) 그 최종 상태로 엔진을 만들고 로그를 과거 이벤트로 시드한다 (새 이벤트만 append).
 * 3) state.players[].augments 기준으로 증강 효과를 재설치한다 (rebuildAugments).
 *
 * 이후 HanchanController.resume(game)이 FlowController로 현재 페이즈에서 이어간다.
 *
 * **동기인 이유**: 재개는 부팅 중 한 번, 방을 만들기 **전에** 끝나야 한다. 중간에
 * await가 끼면 그 틈에 같은 코드의 방이 새로 생기거나 사람이 붙을 수 있다.
 */
export function reconstructGame(
  lines: readonly string[],
  opts: {
    extraAugments?: readonly AugmentDef[];
    /** 증강 훅 예외를 남길 곳 — 없으면 격리는 되지만 흔적이 사라진다 */
    processor?: ProcessorOptions;
  } = {},
): ResumeReconstruction {
  const clean = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (clean.length === 0) throw new Error("Replay is empty");
  const init = JSON.parse(clean[0] as string) as ReplayInitLine;
  if (init.type !== "__init__") throw new Error("Replay first line must be __init__");
  const extraAugments = opts.extraAugments;

  // 1차: 임시 게임의 리듀서로 최종 상태를 계산 (엔진 상태는 건드리지 않는다)
  let state = createInitialGameState(init.payload.config, init.payload.options);
  const tmp = createStandardGameFromState(state, undefined, extraAugments);
  const events: GameEvent[] = [];
  const eventLines: string[] = [];
  for (const line of clean.slice(1)) {
    /*
     * **마지막 줄이 반만 써져 있을 수 있다.**
     *
     * 이 파일은 프로세스가 살아 있는 동안 계속 append되며, 서버가 SIGKILL로
     * 죽으면 마지막 write가 중간에서 끊긴다. 그 한 줄에서 던지면 **판 전체를**
     * 못 되살린다 — 마지막 한 수를 잃는 것과 40분을 잃는 것 중 하나를 고르는
     * 문제다. 거기서 끊고 지금까지의 상태로 이어간다.
     *
     * 중간 줄이 상하는 경우는 이렇게 조용히 넘기면 안 되지만, append-only
     * 파일에서 그런 일은 디스크가 상했다는 뜻이고 그때는 뒤 줄들도 성하지 않다.
     */
    let event: GameEvent;
    try {
      event = JSON.parse(line) as GameEvent;
    } catch {
      console.warn(
        `[replay] 마지막 줄이 온전하지 않다 — ${events.length}개 이벤트까지만 되살린다`,
      );
      break;
    }
    state = tmp.engine.reducers.dispatch(state, event);
    state = { ...state, lastEventSeq: event.seq };
    // ⚠ readReplay와 같은 규약: 증강은 자기 이벤트 타입의 Reducer를 install에서
    // 등록한다(CounterStruck·RecallPerformed 등). 드래프트되는 순간 설치하지 않으면
    // 이후 그 증강이 만든 이벤트에서 "No reducer registered"로 재구성이 통째로 죽는다.
    if (event.type === AUGMENT_DRAFTED) {
      const p = event.payload as { player: PlayerId; augmentId: string };
      const def = tmp.augments.get(p.augmentId);
      if (def !== undefined) {
        installAugment(tmp.engine, def, p.player, { yaku: tmp.yaku });
      }
    }
    events.push(event);
    eventLines.push(line);
  }

  // 2차: 최종 상태를 담은 재개용 엔진 + 로그 시드 + 증강 재설치
  const game = createStandardGameFromState(state, opts.processor, extraAugments, events);
  rebuildAugments(game.engine, game.augments, {
    yaku: game.yaku,
    catalog: game.augments,
  });
  return { game, eventCount: events.length, hanchan: resumeConfigOf(init), eventLines };
}

/** 리플레이 파일을 동기로 읽어 재구성한다 (resume 트리거는 레이스 방지를 위해 동기 처리) */
export function reconstructGameFromFile(
  path: string,
  opts: {
    extraAugments?: readonly AugmentDef[];
    processor?: ProcessorOptions;
  } = {},
): ResumeReconstruction {
  const text = readFileSync(path, "utf-8");
  return reconstructGame(text.split(/\r?\n/), opts);
}
