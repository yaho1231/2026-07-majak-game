/**
 * 날치기 (pond_snatch, prism).
 * 동풍전 3회·반장전 5회, 자기 턴에 쯔모하는 대신 상대가 **최근에 버린 3장** 중 1장을 주워 손에
 * 넣는다. 후로로 치지 않아 멘젠이 유지되며(리치도 가능), 원래 주인의 바닥 기록은
 * 그대로 남아 그 상대의 후리텐 판정은 유지된다.
 *
 * # 버프 (2026-07-31 사용자 지시)
 *
 * 예전에는 **각자의 마지막 한 장**만 대상이라, 발동 가능한 순에 쓸모 있는 패가 깔려
 * 있을 확률이 낮았다. 쯔모 한 번을 통째로 내주는 비용에 비해 건질 것이 없어 그 횟수를
 * 다 쓰지 못하고 게임이 끝나기 일쑤였다. 이제 **각 상대의 최근 3장**까지 손이 닿는다 —
 * 같은 값이면 지금 필요한 패를 고를 수 있어 "쯔모를 포기할 만한가"가 실제 판단이 된다.
 *
 * 구현: 자기 턴(이미 쯔모한 상태)에서 쯔모패를 패산 맨 밑으로 되돌리고(take_back과
 * 동일) 상대의 최근 버림패를 손으로 가져와 lastDrawnTile로 삼는 커스텀 이벤트.
 * byPlayer.discardedKinds(후리텐 근거)는 건드리지 않아 원주인 후리텐이 보존된다.
 *
 * # 주운 패로 나는 것 (2026-08-08 감사, docs/28 §2-9)
 *
 * 주운 패가 `lastDrawnTile`이 되므로 그 패로 **쯔모 화료가 성립한다** — 무덤 도굴
 * (grave_rob)·정적의 손(silent_swap)과 같은 계열이고, 이 엔진은 그 셋을 모두
 * "지불은 쯔모 취급"으로 처리한다. 문제는 **후리텐이 통째로 빠져 있었다**는 것이다.
 * 코어의 쯔모 분기에는 후리텐 검사가 없다(표준 룰: 쯔모는 후리텐과 무관). 그 결과
 * 후리텐 플레이어가 자기 오름패가 강에 깔리기를 기다렸다가 주워 멘젠쯔모로 나고
 * 상대 셋이 전부 지불했다.
 *
 * 이름은 쯔모지만 실체는 **남이 버린 패로 나는 것**이다. 후리텐은 바로 그 상황에
 * 붙는 벌이므로, 주운 패가 지금의 쯔모패인 동안에만 코어 규칙 `win.tsumoFuriten`을
 * 보유자에게 켠다. 다음 쯔모가 오면 자연히 꺼진다(패산에서 뽑은 패는 예전 그대로).
 */

import {
  WALL,
  augmentDataSet,
  defineAugment,
  discardedByPlayer,
  discardsZone,
  handZone,
  moveTiles,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { counterOf, publishUsesLeft, replaceDrawnTile, scaledUses } from "../util.js";
import { handKindsOf, hasNeighbor } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";
import { handAlteredMark } from "./handAltered.js";

const ID = "pond_snatch";
const ACTION = "pond_snatch";
const EVENT = "PondSnatchPerformed";
/**
 * **동풍전 기준** 사용 횟수 — 반장전은 `scaledUses`가 1.5배(올림)로 늘린다
 * (동풍전 3회 · 반장전 5회, 2026-08-23 사용자 지시).
 * 매치 예산은 원래 동풍전(4국)을 기준으로 잡혀 있어서, 국이 두 배 도는 반장전에서
 * 같은 카드가 국당 절반 값이 됐다.
 */
const TONPUU_USES = 3;
/** 이 매치에서 쓸 수 있는 총 횟수 (동풍전 3 · 반장전 5) */
const maxUses = (state: GameState): number => scaledUses(state, TONPUU_USES);
/** 손이 닿는 깊이 — 각 상대의 **최근 SNATCH_DEPTH장** (2026-07-31 버프: 1 → 3) */
const SNATCH_DEPTH = 3;
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
/**
 * 이 국에서 **마지막으로 주운 패**의 id. 지금의 `lastDrawnTile`과 같을 때만
 * "손에 든 쯔모패가 바닥에서 온 패"라는 뜻이다 — 다음 쯔모가 오면 자연히 어긋난다.
 * 국을 섞어 오판하지 않게 국 키를 넣는다.
 */
const takenKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "taken", state, h);
const wallLen = (state: GameState): number =>
  state.zones[WALL]?.tileIds.length ?? 0;

interface PondSnatchPayload {
  holder: PlayerId;
  drawnId: TileId;
  snatchId: TileId;
  fromPlayer: PlayerId;
}

/** 각 상대의 최근 버림패 SNATCH_DEPTH장 (바닥 맨 끝부터) */
function recentDiscards(
  state: GameState,
  holder: PlayerId,
): { fromPlayer: PlayerId; snatchId: TileId }[] {
  const out: { fromPlayer: PlayerId; snatchId: TileId }[] = [];
  for (const p of state.players) {
    if (p.id === holder) continue;
    const ids = state.zones[discardsZone(p.id)]?.tileIds ?? [];
    for (const snatchId of ids.slice(-SNATCH_DEPTH)) {
      out.push({ fromPlayer: p.id, snatchId });
    }
  }
  return out;
}

const pondSnatchAction: ActionDef<{ snatchId: TileId; fromPlayer: PlayerId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no pond_snatch augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: cannot snatch";
    }
    if (counterOf(state, usedKey(req.player)) >= maxUses(state)) return "no uses left";
    if (state.round.lastDrawnTile == null) return "no drawn tile";
    if (state.round.lastDrawRinshan) return "cannot snatch after a rinshan draw";
    if (wallLen(state) === 0) return "wall is empty";
    if (req.payload.fromPlayer === req.player) return "cannot snatch your own pond";
    /*
     * 바닥의 주인만 보면 누명(frame_up)으로 남의 바닥에 심어 둔 **내 패**를 도로
     * 집을 수 있었다 (QA synergy3 handedit 확정 2, 2026-08-23). 근거를 실제 버린
     * 사람으로 옮긴다 — 강 회수 3종이 같은 판정을 쓴다.
     */
    if (discardedByPlayer(state, req.player, req.payload.snatchId)) {
      return "cannot snatch a tile you discarded";
    }
    const pond = state.zones[discardsZone(req.payload.fromPlayer)]?.tileIds ?? [];
    if (!pond.slice(-SNATCH_DEPTH).includes(req.payload.snatchId)) {
      return "not among the recent discards";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const payload: PondSnatchPayload = {
      holder: req.player,
      drawnId: state.round.lastDrawnTile as TileId,
      snatchId: req.payload.snatchId,
      fromPlayer: req.payload.fromPlayer,
    };
    return [{ type: EVENT, payload }];
  },
};

export const pondSnatch: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 2,
  name: "날치기",
  description:
    "(동풍전 3회 · 반장전 5회) 방금 쯔모한 패 대신 상대 셋의 최근 버림패 9장 중 1장을 훔쳐온다. 단 후리텐이면 쯔모로 화료할 수 없다.",
  detail:
    "그 순의 쯔모패는 패산 맨 밑으로 가고, 주운 패를 넣은 뒤 한 장을 버린다. 후로가 아니라서 멘젠은 깨지지 않는다. 원주인의 바닥 기록은 남아 그쪽 후리텐도 유지된다.\n\n주운 패로 나는 화료는 지불이 쯔모 취급이지만 **후리텐이면 화료할 수 없다**. 리치 중이거나 영상패를 잡은 순, 패산이 바닥난 국에는 쓸 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, maxUses(state) - counterOf(state, usedKey(holder))),
      total: maxUses(state),
    }));

    if (!engine.reducers.has(EVENT)) {
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as PondSnatchPayload;
        // 쯔모패를 패산 맨 밑으로 되돌리고
        let zones = moveTiles(state.zones, handZone(p.holder), WALL, [p.drawnId]);
        // 상대 바닥의 최근 버림패를 손으로 (바닥 기록 discardedKinds는 유지 → 후리텐 보존)
        zones = moveTiles(
          zones,
          discardsZone(p.fromPlayer),
          handZone(p.holder),
          [p.snatchId],
        );
        return {
          ...state,
          zones,
          round: {
            ...replaceDrawnTile(state.round, p.snatchId),
            // 바닥에서 걷어 간 패가 마지막 버림패였다면 그 표식을 비운다 —
            // 후로가 패를 가져갈 때 CALL_MADE가 하는 것과 같은 처리다
            // (2026-08-20 QA hand 확정 7). 비우지 않으면 `round.lastDiscard`가
            // **이미 바닥에 없는 패**를 가리켜, 세 좌석 뷰의 tiles 맵에 어느 가시 존에도
            // 없는 패의 정체가 실리고 `lastDiscardFrom` 낡은 표식도 걸러지지 않는다.
            lastDiscard:
              state.round.lastDiscard?.tileId === p.snatchId
                ? null
                : state.round.lastDiscard,
          },
          augmentData: {
            ...state.augmentData,
            // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다 (handAltered.ts 참고)
            ...handAlteredMark(state, p.holder),
            [usedKey(p.holder)]: counterOf(state, usedKey(p.holder)) + 1,
            // 이 패로 화료하면 후리텐 판정을 받는다 (아래 win.tsumoFuriten Modifier)
            [takenKey(state, p.holder)]: p.snatchId,
          },
        };
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(pondSnatchAction);
    }

    /**
     * 주운 패가 지금의 쯔모패인 동안, 이 보유자의 **쯔모 화료에 후리텐을 태운다**.
     * 남이 버린 패로 나는 것이므로 표준 론과 같은 판정을 받아야 한다(파일 머리말).
     * setHolderRule은 상수만 걸 수 있어 여기서는 Modifier로 직접 짠다.
     */
    ctx.engine.rules.addModifier<boolean>("win.tsumoFuriten", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        const taken = state.augmentData[takenKey(state, holder)];
        if (typeof taken !== "number") return cur;
        return state.round.lastDrawnTile === taken ? true : cur;
      },
    });

    ctx.holderTurnOptions((state) => {
      if (counterOf(state, usedKey(holder)) >= maxUses(state)) return [];
      if (state.round.lastDrawnTile == null) return [];
      return recentDiscards(state, holder).map((d) => ({
        type: ACTION,
        payload: { snatchId: d.snatchId, fromPlayer: d.fromPlayer },
      }));
    });
  },
  // 쯔모 대신 상대 버림패를 줍는다(동풍전 3회·반장전 5회) — 쯔모 기회를 쓰는 만큼, 주운 패가
  // 확실히 손을 진전시킬 때만(짝을 만들거나 슌쯔로 이어질 때) 발동한다. 텐파이면
  // 그냥 오름패를 노리는 게 나으므로 발동하지 않는다.
  bot: plan({
    intent: "advance",
    // 매치 예산이 정해져 있다 — 회수할 순목이 남아 있을 때만 태운다.
    pick: ({ options, view, holder, tenpai }) => {
      if (tenpai) return null;
      const kinds = handKindsOf(view, holder);
      for (const o of options) {
        if (o.type !== ACTION) continue;
        const snatchId = (o.payload as { snatchId?: number }).snatchId;
        const k = snatchId !== undefined ? view.tiles[snatchId]?.kind : undefined;
        if (k === undefined) continue;
        if (kinds.some((x) => x.suit === k.suit && x.rank === k.rank) || hasNeighbor(kinds, k)) {
          return o;
        }
      }
      return null;
    },
  }),
});
