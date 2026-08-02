/**
 * 정적의 손 (silent_swap, prism) — "아무도 리치를 걸지 않은 조용한 국에서만 열리는 창".
 *
 * 그 국에 리치가 단 하나도 없을 때, 자기 턴에 **네 명 전원의 바닥(버림패 더미)**에서
 * 아무 패나 1장을 골라 손으로 가져온다. 국당 1회. 발동한 국에 화료하면 +2판.
 *
 * 설계 결정:
 * - **이 증강만은 무페널티 원칙의 명시적 예외다**(사용자 지정). 리스크는 방총이다 —
 *   가져오기만 하고 버림은 소비하지 않으므로 같은 턴의 프롬프트가 곧바로 다시 열리고,
 *   거기서 **표준 discard**로 한 장을 버리게 된다. 그 버림에 상대의 론이 붙는 것이
 *   이 증강의 도박성이다 (커스텀 액션이 직접 화료·정산을 만들지 않는다 — 함정 6).
 * - **손패 장수는 보존한다.** 이번 턴의 쯔모패는 패산 맨 밑으로 되돌리고 무덤에서
 *   꺼낸 패가 새 쯔모패가 된다(날치기 pond_snatch·무덤 도굴 grave_rob과 같은 계열).
 *   손패가 영구히 한 장 늘면 13장 전제의 화료 분해가 통째로 깨져 화료 자체가
 *   불가능해지므로, 엔진 불변식을 지키는 이 형태로 구현했다.
 * - **대상은 내 바닥을 포함한 네 명의 바닥 전부.** 후보가 수십 장이 되므로 클라이언트는
 *   전용 모달로 바닥을 통째로 펼쳐 보여준다 — payload는 `{ tileId }` 하나로 유지한다.
 * - 원주인의 바닥 기록(discardedKinds)은 **건드리지 않는다** — 바닥에서 패가 빠져도
 *   후리텐 판정은 이 이력을 쓰므로 그대로 둬야 안전하다.
 * - 리치가 하나라도 걸린 국에서는 발동할 수 없다. "정적"이 이 증강의 조건이다.
 */

import {
  WALL,
  defineAugment,
  discardsZone,
  handIdsOf,
  handZone,
  kindKey,
  kindOf,
  moveTiles,
  playerAtSeat,
  visibleTileIdsIn,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { addWinHanBonus, flagOf, riichiHidden, roundKey, roundViewKey } from "../util.js";
import { handKindsOf, usefulIn } from "./botHelpers.js";

const ID = "silent_swap";
const ACTION = "silent_take";
const EVENT = "SilentSwapTaken";
/** 발동한 국에 화료하면 얻는 추가 판수 (구 +4500점 → 3판 → 2판, 2026-07-26) */
const WIN_BONUS_HAN = 2;

/** 국당 1회 — roundKey가 섞여 국이 바뀌면 자동 만료 */
const usedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:used:${roundKey(state)}:${h}`;

/**
 * 이번 국에 리치를 건 사람이 하나라도 있는가.
 *
 * ⚠ **숨은 리치(스텔스 리치)는 세지 않는다.** 이 증강은 "누가 리치를 걸었을 때"만
 * 버튼이 열리므로, 스텔스 리치로 열어 버리면 버튼이 켜지는 것만으로 "누군가 리치다"가
 * 새어 나간다 — 아무도 모르는 것이 그 증강의 전부다(2026-08-02 감사).
 */
function anyRiichi(
  rules: Parameters<typeof riichiHidden>[0],
  state: GameState,
): boolean {
  return state.players.some(
    (p) =>
      state.round.byPlayer[p.id]?.riichi != null && !riichiHidden(rules, state, p.id),
  );
}

/** 그 패가 놓여 있는 바닥의 주인 (어느 바닥에도 없으면 null) */
function pondOwnerOf(state: GameState, tileId: TileId): PlayerId | null {
  for (const p of state.players) {
    if ((state.zones[discardsZone(p.id)]?.tileIds ?? []).includes(tileId)) {
      return p.id;
    }
  }
  return null;
}

interface SilentSwapPayload {
  holder: PlayerId;
  /** 패산 맨 밑으로 되돌릴 쯔모패 */
  drawnId: TileId;
  /** 바닥에서 손으로 가져오는 패 */
  takenId: TileId;
  /** 그 바닥의 주인 */
  fromPlayer: PlayerId;
}

const silentTakeAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no silent_swap augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    if (anyRiichi(rules, state)) return "riichi declared: the room is not silent";
    const drawn = state.round.lastDrawnTile;
    if (drawn === null) return "no drawn tile to trade";
    if (!handIdsOf(state, req.player).includes(drawn)) return "drawn tile not in hand";
    if (pondOwnerOf(state, req.payload.tileId) === null) {
      return "tile is not in any pond";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: EVENT,
      payload: {
        holder: req.player,
        drawnId: state.round.lastDrawnTile as TileId,
        takenId: req.payload.tileId,
        fromPlayer: pondOwnerOf(state, req.payload.tileId) as PlayerId,
      } satisfies SilentSwapPayload,
    },
  ],
};

export const silentSwap: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "정적의 손",
  description:
    "(매 국 1회 — 그 국에 아무도 리치를 걸지 않았을 때) 자기 순에 네 명 전원의 바닥에서 버림패 1장을 골라 손으로 가져온다(쯔모패는 패산으로). 발동한 국에 화료하면 +2판을 얻는다.",
  detail:
    "(매 국 1회 — 그 국에 아무도 리치를 걸지 않았을 때) 자기 순에 네 사람의 바닥 전체에서 한 장을 골라 손으로 가져오고, 그 순의 쯔모패는 패산 맨 밑으로 돌아간다. 리치가 하나라도 걸린 국에서는 발동할 수 없다. 가져온 뒤 이어지는 같은 순의 버림에는 방총 위험이 그대로 적용된다. 원래 주인의 바닥 기록은 남아 그 사람의 후리텐은 유지되고, 내 바닥에서 가져와도 내 후리텐은 풀리지 않는다. 발동한 국에 화료하면 +2판을 얻는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션·리듀서는 게임당 한 번만 등록 (여러 명이 같은 증강을 가질 수 있다)
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(silentTakeAction);
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as SilentSwapPayload;
        // 쯔모패는 패산 맨 밑으로 → 바닥의 패를 손으로 (손패 장수 보존).
        // 바닥의 패 1장이 패산으로 옮겨 간 셈이라 패산이 1장 늘어 국이 1쯔모 길어진다
        // (날치기 pond_snatch와 동일한 성질 — 손패 13장 전제를 지키기 위한 대가다).
        let zones = moveTiles(state.zones, handZone(p.holder), WALL, [p.drawnId]);
        zones = moveTiles(zones, discardsZone(p.fromPlayer), handZone(p.holder), [
          p.takenId,
        ]);
        return {
          ...state,
          zones,
          // 가져온 패가 새 쯔모패 — 이어지는 버림 흐름 유지
          round: { ...state.round, lastDrawnTile: p.takenId },
          augmentData: {
            ...state.augmentData,
            [usedKey(state, p.holder)]: true,
            // 전원 공개 — 누구의 바닥에서 무엇이 걸어 나왔는지가 이 증강의 구경거리다
            [roundViewKey("*", `${ID}:${p.holder}`)]: {
              from: p.fromPlayer,
              kind: kindKey(kindOf(state, p.takenId)),
            },
          },
        };
      });
    }

    /*
     * 보유자 턴 후보: 네 명 전원의 바닥 중 **보유자에게 실제로 보이는 패만**.
     *
     * 안개 계열(박무·숨은 강)이 가려 놓은 바닥까지 후보로 내면, 보유자는 뒷면인
     * 패를 집게 되어 "무엇을 가져오는지 보고 고른다"는 이 능력이 제비뽑기가 된다
     * (클라이언트는 뷰에 없는 tileId를 빈 패로 그린다). 보이지 않는 바닥에는
     * 손을 넣지 않는다 — 정보와 규칙을 같은 선에 맞춘다(2026-08-02 감사).
     */
    ctx.holderTurnOptions((state) => {
      if (flagOf(state, usedKey(state, holder))) return [];
      if (state.round.phase !== "turn.act") return [];
      if (playerAtSeat(state, state.round.turnSeat).id !== holder) return [];
      if (anyRiichi(engine.rules, state)) return [];
      const out: { type: string; payload: { tileId: TileId } }[] = [];
      for (const p of state.players) {
        for (const tileId of visibleTileIdsIn(
          state,
          engine.rules,
          holder,
          discardsZone(p.id),
        )) {
          out.push({ type: ACTION, payload: { tileId } });
        }
      }
      return out;
    });

    // 발동한 국에 화료하면 +2판
    addWinHanBonus(ctx, (state) =>
      flagOf(state, usedKey(state, holder)) ? WIN_BONUS_HAN : 0,
    );
  },
  /**
   * 봇: 네 바닥을 통틀어 **내 손을 진전시키는 패**(짝을 만들거나 슌쯔 이웃)가 있으면
   * 가져온다 — 날치기(pond_snatch)와 같은 판단이다. 텐파이면 대기를 흐트러뜨리지
   * 않도록 손대지 않는다. (발동 국 화료 시 +2판이 따라온다.)
   */
  bot: {
    choose({ options, view, holder, tenpai }) {
      if (tenpai) return null;
      const kinds = handKindsOf(view, holder);
      for (const o of options) {
        if (o.type !== ACTION) continue;
        const tileId = (o.payload as { tileId?: number }).tileId;
        const k = tileId !== undefined ? view.tiles[tileId]?.kind : undefined;
        if (k === undefined) continue;
        if (usefulIn(kinds, k)) return o;
      }
      return null;
    },
  },
});
