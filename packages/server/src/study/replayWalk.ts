/**
 * replayWalk — 리플레이를 되감으며 **결정 지점**을 하나씩 돌려준다.
 *
 * ## 왜 필요한가
 *
 * 리플레이(`replays/*.jsonl`)에는 사람이 실제로 둔 수가 1,200판·14만 장 넘게 쌓여
 * 있다. 그런데 기록에는 «무엇을 골랐나»만 있고 «무엇을 고를 수 있었나»는 없다 —
 * 리치를 걸 수 있었는데 안 건 순, 펑을 부를 수 있었는데 흘린 버림패는 파일에 한
 * 줄도 남지 않는다. 그 «고를 수 있었던 것»이 있어야 사람의 판단을 봇의 판단과
 * 같은 자리에서 견줄 수 있다.
 *
 * 그래서 리듀서로 상태를 한 이벤트씩 되살리며(`ReplayReader`와 같은 길), 결정이
 * 필요한 페이즈(`turn.act`·`reaction`)마다 `FlowController.peekPrompts`로 그 시점의
 * 프롬프트를 다시 세운다. 그 프롬프트에 **실제로 둔 수**를 이어 붙인 것이 결정 지점이다.
 *
 * ## 무엇을 돌려주는가
 *
 * 결정 지점 하나 = 그 자리의 뷰(`PlayerView`, 그 사람이 본 것) + 고를 수 있었던
 * 옵션 + 실제로 고른 옵션. 봇이든 사람이든 같은 형태다. 사람의 것은 학습 대상이고,
 * 봇의 것은 «그 봇이 그때 그렇게 둔 이유»를 되짚는 회귀 자료다.
 *
 * ## 한계 (정직하게)
 *
 * - 리액션에서 **남에게 진 선언**은 보이지 않는다. 내가 치를 눌렀는데 옆에서 펑이
 *   났으면 기록에는 펑만 남는다. 그런 지점은 `actual = null`로 표시하고 집계에서 뺀다.
 * - 증강이 세운 커스텀 액션은 이벤트 타입으로만 대응한다(액션 타입 ≠ 이벤트 타입인
 *   것도 있다). 그때는 `actual.type`이 옵션 어디에도 없을 수 있고, 집계는 그것을
 *   «증강 발동」으로만 센다.
 * - 옛 파일(2026-07 프로토타입 증강 id)은 증강 정의를 못 찾아 재구성이 실패할 수
 *   있다. 실패한 파일은 건너뛰고 세어 둔다.
 */

import { readFileSync } from "node:fs";
import {
  AUGMENT_DRAFTED,
  FlowController,
  buildPlayerView,
  createInitialGameState,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  DecisionPrompt,
  GameEvent,
  GameMode,
  GameState,
  PlayerId,
  PlayerView,
  StandardGame,
} from "@majak/core";
import type { ReplayInitLine } from "../ReplayReader.js";

/** 파일 머리의 좌석 정보 (2026-07 말 이전 파일에는 없다) */
export interface SeatMeta {
  nickname: string;
  isBot: boolean;
  archetype?: string | null;
}

export interface DecisionPoint {
  /** 이 결정 직전까지 적용된 마지막 이벤트 seq */
  seq: number;
  player: PlayerId;
  kind: "turn" | "reaction";
  prompt: DecisionPrompt;
  view: PlayerView;
  state: GameState;
  /** 실제로 둔 수. 판별 불가(남에게 진 선언 등)면 null */
  actual: ActionOption | null;
  /** 실제 수가 표준 옵션이 아닌 증강 액션이면 그 이벤트 타입 */
  actualEventType: string;
}

export interface DraftPoint {
  seq: number;
  player: PlayerId;
  stageIndex: number;
  offered: string[];
  picked: string | null;
  state: GameState;
}

export interface ReplayWalkResult {
  mode: GameMode;
  seats: Record<PlayerId, SeatMeta>;
  playerIds: PlayerId[];
  events: GameEvent[];
}

export interface WalkOptions {
  /** 이 좌석들만 결정 지점을 만든다 (뷰 계산이 비싸다). 생략하면 전원 */
  track?: ReadonlySet<PlayerId>;
  onDecision?: (dp: DecisionPoint) => void;
  onDraft?: (dp: DraftPoint) => void;
  /** 국이 끝날 때 (정산 이벤트) */
  onSettled?: (state: GameState, event: GameEvent) => void;
}

const STANDARD_TURN_EVENTS = new Set([
  "TileDiscarded",
  "KanDeclared",
  "WinDeclared",
]);

function actorOf(e: GameEvent): PlayerId | null {
  const p = e.payload as Record<string, unknown>;
  const cand = p["player"] ?? p["caller"] ?? p["winner"];
  return typeof cand === "string" ? (cand as PlayerId) : null;
}

/** 파일 머리를 읽는다 (본문은 건드리지 않는다) */
export function readInit(path: string): { init: ReplayInitLine; lines: string[] } {
  const text = readFileSync(path, "utf-8");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error(`empty replay: ${path}`);
  const init = JSON.parse(lines[0] as string) as ReplayInitLine;
  if (init.type !== "__init__") throw new Error(`no __init__: ${path}`);
  return { init, lines };
}

export function seatsOf(init: ReplayInitLine): Record<PlayerId, SeatMeta> {
  const cfg = init.payload.config as { playerIds: PlayerId[]; playerMeta?: Record<string, SeatMeta> };
  const out: Record<PlayerId, SeatMeta> = {};
  for (const id of cfg.playerIds) {
    const m = cfg.playerMeta?.[id];
    out[id] = m ?? { nickname: id, isBot: true };
  }
  return out;
}

/**
 * 턴 결정의 실제 수를 이벤트에서 찾는다 — 이 사람에게 귀속되는 첫 이벤트.
 * 다른 사람의 이벤트(도라 공개·데이터 세팅 등 시스템 이벤트 포함)는 건너뛴다.
 */
function resolveTurnActual(
  events: readonly GameEvent[],
  from: number,
  actor: PlayerId,
  prompt: DecisionPrompt,
): { actual: ActionOption | null; type: string } {
  for (let i = from; i < events.length && i < from + 40; i++) {
    const e = events[i] as GameEvent;
    if (e.type === "TurnPassed" || e.type === "RoundSettled" || e.type === "TileDrawn") {
      // 자기 순이 끝났는데 귀속 이벤트가 없다 — 판별 불가
      if (e.type === "TileDrawn" && actorOf(e) === actor) continue; // 영상패
      if (e.type === "TileDrawn") break;
      break;
    }
    // 액티브 발동은 `view:<actor>:uses:<증강>` 채널이 줄어드는 것으로 드러난다 —
    // 발동 이벤트가 없는 증강(연금술·물들이기 등)도 이 채널은 반드시 건드린다.
    const usedAug = usesKeyOf(e, actor);
    if (usedAug !== null) return { actual: { type: `augment:${usedAug}`, payload: {} }, type: "AugmentUse" };
    if (actorOf(e) !== actor) continue;
    if (e.type === "AugmentOffered" || e.type === "AugmentDrafted") continue;
    const p = e.payload as Record<string, unknown>;
    if (e.type === "TileDiscarded") {
      const type = p["riichi"] === true ? "riichi" : "discard";
      const tileId = p["tileId"];
      const opt = prompt.options.find(
        (o) => o.type === type && (o.payload as { tileId: unknown }).tileId === tileId,
      );
      return { actual: opt ?? { type, payload: { tileId } }, type: e.type };
    }
    if (e.type === "KanDeclared") {
      const kanKind = p["kanKind"];
      const ids = (p["handTileIds"] as number[]) ?? [];
      if (kanKind === "kan_closed") {
        const opt = prompt.options.find(
          (o) =>
            o.type === "ankan" &&
            JSON.stringify([...((o.payload as { tileIds: number[] }).tileIds)].sort()) ===
              JSON.stringify([...ids].sort()),
        );
        return { actual: opt ?? { type: "ankan", payload: { tileIds: ids } }, type: e.type };
      }
      if (kanKind === "kan_added") {
        const opt = prompt.options.find(
          (o) => o.type === "shouminkan" && (o.payload as { tileId: number }).tileId === ids[0],
        );
        return { actual: opt ?? { type: "shouminkan", payload: { tileId: ids[0] } }, type: e.type };
      }
      // kan_open은 리액션이다 — 턴 프롬프트에서 나올 수 없다
      return { actual: null, type: e.type };
    }
    if (e.type === "WinDeclared") {
      const opt = prompt.options.find((o) => o.type === "win");
      return { actual: opt ?? { type: "win", payload: {} }, type: e.type };
    }
    // 증강 액션 — 뒤따르는 uses 채널로 어느 증강인지 확정한다 (없으면 이벤트 타입만 남긴다)
    for (let j = i + 1; j < events.length && j < i + 12; j++) {
      const aug = usesKeyOf(events[j] as GameEvent, actor);
      if (aug !== null) return { actual: { type: `augment:${aug}`, payload: {} }, type: e.type };
      const t = (events[j] as GameEvent).type;
      if (t === "TileDiscarded" || t === "TurnPassed" || t === "TileDrawn") break;
    }
    return { actual: { type: `augment:?${e.type}`, payload: {} }, type: e.type };
  }
  return { actual: null, type: "" };
}

/** `view:<player>:uses:<증강>` 데이터 세팅이면 그 증강 id, 아니면 null */
export function usesKeyOf(e: GameEvent, player: PlayerId): string | null {
  if (e.type !== "AugmentDataSet") return null;
  const key = (e.payload as { key?: unknown }).key;
  if (typeof key !== "string") return null;
  const prefix = `view:${player}:uses:`;
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const hash = rest.indexOf("#");
  return hash >= 0 ? rest.slice(0, hash) : rest;
}

const STANDARD_TYPES = new Set([
  "discard",
  "riichi",
  "ankan",
  "shouminkan",
  "win",
  "kyushuKyuhai",
  "pon",
  "chi",
  "minkan",
  "pass",
]);
export function isStandardType(t: string): boolean {
  return STANDARD_TYPES.has(t);
}

/**
 * 리액션의 실제 수. 다음 «진행» 이벤트(TurnPassed·TileDrawn·CallMade·KanDeclared·
 * WinDeclared) 하나로 결정된다 — 이 사람의 선언이면 그것, 남의 선언이면 판별 불가,
 * 아무 선언도 없으면 패스.
 */
function resolveReactionActual(
  events: readonly GameEvent[],
  from: number,
  actor: PlayerId,
  prompt: DecisionPrompt,
): { actual: ActionOption | null; type: string } {
  const pass = prompt.options.find((o) => o.type === "pass") ?? { type: "pass", payload: {} };
  for (let i = from; i < events.length && i < from + 40; i++) {
    const e = events[i] as GameEvent;
    if (e.type === "TurnPassed" || e.type === "TileDrawn" || e.type === "RoundSettled") {
      return { actual: pass, type: "pass" };
    }
    if (e.type === "CallMade" || e.type === "KanDeclared" || e.type === "WinDeclared") {
      if (actorOf(e) !== actor) return { actual: null, type: e.type };
      const p = e.payload as Record<string, unknown>;
      if (e.type === "WinDeclared") {
        return { actual: prompt.options.find((o) => o.type === "win") ?? { type: "win", payload: {} }, type: e.type };
      }
      const ids = ((p["handTileIds"] as number[]) ?? []).slice().sort();
      const type = e.type === "KanDeclared" ? "minkan" : (p["meldKind"] === "chi" ? "chi" : "pon");
      const opt = prompt.options.find((o) => {
        if (o.type !== type) return false;
        const pl = o.payload as { tileIds?: number[]; handTileIds?: number[] };
        const mine = (pl.tileIds ?? pl.handTileIds ?? []).slice().sort();
        return JSON.stringify(mine) === JSON.stringify(ids);
      });
      return { actual: opt ?? { type, payload: { tileIds: ids } }, type: e.type };
    }
    if (!isStandardEvent(e.type) && actorOf(e) === actor) {
      // 리액션 자리의 증강 선언 (예: 연못 낚아채기)
      const opt = prompt.options.find((o) => !isStandardType(o.type));
      return { actual: opt ?? { type: e.type, payload: {} }, type: e.type };
    }
  }
  return { actual: null, type: "" };
}

function isStandardEvent(t: string): boolean {
  return (
    STANDARD_TURN_EVENTS.has(t) ||
    t === "TurnPassed" ||
    t === "TileDrawn" ||
    t === "CallMade" ||
    t === "RoundStarted" ||
    t === "RoundSettled" ||
    t === "DoraFlipped" ||
    t === "FuritenMarked" ||
    t === "AugmentDataSet" ||
    t === "AugmentOffered" ||
    t === "AugmentDrafted" ||
    t === "TileKindChanged" ||
    t === "ScoreChanged"
  );
}

/** 리플레이 한 파일을 되감으며 결정 지점을 콜백으로 흘린다. */
export function walkReplay(
  path: string,
  catalog: readonly AugmentDef[],
  opts: WalkOptions,
): ReplayWalkResult {
  const { init, lines } = readInit(path);
  const seats = seatsOf(init);
  const cfg = init.payload.config as { playerIds: PlayerId[]; mode?: GameMode };
  const mode: GameMode = cfg.mode ?? init.payload.hanchan?.mode ?? "hanchan";
  const playerIds = cfg.playerIds;
  const track = opts.track ?? new Set(playerIds);

  let state = createInitialGameState(init.payload.config, init.payload.options);
  const house = {
    ...(init.payload.hanchan?.kuitan !== undefined ? { kuitan: init.payload.hanchan.kuitan } : {}),
    ...(init.payload.hanchan?.openHands !== undefined ? { openHands: init.payload.hanchan.openHands } : {}),
  };
  const game: StandardGame = createStandardGameFromState(state, undefined, catalog, undefined, house);
  const flow = new FlowController(game.engine);

  const events: GameEvent[] = [];
  for (const line of lines.slice(1)) {
    try {
      events.push(JSON.parse(line) as GameEvent);
    } catch {
      break; // 반쯤 써진 마지막 줄
    }
  }

  const draftStage: Record<string, number> = {};
  const emit = (i: number): void => {
    const phase = state.round.phase;
    if (phase !== "turn.act" && phase !== "reaction") return;
    game.engine.restoreState(state);
    const prompts = flow.peekPrompts();
    for (const prompt of prompts) {
      if (!track.has(prompt.player)) continue;
      const kind = phase === "turn.act" ? "turn" : "reaction";
      // 패스밖에 없는 리액션은 결정이 아니다
      if (kind === "reaction" && prompt.options.every((o) => o.type === "pass")) continue;
      const res =
        kind === "turn"
          ? resolveTurnActual(events, i, prompt.player, prompt)
          : resolveReactionActual(events, i, prompt.player, prompt);
      const view = buildPlayerView(state, prompt.player, game.engine.rules);
      opts.onDecision?.({
        seq: i === 0 ? 0 : (events[i - 1] as GameEvent).seq,
        player: prompt.player,
        kind,
        prompt,
        view,
        state,
        actual: res.actual,
        actualEventType: res.type,
      });
    }
  };

  for (let i = 0; i < events.length; i++) {
    const event = events[i] as GameEvent;
    if (opts.onDecision !== undefined && resolvesDecision(state, event)) {
      // 결정 지점은 «그 결정을 해소하는 이벤트» 바로 앞의 상태다 — 버림 앞, 선언 앞,
      // 전원 패스(TurnPassed) 앞. 같은 페이즈에 머무는 시스템 이벤트(데이터 세팅·
      // 도라 공개)는 결정이 아니므로 그 앞에서는 세우지 않는다.
      emit(i);
    }
    if (event.type === "AugmentOffered" && opts.onDraft !== undefined) {
      const p = event.payload as { player: PlayerId; augmentIds: string[] };
      if (track.has(p.player)) {
        const idx = draftStage[p.player] ?? 0;
        draftStage[p.player] = idx + 1;
        // 픽은 뒤따르는 AugmentDrafted
        let picked: string | null = null;
        for (let j = i + 1; j < events.length && j < i + 40; j++) {
          const e = events[j] as GameEvent;
          if (e.type === "AugmentDrafted" && (e.payload as { player: PlayerId }).player === p.player) {
            picked = (e.payload as { augmentId: string }).augmentId;
            break;
          }
          if (e.type === "RoundStarted") break;
        }
        opts.onDraft({ seq: event.seq, player: p.player, stageIndex: idx, offered: p.augmentIds, picked, state });
      }
    }
    state = game.engine.reducers.dispatch(state, event);
    state = { ...state, lastEventSeq: event.seq };
    if (event.type === AUGMENT_DRAFTED) {
      const p = event.payload as { player: PlayerId; augmentId: string };
      const def = game.augments.get(p.augmentId);
      if (def !== undefined) {
        installAugment(game.engine, def, p.player, { yaku: game.yaku, catalog: game.augments });
      }
    }
    if (event.type === "RoundSettled") opts.onSettled?.(state, event);
  }
  return { mode, seats, playerIds, events };
}

/** 이 이벤트가 «지금 상태의 결정»을 해소하는가 */
function resolvesDecision(state: GameState, e: GameEvent): boolean {
  const phase = state.round.phase;
  if (phase === "turn.act") {
    const actor = state.players[state.round.turnSeat]?.id;
    // playerAtSeat: players 배열 순서가 좌석과 다를 수 있으므로 seat 필드로 찾는다
    const seatActor = state.players.find((p) => p.seat === state.round.turnSeat)?.id ?? actor;
    if (usesKeyOf(e, seatActor as PlayerId) !== null) return true;
    if (actorOf(e) !== seatActor) return false;
    if (STANDARD_TURN_EVENTS.has(e.type)) return true;
    return !isStandardEvent(e.type);
  }
  if (phase === "reaction") {
    if (e.type === "TurnPassed" || e.type === "TileDrawn" || e.type === "RoundSettled") return true;
    if (e.type === "CallMade" || e.type === "KanDeclared" || e.type === "WinDeclared") return true;
    return !isStandardEvent(e.type) && actorOf(e) !== null;
  }
  return false;
}
