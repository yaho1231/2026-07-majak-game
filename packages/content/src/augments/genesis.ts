/**
 * 개벽 (genesis, prism) — 동풍전 1·반장전 2회, 자기 턴에 버튼으로 발동한다.
 * **손패의 자패는 수패로, 수패는 자패로** 통째로 뒤바뀐다.
 *
 * 부수는 상식: 내 손은 내가 쌓아 올린 것이라는 전제 — 한순간에 세계가 뒤집혀 전혀 다른 손이 된다.
 * 자일색이 터질 수도, 완전한 쓰레기가 될 수도 있다(결과는 무작위, 홀더도 못 읽는다).
 *
 * 패 수지 (2026-07-25 재설계): 허공 생성이 아니라 **패산과의 실물 교환**이다.
 *  - 새 패는 패산에서 해당 분류(자/수)의 실물 패를 무작위로 가져온다 — 같은 종류 5장 같은
 *    비정상 분포가 생기지 않는다.
 *  - 원래 손패는 패산 맨 밑으로 반납되어 계속 돈다 (full_hand_swap·table_flip과 같은 규약 —
 *    방금 반납한 패를 곧바로 되뽑는 일이 없다).
 *  - 패산에 해당 분류가 모자랄 때만 잔여를 그 자리에서 종류 변경으로 생성한다(conjured 표식).
 *    이때 적도라(red)는 새 종류로 이어지지 않는다 — 5가 아닌 패가 적도라가 되는 것 방지.
 *  - 쯔모패가 교환되어 나가면 그 자리에 들어온 패가 새 쯔모패가 된다 ("14번째 패" 불변식).
 *
 * 리미트는 동풍전 1·반장전 2회(usesKey 카운터)뿐, 페널티 없음. 리치 중에는 오름패 고정과
 * 충돌하므로 발동 불가. 무작위는 `statePrng`(state.prngState)에서 결정적으로 뽑고, 소비 후
 * 전진된 상태를 이벤트 payload(prngState)에 실어 리듀서가 되돌린다 — 리플레이 결정성 유지.
 */

import {
  WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  isHonor,
  isNumberSuit,
  kindOf,
  moveTiles,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  ProposedEvent,
  Suit,
  TileId,
  TileKind,
} from "@majak/core";
import {
  counterOf,
  flagOf,
  matchUses,
  publishUsesLeft,
  replaceDrawnTile,
  roundViewKey,
  statePrng,
} from "../util.js";
import { handIsPoor, handKindsOf } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";
import { handAlteredMark } from "./handAltered.js";

const ID = "genesis";
const ACTION = "genesis_flip";
const GENESIS_FLIP_PERFORMED = "GenesisFlipPerformed";

const NUMBER_SUITS: readonly Suit[] = ["man", "pin", "sou"];
/** 자패 7종 (동남서북 = wind 1~4, 백발중 = dragon 1~3) */
const HONOR_KINDS: readonly TileKind[] = [
  { suit: "wind", rank: 1 },
  { suit: "wind", rank: 2 },
  { suit: "wind", rank: 3 },
  { suit: "wind", rank: 4 },
  { suit: "dragon", rank: 1 },
  { suit: "dragon", rank: 2 },
  { suit: "dragon", rank: 3 },
];

const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

/**
 * 이번 국에 이미 개벽했는가 (국 스코프).
 *
 * 개벽은 손패를 통째로 갈아엎지만 **턴을 넘기지 않는다**. 그래서 예전에는 같은 턴에
 * 버튼이 다시 떠서, 봇이 한 턴 만에 매치 횟수(1~2회)를 전부 태워 버렸다(2026-07-29 감사).
 * 국당 1회로 묶어 연타를 막는다.
 */
const flippedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "flipped", state, h);

/** 자기 턴(turn.act)이고 리치 중이 아니면 발동 가능 */
function canFlip(state: GameState, holder: PlayerId): boolean {
  const r = state.round;
  if (r.phase !== "turn.act") return false;
  if (playerAtSeat(state, r.turnSeat).id !== holder) return false;
  if (r.byPlayer[holder]?.riichi != null) return false;
  if (flagOf(state, flippedKey(state, holder))) return false; // 국당 1회
  return true;
}

interface GenesisFlipPayload {
  holder: PlayerId;
  /** 패산과 맞바꾸는 쌍 — handId는 패산 맨 밑으로 반납되고, wallId가 그 대신 손으로 온다 */
  swaps: { handId: TileId; wallId: TileId }[];
  /** 패산에 대상 분류가 모자라 그 자리에서 종류만 바꿔 생성하는 패 (conjured) */
  mutations: { tileId: TileId; kind: TileKind }[];
  /** 난수 소비 후 전진된 PRNG 상태 (결정론 유지) */
  prngState: number;
}

/** 손패를 자↔수 전환하는 이벤트들 — 패산 실물 우선 교환, 모자라면 생성 */
function flipEvents(
  state: GameState,
  holder: PlayerId,
): ProposedEvent<string, unknown>[] {
  const prng = statePrng(state);
  const wallIds = state.zones[WALL]?.tileIds ?? [];
  // 패산에서 가져올 후보 풀 — 실물 패를 최대한 쓰고, 바닥나면 생성으로 전환한다
  const honorPool = wallIds.filter((id) => isHonor(kindOf(state, id)));
  const numberPool = wallIds.filter((id) => isNumberSuit(kindOf(state, id)));
  /** 풀에서 무작위 한 장을 꺼낸다 (마지막 원소와 스왑 후 pop — 결정적 O(1)) */
  const drawFrom = (pool: TileId[]): TileId | undefined => {
    if (pool.length === 0) return undefined;
    const i = prng.int(pool.length);
    const id = pool[i] as TileId;
    pool[i] = pool[pool.length - 1] as TileId;
    pool.pop();
    return id;
  };

  const swaps: GenesisFlipPayload["swaps"] = [];
  const mutations: GenesisFlipPayload["mutations"] = [];
  for (const tileId of handIdsOf(state, holder)) {
    const kind = kindOf(state, tileId);
    if (isNumberSuit(kind)) {
      // 수패 → 자패: 패산의 실물 자패 우선, 없으면 무작위 생성
      const wallId = drawFrom(honorPool);
      if (wallId !== undefined) swaps.push({ handId: tileId, wallId });
      else {
        mutations.push({
          tileId,
          kind: HONOR_KINDS[prng.int(HONOR_KINDS.length)] as TileKind,
        });
      }
    } else if (isHonor(kind)) {
      // 자패 → 수패: 패산의 실물 수패 우선, 없으면 무작위 생성
      const wallId = drawFrom(numberPool);
      if (wallId !== undefined) swaps.push({ handId: tileId, wallId });
      else {
        const suit = NUMBER_SUITS[prng.int(NUMBER_SUITS.length)] as Suit;
        mutations.push({ tileId, kind: { suit, rank: prng.int(9) + 1 } });
      }
    }
    // 비표준 suit는 건드리지 않는다
  }

  const payload: GenesisFlipPayload = {
    holder,
    swaps,
    mutations,
    prngState: prng.getState(),
  };
  return [
    { type: GENESIS_FLIP_PERFORMED, payload },
    augmentDataSet(usesKey(holder), counterOf(state, usesKey(holder)) + 1),
    augmentDataSet(flippedKey(state, holder), true),
    // 개벽이 일어났음을 전원에게 알린다 (구체적 결과는 손패로 드러난다)
    augmentDataSet(roundViewKey("*", `${ID}:${holder}`), true),
  ];
}

const genesisAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no genesis augment";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left";
    if (!canFlip(state, req.player)) return "not your turn (or riichi)";
    return null;
  },
  toEvents: (req, { state }) => flipEvents(state, req.player),
};

export const genesis: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 1,
  name: "개벽",
  description:
    "(동풍전 1회 · 반장전 2회 · 매 국 1회) 자기 순에 발동하면 손패의 자패는 수패로, 수패는 자패로 통째로 뒤바뀐다.",
  detail:
    "발동하면 손패의 자패는 수패로, 수패는 자패로 통째로 바뀐다 — 새 패는 패산에서 무작위로 오고 원래 손패는 패산 맨 밑으로 간다.\n\n리치 중에는 쓸 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));
    if (!engine.reducers.has(GENESIS_FLIP_PERFORMED)) {
      engine.reducers.register(GENESIS_FLIP_PERFORMED, (state, event) => {
        const p = event.payload as GenesisFlipPayload;
        // ① 교체되는 손패를 패산 맨 밑으로 반납하고, 골라 둔 실물 패를 손으로 가져온다
        //    (wallId들은 반납 전 패산에서 고른 것이라 ①의 반납분과 겹치지 않는다)
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
        // ③ 쯔모패가 반납됐으면 그 자리에 들어온 패가 새 쯔모패다 ("14번째 패" 불변식 —
        //    쯔모 화료·타패 흐름이 손에 없는 패를 가리키지 않게 한다)
        const drawn = state.round.lastDrawnTile;
        const remap =
          drawn === null ? undefined : p.swaps.find((s) => s.handId === drawn);
        return {
          ...state,
          zones,
          tiles,
          prngState: p.prngState,
          // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다 (handAltered.ts 참고)
          augmentData: { ...state.augmentData, ...handAlteredMark(state, p.holder) },
          ...(remap === undefined
            ? {}
            : { round: replaceDrawnTile(state.round, remap.wallId) }),
        };
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(genesisAction);
    }
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (!canFlip(state, holder)) return [];
      return [{ type: ACTION, payload: {} }];
    });
  },
  // 자패↔수패를 통째로 뒤섞는 도박수 — 손이 명백히 약할 때만 던진다(좋은 손은 지킨다).
  // 손을 통째로 갈아엎는 증강 — **나쁜 손이 곧 발동 조건**이라 planner의 `advance`
  // 적기(손이 가까울수록 높다)와 방향이 반대다. 타이밍은 `pick`이 직접 본다.
  bot: plan({
    intent: "rewrite",
    // 자패↔수패를 통째로 뒤집는다 — **잡손일수록 값이 난다.**
    pick: (ctx) =>
      handIsPoor(ctx) ? (ctx.options.find((o) => o.type === ACTION) ?? null) : null,
  }),
});
