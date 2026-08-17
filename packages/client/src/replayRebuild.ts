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
  ROUND_SETTLED,
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
  PublicTileView,
  RoundOverMessage,
  RoundSettledPayload,
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

/**
 * 국마다의 정산을 결과 화면이 그대로 읽을 수 있는 모양으로 뽑는다.
 *
 * 리플레이 뷰어는 판과 재생 바만 그려서, 역·판·부·증감을 되짚을 수 없었다 — 그 국에
 * 무슨 일이 있었는지가 리플레이의 요점인데도 그랬다. 정산 payload는 이벤트 로그에
 * 그대로 있으므로 도라 표시패와 참조 패만 곁들이면 결과 화면을 재사용할 수 있다.
 *
 * `revealedHands`는 비운다 — 손패 복원은 화료 시점의 리치 스냅샷·증강 변형까지 따라가야
 * 해서 여기서 흉내 내면 틀린 손을 보여 주게 된다. 리플레이는 그 프레임의 판을 이미
 * 전부 공개로 그리고 있으므로, 손은 판에서 보고 숫자는 이 패널에서 본다.
 */
export function replaySettlements(replay: RebuiltReplay): {
  /** 이 정산이 일어난 이벤트 인덱스 (states 기준) */
  index: number;
  label: string;
  result: RoundOverMessage;
}[] {
  const out: ReturnType<typeof replaySettlements> = [];
  replay.events.forEach((event, i) => {
    if (event.type !== ROUND_SETTLED) return;
    // 정산 **직전** 상태가 그 국의 판이다 — payload는 이미 다음 국을 가리킨다.
    const before = replay.states[i];
    if (before === undefined) return;
    const settle = event.payload as RoundSettledPayload;
    const tiles: Record<number, PublicTileView> = {};
    const add = (id: number): void => {
      const t = before.tiles[id];
      if (t !== undefined) tiles[id] = { id, kind: t.kind, attrs: t.attrs };
    };
    const dora = [...before.round.doraIndicators];
    for (const id of dora) add(id);
    for (const w of settle.winInfos ?? []) add(w.winningTileId);
    out.push({
      index: i + 1,
      label: `${WIND_KO[before.round.prevalentWind - 1] ?? "?"}${before.round.roundNumber}국${
        before.round.honba > 0 ? ` ${before.round.honba}본장` : ""
      }`,
      result: {
        type: "roundOver",
        outcome: settle.outcome,
        settle,
        doraIndicators: dora,
        uraDoraIndicators: [],
        tiles,
        revealedHands: {},
      },
    });
  });
  return out;
}

/** 국 이름 표기 — 리플레이 목록에서만 쓴다(대국 화면은 한자 표기를 쓴다) */
const WIND_KO = ["동", "남", "서", "북"];

/** i번째 스냅샷의 관전자(전체 공개) 뷰 */
export function replayViewAt(replay: RebuiltReplay, index: number): PlayerView {
  const state = replay.states[Math.max(0, Math.min(index, replay.states.length - 1))]!;
  return buildPlayerView(state, SPECTATOR_ID, replay.game.engine.rules);
}
