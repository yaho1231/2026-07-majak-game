/**
 * 자리 바꿈 (seat_swap, prism) — 동풍전 1·반장전 2회, 국 첫 순에 상대를 지정하면
 * **그 자리에서 즉시** 그 상대와 자리를 맞바꾼다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b F (52차 버프)
 * 이전엔 효과가 "다음 국부터"라 발동과 체감 사이가 너무 멀었다. 이제 즉시 적용하고,
 * 대신 발동 창을 **국 첫 순(아직 내가 버리지 않은 시점)**으로 좁혀 정합성을 지킨다.
 *
 * 2026-07-25(사용자 지시): **손패까지 교환**한다. 자리(자풍·오야·차례)뿐 아니라
 * 상대의 손패(암패)·후로까지 통째로 가져오고 내 것을 넘긴다. 즉 "그 상대가 되어" 그
 * 자리와 손을 함께 차지한다.
 *
 * 장수 정합(핵심):
 * - 발동자(보유자, p.a)는 지금 턴을 쥔 사람이라 쯔모패 한 장을 포함해 14장(상당)을 든다.
 *   손을 통째로 맞바꾸면 발동자가 13장이 되어 버려 버림을 못 한다. 그래서 **발동자의
 *   쯔모패(lastDrawnTile) 한 장만 발동자에게 남기고** 나머지 암패·후로를 상대와 맞바꾼다.
 *   결과: 발동자 = 상대 암패 + 상대 후로 + 내 쯔모패(14 상당, 턴 유지), 상대 = 내 암패
 *   − 쯔모패 + 내 후로(13 상당). 후로 장수가 달라도 정합이 맞는다.
 * - turnSeat는 "턴을 쥔 사람(발동자)"을 따라 옮긴다 — 사람이 바뀌는 것은 dealerSeat뿐.
 */

import {
  augmentDataSet,
  defineAugment,
  handZone,
  meldsZone,
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
import { counterOf, matchUses, sameHandSize } from "../util.js";

/** 자리 교환 확정 이벤트 (증강 id에서 파생한 이름 — 다른 증강과 충돌 방지) */
const SEATS_SWAPPED = "SeatsSwapped";

interface SeatsSwappedPayload {
  a: PlayerId;
  b: PlayerId;
}

/** 매치당 사용 횟수 카운터 (게임 단위). 동풍전 1·반장전 2회. */
const usesKey = (player: PlayerId): string => `seat_swap:uses:${player}`;
const hasUsesLeft = (state: GameState, player: PlayerId): boolean =>
  counterOf(state, usesKey(player)) < matchUses(state);

const seatSwapAction: ActionDef<{ target: PlayerId }> = {
  type: "seat_swap",
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes("seat_swap")) return "no seat_swap augment";
    if (!hasUsesLeft(state, req.player)) return "seat_swap no uses left";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (req.payload.target === req.player) return "cannot swap with yourself";
    if (!state.players.some((p) => p.id === req.payload.target)) {
      return "unknown target";
    }
    // 배패 장수가 다른 상대(진짜 용 16장 등)와는 손을 통째로 맞바꿀 수 없다 —
    // 손패 수/화료형(scoring.totalSets)은 플레이어에 고정돼 타일과 함께 이동하지 않아
    // 맞바꾸면 양쪽 손이 다 화료 불능이 된다. 드래프트 상호 배제로도 같은 플레이어가
    // 둘을 함께 갖는 일은 막지만, 진짜 용을 **대상**으로 지목하는 교차 케이스는
    // 여기서만 막을 수 있다(다른 플레이어가 진짜 용을 보유).
    if (!sameHandSize(rules, state, req.player, req.payload.target)) {
      return "hand sizes differ";
    }
    // **내** 첫 순에만 — 첫 바퀴(firstTurn) 안에서 내가 아직 한 장도 버리지 않았을 때.
    // 이 창으로 좁혀 두면, 손패를 통째로 맞바꿔도 내 버림 이력이 비어 있어 후리텐 등이
    // 어긋나지 않는다(내가 가져온 새 손과 내 빈 버림은 충돌하지 않는다).
    if (!state.round.firstTurn) return "not the first turn of the round";
    if ((state.round.byPlayer[req.player]?.discardedKinds.length ?? 0) > 0) {
      return "you already discarded this round";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: SEATS_SWAPPED,
      payload: { a: req.player, b: req.payload.target } satisfies SeatsSwappedPayload,
    },
    augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
  ],
};

export const seatSwap: AugmentDef = defineAugment({
  id: "seat_swap",
  tier: "prism",
  category: "disrupt",
  name: "자리 바꿈",
  description:
    "(동풍전 1회 · 반장전 2회) 내 첫 순에 상대 한 명을 지정하면 그 자리에서 즉시 자리와 손패를 통째로 맞바꾼다 — 자풍·오야·차례는 물론 상대의 손패·후로까지 가져온다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 첫 바퀴에서 내가 아직 버리지 않은 시점에 상대 한 명을 지정하면 즉시 그 상대와 자리와 손을 통째로 맞바꾼다. 상대의 자리(자풍·오야·차례)뿐 아니라 손패와 후로까지 내 것이 되고 내 손은 상대에게 넘어간다 — 내가 방금 뽑은 쯔모패 한 장만 내게 남아 그대로 버림을 이어 간다. 효과는 다음 국이 아니라 그 국에서 즉시 적용된다.",
  install(ctx) {
    const { engine } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(SEATS_SWAPPED)) {
      engine.reducers.register(SEATS_SWAPPED, (state, event) => {
        const p = event.payload as SeatsSwappedPayload;
        const a = state.players.find((x) => x.id === p.a);
        const b = state.players.find((x) => x.id === p.b);
        if (a === undefined || b === undefined) {
          throw new Error(`SeatsSwapped: unknown player ${p.a}/${p.b}`);
        }
        // 지금 턴을 쥔 사람 — 자리가 바뀌어도 턴은 이 사람을 따라간다 (장수 정합성)
        const turnPlayer = playerAtSeat(state, state.round.turnSeat).id;
        const seatAfter = (id: PlayerId, current: number): number =>
          id === p.a ? b.seat : id === p.b ? a.seat : current;

        // ── 손패·후로 교환 (발동자 p.a는 쯔모패 한 장을 남긴다) ──
        const aHand = [...(state.zones[handZone(p.a)]?.tileIds ?? [])];
        const bHand = [...(state.zones[handZone(p.b)]?.tileIds ?? [])];
        const aMelds = [...(state.zones[meldsZone(p.a)]?.tileIds ?? [])];
        const bMelds = [...(state.zones[meldsZone(p.b)]?.tileIds ?? [])];
        // 발동자에게 남길 쯔모패 — lastDrawnTile이 발동자 손에 있으면 그것, 없으면 손의 마지막 장
        const drawn = state.round.lastDrawnTile;
        const keep: TileId | undefined =
          drawn !== null && aHand.includes(drawn) ? drawn : aHand[aHand.length - 1];

        let zones = state.zones;
        // 1) 암패 전량을 서로의 손패 존으로 교차 이동 (원래 id 배열로 순서 안전)
        zones = moveTiles(zones, handZone(p.a), handZone(p.b), aHand);
        zones = moveTiles(zones, handZone(p.b), handZone(p.a), bHand);
        // 2) 발동자의 쯔모패 한 장은 되가져온다 (14장 상당 유지 → 버림 가능)
        if (keep !== undefined) {
          zones = moveTiles(zones, handZone(p.b), handZone(p.a), [keep]);
        }
        // 3) 후로 존도 교차 이동 — 후로 장수가 달라도 정합이 맞도록
        zones = moveTiles(zones, meldsZone(p.a), meldsZone(p.b), aMelds);
        zones = moveTiles(zones, meldsZone(p.b), meldsZone(p.a), bMelds);

        // byPlayer.melds(의미 정보)도 함께 맞바꾼다 (물리 존과 일치)
        const rsA = state.round.byPlayer[p.a];
        const rsB = state.round.byPlayer[p.b];
        const byPlayer =
          rsA !== undefined && rsB !== undefined
            ? {
                ...state.round.byPlayer,
                [p.a]: { ...rsA, melds: rsB.melds },
                [p.b]: { ...rsB, melds: rsA.melds },
              }
            : state.round.byPlayer;

        return {
          ...state,
          zones,
          players: state.players.map((pl) =>
            pl.id === p.a
              ? { ...pl, seat: b.seat }
              : pl.id === p.b
                ? { ...pl, seat: a.seat }
                : pl,
          ),
          round: {
            ...state.round,
            byPlayer,
            turnSeat: seatAfter(turnPlayer, state.round.turnSeat),
          },
        };
      });
    }
    if (!engine.actions.has("seat_swap")) {
      engine.actions.register(seatSwapAction);
    }

    // 보유자 턴 프롬프트에 상대별 교환 후보 노출 (validate가 최종 판정).
    // 배패 장수가 다른 상대(진짜 용 등)는 애초에 후보에서 제외한다.
    ctx.holderTurnOptions((state) =>
      state.players
        .filter(
          (p) =>
            p.id !== ctx.holder &&
            sameHandSize(engine.rules, state, ctx.holder, p.id),
        )
        .map((p) => ({ type: "seat_swap", payload: { target: p.id } })),
    );
  },
  // 자리와 손패를 통째로 맞바꾼다 — 내가 오야가 아닐 때, 오야 상대와 바꿔 오야(연장·1.5배
  // 점수)와 그 손패까지 빼앗는다. 이미 오야면 얻을 게 없어 발동하지 않는다.
  bot: {
    choose({ options, view, holder }) {
      const me = view.players.find((p) => p.id === holder);
      if (me === undefined || me.seat === view.round.dealerSeat) return null;
      const dealer = view.players.find((p) => p.seat === view.round.dealerSeat);
      if (dealer === undefined) return null;
      return (
        options.find(
          (o) =>
            o.type === "seat_swap" &&
            (o.payload as { target?: string }).target === dealer.id,
        ) ?? null
      );
    },
  },
});
