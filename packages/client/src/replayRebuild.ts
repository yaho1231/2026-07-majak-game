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
  buildSpectateSeatScores,
  createInitialGameState,
  createStandardGameFromState,
  handZone,
  initialHandGrades,
  installAugment,
  refreshHandGrades,
  uraIndicatorIds,
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
  SpectateInsightMessage,
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
    /*
     * **한 줄이 깨져도 판 전체를 잃지 않는다** — 서버 `ReplayReader`와 같은 정책이다.
     *
     * 리플레이 파일은 프로세스가 사는 동안 계속 append되고, 서버가 SIGKILL로 죽으면
     * 마지막 write가 중간에서 끊긴다. 예전에는 여기 `try/catch`가 하나도 없어서 그
     * 한 줄에 `rebuildReplay`가 통째로 throw했고, 뷰어는 `JSON.parse` 원문
     * («Unexpected end of JSON input»)만 띄웠다 — 서버가 비정상 종료했다가 감시자가
     * 되살린 판, 즉 **가장 다시 보고 싶은 판**이 정확히 안 열렸다.
     * 마지막 한 수를 잃는 것과 40분을 잃는 것 중 하나를 고르는 문제라, 거기서 끊고
     * 지금까지 복원한 것을 돌려준다.
     *
     * 리듀서 예외(`dispatch`)도 같이 받는다: 클라이언트는 서버와 달리 콘텐츠 버전이
     * 어긋난 채로 옛 판을 열 수 있어, 모르는 이벤트 하나에 판 전체가 닫혔다.
     */
    let event: GameEvent;
    try {
      event = JSON.parse(line) as GameEvent;
    } catch {
      console.warn(`[replay] 줄이 온전하지 않다 — ${events.length}개 이벤트까지만 되살린다`);
      break;
    }
    try {
      state = game.engine.reducers.dispatch(state, event);
    } catch (err) {
      console.warn(
        `[replay] 이벤트를 되살리지 못했다(${String(event.type)}) — ${events.length}개까지만 보여 준다`,
        err,
      );
      break;
    }
    state = { ...state, lastEventSeq: event.seq };
    if (event.type === AUGMENT_DRAFTED) {
      const p = event.payload as { player: PlayerId; augmentId: string };
      const def = game.augments.get(p.augmentId);
      if (def !== undefined) {
        // 설치 실패도 판을 닫을 이유는 아니다 — 그 증강이 만든 이벤트에서 위
        // dispatch 가 멈추고 «여기까지»로 물러난다.
        try {
          installAugment(game.engine, def, p.player, { yaku: game.yaku });
        } catch (err) {
          console.warn(`[replay] 증강 설치 실패(${p.augmentId})`, err);
        }
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
    /*
     * **뒷도라도 함께 싣는다** (QA 2차 lobby 확정 5).
     *
     * 예전에는 `uraDoraIndicators: []` 를 고정으로 넣었다. 그래서 리치로 화료한 국을
     * 다시 볼 때 역 목록에는 「뒷도라 2판」이 뜨는데 그 두 장이 화면에 없었다 —
     * 점수의 절반을 설명하는 근거가 정확히 그 자리에서 빈다. 바로 위 표도라 블록의
     * 주석이 반대 방향의 같은 문제를 이미 적어 두었다.
     *
     * 생방과 **같은 함수·같은 입력**을 쓴다: `HanchanController`도 화료 때
     * `uraIndicatorIds(state)`로 뽑는다. 화료가 아닌 국에는 뒷도라가 없다.
     */
    const ura = settle.outcome === "win" ? [...uraIndicatorIds(before)] : [];
    for (const id of ura) add(id);
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
        uraDoraIndicators: ura,
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

/**
 * i번째 스냅샷의 **관전 보조값** — 생방 도크가 받는 `spectateInsight`와 같은 모양.
 *
 * 리플레이 도크는 여태 이 값을 한 번도 받지 못했다: 생방에서는 서버가 매 뷰마다
 * 계산해 실어 주는데, 리플레이는 클라이언트가 이벤트를 되돌려 판만 그렸다. 그래서
 * 좌석 분석이 «분석값을 기다리는 중»에서 영영 멈추고 위험패·오름패 구획도 비었다
 * (2026-09-11 사용자 보고: 「리플레이에서 도크가 거의 작동 안 한다」).
 *
 * 되살린 상태에는 코어 엔진(규칙·역 등록부)이 그대로 있으므로 **생방과 같은 함수**
 * (`buildSpectateSeatScores`)로 확정값을 낸다 — 샹텐·도라·텐파이 타점·오름패·
 * 배패 점수·지금 손패 점수까지 전부. 서버만 가진 두 가지는 여기 없다:
 *   - 노텐 좌석의 «추정» 타점(봇 값어치 모형) — 그 줄이 비는 것뿐이다.
 *   - 봇 눈의 위험도 색칠(`danger`) — 「쏘이는 패」(채점기의 사실)는 오름패로 되살아난다.
 *
 * 배패 점수는 그 국의 **배패가 끝난 첫 프레임**에서 재고(생방의 `initialHandGrades`와
 * 같은 자리), 교환 증강으로 손이 갈린 좌석만 `refreshHandGrades`로 다시 잰다.
 */
export function replayInsightAt(replay: RebuiltReplay, index: number): SpectateInsightMessage | null {
  const at = Math.max(0, Math.min(index, replay.states.length - 1));
  const state = replay.states[at]!;
  const { rules } = replay.game.engine;
  // 이 프레임이 속한 국의 시작 → 네 좌석 손패가 다 들어온 첫 프레임을 찾는다
  let start = 0;
  for (const r of replay.roundStarts) {
    if (r <= at) start = r;
    else break;
  }
  let dealt = start;
  while (dealt <= at) {
    const s = replay.states[dealt]!;
    if (s.players.every((p) => (s.zones[handZone(p.id)]?.tileIds.length ?? 0) >= 13)) break;
    dealt++;
  }
  try {
    const hg = initialHandGrades(replay.states[Math.min(dealt, at)]!, rules);
    refreshHandGrades(state, rules, hg);
    const seats = buildSpectateSeatScores(state, rules, replay.game.yaku, hg.grades, () => false, hg.regraded);
    return {
      type: "spectateInsight",
      seats: seats.map((s) => ({
        ...s,
        han: s.best?.han ?? 0,
        fu: s.best?.fu ?? 0,
        points: s.best?.points ?? 0,
      })),
    };
  } catch (err) {
    console.warn("[replay] 관전 보조값 계산 실패 — 판만 그린다", err);
    return null;
  }
}
