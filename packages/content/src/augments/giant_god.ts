/**
 * 마작의 거신병 (giant_god, prism) — 상시(횟수 제한 없음). 내 바닥에 잠든 국사무쌍 13종을
 * 통째로 손으로 끌어올려 국사무쌍 텐파이를 완성하고, **다음 순에 반드시 화료한다**.
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
 * **다음 순의 화료 예약** (2026-08-12 사용자 지시): 각성한 거신병은 텐파이에서 멈추지
 * 않는다. 발동하면 `giant_god:tsumo:<국>:<보유자>` 예약이 서고, 그 국의 **다음 정상 쯔모**
 * 한 장이 요구패(오름패)로 물질화된다 — 소환(conjure_draw)과 같은 방식으로 이미 뽑은
 * 실물 패의 kind만 바꾸므로 난수도 손패 장수도 건드리지 않는다. 13면 대기 손에 오름패가
 * 오므로 그 순의 쯔모 화료(국사무쌍)가 보장된다.
 * (남이 먼저 화료하거나 유국이면 예약은 국과 함께 사라진다. 스스로 요구패를 버려
 *  손을 무너뜨린 경우에는 부를 수 있는 오름패가 없으므로 아무 일도 일어나지 않는다.)
 *
 * 설계 결정:
 * - **횟수 제한이 없다(상시).** 발동하면 바닥의 요구패 13장이 통째로 손으로 올라오므로
 *   조건("내 바닥에 13종")이 스스로 무너진다 — 다시 쓰려면 13종을 다시 버려 쌓아야 한다.
 *   조건 자체가 리미트라 별도 카운터를 두지 않는다.
 * - 결정적(prng 없음): moveTiles 두 번 + 쯔모패 kind 변경. 리플레이·재개 안전.
 *
 * 구현: 커스텀 액션 하나 + 리듀서 하나 + 쯔모 반응 하나.
 * - moveTiles(discards→hand, 국사 13장) 후 moveTiles(hand→discards, 손패 앞 13장).
 *   국사 13장은 바닥 출신, 내보낼 13장은 손패 출신이라 타일 id가 서로 겹치지 않는다.
 * - 발동은 전원 공개(view:*:giant_god:<holder>) — 거신병 각성은 이 증강의 구경거리다.
 */

import {
  TILE_DRAWN,
  augmentDataSet,
  defineAugment,
  discardsZone,
  handIdsOf,
  handZone,
  kindKey,
  kindOf,
  meldCountOf,
  moveTiles,
  playerAtSeat,
  scoringOptionsOf,
  tileKindChanged,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileDrawnPayload,
  TileId,
} from "@majak/core";
import { flagOf, roundKey, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";

const ID = "giant_god";
const ACTION = "giant_god";
const EVENT = "GiantGodAwakened";

/**
 * "다음 정상 쯔모를 오름패로" 예약 — **국 스코프**다.
 *
 * 게임 스코프로 두면 소비 전에 국이 끝났을 때(남의 화료·유국) 예약이 다음 국의 첫
 * 쯔모를 강탈한다 — 소환(conjure_draw)이 같은 이유로 국 스코프를 쓴다.
 */
const tsumoKey = (state: GameState, h: PlayerId): string =>
  `${ID}:tsumo:${roundKey(state)}:${h}`;

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

/** 지금 거신병을 깨울 수 있는가 (자기 턴 · 손패 ≥13 · 바닥에 국사 13종 완비) */
function canAwaken(state: GameState, holder: PlayerId): boolean {
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
  complexity: 3,
  name: "마작의 거신병",
  description:
    "(상시) **조건: 국사무쌍 13종(1m9m·1p9p·1s9s·동남서북·백발중)을 내가 직접 전부 버려 둬야 한다.** 13종이 모두 내 바닥에 깔린 뒤 내 순이 오면 버튼이 켜지고, 발동하면 그 13장을 손으로 끌어올려 국사무쌍 텐파이가 된 뒤 **다음 순에 반드시 화료한다**.",
  detail:
    "(상시 · 횟수 제한 없음) **증강이 요구패를 깔아 주지 않는다 — 내가 손수 버려서 모아야 한다.** 내 바닥에 국사무쌍의 요구패 13종이 한 장씩 전부 쌓이기 전까지는 버튼이 아예 나타나지 않는다. 남의 바닥은 세지 않는다.\n\n발동하면 바닥의 그 13장과 내 손패가 통째로 자리를 바꿔 국사무쌍 13면 대기가 서고, **다음 순 내 쯔모가 반드시 오름패로 온다**(쯔모 선언은 평소대로 내가 한다). 되가져온 요구패는 후리텐도 풀리므로 그 전에 상대가 요구패를 버리면 론으로 먼저 끝낼 수도 있다.\n\n횟수 제한은 없지만 발동과 동시에 바닥이 비어 조건이 스스로 무너진다. 리치 중에는 쓸 수 없고, 발동은 전원에게 공개된다.",
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
            // 다음 정상 쯔모를 오름패로 — "다음 순에 반드시 화료한다"
            [tsumoKey(state, p.holder)]: true,
            // 전원 공개 — 거신병 각성
            [roundViewKey("*", `${ID}:${p.holder}`)]: true,
          },
        };
      });
    }

    /**
     * 각성 다음 순 — 정상 쯔모 한 장을 오름패로 물질화한다.
     *
     * 이미 뽑힌 실물 패의 kind만 바꾼다(소환과 같은 방식) — 난수를 소비하지 않고
     * 손패 장수도 그대로다. 오름패는 **지금 손으로 화료가 되는 요구패**만 고르므로,
     * 13면 대기든 요구패 한 장을 흘린 뒤든 그 순의 쯔모 화료가 성립한다.
     */
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder) return;
      if (p.rinshan) return; // 영상패(깡 후 쯔모)가 아니라 정상 쯔모 한 장이다
      if (!flagOf(rc.state, tsumoKey(rc.state, holder))) return;
      // 예약은 한 번뿐 — 부를 수 있는 패가 없어도 여기서 비운다
      rc.emit(augmentDataSet(tsumoKey(rc.state, holder), null));
      // 쯔모패를 뺀 손패로 화료가 되는 요구패
      const hand13 = handIdsOf(rc.state, holder)
        .filter((id) => id !== p.tileId)
        .map((id) => kindOf(rc.state, id));
      const wins = winningKinds(
        hand13,
        meldCountOf(rc.state, holder),
        KOKUSHI_KINDS,
        scoringOptionsOf(rc.state, rc.rules, holder),
      );
      const target = wins[0];
      // 스스로 요구패를 버려 손을 무너뜨렸다면 부를 패가 없다 — 아무 일도 하지 않는다
      if (target === undefined) return;
      if (kindKey(kindOf(rc.state, p.tileId)) === kindKey(target)) return; // 이미 오름패다
      rc.emit(
        tileKindChanged([{ tileId: p.tileId, kind: target, attrs: { conjured: true } }]),
      );
    });

    ctx.holderTurnOptions((state) =>
      canAwaken(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );
  },
  // 봇: 제시된다는 것 자체가 국사 텐파이 확정이므로 언제나 발동한다.
  bot: plan({
    intent: "win",
    fleeting: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
