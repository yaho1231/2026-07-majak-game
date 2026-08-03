/**
 * suitUnifyCore — "손패의 수패를 한 색으로" 의 **실물 패 교환 구현 단일 진실**.
 *
 * 단색 세계(`suit_unify`)와 그 퀘스트판인 편식(`picky_eater`)이 같은 규약으로 손을
 * 물들인다. 사본을 두 벌 두면 한쪽만 고쳐져 **패 수지가 갈라지는** 사고가 난다
 * (개벽·단색 세계가 실제로 그 길을 한 번 갔다 — suit_unify 헤더 주석 참고).
 *
 * 규약 (개벽 `genesis`와 같다):
 * - 바꿔야 할 수패는 패산에 있는 **같은 숫자·목표 색의 실물 패**와 1:1로 맞바꾼다.
 *   숫자를 유지해야 손 모양이 그대로 한 색으로 옮겨진다.
 * - 내보낸 손패는 패산 맨 밑으로 반납되어 계속 돈다 — 게임 전체의 패 분포가 안 깨진다.
 * - 패산에 그 숫자의 목표 색이 남아 있지 않을 때만 그 자리에서 종류를 바꿔 생성한다
 *   (`conjured` 표식). 적도라(red)는 새 종류로 이어지지 않는다.
 * - 쯔모패가 교환되어 나가면 그 자리에 들어온 패가 새 쯔모패가 된다("14번째 패" 불변식).
 */

import {
  WALL,
  handIdsOf,
  handZone,
  isNumberSuit,
  kindOf,
  moveTiles,
} from "@majak/core";
import type {
  GameEngine,
  GameState,
  PlayerId,
  ProposedEvent,
  Suit,
  TileId,
  TileKind,
} from "@majak/core";
import { replaceDrawnTile, statePrng } from "../util.js";

/** 통일 대상 후보 수패 종류 */
export const NUMBER_SUITS: readonly Suit[] = ["man", "pin", "sou"];

/** 두 증강이 공유하는 이벤트 — 리듀서도 한 번만 등록된다 */
export const MONO_WORLD_PERFORMED = "MonoWorldPerformed";

export interface MonoWorldPayload {
  holder: PlayerId;
  /** 통일한 색 (표시·검증용) */
  suit: Suit;
  /** 패산과 맞바꾸는 쌍 — handId는 패산 맨 밑으로 반납되고, wallId가 그 대신 손으로 온다 */
  swaps: { handId: TileId; wallId: TileId }[];
  /** 패산에 그 숫자의 목표 색이 남지 않아 그 자리에서 종류만 바꿔 생성하는 패 (conjured) */
  mutations: { tileId: TileId; kind: TileKind }[];
  /** 난수 소비 후 전진된 PRNG 상태 (결정론 유지) */
  prngState: number;
}

/**
 * 손패 수패를 지정한 한 색으로 통일하는 **이벤트 한 건**.
 * 패산의 실물(같은 숫자·목표 색)을 최대한 쓰고, 모자란 만큼만 생성한다.
 * 사용 횟수·공개 채널 같은 증강별 기록은 호출부가 따로 붙인다.
 */
export function monoWorldEvent(
  state: GameState,
  holder: PlayerId,
  suit: Suit,
): ProposedEvent<string, unknown> {
  const prng = statePrng(state);
  // 패산의 목표 색 패를 숫자별 풀로 모아 둔다 — 숫자를 유지한 채 맞바꾸기 위해서다
  const poolByRank = new Map<number, TileId[]>();
  for (const id of state.zones[WALL]?.tileIds ?? []) {
    const k = kindOf(state, id);
    if (k.suit !== suit) continue;
    const pool = poolByRank.get(k.rank);
    if (pool === undefined) poolByRank.set(k.rank, [id]);
    else pool.push(id);
  }
  /** 그 숫자의 풀에서 무작위 한 장을 꺼낸다 (마지막 원소와 스왑 후 pop — 결정적 O(1)) */
  const drawRank = (rank: number): TileId | undefined => {
    const pool = poolByRank.get(rank);
    if (pool === undefined || pool.length === 0) return undefined;
    const i = prng.int(pool.length);
    const id = pool[i] as TileId;
    pool[i] = pool[pool.length - 1] as TileId;
    pool.pop();
    return id;
  };

  const swaps: MonoWorldPayload["swaps"] = [];
  const mutations: MonoWorldPayload["mutations"] = [];
  for (const tileId of handIdsOf(state, holder)) {
    const kind = kindOf(state, tileId);
    if (!isNumberSuit(kind) || kind.suit === suit) continue; // 자패·이미 그 색인 패는 그대로
    const wallId = drawRank(kind.rank);
    if (wallId !== undefined) swaps.push({ handId: tileId, wallId });
    else mutations.push({ tileId, kind: { suit, rank: kind.rank } });
  }

  const payload: MonoWorldPayload = {
    holder,
    suit,
    swaps,
    mutations,
    prngState: prng.getState(),
  };
  return { type: MONO_WORLD_PERFORMED, payload };
}

/** 리듀서를 한 번만 등록한다 (두 증강·여러 보유자가 같은 이벤트를 쓴다) */
export function registerMonoWorldReducer(engine: GameEngine): void {
  if (engine.reducers.has(MONO_WORLD_PERFORMED)) return;
  engine.reducers.register(MONO_WORLD_PERFORMED, (state, event) => {
    const p = event.payload as MonoWorldPayload;
    // ① 교체되는 손패를 패산 맨 밑으로 반납하고, 골라 둔 실물 패를 손으로 가져온다
    //    (wallId들은 반납 전 패산에서 고른 것이라 반납분과 겹치지 않는다)
    let zones = state.zones;
    if (p.swaps.length > 0) {
      zones = moveTiles(
        zones,
        handZone(p.holder),
        WALL,
        p.swaps.map((s) => s.handId),
      );
      zones = moveTiles(
        zones,
        WALL,
        handZone(p.holder),
        p.swaps.map((s) => s.wallId),
      );
    }
    // ② 패산이 모자란 잔여만 그 자리에서 종류를 바꿔 생성 (conjured 표식)
    let tiles = state.tiles;
    if (p.mutations.length > 0) {
      tiles = { ...tiles };
      for (const m of p.mutations) {
        const tile = tiles[m.tileId];
        if (tile === undefined) throw new Error(`Unknown tile: ${m.tileId}`);
        // 적도라(red)는 새 종류로 이어지지 않는다 — 5가 아닌 패의 적도라 방지
        const attrs = { ...tile.attrs, conjured: true };
        delete attrs.red;
        tiles[m.tileId] = { ...tile, kind: m.kind, attrs };
      }
    }
    // ③ 쯔모패가 반납됐으면 그 자리에 들어온 패가 새 쯔모패다 ("14번째 패" 불변식)
    const drawn = state.round.lastDrawnTile;
    const remap = drawn === null ? undefined : p.swaps.find((s) => s.handId === drawn);
    return {
      ...state,
      zones,
      tiles,
      prngState: p.prngState,
      ...(remap === undefined
        ? {}
        : { round: replaceDrawnTile(state.round, remap.wallId) }),
    };
  });
}
