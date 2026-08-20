/**
 * 왕패의 주인 (dead_wall_master, prism) — 국 시작에 왕패를 뒤집어 손을 새로 짠다.
 *
 * 국이 시작될 때(자기 첫 순, 아직 아무것도 버리지 않았을 때) 왕패 14장을 전부 들여다보고,
 * **그중 최대 2장까지 내 손패와 1:1로 맞바꾼다.**
 *
 * ⚠ 밸런스(2026-07-26): 교환 4장 → **2장**, 화료 보너스 **+6000 삭제**.
 * 매 국 반복되는데 효과가 매치 1~2회짜리급이라 파워 티어 최상위였다(docs/20 §7c).
 *
 * 밑장빼기(bottom_deal)와의 차별 — **무대가 다르다**(2026-07-26, 도박사의 손 폐기와 함께 정리):
 * - 저쪽은 **패산** 담당이다. 맨 밑 3장을 보고 매 순 밑장을 쯔모한다. 패산 밑은 유국까지
 *   불변이라 확정 화료를 미리 설계할 수 있지만, 도라에는 손댈 수 없다.
 * - 이쪽은 **왕패** 담당이다. 국 시작에 최대 2장 교환으로 배패의 급소를 갈아 끼우고,
 *   무엇보다 표시패 자리에 원하는 패를 밀어 넣어 **도라·뒷도라를 지정**한다.
 *
 * 구현 지점:
 * - visibility.deadWall Modifier: 보유자에게 왕패 14장 전체 공개(도라 표시패·뒷도라 후보 포함).
 * - dw_swap 액션: 손패 1장 ↔ 왕패 deadIndex 자리 1장 (왕패 장수 보존 — 뺀 자리에 내 패를
 *   그대로 밀어 넣는다). 국당 2회까지 반복 발동해 최대 2장을 갈아 끼운다.
 *   후보는 손패(≤14) × 왕패(14) = 200개 미만이라 조합 폭발이 없다.
 * - 도라 표시패 자리를 집으면 표시패가 내 패로 교체되어 **그 자리에서 도라가 바뀐다**
 *   (막지 않는다 — 왕패의 주인이 도라까지 갈아 끼우는 것이 이 증강의 재미다).
 *   doraIndicators는 tileId로 추적되므로 리듀서가 함께 갈아 끼운다.
 * - 남은 교환 횟수는 augmentData 카운터만으로는 클라이언트에 가지 않는다 —
 *   view:{holder}:dead_wall_master:remaining:{holder} 채널로 함께 실어 UI에 노출한다
 *   (bottom_deal의 armed 채널이 같은 구조다).
 * - 억제는 오직 "국 시작에만 · 국당 2장"이라는 창과 횟수뿐이다(무페널티 원칙).
 */

import {
  DEAD_WALL,
  ROUND_STARTED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  kindKey,
  moveTiles,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  VisibilityRule,
} from "@majak/core";
import {
  counterOf,
  replaceDrawnTile,
  roundViewKey,
  widenPeek,
} from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";
import { handAlteredMark } from "./handAltered.js";

const ID = "dead_wall_master";
const ACTION_SWAP = "dw_swap";
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const DEAD_WALL_SWAPPED = "DeadWallMasterSwapped";
/** 국당 교환 가능 장수 (2026-07-26 밸런스: 4 → 2) */
const SWAPS_PER_ROUND = 2;
/**
 * 지금 왕패에 남은 장수 — 고를 수 있는 인덱스는 0 ~ (이 값-1).
 *
 * 14장으로 시작하지만 깡으로 영상패를 뽑으면 **보충되지 않고 줄어든다**
 * (2026-07-26 사용자 확정). 내 첫 순 앞에 다른 사람이 깡을 쳤을 수 있으므로 매번 실측한다.
 */
const deadWallSize = (state: GameState): number =>
  state.zones[DEAD_WALL]?.tileIds.length ?? 0;

/** 이번 국에 쓴 교환 횟수 (roundKey 스코프 — 국이 바뀌면 자동으로 0) */
const swapsKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "swaps", state, h);
/** 보유자 뷰 전용 채널 — 남은 교환 횟수를 클라이언트에 노출한다 */
const viewRemainingKey = (h: PlayerId): string =>
  roundViewKey(h, `${ID}:remaining:${h}`);

/** 이번 국에 남은 교환 횟수 */
function remainingSwaps(state: GameState, h: PlayerId): number {
  return Math.max(0, SWAPS_PER_ROUND - counterOf(state, swapsKey(state, h)));
}

/**
 * 지금이 '국 시작(자기 첫 순)'이고 아직 교환 여력이 있는가.
 *
 * ⚠ `round.firstTurn`(첫 바퀴)은 쓰지 않는다. 그 플래그는 **누구든** 울거나 깡을 하면
 * 즉시 false가 되어, 내 앞자리 봇이 퐁 한 번만 해도 그 국의 교환 기회가 통째로
 * 사라졌다 — 오야가 아닌 국에서 "왕패의 주인이 발동하지 않는다"는 증상의 원인이었다
 * (2026-07-31 사용자 보고). 판정 기준은 **내가 아직 한 장도 버리지 않은 내 순**이다
 * (일확천금·단색 세계·밥상 뒤엎기와 같은 규약).
 */
function canSwap(state: GameState, h: PlayerId): boolean {
  const r = state.round;
  if (r.phase !== "turn.act") return false;
  if (playerAtSeat(state, r.turnSeat).id !== h) return false;
  if ((r.byPlayer[h]?.discardCount ?? 0) > 0) return false;
  if (r.byPlayer[h]?.riichi != null) return false;
  return remainingSwaps(state, h) > 0;
}

interface DeadWallSwappedPayload {
  player: PlayerId;
  /** 왕패로 내보내는 손패 */
  handTileId: TileId;
  /** 가져올 왕패의 자리 (0~13) */
  deadIndex: number;
  /** 손으로 가져오는 왕패 */
  deadTileId: TileId;
}

const swapAction: ActionDef<{ handTileId: TileId; deadIndex: number }> = {
  type: ACTION_SWAP,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no dead_wall_master augment";
    if (!canSwap(state, req.player)) return "not at the start of the round";
    const idx = req.payload.deadIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx >= deadWallSize(state)) {
      return "invalid dead wall index";
    }
    if ((state.zones[DEAD_WALL]?.tileIds ?? [])[idx] === undefined) {
      return "no tile at that index";
    }
    if (!handIdsOf(state, req.player).includes(req.payload.handTileId)) {
      return "tile not in hand";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const payload: DeadWallSwappedPayload = {
      player: req.player,
      handTileId: req.payload.handTileId,
      deadIndex: req.payload.deadIndex,
      deadTileId: (state.zones[DEAD_WALL]?.tileIds ?? [])[
        req.payload.deadIndex
      ] as TileId,
    };
    return [{ type: DEAD_WALL_SWAPPED, payload }];
  },
};

export const deadWallMaster: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 3,
  name: "왕패의 주인",
  description:
    "(상시 열람 · 매 국 2회 교환) 왕패가 처음부터 전부 보이며(국 시작 14장 — 깡이 나올 때마다 영상패가 빠져 줄어든다), 국이 시작될 때 자기 첫 순에 왕패의 패와 손패를 최대 2장까지 1:1로 맞바꿔 손의 급소를 갈아 끼운다.",
  detail:
    "(상시 열람 · 매 국 2회 교환) 왕패가 항상 전부 보인다. 국 시작 시 14장이지만 **깡의 영상 쯔모는 보충되지 않으므로 누군가 깡을 칠 때마다 한 장씩 줄어든다** — 깡 네 번이 나온 국의 왕패는 10장이다.\n\n자리 구성은 — 왼쪽은 깡으로 뽑는 영상패, **뒤쪽 10장**이 도라·뒷도라 표시패 블록이다(깡으로 영상패가 빠지면 앞이 줄고 블록은 늘 마지막 10장이다). 아직 아무것도 버리지 않은 국의 첫 순에 한해 왕패 아무 자리의 패와 손패 1장을 맞바꾸며, 국당 2번까지 반복할 수 있다. 내보낸 손패가 왕패의 그 자리를 대신 채우므로 도라·뒷도라 표시패까지 바꿀 수 있다. 첫 순을 넘기면 그 국의 교환 기회는 사라지고 다음 국에 다시 2장이 채워진다.",
  // 봇: 손패에 같은 종류가 이미 있는 왕패 패를 가져오고, 홀로 뜬(1장뿐인) 손패를 내보낸다.
  //     확실한 개선만 고르므로 자해 위험이 없다.
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder }) => {
      const swaps = options.filter((o) => o.type === ACTION_SWAP);
      if (swaps.length === 0) return null;
      const handIds = view.zones[handZone(holder)]?.tileIds ?? [];
      const counts = new Map<string, number>();
      for (const id of handIds) {
        const kind = view.tiles[id]?.kind;
        if (kind === undefined) continue;
        const key = kindKey(kind);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const dead = view.zones[DEAD_WALL]?.tileIds ?? [];
      for (const option of swaps) {
        const p = option.payload as {
          handTileId?: unknown;
          deadIndex?: unknown;
        };
        if (typeof p.handTileId !== "number" || typeof p.deadIndex !== "number") {
          continue;
        }
        const giveKind = view.tiles[p.handTileId]?.kind;
        const takeId = dead[p.deadIndex];
        const takeKind = takeId === undefined ? undefined : view.tiles[takeId]?.kind;
        if (giveKind === undefined || takeKind === undefined) continue;
        const giveKey = kindKey(giveKind);
        const takeKey = kindKey(takeKind);
        if (giveKey === takeKey) continue;
        // 홀로 뜬 패를 내보내고, 이미 짝이 있는 종류를 가져온다
        if ((counts.get(giveKey) ?? 0) !== 1) continue;
        if ((counts.get(takeKey) ?? 0) < 1) continue;
        return option;
      }
      return null;
    },
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(DEAD_WALL_SWAPPED)) {
      engine.reducers.register(DEAD_WALL_SWAPPED, (state, event) => {
        const p = event.payload as DeadWallSwappedPayload;
        // 왕패 → 손 / 비워진 자리(deadIndex)에 내 손패를 밀어 넣는다 (왕패 장수 보존)
        let zones = moveTiles(state.zones, DEAD_WALL, handZone(p.player), [
          p.deadTileId,
        ]);
        zones = moveTiles(
          zones,
          handZone(p.player),
          DEAD_WALL,
          [p.handTileId],
          p.deadIndex,
        );
        const used = counterOf(state, swapsKey(state, p.player)) + 1;
        // 도라 표시패 자리를 집었다면 표시패는 그 자리를 채운 내 패로 바뀐다
        // (doraIndicators는 tileId 추적이라 자동으로 따라오지 않는다).
        const doraIndicators = state.round.doraIndicators.map((id) =>
          id === p.deadTileId ? p.handTileId : id,
        );
        // 쯔모패를 내보냈다면 가져온 패가 새 쯔모패다 (쯔모 화료·리치 판정 정합성).
        // 이때 `replaceDrawnTile`을 거쳐 **lastDrawRinshan을 함께 내린다** —
        // 첫 순 안깡 직후에도 발동 창이 열려 있어서(canSwap은 discardCount만 본다),
        // 영상 쯔모를 왕패의 오름패로 갈아 끼우면 영상개화 +1판이 그대로 붙었다
        // (2026-08-20 QA hand-b 확정 1). 형제들(개벽·단색 세계·밥상 뒤엎기)은
        // 전부 이 헬퍼를 쓴다.
        const base = { ...state.round, doraIndicators };
        const round =
          state.round.lastDrawnTile === p.handTileId
            ? replaceDrawnTile(base, p.deadTileId)
            : base;
        return {
          ...state,
          zones,
          round,
          augmentData: {
            ...state.augmentData,
            // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다 (handAltered.ts 참고)
            ...handAlteredMark(state, p.player),
            [swapsKey(state, p.player)]: used,
            [viewRemainingKey(p.player)]: Math.max(0, SWAPS_PER_ROUND - used),
          },
        };
      });
    }
    if (!engine.actions.has(ACTION_SWAP)) {
      engine.actions.register(swapAction);
    }

    // 국이 시작될 때마다 남은 교환 횟수를 다시 발행 (매 국 2장으로 리셋된다)
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      rc.emit(
        augmentDataSet(viewRemainingKey(holder), remainingSwaps(rc.state, holder)),
      );
    });

    // 보유자에게 왕패 14장 전체 공개 — 무엇을 가져올지 보고 정한다
    engine.rules.addModifier<VisibilityRule>("visibility.deadWall", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        return widenPeek(cur, {
          mode: "peek",
          count: state === undefined ? 14 : deadWallSize(state),
        });
      },
    });

    // 보유자 턴 후보: 손패 × 왕패 자리 (합법성 최종 판정은 validate)
    ctx.holderTurnOptions((state) => {
      if (!canSwap(state, holder)) return [];
      const out: { type: string; payload: unknown }[] = [];
      const size = deadWallSize(state);
      for (const handTileId of handIdsOf(state, holder)) {
        for (let deadIndex = 0; deadIndex < size; deadIndex++) {
          if ((state.zones[DEAD_WALL]?.tileIds ?? [])[deadIndex] === undefined) {
            continue;
          }
          out.push({ type: ACTION_SWAP, payload: { handTileId, deadIndex } });
        }
      }
      return out;
    });
  },
});
