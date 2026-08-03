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
 *
 * # 버프 (2026-07-31 사용자 지시)
 *
 * ① **발동 창 확대.** 예전 조건은 `round.firstTurn`(첫 바퀴)이었는데, 이 플래그는
 *    **누가 울거나 깡을 하면 즉시 false**가 된다. 내 앞자리가 퐁 한 번만 해도 그 국의
 *    자리 바꿈은 통째로 사라졌다 — 오야가 아닌 국에서는 거의 못 쓰는 증강이었다.
 *    지금 기준은 **내가 아직 한 장도 버리지 않은 내 순**이다(일확천금·단색 세계와 같은 규약).
 *    손패를 통째로 맞바꿔도 내 버림 이력이 비어 있다는 정합성은 그대로 지켜진다.
 * ② **횟수 +1** (동풍전 2회 · 반장전 3회). 결과가 무작위 손에 달린 도박수라
 *    한 번 빗나가면 게임이 끝나던 것을, 다시 걸어 볼 수 있게 했다.
 *
 * # 국당 1회 (2026-08-02 사용자 지시)
 *
 * 발동 창이 "내가 아직 한 장도 버리지 않은 내 순"이라 손을 맞바꿔도 내 버림 이력은
 * 그대로 비어 있다 — 매치 횟수만 남으면 **같은 순에 연달아** 자리를 갈아탈 수 있었다.
 * 국 스코프 소진 플래그(roundUsedKey)로 한 국에 한 번으로 잠근다.
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
  Meld,
  PlayerId,
  TileId,
} from "@majak/core";
import { counterOf, flagOf, matchUses, roundKey, sameHandSize } from "../util.js";
import {
  breakStealthRiichiEvents,
  ensureStealthBreakReducer,
  riichiBlocksSwap,
} from "./stealthBreak.js";

/** 자리 교환 확정 이벤트 (증강 id에서 파생한 이름 — 다른 증강과 충돌 방지) */
const SEATS_SWAPPED = "SeatsSwapped";

interface SeatsSwappedPayload {
  a: PlayerId;
  b: PlayerId;
}

/** 매치당 사용 횟수 카운터 (게임 단위). 동풍전 2·반장전 3회 (2026-07-31 버프: +1). */
const usesKey = (player: PlayerId): string => `seat_swap:uses:${player}`;
const maxUses = (state: GameState): number => matchUses(state) + 1;
const hasUsesLeft = (state: GameState, player: PlayerId): boolean =>
  counterOf(state, usesKey(player)) < maxUses(state);

/**
 * 이번 국에 이미 썼는가 — **국 스코프**(2026-08-02 사용자 지시: 1국 1회).
 *
 * 발동 창이 "내가 아직 한 장도 버리지 않은 내 순"이라, 손을 맞바꿔도 내 버림 이력은
 * 계속 비어 있다 — 매치 횟수가 남아 있으면 **같은 순에** 연달아 자리를 갈아탈 수
 * 있었다(테이블을 한 순에 두 번 뒤집는다). 국당 1회로 잠근다.
 */
const roundUsedKey = (state: GameState, player: PlayerId): string =>
  `seat_swap:round:${roundKey(state)}:${player}`;

const seatSwapAction: ActionDef<{ target: PlayerId }> = {
  type: "seat_swap",
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes("seat_swap")) return "no seat_swap augment";
    if (!hasUsesLeft(state, req.player)) return "seat_swap no uses left";
    if (flagOf(state, roundUsedKey(state, req.player))) {
      return "seat_swap already used this round";
    }
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
    // 상대가 이미 리치를 선언했다면 손을 통째로 맞바꿀 수 없다 — 리치는 "이 손으로
    // 텐파이 고정"이 전제인데, 손패만 바뀌고 riichi 필드(공탁·일발)는 자리에 남아
    // 리치=텐파이 불변식이 깨진다(원래 대기와 무관한 손을 쥔 채 강제 쯔모기리하게 됨).
    // ⚠ 단 **숨은 리치(스텔스)는 막지 않는다** — 후보에서 빼면 그 빈자리가 곧
    //   "저 사람 리치다"가 되어 은닉이 통째로 깨진다. 대신 맞바꾸는 순간 해제한다.
    if (riichiBlocksSwap(rules, state, req.payload.target)) {
      return "target already riichi";
    }
    // **내** 첫 순에만 — 내가 이 국에서 아직 한 장도 버리지 않았을 때.
    // 이 창이면 손패를 통째로 맞바꿔도 내 버림 이력이 비어 있어 후리텐 등이 어긋나지
    // 않는다(내가 가져온 새 손과 내 빈 버림은 충돌하지 않는다).
    // ⚠ round.firstTurn(첫 바퀴)은 쓰지 않는다 — 남이 울기만 해도 꺼져서, 앞자리
    // 봇의 퐁 한 번에 그 국의 발동 기회가 통째로 사라졌다(2026-07-31 버프).
    if ((state.round.byPlayer[req.player]?.discardedKinds.length ?? 0) > 0) {
      return "you already discarded this round";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => [
    {
      type: SEATS_SWAPPED,
      payload: { a: req.player, b: req.payload.target } satisfies SeatsSwappedPayload,
    },
    augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
    augmentDataSet(roundUsedKey(state, req.player), true),
    // 손이 통째로 바뀌었으면 그 손에 걸려 있던 숨은 리치는 풀린다 (당사자에게만 통보)
    ...breakStealthRiichiEvents(rules, state, req.payload.target, req.player),
  ],
};

export const seatSwap: AugmentDef = defineAugment({
  id: "seat_swap",
  tier: "prism",
  category: "disrupt",
  name: "자리 바꿈",
  description:
    "(동풍전 2회 · 반장전 3회, 국당 1회) 내 첫 순에 상대 한 명을 지정하면 그 자리에서 즉시 자리와 손패를 통째로 맞바꾼다 — 자풍·오야·차례는 물론 상대의 손패·후로까지 가져온다.",
  detail:
    "(동풍전 2회 · 반장전 3회, 한 국에는 1회) 그 국에서 내가 아직 한 장도 버리지 않은 내 순이면 상대 한 명을 지정해 즉시 그 상대와 자리와 손을 통째로 맞바꾼다. 상대의 자리(자풍·오야·차례)뿐 아니라 손패와 후로까지 내 것이 되고 내 손은 상대에게 넘어간다 — 내가 방금 뽑은 쯔모패 한 장만 내게 남아 그대로 버림을 이어 간다. 효과는 다음 국이 아니라 그 국에서 즉시 적용된다. 리치한 상대는 지정할 수 없지만, **숨은 리치(스텔스 리치)는 남들에게 리치가 아닌 사람으로 보이므로 그대로 지정할 수 있고**, 손이 바뀌는 순간 그 리치는 풀린다 — 풀렸다는 사실은 당사자에게만 알려진다.",
  install(ctx) {
    const { engine } = ctx;

    // 숨은 리치 해제 리듀서 (손을 바꾸는 증강 공용 — 등록은 멱등)
    ensureStealthBreakReducer(engine);

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
        //
        // ⚠ calledFrom(누구에게서 울었는가)도 함께 뒤집어야 한다. 그대로 두면
        // "p0가 p1의 버림을 펑" → 자리 교환 후 **p1이 calledFrom: p1인 멘쯔**를
        // 갖는다 — 자기 버림을 자기가 운 셈이 되어 표시와 책임 판정이 자기 자신을
        // 가리킨다(docs/25 손패 #6). 교환 당사자끼리만 뒤집으면 되고, 제3자에게서
        // 운 멘쯔는 그대로다.
        const swapCalledFrom = (melds: readonly Meld[]): Meld[] =>
          melds.map((m) =>
            m.calledFrom === p.a
              ? { ...m, calledFrom: p.b }
              : m.calledFrom === p.b
                ? { ...m, calledFrom: p.a }
                : m,
          );
        const rsA = state.round.byPlayer[p.a];
        const rsB = state.round.byPlayer[p.b];
        const byPlayer =
          rsA !== undefined && rsB !== undefined
            ? {
                ...state.round.byPlayer,
                [p.a]: { ...rsA, melds: swapCalledFrom(rsB.melds) },
                [p.b]: { ...rsB, melds: swapCalledFrom(rsA.melds) },
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
      flagOf(state, roundUsedKey(state, ctx.holder))
        ? []
        : state.players
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
