/**
 * 마작의 거신병 (giant_god, prism) — 동풍전 1·반장전 2회, 내 바닥에 잠든 국사무쌍 13종을
 * 통째로 손으로 끌어올려 그 자리에서 국사무쌍 텐파이를 완성한다.
 *
 * 부수는 상식: "버린 패는 죽은 패". 이 증강은 내 강(버림패 더미)에 흩어져 쌓인
 * 1m9m·1p9p·1s9s·동남서북·백발중 **13종이 한 장씩 전부** 깔리는 순간, 그 13장을
 * 손으로 소환하고 지금 손패를 그 자리(바닥)로 내던진다. 12순 동안 무심코 버려 온
 * 요구패들이 거신병처럼 일어나 손패가 된다.
 *
 * 발동 조건: 보유자 **자기 바닥**이 국사 13종을 모두(각 1장 이상) 포함할 때 액티브가 켜진다.
 *
 * 스왑 규칙 (손패 장수 불변):
 * - 바닥의 13종에서 **종류당 첫 매칭 타일 1장씩**(결정적)을 골라 손으로 올린다 → 정확히 13장 IN.
 * - 손패 앞쪽 **13장**(handIdsOf 순서, 결정적)을 바닥으로 내린다 → 정확히 13장 OUT.
 * - 손패 13장(배패 상태, 아직 안 뽑음)이면 스왑 후 **순수 국사 13면 대기**가 된다.
 * - 손패 14장(막 쯔모)이면 앞 13장만 나가고 뽑은 1장이 남아 14장(국사 13종+여분 1장)이 된다.
 *   어느 쪽이든 "13 OUT / 13 IN"이라 손패 총량은 그대로다.
 *
 * 설계 결정:
 * - **바닥 종류 기록(byPlayer.discardedKinds)은 건드리지 않는다** — 밥상 뒤엎기·무덤 도굴과 같은
 *   규율. 물리 타일만 옮기고 후리텐/버림 순서 메타는 그대로 둔다(엔진 불변).
 * - 결정적(prng 없음): moveTiles 두 번. 리플레이·재개 안전.
 * - 리미트는 게임 1회라는 **횟수뿐**(무페널티 원칙).
 *
 * 구현: 커스텀 액션 하나 + 리듀서 하나.
 * - moveTiles(discards→hand, 국사 13장) 후 moveTiles(hand→discards, 손패 앞 13장).
 *   국사 13장은 바닥 출신, 내보낼 13장은 손패 출신이라 타일 id가 서로 겹치지 않는다.
 * - 발동은 전원 공개(view:*:giant_god:<holder>) — 거신병 각성은 이 증강의 구경거리다.
 */

import {
  defineAugment,
  discardsZone,
  handIdsOf,
  handZone,
  kindKey,
  kindOf,
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
import { counterOf, matchUses, roundViewKey } from "../util.js";

const ID = "giant_god";
const ACTION = "giant_god";
const EVENT = "GiantGodAwakened";

/** 매치당 사용 횟수 카운터 (게임 단위). 동풍전 1·반장전 2회. */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

/** 국사무쌍 13종 (1·9 수패 + 동남서북 + 백발중) */
const KOKUSHI_KINDS = [
  { suit: "man", rank: 1 },
  { suit: "man", rank: 9 },
  { suit: "pin", rank: 1 },
  { suit: "pin", rank: 9 },
  { suit: "sou", rank: 1 },
  { suit: "sou", rank: 9 },
  { suit: "wind", rank: 1 },
  { suit: "wind", rank: 2 },
  { suit: "wind", rank: 3 },
  { suit: "wind", rank: 4 },
  { suit: "dragon", rank: 1 },
  { suit: "dragon", rank: 2 },
  { suit: "dragon", rank: 3 },
] as const;

const KOKUSHI_KEYS: string[] = KOKUSHI_KINDS.map(kindKey);

/**
 * 보유자 바닥에서 국사 13종을 종류당 1장씩 결정적으로 뽑는다.
 * 한 종류라도 없으면 null (아직 발동 불가).
 */
function pickKokushiIds(state: GameState, holder: PlayerId): TileId[] | null {
  const pond = state.zones[discardsZone(holder)]?.tileIds ?? [];
  const out: TileId[] = [];
  for (const key of KOKUSHI_KEYS) {
    const id = pond.find((tid) => kindKey(kindOf(state, tid)) === key);
    if (id === undefined) return null;
    out.push(id);
  }
  return out;
}

/** 지금 거신병을 깨울 수 있는가 (게임 1회 · 자기 턴 · 손패 ≥13 · 바닥에 국사 13종 완비) */
function canAwaken(state: GameState, holder: PlayerId): boolean {
  if (!hasUsesLeft(state, holder)) return false;
  if (state.round.phase !== "turn.act") return false;
  if (playerAtSeat(state, state.round.turnSeat).id !== holder) return false;
  if (handIdsOf(state, holder).length < 13) return false;
  return pickKokushiIds(state, holder) !== null;
}

interface GiantGodPayload {
  holder: PlayerId;
  /** 바닥에서 손으로 올릴 국사 13장 */
  kokushiIds: TileId[];
  /** 손패에서 바닥으로 내릴 앞 13장 */
  handOut: TileId[];
}

const giantGodAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no giant_god augment";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 리치 중에는 손패가 동결된다 (2026-07-29 감사: 자기 리치 검사 누락)
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: hand is frozen";
    }
    if (handIdsOf(state, req.player).length < 13) return "need at least 13 in hand";
    if (pickKokushiIds(state, req.player) === null) {
      return "kokushi 13 kinds are not all in your pond";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const kokushiIds = pickKokushiIds(state, req.player);
    if (kokushiIds === null) throw new Error("giant_god: pond no longer covers kokushi");
    const handOut = handIdsOf(state, req.player).slice(0, 13);
    return [
      {
        type: EVENT,
        payload: {
          holder: req.player,
          kokushiIds,
          handOut: [...handOut],
        } satisfies GiantGodPayload,
      },
    ];
  },
};

export const giantGod: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "마작의 거신병",
  description:
    "(동풍전 1회 · 반장전 2회) 내 바닥에 국사무쌍 13종(1m9m·1p9p·1s9s·동남서북·백발중)이 한 장씩 전부 깔리고 내 순이 오면 액티브 버튼이 켜진다. 발동하면 그 13장을 손으로 끌어올리고 손패를 바닥으로 내던져 그 자리에서 국사무쌍 13면 대기 텐파이 상태가 된다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 내 바닥에 국사무쌍의 요구패 13종이 한 장씩 전부 쌓이고 내 순(turn.act)이 되면 액티브 버튼이 켜진다 — 둘 중 하나라도 아니면 버튼은 나타나지 않는다. 발동하면 바닥의 그 13장이 손으로 올라오고 지금 손패 13장이 그 자리로 내려가 손패 장수는 그대로 유지된다. 배패 상태(손패 13장)에서 발동하면 순수 국사무쌍 13면 대기 텐파이가 되어 요구패 13종 어느 것으로도 화료할 수 있고, 막 쯔모한 14장 상태라면 뽑은 한 장이 남는다. 리치 중에는 손이 잠겨 발동할 수 없으며, 발동은 전원에게 공개된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(giantGodAction);
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as GiantGodPayload;
        // ① 바닥의 국사 13장을 손으로 (손패가 13 → 26 / 14 → 27 로 잠시 늘어난다)
        let zones = moveTiles(
          state.zones,
          discardsZone(p.holder),
          handZone(p.holder),
          p.kokushiIds,
        );
        // ② 원래 손패 앞 13장을 바닥으로 (①에서 올라온 국사와 id가 겹치지 않는다)
        zones = moveTiles(zones, handZone(p.holder), discardsZone(p.holder), p.handOut);

        // ③ 버림 **이력**도 바닥과 맞춘다.
        //
        // 후리텐은 물리 바닥이 아니라 discardedKinds로 판정한다. 그런데 이 증강의
        // 발동 조건이 "바닥에 국사 13종이 전부 있다"이므로, 손대지 않으면 보유자는
        // **13면 대기 전부에 후리텐**이라 론이 원리적으로 불가능했다 — "요구패 13종
        // 어느 것으로도 화료할 수 있다"는 설명이 쯔모에만 참이었다(docs/25 국면 #3).
        //
        // 반대로 바닥으로 내려간 13장은 이력에 없어서, 상대가 "저 패를 버렸으니
        // 안전하다"고 읽으면 그대로 쏘였다(같은 문서 #6).
        //
        // 되가져온 종류는 이력에서 한 장씩 빼고, 내려간 종류는 더한다 — 이력이 곧
        // 바닥이라는 관계를 회복하면 두 문제가 함께 사라진다.
        const pulled = p.kokushiIds.map((id) => kindKey(kindOf(state, id)));
        const rs = state.round.byPlayer[p.holder];
        const history = [...(rs?.discardedKinds ?? [])];
        for (const key of pulled) {
          const at = history.indexOf(key);
          if (at >= 0) history.splice(at, 1);
        }
        history.push(...p.handOut.map((id) => kindKey(kindOf(state, id))));
        const byPlayer =
          rs === undefined
            ? state.round.byPlayer
            : {
                ...state.round.byPlayer,
                [p.holder]: { ...rs, discardedKinds: history },
              };

        return {
          ...state,
          zones,
          round: { ...state.round, byPlayer },
          augmentData: {
            ...state.augmentData,
            [usesKey(p.holder)]: counterOf(state, usesKey(p.holder)) + 1,
            // 전원 공개 — 거신병 각성
            [roundViewKey("*", `${ID}:${p.holder}`)]: true,
          },
        };
      });
    }

    ctx.holderTurnOptions((state) =>
      canAwaken(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );
  },
  // 봇: 제시된다는 것 자체가 국사 텐파이 확정이므로 언제나 발동한다.
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
});
