/**
 * replayRebuild — 서버가 보내준 리플레이 JSONL 라인을 클라이언트에서
 * 순수 Reducer로 재적용해 국면(스냅샷) 시퀀스를 만든다.
 *
 * 서버 ReplayReader와 동일한 절차 (결정론 보장):
 * __init__ → createInitialGameState → 이벤트 순차 dispatch,
 * AugmentDrafted 시 해당 증강 install (새 이벤트 타입 Reducer 등록).
 *
 * 설계: docs/12_NETWORK_REPLAY.md §5, docs/15_ACCOUNTS_SITE.md §4
 */

import {
  AUGMENT_DRAFTED,
  ROUND_STARTED,
  SPECTATOR_ID,
  buildPlayerView,
  createInitialGameState,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type {
  GameConfig,
  GameEvent,
  GameState,
  InitialStateOptions,
  PlayerId,
  PlayerView,
  StandardGame,
} from "@majak/core";
import { contentAugments } from "@majak/content";

export interface RebuiltReplay {
  game: StandardGame;
  /** states[i] = i번째 이벤트까지 적용된 상태 (states[0] = 초기) */
  states: GameState[];
  events: GameEvent[];
  /** 각 국이 시작되는 이벤트 인덱스 (국 점프 내비게이션용) */
  roundStarts: number[];
  /** 증강 카탈로그 (id → 이름·등급·설명) — 서버 catalog 메시지와 동일 정보 */
  catalog: Record<string, { id: string; tier: string; name: string; description: string }>;
}

export function rebuildReplay(lines: string[]): RebuiltReplay {
  if (lines.length === 0) throw new Error("빈 리플레이입니다");
  const init = JSON.parse(lines[0]!) as {
    type: string;
    payload: { config: GameConfig; options: InitialStateOptions };
  };
  if (init.type !== "__init__") throw new Error("리플레이 형식 오류 (__init__ 없음)");

  let state = createInitialGameState(init.payload.config, init.payload.options);
  const game = createStandardGameFromState(state, undefined, contentAugments);

  const states: GameState[] = [state];
  const events: GameEvent[] = [];
  const roundStarts: number[] = [];

  for (const line of lines.slice(1)) {
    const event = JSON.parse(line) as GameEvent;
    state = game.engine.reducers.dispatch(state, event);
    state = { ...state, lastEventSeq: event.seq };
    if (event.type === AUGMENT_DRAFTED) {
      const p = event.payload as { player: PlayerId; augmentId: string };
      const def = game.augments.get(p.augmentId);
      if (def !== undefined) {
        installAugment(game.engine, def, p.player, { yaku: game.yaku });
      }
    }
    events.push(event);
    states.push(state);
    if (event.type === ROUND_STARTED) roundStarts.push(events.length);
  }

  const catalog: RebuiltReplay["catalog"] = {};
  for (const a of game.augments.all()) {
    catalog[a.id] = { id: a.id, tier: a.tier, name: a.name, description: a.description };
  }

  return { game, states, events, roundStarts, catalog };
}

/** i번째 스냅샷의 관전자(전체 공개) 뷰 */
export function replayViewAt(replay: RebuiltReplay, index: number): PlayerView {
  const state = replay.states[Math.max(0, Math.min(index, replay.states.length - 1))]!;
  return buildPlayerView(state, SPECTATOR_ID, replay.game.engine.rules);
}
