/**
 * standardAugments — 첫 증강 7종. 등록 API가 엔진 수정 없이 작동함을 실증한다.
 *
 * 각 증강은 서로 다른 등록 지점을 쓴다:
 *   Rule Modifier(4) / Effect Reaction(1) / Effect Interceptor(1) / 새 프롬프트 액션(1).
 *
 * 설계: docs/10_AUGMENT_SYSTEM.md §5
 */

import type { GameState } from "../engine/state/GameState.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import { discardsZone, handZone, moveTiles } from "../engine/zones/Zone.js";
import type { TileId } from "../mahjong/tiles/Tile.js";
import type { ActionDef } from "../engine/actions/ActionRegistry.js";
import {
  ROUND_SETTLED,
  WIN_DECLARED,
} from "../mahjong/flow/flowEvents.js";
import type {
  RoundSettledPayload,
  WinDeclaredPayload,
} from "../mahjong/flow/flowEvents.js";
import { defineAugment } from "./Augment.js";
import type { AugmentDef } from "./Augment.js";
import { scoreChanged } from "./events.js";

const roundDown100 = (n: number): number => Math.floor(n / 100) * 100;

export const cheapRiichi = defineAugment({
  id: "cheap_riichi",
  tier: "silver",
  name: "가벼운 선언",
  description: "리치 비용이 500점이 된다.",
  install(ctx) {
    ctx.setHolderRule("riichi.cost", 500);
  },
});

export const tsumoBonus = defineAugment({
  id: "tsumo_bonus",
  tier: "silver",
  name: "쯔모의 기쁨",
  description: "쯔모로 화료하면 1000점을 추가로 얻는다.",
  install(ctx) {
    ctx.reaction(WIN_DECLARED, (event, rc) => {
      const p = event.payload as WinDeclaredPayload;
      if (p.winner === ctx.holder && p.winType === "tsumo") {
        rc.emit(scoreChanged(ctx.holder, 1000, "tsumo_bonus"));
      }
    });
  },
});

export const ironWall = defineAugment({
  id: "iron_wall",
  tier: "gold",
  name: "철벽",
  description: "후리텐을 무시하고 론할 수 있다.",
  install(ctx) {
    ctx.setHolderRule("win.furiten.enabled", false);
  },
});

export const vengeance = defineAugment({
  id: "vengeance",
  tier: "gold",
  name: "설욕",
  description: "방총으로 잃는 점수가 절반이 된다 (그만큼 화료자 이득도 준다).",
  install(ctx) {
    ctx.interceptor(ROUND_SETTLED, (event) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      const loss = p.deltas[ctx.holder] ?? 0;
      if (loss >= 0) return event;

      const refund = roundDown100(-loss / 2);
      if (refund <= 0) return event;

      // 최대 이득자(화료자)의 이득을 같은 만큼 줄여 점수 보존
      let winner: PlayerId | null = null;
      let best = 0;
      for (const [id, delta] of Object.entries(p.deltas)) {
        if (delta > best) {
          best = delta;
          winner = id;
        }
      }
      if (winner === null) return event;

      const deltas = { ...p.deltas };
      deltas[ctx.holder] = (deltas[ctx.holder] ?? 0) + refund;
      deltas[winner] = (deltas[winner] ?? 0) - refund;
      return { type: event.type, payload: { ...p, deltas } };
    });
  },
});

export const openRiichi = defineAugment({
  id: "open_riichi",
  tier: "prism",
  name: "개문선언",
  description: "부로한 손으로도 리치를 선언할 수 있다.",
  install(ctx) {
    ctx.setHolderRule("riichi.requiresClosed", false);
  },
});

export const yakulessWin = defineAugment({
  id: "yakuless_win",
  tier: "prism",
  name: "무형화료",
  description: "역이 없어도 화료할 수 있다.",
  install(ctx) {
    ctx.setHolderRule("win.requiresYaku", false);
  },
});

// ─────────────────────────── 새 프롬프트 액션 증강 ───────────────────────────

/** 회수가 만들어내는 이벤트 (매국 1회, 여러 보유자가 있어도 한 번만 등록) */
const RECALL_PERFORMED = "RecallPerformed";
/** 국을 식별하는 키 — roundKey가 들어가 국이 바뀌면 사용 플래그가 자동 초기화된다 */
const recallUsedKey = (state: GameState, player: PlayerId): string => {
  const r = state.round;
  return `recall_used:${r.prevalentWind}-${r.roundNumber}-${r.honba}:${player}`;
};

interface RecallPayload {
  player: PlayerId;
  drawnTileId: TileId;
  recallTileId: TileId;
}

const recallAction: ActionDef<{ recallTileId: TileId }> = {
  type: "recall",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes("discard_recall")) return "no discard_recall augment";
    if (state.augmentData[recallUsedKey(state, req.player)] === true) return "recall already used this round";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (state.round.turnSeat !== player.seat) return "not your turn";
    if (state.round.lastDrawnTile === null) return "no drawn tile to trade";
    const discards = state.zones[discardsZone(req.player)]?.tileIds ?? [];
    if (discards.length === 0) return "no discards to recall";
    if (!discards.includes(req.payload.recallTileId)) return "tile not in your discards";
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: RECALL_PERFORMED,
      payload: {
        player: req.player,
        drawnTileId: state.round.lastDrawnTile as TileId,
        recallTileId: req.payload.recallTileId,
      } satisfies RecallPayload,
    },
  ],
};

/**
 * 회수 (버림패 회수) — 차터의 대표 예시.
 * 새 플레이어 액션을 "엔진 수정 없이" 프롬프트에 노출하는 것을 실증한다.
 * 쯔모패를 버림패로 내보내고 자신의 과거 버림패 하나를 골라 손으로 되가져온다 (매 국 1회).
 * 손패 수는 보존되며, 되가져온 뒤 정상적으로 버림을 이어간다.
 */
export const discardRecall = defineAugment({
  id: "discard_recall",
  tier: "prism",
  name: "회수",
  description: "매 국 한 번, 쯔모한 패를 버리고 자신의 버림패 중 하나를 골라 손으로 되가져온다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(RECALL_PERFORMED)) {
      engine.reducers.register(RECALL_PERFORMED, (state, event) => {
        const p = event.payload as RecallPayload;
        let zones = moveTiles(
          state.zones,
          handZone(p.player),
          discardsZone(p.player),
          [p.drawnTileId],
        );
        zones = moveTiles(zones, discardsZone(p.player), handZone(p.player), [
          p.recallTileId,
        ]);
        return {
          ...state,
          zones,
          round: { ...state.round, lastDrawnTile: p.recallTileId },
          augmentData: { ...state.augmentData, [recallUsedKey(state, p.player)]: true },
        };
      });
    }
    if (!engine.actions.has("recall")) {
      engine.actions.register(recallAction);
    }

    // 보유자 턴에 자기 버림패마다 회수 후보를 프롬프트에 노출
    ctx.holderTurnOptions((state) => {
      const discards = state.zones[discardsZone(holder)]?.tileIds ?? [];
      return discards.map((recallTileId) => ({
        type: "recall",
        payload: { recallTileId },
      }));
    });
  },
});

export const standardAugments: AugmentDef[] = [
  cheapRiichi,
  tsumoBonus,
  ironWall,
  vengeance,
  openRiichi,
  yakulessWin,
  discardRecall,
];
