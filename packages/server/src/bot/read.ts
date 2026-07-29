/**
 * read — 한 번의 결정에 필요한 판 읽기를 한 곳에 모은 스냅샷.
 *
 * 손패·샹텐·대기·도라·잔여 장수·상대 위협을 매 결정마다 **한 번만** 계산해 두고
 * 버림·리치·후로·증강 정책이 전부 이걸 나눠 쓴다. (예전엔 판단마다 텐파이를 다시
 * 계산해 같은 일을 서너 번씩 했다.)
 */

import {
  doraKindFor,
  handZone,
  kindKey,
  meldsZone,
  shantenOf,
  winningKinds,
} from "@majak/core";
import type { DecomposeOptions, PlayerId, PlayerView, TileId, TileKind } from "@majak/core";
import { maxThreat, readThreats, safetyOf, tileTracker, wallLeftOf } from "./danger.js";
import type { Threat } from "./danger.js";

/** 이 국에 노리는 역 — 후로할지, 무엇을 버릴지의 기준이 된다 */
export type HandPlan =
  | { yaku: "yakuhai" }
  | { yaku: "honitsu"; suit: string }
  | { yaku: "tanyao" }
  | { yaku: "toitoi" }
  | null;

export interface BotRead {
  view: PlayerView;
  me: PlayerId;
  /** 감춰진 손패(후로 제외) */
  hand: TileKind[];
  meldCount: number;
  /** 증강이 바꾼 화료형 옵션 — 텐파이·대기 계산에 반드시 넘긴다 */
  opts: DecomposeOptions;
  turn: number;
  wallLeft: number;
  threats: Threat[];
  /** 가장 높은 상대 위협도 0~1 */
  threat: number;
  /** 샹텐 (0=텐파이) — 버림 후보 비교용 근사 */
  shanten: number;
  /** 정확한 텐파이 여부 (증강 화료형 반영) */
  tenpai: boolean;
  /** 텐파이면 오름패 종류 (13장 기준). 아니면 빈 배열 */
  waits: TileKind[];
  /** 이 국의 도라 종류 (표시패에서 변환) */
  doraKinds: TileKind[];
  /** 보이지 않는 곳에 남은 장수 */
  remainingOf(kind: TileKind): number;
  /** 이 패를 버릴 때의 안전도 0(위험)~1(안전) */
  safetyOf(kind: TileKind): number;
  /** 이 패 목록에 든 도라 수 (적도라 제외) */
  doraIn(kinds: readonly TileKind[]): number;
  /** 지금 손패(후로 포함)의 도라·적도라 합 — 손의 값어치 어림 */
  handDora: number;
  /** 내 자풍 (1동 2남 3서 4북) */
  seatWind: number;
  /** 후리텐인가 (본인 뷰에만 있는 정보) */
  furiten: boolean;
  /** 리치 선언 중인가 */
  riichiDeclared: boolean;
  /** 이 종류가 나에게 역패인가 */
  isYakuhai(kind: TileKind): boolean;
}

const sameKind = (a: TileKind, b: TileKind): boolean =>
  a.suit === b.suit && a.rank === b.rank;

/** kinds에서 remove의 각 패를 한 장씩 뺀 새 목록 */
export function removeKinds(
  kinds: readonly TileKind[],
  remove: readonly TileKind[],
): TileKind[] {
  const out = [...kinds];
  for (const r of remove) {
    const i = out.findIndex((k) => sameKind(k, r));
    if (i >= 0) out.splice(i, 1);
  }
  return out;
}

/** 뷰 하나로 이번 결정의 판 읽기를 만든다 */
export function buildRead(view: PlayerView, me: PlayerId): BotRead {
  const hand: TileKind[] = [];
  for (const id of view.zones[handZone(me)]?.tileIds ?? []) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) hand.push(k);
  }
  const meldCount = view.round.byPlayer[me]?.meldCount ?? 0;
  const opts: DecomposeOptions = view.scoringOptions ?? {};
  const remainingOf = tileTracker(view);
  const threats = readThreats(view, me);
  const shanten = shantenOf(hand, meldCount, opts);

  // 텐파이·대기는 정확해야 한다 — 코어 계산기에 화료형 옵션을 그대로 넘긴다.
  // (13장이면 그대로, 14장이면 한 장씩 빼 보며 대기형을 찾는다.)
  let waits: TileKind[] = [];
  let tenpai = false;
  if (shanten <= 0 && hand.length > 0) {
    waits = winningKinds(hand, meldCount, undefined, opts);
    if (waits.length > 0) {
      tenpai = true;
    } else {
      for (let i = 0; i < hand.length; i++) {
        const rest = hand.slice(0, i).concat(hand.slice(i + 1));
        const w = winningKinds(rest, meldCount, undefined, opts);
        if (w.length > 0) {
          tenpai = true;
          if (w.length > waits.length) waits = w;
        }
      }
    }
  }

  const doraKinds: TileKind[] = [];
  for (const id of view.round.doraIndicators) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) doraKinds.push(doraKindFor(k));
  }
  const doraCount = new Map<string, number>();
  for (const d of doraKinds) {
    const key = kindKey(d);
    doraCount.set(key, (doraCount.get(key) ?? 0) + 1);
  }
  const doraIn = (kinds: readonly TileKind[]): number => {
    let n = 0;
    for (const k of kinds) n += doraCount.get(kindKey(k)) ?? 0;
    return n;
  };

  // 손 전체(후로 포함)의 도라 + 적도라 — 밀지 접을지의 기준이 되는 값어치
  const meldTiles: TileId[] = view.zones[meldsZone(me)]?.tileIds ?? [];
  const meldKinds: TileKind[] = [];
  for (const id of meldTiles) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) meldKinds.push(k);
  }
  let reds = 0;
  for (const id of [...(view.zones[handZone(me)]?.tileIds ?? []), ...meldTiles]) {
    if (view.tiles[id]?.attrs.red === true) reds++;
  }
  const handDora = doraIn(hand) + doraIn(meldKinds) + reds;

  const seat = view.players.find((p) => p.id === me)?.seat ?? 0;
  const n = view.players.length || 4;
  const seatWind =
    ((((seat - view.round.dealerSeat) * view.round.direction) % n) + n) % n + 1;

  const mine = view.round.byPlayer[me];

  const read: BotRead = {
    view,
    me,
    hand,
    meldCount,
    opts,
    turn: view.round.turnCount,
    wallLeft: wallLeftOf(view),
    threats,
    threat: maxThreat(threats),
    shanten,
    tenpai,
    waits,
    doraKinds,
    remainingOf,
    safetyOf: (kind) => safetyOf(kind, threats, remainingOf),
    doraIn,
    handDora,
    seatWind,
    furiten: mine?.furiten === true,
    riichiDeclared: mine?.riichiDeclared === true,
    isYakuhai(kind) {
      if (kind.suit === "dragon") return true;
      if (kind.suit === "wind") {
        return kind.rank === seatWind || kind.rank === view.round.prevalentWind;
      }
      return false;
    },
  };
  return read;
}

/**
 * 지금 손이 어떤 역을 향하고 있는가 — 버림·후로의 기준.
 * 커밋이 아니라 **매 결정마다 다시 읽는 관측**이다(손이 바뀌면 방향도 바뀐다).
 * 이미 후로로 방향이 정해졌다면 `committed`를 넘겨 그 방향을 우선한다.
 */
export function readPlan(read: BotRead, committed: HandPlan = null): HandPlan {
  const all = [...read.hand, ...meldKindsOf(read)];
  if (all.length === 0) return committed;

  // 혼일색 — 수패가 한 색에 몰려 있고 그 색이 충분히 두꺼울 때
  const counts = new Map<string, number>();
  let numberTotal = 0;
  for (const k of all) {
    if (k.suit === "man" || k.suit === "pin" || k.suit === "sou") {
      counts.set(k.suit, (counts.get(k.suit) ?? 0) + 1);
      numberTotal++;
    }
  }
  let bestSuit: string | null = null;
  let bestCount = 0;
  for (const [suit, c] of counts) {
    if (c > bestCount) {
      bestSuit = suit;
      bestCount = c;
    }
  }
  if (bestSuit !== null && bestCount >= 5 && numberTotal - bestCount <= 1) {
    return { yaku: "honitsu", suit: bestSuit };
  }
  if (committed !== null) return committed;

  // 토이토이 — 커쯔·작두가 4조 이상이면 사람도 이 방향을 본다
  const pairs = new Map<string, number>();
  for (const k of all) {
    const key = kindKey(k);
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  let sets = 0;
  for (const c of pairs.values()) if (c >= 2) sets++;
  if (sets >= 4) return { yaku: "toitoi" };

  // 탕야오 — 요구패가 거의 없을 때
  const orphans = all.filter((k) => isOrphan(k)).length;
  if (orphans <= 1) return { yaku: "tanyao" };

  return null;
}

const isOrphan = (k: TileKind): boolean =>
  !(k.suit === "man" || k.suit === "pin" || k.suit === "sou") ||
  k.rank === 1 ||
  k.rank === 9;

/** 내 후로 패의 kind 목록 */
export function meldKindsOf(read: BotRead): TileKind[] {
  const out: TileKind[] = [];
  for (const id of read.view.zones[meldsZone(read.me)]?.tileIds ?? []) {
    const k = read.view.tiles[id]?.kind;
    if (k !== undefined) out.push(k);
  }
  return out;
}
