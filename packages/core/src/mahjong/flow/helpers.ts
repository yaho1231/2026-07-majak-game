/**
 * flow helpers — GameState에서 채점·판정 입력을 뽑아내는 순수 함수들.
 *
 * 설계: docs/11_GAME_FLOW.md
 */

import { DEAD_WALL, discardsZone, handZone } from "../../engine/zones/Zone.js";
import { DISARMED_SOURCES_KEY } from "../../engine/GameEngine.js";
import type { PlayerId } from "../../engine/zones/Zone.js";
import type { GameState, PlayerState } from "../../engine/state/GameState.js";
import type { RuleRegistry } from "../../engine/rules/RuleRegistry.js";
import { kindKey } from "../tiles/Tile.js";
import type { TileId, TileKind } from "../tiles/Tile.js";
import { doraKindFor } from "../scoring/dora.js";
import { winningKinds } from "../scoring/waits.js";
import { evaluateWin } from "../scoring/evaluate.js";
import type { YakuRegistry } from "../scoring/YakuRegistry.js";
import { DEFAULT_SEQUENCE_SUITS } from "../scoring/decompose.js";
import type { DecomposeOptions } from "../scoring/decompose.js";
import type { MeldInfo, WinContext } from "../scoring/WinContext.js";

/** 시스템 액션 전용 플레이어 id. 서버는 소켓에서 이 id를 절대 받지 않는다 */
export const SYSTEM_PLAYER: PlayerId = "__system";

export function playerOf(state: GameState, id: PlayerId): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (p === undefined) throw new Error(`Unknown player: ${id}`);
  return p;
}

export function playerAtSeat(state: GameState, seat: number): PlayerState {
  const p = state.players.find((x) => x.seat === seat);
  if (p === undefined) throw new Error(`No player at seat: ${seat}`);
  return p;
}

/** @param direction 1=시계(표준), -1=역방향 (turn.direction 규칙) */
export function nextSeat(state: GameState, seat: number, direction = 1): number {
  const n = state.players.length;
  return (((seat + direction) % n) + n) % n;
}

/** 자풍 (1동 2남 3서 4북). direction -1이면 반대 방향으로 바람이 돈다 */
export function seatWindOf(
  state: GameState,
  id: PlayerId,
  direction = 1,
): number {
  const n = state.players.length;
  const diff = playerOf(state, id).seat - state.round.dealerSeat;
  return ((((diff * direction) % n) + n) % n) + 1;
}

export function kindOf(state: GameState, tileId: TileId): TileKind {
  const tile = state.tiles[tileId];
  if (tile === undefined) throw new Error(`Unknown tile: ${tileId}`);
  return tile.kind;
}

export function handIdsOf(state: GameState, id: PlayerId): readonly TileId[] {
  return state.zones[handZone(id)]?.tileIds ?? [];
}

export function handKindsOf(state: GameState, id: PlayerId): TileKind[] {
  return handIdsOf(state, id).map((t) => kindOf(state, t));
}

/**
 * 화료·대기·후리텐·텐파이 판정에 쓸 '손패' 타일 id.
 * 기본은 실제 손패지만, 규칙 `hand.winTileIds`가 대체 목록(TileId[])을 주면 그걸 쓴다.
 * (자유 선언: 리치 시점의 손패를 스냅샷으로 고정 — 이후 물리 손패를 자유롭게 버려도
 *  대기·화료형은 첫 리치 손패로 판정한다.) rules가 없거나 override가 null이면 실제 손패.
 */
export function winHandIdsOf(
  state: GameState,
  rules: RuleRegistry | undefined,
  id: PlayerId,
): readonly TileId[] {
  if (rules !== undefined && rules.has("hand.winTileIds")) {
    const override = rules.resolve<readonly TileId[] | null>("hand.winTileIds", {
      playerId: id,
      state,
    });
    if (override != null) return override;
  }
  return handIdsOf(state, id);
}

export function winHandKindsOf(
  state: GameState,
  rules: RuleRegistry | undefined,
  id: PlayerId,
): TileKind[] {
  return winHandIdsOf(state, rules, id).map((t) => kindOf(state, t));
}

export function meldInfosOf(state: GameState, id: PlayerId): MeldInfo[] {
  const rs = state.round.byPlayer[id];
  return (rs?.melds ?? []).map((m) => ({
    kind: m.kind,
    tiles: m.tileIds.map((t) => kindOf(state, t)),
    ...(m.silent === true ? { silent: true } : {}),
  }));
}

export function meldCountOf(state: GameState, id: PlayerId): number {
  return state.round.byPlayer[id]?.melds.length ?? 0;
}

/**
 * 노출 후로 개수. 안깡(kan_closed)은 멘젠을 깨지 않으므로 제외한다.
 * 리치 등 "닫힌 손" 판정에 사용한다(채점의 isClosed와 동일 규칙).
 */
export function openMeldCountOf(state: GameState, id: PlayerId): number {
  return (
    state.round.byPlayer[id]?.melds.filter(
      (m) => m.kind !== "kan_closed" && m.silent !== true,
    ).length ?? 0
  );
}

/**
 * scoring.* 규칙 → 분해 옵션. 증강이 만든 채점 변형(순환 슌쯔, 5멘쯔,
 * 후로 국사)을 모든 판정 지점(화료·텐파이·후리텐·대기)에 일관 적용한다.
 */
export function scoringOptionsOf(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
): DecomposeOptions {
  const ctx = { playerId: player, state };
  const opts: DecomposeOptions = {};
  if (rules.has("scoring.wrapRuns") && rules.resolve<boolean>("scoring.wrapRuns", ctx)) {
    opts.wrapRuns = true;
  }
  if (
    rules.has("scoring.mixedRuns") &&
    rules.resolve<boolean>("scoring.mixedRuns", ctx)
  ) {
    opts.mixedRuns = true;
  }
  if (
    rules.has("scoring.mixedTriplets") &&
    rules.resolve<boolean>("scoring.mixedTriplets", ctx)
  ) {
    opts.mixedTriplets = true;
  }
  if (
    rules.has("scoring.mixedPairs") &&
    rules.resolve<boolean>("scoring.mixedPairs", ctx)
  ) {
    opts.mixedPairs = true;
  }
  if (rules.has("scoring.totalSets")) {
    const totalSets = rules.resolve<number>("scoring.totalSets", ctx);
    if (totalSets !== 4) opts.totalSets = totalSets;
  }
  if (rules.has("scoring.kokushiDupes")) {
    const dupes = rules.resolve<number>("scoring.kokushiDupes", ctx);
    if (dupes > 0) opts.kokushiDupes = dupes;
  }
  if (
    rules.has("scoring.polarEnds") &&
    rules.resolve<boolean>("scoring.polarEnds", ctx)
  ) {
    opts.polarEnds = true;
  }
  if (
    rules.has("scoring.chiitoiMixedPairs") &&
    rules.resolve<boolean>("scoring.chiitoiMixedPairs", ctx)
  ) {
    opts.chiitoiMixedPairs = true;
  }
  if (
    rules.has("scoring.honorRuns") &&
    rules.resolve<boolean>("scoring.honorRuns", ctx)
  ) {
    opts.honorRuns = true;
  }
  /**
   * 조커 — 이 종류의 패는 손패에서 무엇이든 될 수 있다. 화료·텐파이·대기·후리텐이
   * 전부 이 옵션 하나를 타므로, 규칙에 실어 두면 판정 지점마다 손댈 것이 없다.
   */
  if (rules.has("scoring.wildKinds")) {
    const wild = rules.resolve<readonly TileKind[]>("scoring.wildKinds", ctx);
    if (wild.length > 0) opts.wildKinds = wild;
  }
  if (
    rules.has("scoring.kokushiMeldAssist") &&
    rules.resolve<boolean>("scoring.kokushiMeldAssist", ctx)
  ) {
    const melds = state.round.byPlayer[player]?.melds ?? [];
    // 울어 국사 특수 후로(서로 다른 요구패 3장)의 모든 kind를 국사 덮개로 넘긴다
    opts.kokushiMeldKinds = melds
      .filter((m) => m.kind === "kokushi_pon")
      .flatMap((m) => m.tileIds.map((id) => kindOf(state, id)));
    // 특수 퐁을 한 순간 국사 외의 길은 닫힌다 — 안 막으면 남은 손패가 표준형
    // 텐파이로 잡혀 "69삭 양면"이 오름패가 된다(국사는 13종 + 1장이어야 한다).
    if (opts.kokushiMeldKinds.length > 0) opts.kokushiOnly = true;
  }
  return opts;
}

/**
 * 후로(치·펑) 판정에서 "같은 패로 볼 것인가".
 * - 동수의 결속(scoring.mixedTriplets): 무늬를 안 가리고 **랭크만** 본다 (2만·2통·2삭이 한 펑).
 * - 양극(scoring.polarEnds, polarEnds=true): 같은 무늬의 1·9를 동일 패로 본다 —
 *   199·191·911이 한 펑이 된다(퐁 한정, 깡은 4장 도라·영상 규약과 충돌해 제외).
 * 자패는 무늬 개념이 없어 언제나 동일 kind만 인정한다.
 */
export function sameCallKind(
  a: TileKind,
  b: TileKind,
  mixedTriplets: boolean,
  polarEnds = false,
): boolean {
  const numbered = (k: TileKind): boolean =>
    k.suit === "man" || k.suit === "pin" || k.suit === "sou";
  if (numbered(a) && numbered(b)) {
    if (mixedTriplets && a.rank === b.rank) return true;
    // 양극: 같은 무늬의 노두패(1·9)는 서로 같은 패로 통한다
    const isTerminal = (r: number): boolean => r === 1 || r === 9;
    if (
      polarEnds &&
      a.suit === b.suit &&
      isTerminal(a.rank) &&
      isTerminal(b.rank)
    ) {
      return true;
    }
  }
  return kindKey(a) === kindKey(b);
}

/** 이 사람에게 혼색 커쯔(동수의 결속)가 열려 있는가 — 후로 판정용 */
export function mixedTripletsFor(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
): boolean {
  return (
    rules.has("scoring.mixedTriplets") &&
    rules.resolve<boolean>("scoring.mixedTriplets", { playerId: player, state })
  );
}

/** 이 사람에게 양극(1·9 혼합 커쯔)이 열려 있는가 — 퐁 판정용 */
export function polarEndsFor(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
): boolean {
  return (
    rules.has("scoring.polarEnds") &&
    rules.resolve<boolean>("scoring.polarEnds", { playerId: player, state })
  );
}

/** 이 사람에게 자패 슌쯔(바람의 계보)가 열려 있는가 — 동남서북 깡 판정용 */
export function honorRunsFor(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
): boolean {
  return (
    rules.has("scoring.honorRuns") &&
    rules.resolve<boolean>("scoring.honorRuns", { playerId: player, state })
  );
}

/**
 * 이 네 패가 **동·남·서·북 각 한 장씩**(사풍)인가 — 바람의 계보의 '동남서북 깡' 재료.
 * 자패 바람 suit의 rank 1~4가 정확히 하나씩 있어야 한다.
 */
export function isFourWinds(kinds: readonly TileKind[]): boolean {
  if (kinds.length !== 4) return false;
  const ranks = new Set<number>();
  for (const k of kinds) {
    if (k.suit !== "wind" || k.rank < 1 || k.rank > 4) return false;
    ranks.add(k.rank);
  }
  return ranks.size === 4;
}

/** 이 사람에게 장사진(4연속 깡)이 열려 있는가 */
export function snakeKanFor(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
): boolean {
  return (
    rules.has("call.snakeKan") &&
    rules.resolve<boolean>("call.snakeKan", { playerId: player, state })
  );
}

/**
 * 이 네 패가 **같은 수패 무늬의 연속 4장**(예: 3-4-5-6)인가 — 장사진의 '4연속 깡' 재료.
 * 자패는 순서 개념이 없으므로 제외한다(자패 4연속은 바람의 계보의 동남서북 깡이 담당).
 */
export function isRunQuad(kinds: readonly TileKind[]): boolean {
  if (kinds.length !== 4) return false;
  const suit = kinds[0]?.suit;
  if (suit === undefined || !DEFAULT_SEQUENCE_SUITS.has(suit)) return false;
  if (!kinds.every((k) => k.suit === suit)) return false;
  const ranks = [...kinds.map((k) => k.rank)].sort((a, b) => a - b);
  return ranks.every((r, i) => i === 0 || r === (ranks[i - 1] as number) + 1);
}

/**
 * 기본 후리텐: 자기가 버린 적 있는 패에 대기패가 있으면 론 불가.
 * 버림 '이력'(discardedKinds)을 쓴다 — 버림패가 후로로 바닥에서 사라져도
 * 후리텐은 유지된다 (표준 룰).
 */
/**
 * 이 플레이어가 **지금 버릴 수 없는 손패 tileId 집합** (봉인).
 *
 * 두 봉인 규칙을 한 곳에서 합친다:
 * - `discard.blockedKinds` — 종류 단위. 봉인 뒤 새로 들어온 같은 종류도 함께 잠긴다.
 * - `discard.blockedTileIds` — 개별 패 단위. 지목된 그 한 장만 잠기고, 손을 떠나면 풀린다.
 *
 * ⚠ 이건 **원재료**다 — 리치 예외·소프트락 예외를 얹기 전의 "봉인 규칙이 지목한 패".
 * 화면과 판정이 실제로 쓰는 최종 결과는 `lockedDiscardIds`다. 표시 쪽이 이 함수를 직접
 * 쓰다가 자물쇠와 실제 버림 가능 여부가 어긋났다(docs/25 방해 #7).
 */
export function sealedDiscardIds(
  state: GameState,
  rules: RuleRegistry,
  playerId: PlayerId,
  hand: readonly TileId[] = handIdsOf(state, playerId),
): Set<TileId> {
  const out = new Set<TileId>();
  if (rules.has("discard.blockedKinds")) {
    const kinds = new Set(
      rules.resolve<string[]>("discard.blockedKinds", { playerId, state }),
    );
    if (kinds.size > 0) {
      for (const id of hand) {
        if (kinds.has(kindKey(kindOf(state, id)))) out.add(id);
      }
    }
  }
  if (rules.has("discard.blockedTileIds")) {
    for (const id of rules.resolve<TileId[]>("discard.blockedTileIds", {
      playerId,
      state,
    })) {
      if (hand.includes(id)) out.add(id);
    }
  }
  return out;
}

/**
 * **실제로 버릴 수 없는 손패** — 봉인 규칙에 두 예외를 얹은 최종 판정.
 *
 * 버림 액션(`standardActions`의 discard validate)과 화면의 자물쇠 표시(`PlayerView`)가
 * 반드시 이 함수 하나를 쓴다. 예전에는 표시가 `sealedDiscardIds`(원재료)를 그대로 실어,
 * **화면에는 자물쇠가 걸렸는데 실제로는 버려지는 거짓 UI**가 났다(docs/25 방해 #7).
 *
 * 두 예외:
 *  1. **리치 중에는 봉인을 보지 않는다** — 리치는 쯔모패만 버릴 수 있어, 그 위에 봉인까지
 *     걸면 버릴 패가 하나도 없어질 수 있다.
 *  2. **손패가 전부 봉인이면 전부 허용한다** — 소프트락 방지.
 */
export function lockedDiscardIds(
  state: GameState,
  rules: RuleRegistry,
  playerId: PlayerId,
  hand: readonly TileId[] = handIdsOf(state, playerId),
): Set<TileId> {
  if (state.round.byPlayer[playerId]?.riichi != null) return new Set();
  const sealed = sealedDiscardIds(state, rules, playerId, hand);
  if (sealed.size === 0) return sealed;
  // 전부 잠겼으면 잠긴 것이 없는 것과 같다 (그대로 두면 버릴 패가 없다)
  return hand.some((id) => !sealed.has(id)) ? sealed : new Set();
}

export function isFuriten(
  state: GameState,
  id: PlayerId,
  opts?: DecomposeOptions,
  rules?: RuleRegistry,
): boolean {
  const rs = state.round.byPlayer[id];
  if (rs?.temporaryFuriten === true || rs?.riichiFuriten === true) return true;
  const discarded = rs?.discardedKinds ?? [];
  if (discarded.length === 0) return false;
  const waits = winningKinds(
    winHandKindsOf(state, rules, id),
    meldCountOf(state, id),
    undefined,
    opts,
  );
  if (waits.length === 0) return false;
  const waitKeys = new Set(waits.map(kindKey));
  return discarded.some((k) => waitKeys.has(k));
}

/**
 * 형식텐파이(역없음) 판정: 텐파이지만 어떤 오름패로 화료해도 역이 없는가.
 *
 * 열린 손(안깡 외 후로 보유) 전용 개념이다 — 멘젠 손은 리치·멘젠쯔모로
 * 언제든 역을 만들 수 있어 "역없음"이 아니다. 각 대기패로 론 화료를 가상
 * 평가해 하나라도 역이 나면 false, 전부 역이 없으면 true.
 */
export function tenpaiNoYaku(
  state: GameState,
  id: PlayerId,
  rules: RuleRegistry,
  yaku: YakuRegistry,
): boolean {
  const melds = state.round.byPlayer[id]?.melds ?? [];
  // 안깡(kan_closed)·묵계(silent)는 손을 열지 않는다 — 그 외 후로가 있어야 열린 손
  const isOpen = melds.some((m) => m.kind !== "kan_closed" && m.silent !== true);
  if (!isOpen) return false;
  const opts = scoringOptionsOf(state, rules, id);
  const waits = winningKinds(handKindsOf(state, id), meldCountOf(state, id), undefined, opts);
  if (waits.length === 0) return false;
  const outside = outsideHandTileFinder(state, rules, id);
  for (const waitKind of waits) {
    const tileId = outside(waitKind);
    if (tileId === undefined) continue; // 그 종류 패가 상태에 없을 순 없지만 방어적으로
    const ev = evaluateWin(buildWinContext(state, id, "ron", tileId, { rules }), yaku);
    if (ev !== null && ev.ok) return false; // 하나라도 역이 나면 형식텐파이 아님
  }
  return true;
}

/**
 * 가상 화료 평가에 쓸 "손패 **밖**의 그 종류 실물 패"를 찾아 주는 함수를 만든다.
 *
 * ⚠ 화료패 tileId가 손 안에 있으면 buildWinContext가 그 패를 뺐다가 다시 붙여
 * 13장이 되어 **분해가 통째로 실패**한다(51차 함정 ②). 반드시 손 밖에서 골라야 한다.
 */
function outsideHandTileFinder(
  state: GameState,
  rules: RuleRegistry | undefined,
  id: PlayerId,
): (kind: TileKind) => TileId | undefined {
  const inHand = new Set<TileId>([
    ...winHandIdsOf(state, rules, id),
    ...(state.round.byPlayer[id]?.melds ?? []).flatMap((m) => m.tileIds),
  ]);
  const byKind = new Map<string, TileId>();
  for (const key of Object.keys(state.tiles)) {
    const tileId = Number(key) as TileId;
    if (inHand.has(tileId)) continue;
    const k = kindKey(state.tiles[tileId]!.kind);
    if (!byKind.has(k)) byKind.set(k, tileId);
  }
  return (kind) => byKind.get(kindKey(kind));
}

/**
 * 지금 손으로 **론이 성립하지 않는**(역이 없는) 대기패 종류(kindKey) 목록.
 *
 * "오름패인 줄 알고 기다렸는데 역이 없어 못 먹는" 상황을 화면에서 미리 알려 주기 위한 정보다.
 * 형식텐파이(tenpaiNoYaku)가 손 전체를 보는 것과 달리 **대기패 하나하나**를 판정한다.
 * 리치 중이면 리치가 역이 되므로 자연히 빈 목록이 된다.
 */
export function yakulessWaits(
  state: GameState,
  id: PlayerId,
  rules: RuleRegistry,
  yaku: YakuRegistry,
): string[] {
  const opts = scoringOptionsOf(state, rules, id);
  const waits = winningKinds(
    winHandKindsOf(state, rules, id),
    meldCountOf(state, id),
    undefined,
    opts,
  );
  if (waits.length === 0) return [];
  const outside = outsideHandTileFinder(state, rules, id);
  const out: string[] = [];
  for (const waitKind of waits) {
    const tileId = outside(waitKind);
    if (tileId === undefined) continue;
    const ev = evaluateWin(buildWinContext(state, id, "ron", tileId, { rules }), yaku);
    if (ev === null || !ev.ok) out.push(kindKey(waitKind));
  }
  return out;
}

/**
 * 증강이 이 사람에게만 얹는 개인 도라 종류 (규칙이 없거나 값이 이상하면 빈 배열).
 * `rules`가 없는 경로(테스트용 최소 문맥)에서는 개인 도라도 없다.
 */
function extraDoraKinds(
  state: GameState,
  rules: RuleRegistry | undefined,
  winner: PlayerId,
  rule: "scoring.extraDoraKinds" | "scoring.extraUraDoraKinds",
): TileKind[] {
  if (rules === undefined || !rules.has(rule)) return [];
  const kinds = rules.resolve<readonly TileKind[]>(rule, { playerId: winner, state });
  return Array.isArray(kinds) ? [...kinds] : [];
}

/** 공개된 도라 표시패의 바로 다음 왕패가 뒷도라 표시패 (07 §2 규약) */
export function uraIndicatorIds(state: GameState): TileId[] {
  const deadWall = state.zones[DEAD_WALL]?.tileIds ?? [];
  const ura: TileId[] = [];
  for (const indicator of state.round.doraIndicators) {
    const idx = deadWall.indexOf(indicator);
    const uraId = idx >= 0 ? deadWall[idx + 1] : undefined;
    if (uraId !== undefined) ura.push(uraId);
  }
  return ura;
}

export interface BuildWinContextOptions {
  includeUra?: boolean;
  /**
   * 규칙 레지스트리 — 넘기면 winnerId·blockedYaku·분해 옵션·턴 방향까지
   * 채워진 완전한 문맥을 만든다 (증강 연동 경로).
   */
  rules?: RuleRegistry;
  /**
   * 론일 때 쏜 사람. 정산(sys.settleWin)은 이 값을 알고 있으므로 그대로 넘긴다.
   * 생략하면 창깡 선언자 → 마지막 버림자 순으로 상태에서 유도한다.
   */
  from?: PlayerId;
}

export function buildWinContext(
  state: GameState,
  winner: PlayerId,
  winType: "tsumo" | "ron",
  winningTileId: TileId,
  options: BuildWinContextOptions = {},
): WinContext {
  const winKind = kindOf(state, winningTileId);
  const rs = state.round.byPlayer[winner];
  const melds = meldInfosOf(state, winner);
  const wallEmpty = (state.zones["wall"]?.tileIds.length ?? 0) === 0;

  // 채점용 손패 id — 자유 선언이면 리치 스냅샷, 아니면 실제 손패.
  // 쯔모패(=화료패)는 손패에 섞여 있으므로 제외한 뒤, 화료패를 한 번만 다시 얹어
  // 쯔모·론 모두 "13장 + 화료패 1장" 형태로 통일한다.
  const concealedIds = winHandIdsOf(state, options.rules, winner).filter(
    (id) => id !== winningTileId,
  );
  const hand = [...concealedIds.map((id) => kindOf(state, id)), winKind];

  const handTileIds = [
    ...concealedIds,
    winningTileId,
    ...(rs?.melds ?? []).flatMap((m) => m.tileIds),
  ];
  // 적도라 — 증강이 만들어낸 적도라(attrs.redFor)는 **그것을 만든 사람만** 센다.
  // (붉은 손길로 물들인 5를 버려서 상대가 울어 가면 상대가 이득을 보던 것을 막는다.
  //  패산에서 나온 진짜 적도라는 redFor가 없으므로 누구에게나 그대로 적용된다.)
  const redCount = handTileIds.filter((t) => {
    const attrs = state.tiles[t]?.attrs;
    if (attrs?.red !== true) return false;
    const owner = attrs.redFor;
    return typeof owner !== "string" || owner === winner;
  }).length;

  const rules = options.rules;
  const direction =
    rules !== undefined && rules.has("turn.direction")
      ? rules.resolve<number>("turn.direction", { state })
      : 1;
  // 채점상의 자풍 — 기본은 실제 자리에서 계산하고, 증강(만년 오야)이 고정할 수 있다.
  const seatWindOverride =
    rules !== undefined && rules.has("scoring.seatWind")
      ? rules.resolve<number | null>("scoring.seatWind", {
          playerId: winner,
          state,
        })
      : null;

  return {
    hand,
    melds,
    winningTile: winKind,
    winType,
    seatWind: seatWindOverride ?? seatWindOf(state, winner, direction),
    prevalentWind: state.round.prevalentWind,
    riichi:
      rs?.riichi != null
        ? { double: rs.riichi.double, ippatsu: rs.riichi.ippatsu }
        : null,
    flags: {
      // 영상패는 해저패가 아니다 — 영상개화와 해저로월은 병립하지 않는다
      haitei: winType === "tsumo" && wallEmpty && !state.round.lastDrawRinshan,
      houtei: winType === "ron" && wallEmpty,
      rinshan: winType === "tsumo" && state.round.lastDrawRinshan,
      chankan:
        winType === "ron" &&
        state.round.chankan !== null &&
        state.round.chankan.tileId === winningTileId,
      // 천화: 친의 첫 쯔모 화료 / 지화: 자의 첫 쯔모 화료 (첫 바퀴·무후로)
      tenhou:
        winType === "tsumo" &&
        state.round.firstTurn &&
        !state.round.goAroundBroken &&
        (rs?.discardedKinds.length ?? 0) === 0 &&
        playerOf(state, winner).seat === state.round.dealerSeat,
      chihou:
        winType === "tsumo" &&
        state.round.firstTurn &&
        !state.round.goAroundBroken &&
        (rs?.discardedKinds.length ?? 0) === 0 &&
        playerOf(state, winner).seat !== state.round.dealerSeat,
    },
    // 개인 도라(scoring.extraDoraKinds)는 표준 도라 뒤에 그대로 이어 붙는다 —
    // countDora가 중복을 세므로 표준 도라와 같은 종류면 자연히 중첩된다.
    doraKinds: [
      ...state.round.doraIndicators.map((t) => doraKindFor(kindOf(state, t))),
      ...extraDoraKinds(state, rules, winner, "scoring.extraDoraKinds"),
    ],
    uraDoraKinds:
      options.includeUra === true
        ? [
            ...uraIndicatorIds(state).map((t) => doraKindFor(kindOf(state, t))),
            ...extraDoraKinds(state, rules, winner, "scoring.extraUraDoraKinds"),
          ]
        : [],
    // 리치 없이도 뒷도라를 세는 증강(숨은 칼날) — winType·멘젠 여부까지 넘겨
    // 규칙 쪽에서 "다마텐 론"만 골라낼 수 있게 한다
    ...(rules !== undefined && rules.has("scoring.uraWithoutRiichi")
      ? {
          uraAlways: rules.resolve<boolean>("scoring.uraWithoutRiichi", {
            playerId: winner,
            state,
            winType,
            isClosed: openMeldCountOf(state, winner) === 0,
          }),
        }
      : {}),
    redCount,
    winnerId: winner,
    // 론이면 쏜 사람 — 증강 역이 "누구에게서 잡았는가"를 볼 수 있게 한다
    ...(() => {
      if (winType !== "ron") return {};
      const from =
        options.from ??
        state.round.chankan?.player ??
        state.round.lastDiscard?.player;
      if (from === undefined) return {};
      return {
        fromPlayerId: from,
        fromRiichi: state.round.byPlayer[from]?.riichi != null,
      };
    })(),
    // 무장해제된 증강의 커스텀 역을 평가에서 빼기 위한 목록 (rules 유무와 무관하게 싣는다)
    ...(() => {
      const v = state.augmentData[DISARMED_SOURCES_KEY];
      return Array.isArray(v) && v.length > 0
        ? { disarmedSources: v as string[] }
        : {};
    })(),
    ...(rules !== undefined
      ? {
          blockedYaku: rules.has("win.blockedYaku")
            ? rules.resolve<string[]>("win.blockedYaku", {
                playerId: winner,
                state,
              })
            : [],
          options: scoringOptionsOf(state, rules, winner),
        }
      : {}),
  };
}
