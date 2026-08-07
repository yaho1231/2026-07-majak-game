/**
 * 북풍 상인 (north_trader, prism) — "여기 4마잖아?!"
 *
 * 삼인마작의 **북빼기**가 4인 마작에 침입한다. 자기 턴에 손에 든 **北**을 공개로 빼놓고
 * 그 자리를 **영상패**로 보충한다. 빼놓은 北은 **나에게만 장당 도라**(1장당 +1판)다.
 *
 * 구현: 코어 변경 없음.
 * - 커스텀 액션 `north_pull{tileId}` + 리듀서 — 北을 **후로 자리**(melds Zone)로 내려놓고,
 *   **왕패 맨 앞(영상패)** 한 장을 손으로 올린 뒤 **패산 최후미** 한 장을 왕패 앞으로 밀어
 *   넣는다. **손패 장수 불변**(1장 나가고 1장 들어온다), **왕패 장수 불변**.
 *   ✅ 2026-07-26 실측 확인: 나가고 들어오는 장수가 정확히 1:1이라 장수는 보존된다.
 *
 * ## 보충은 영상패로 (2026-07-26 사용자 확정)
 * 처음엔 패산 맨 앞에서 보충했는데, 그러면 "다음 사람의 쯔모를 한 장 앞당겨 훔치는" 셈이라
 * 북빼기가 조용한 순번 조작이 돼 버린다. **영상패 경로**로 바꿨다 — 영상패를 뽑고
 * **패산 최후미**에서 한 장을 왕패 앞으로 밀어 넣어 왕패 장수도 표시패 자리도 그대로다.
 * **깡과 다른 점이 바로 이 되채움이다.** 깡의 영상 쯔모는 영상패를 그냥 **소모**해
 * 왕패가 14 → 10장으로 줄지만(2026-07-26 사용자 확정), 북빼기는 뽑은 자리를 메워
 * 왕패 장수도 남은 영상패 수도 그대로다 — 즉 북빼기는 **깡 횟수를 쓰지 않고 영상 쯔모만**
 * 가져온다. 그래서 깡 4회를 다 쓴 뒤에도(영상패 0장) 북빼기는 막힌다: 가져올 영상패가 없다.
 * 부수 효과로 **영상개화(嶺上開花)가 성립한다** — `lastDrawRinshan = true`로 두기 때문이다.
 * 이건 버그가 아니라 이 증강이 사는 이유다: 北 한 장이 영상 쯔모 기회로 바뀐다.
 *
 * - 깡이 아니므로 **깡도라도 안 뒤집히고, 일발도 안 끊긴다** — 북빼기는 후로(鳴き)가 아니다.
 *   4깡 유국(四開槓)에도 세지 않는다. 코어에는 깡 흔적이 전혀 남지 않는다.
 * - 놓는 자리: 삼마와 똑같이 **후로 옆에** 둔다. 예전엔 자기 바닥(discards)에 놓아
 *   버림패 줄에 섞여 보였는데, 버림이 아닌 패가 바닥에 서 있는 게 오해를 불렀다
 *   (2026-07-26 유저 지적). melds Zone은 `visibility.melds = public`이라 전원에게 보이고,
 *   멘젠 판정은 `round.byPlayer[p].melds`(의미 정보)만 보므로 **손은 여전히 닫혀 있다** —
 *   Meld 항목을 만들지 않기 때문이다. 클라이언트는 melds Zone에 있으나 어떤 Meld에도
 *   속하지 않은 패를 '빼놓은 北'으로 알아보고 후로 줄 옆에 **똑바로 세워** 그린다
 *   (후로처럼 눕히지 않는다 — 후로가 아니라는 표시다).
 * - **버림이 아니다** — `discardedKinds`(후리텐 근거)에 기록하지 않고
 *   `lastDiscard`도 건드리지 않으므로 그 北으로 론당하지 않는다(삼마 북빼기와 같은 취급).
 * - `lastDrawnTile`은 **항상** 보충패로 갱신한다. 안 그러면 화면에서 새 쯔모패가 오른쪽
 *   신규패 자리에 안 서고, 쯔모 화료·쯔모기리 판정도 어긋난다.
 * - `score.extraHan` Modifier가 빼놓은 장수만큼 판을 더한다(개인 도라 — 상대에겐 안 붙는다).
 * - 발동 횟수 제한은 두지 않는다 — **北은 세상에 4장뿐**이라 그 자체가 상한이다.
 * - 패산 최후미에서 한 장씩 당겨 오므로 유국이 그만큼 빨라진다(전원이 공유하는 변수).
 */

import {
  DEAD_WALL,
  WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  kindOf,
  meldsZone,
  moveTiles,
  playerAtSeat,
  TILE_DISCARDED,
  rinshanRemaining,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { counterOf, roundViewKey } from "../util.js";
import { handKindsOf, seatWindOf } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "north_trader";
const ACTION = "north_pull";
const EVENT = "NorthPulled";

/** 北의 바람 랭크 */
const NORTH_RANK = 4;

/** 北(바람 4)인가 */
function isNorth(state: GameState, id: TileId): boolean {
  const k = kindOf(state, id);
  return k.suit === "wind" && k.rank === NORTH_RANK;
}

/**
 * **지금 이 사람 앞에 서 있는 빼놓은 北 장수** — 개인 도라 판의 단일 진실.
 *
 * 빼놓은 北은 melds Zone에 놓이되 어떤 Meld에도 속하지 않는다(그래서 손이 닫힌 채로
 * 남는다). 클라이언트가 '빼놓은 北'을 알아보는 기준과 같다.
 *
 * ⚠ 카운터(`pulledKey`)로 세면 안 된다 — 자리 바꿈(seat_swap)이 후로 존을 통째로
 * 맞바꾸면 **北 실물은 상대에게 넘어갔는데 도라 판은 원래 주인에게 남는다**
 * (docs/25 손패 조작 #5). 자기 앞에 없는 패로 판을 받는 셈이다. 상태에서 세면
 * 실물과 점수가 원리적으로 어긋나지 않는다.
 */
function pulledNorthCount(state: GameState, h: PlayerId): number {
  const inMelds = new Set(
    (state.round.byPlayer[h]?.melds ?? []).flatMap((m) => m.tileIds),
  );
  return (state.zones[meldsZone(h)]?.tileIds ?? []).filter(
    (id) => !inMelds.has(id) && isNorth(state, id),
  ).length;
}

const wallIds = (state: GameState): readonly TileId[] =>
  state.zones[WALL]?.tileIds ?? [];

const deadWallIds = (state: GameState): readonly TileId[] =>
  state.zones[DEAD_WALL]?.tileIds ?? [];

interface NorthPulledPayload {
  player: PlayerId;
  tileId: TileId;
  /** 보충으로 손에 올라오는 **영상패** (왕패 맨 앞) */
  replacement: TileId;
}

const pullAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no north_trader augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 리치 중에는 손이 잠겨 있어 북빼기로 손패를 갈 수 없다
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "cannot pull north during riichi";
    }
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    if (!isNorth(state, req.payload.tileId)) return "not a north tile";
    // 영상패를 뽑고 패산 최후미로 왕패를 되채우므로 양쪽 다 남아 있어야 한다.
    // 남은 장수는 배열 길이가 아니라 rinshanRemaining으로 본다 — 깡으로 영상패가
    // 소모된 뒤에는 왕패 맨 앞이 도라 표시패라, 길이로 보면 그걸 손에 넣게 된다.
    if (rinshanRemaining(state) === 0) return "no rinshan tiles left";
    if (wallIds(state).length === 0) return "wall is empty";
    return null;
  },
  toEvents: (req, { state }) => {
    const replacement = deadWallIds(state)[0] as TileId;
    return [
      {
        type: EVENT,
        payload: {
          player: req.player,
          tileId: req.payload.tileId,
          replacement,
        } satisfies NorthPulledPayload,
      },
    ];
  },
};

export const northTrader: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 3,
  name: "북풍 상인",
  description:
    "(상시) 삼인마작의 북빼기. 자기 순에 손의 北을 빼놓고 영상패로 보충하며, 빼놓은 北은 한 장당 도라 1판으로 값한다. 영상패가 떨어지면 더는 못 빼고, 뺄 때마다 패산이 한 장씩 줄어 국이 그만큼 빨리 끝난다.",
  detail:
    "(상시) 삼인마작의 북빼기가 그대로 들어온다. 자기 순에 '북빼기'를 선언하면 손의 北이 옆에 서고 그 자리를 영상패로 보충하며, 빼놓은 北은 한 장당 도라 1판으로 값한다. 보충 쯔모로 화료하면 영상개화가 붙는다. 리치 중에는 쓸 수 없다.\n\n밝혀 둘 대가가 셋 있다.\n\n① **영상패가 다 떨어지면 북빼기도 끝난다.** 보충은 왕패 맨 앞(영상패)에서 오는데, 남이 깡을 칠 때마다 영상패가 하나씩 줄어든다. 깡 네 번이 나온 국에서는 北이 손에 있어도 뺄 수 없다.\n\n② **뺄 때마다 패산이 한 장 줄어든다** — 왕패 장수를 맞추려고 패산 맨 뒤 한 장을 왕패로 옮기기 때문이다. 줄어드는 것은 내 쯔모가 아니라 **테이블 전체의 남은 순목**이라, 북을 많이 뺄수록 그 국은 모두에게 빨리 끝난다.\n\n③ **내 천화·지화가 깨진다.** 북빼기는 '배패 그대로'를 깨는 행위라, 첫 순에 북을 빼면 그 국의 천화·지화는 성립하지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(pullAction);
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as NorthPulledPayload;
        // 北을 후로 자리로 내려놓는다 (버림이 아니다 — discardedKinds·lastDiscard는 건드리지 않는다).
        // Meld 항목은 만들지 않으므로 멘젠은 유지된다 — 물리 위치만 후로 옆이다.
        let zones = moveTiles(
          state.zones,
          handZone(p.player),
          meldsZone(p.player),
          [p.tileId],
        );
        // 영상패(왕패 맨 앞) 한 장을 손으로 — 손패 장수 불변
        zones = moveTiles(zones, DEAD_WALL, handZone(p.player), [p.replacement]);
        // 패산 최후미 한 장을 왕패 '앞'으로 되채운다 — 왕패 장수 유지 + 표시패 자리 불변.
        // **이 되채움이 깡과의 차이다**: 깡의 영상 쯔모는 뽑기만 하고 보충하지 않아
        // 왕패가 줄어든다(flowEvents의 TILE_DRAWN{rinshan} 참고).
        {
          const wall = zones[WALL];
          const dead = zones[DEAD_WALL];
          const last = wall?.tileIds.at(-1);
          if (wall !== undefined && dead !== undefined && last !== undefined) {
            zones = {
              ...zones,
              [WALL]: { ...wall, tileIds: wall.tileIds.slice(0, -1) },
              [DEAD_WALL]: { ...dead, tileIds: [last, ...dead.tileIds] },
            };
          }
        }
        // 보충패가 **항상** 새 쯔모패다 — 화면의 신규패 자리도 이걸 따라간다.
        // 영상패로 뽑았으므로 lastDrawRinshan을 세워 **영상개화가 성립**한다.
        // (깡이 아니므로 깡도라·일발 소멸은 건드리지 않는다.)
        const round = {
          ...state.round,
          lastDrawnTile: p.replacement,
          lastDrawRinshan: true,
          // 북빼기는 '배패 그대로'를 깬다 — 천화·지화의 전제가 사라진다.
          // 예전에는 두 플래그를 그대로 둬서 오야가 첫 순에 북을 뺀 뒤 보충패로 화료하면
          // **천화가 붙었다**(2026-07-29 감사). 삼마 북빼기 룰도 동일하게 천화를 깬다.
          firstTurn: false,
          goAroundBroken: true,
        };
        // 표시도 **실물에서 센다** — 점수(score.extraHan)와 같은 근거를 써야
        // 자리 바꿈 뒤에 "北3장"이라 떠 있는데 판은 0인 어긋남이 안 생긴다.
        const next = pulledNorthCount({ ...state, zones }, p.player);
        return {
          ...state,
          zones,
          round,
          augmentData: {
            ...state.augmentData,
            // 전원 공개 — 몇 장을 빼놓았는지(=도라 몇 판인지)는 테이블의 공유 정보다
            [roundViewKey("*", `${ID}:${p.player}`)]: next,
          },
        };
      });
    }

    /*
     * 표시 재동기화 — 자리 바꿈으로 후로 존이 통째로 넘어가면 실물과 표시가 갈린다.
     * 매 버림마다 실물에서 다시 세어, 이름표의 "北N장"이 점수와 어긋나지 않게 한다.
     */
    ctx.reaction(TILE_DISCARDED, (_event, rc) => {
      const key = roundViewKey("*", `${ID}:${holder}`);
      const shown = counterOf(rc.state, key);
      const actual = pulledNorthCount(rc.state, holder);
      if (shown !== actual) rc.emit(augmentDataSet(key, actual));
    });

    // 빼놓은 北 장당 +1판 (개인 도라 — 보유자에게만)
    engine.rules.addModifier<number>("score.extraHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return cur + pulledNorthCount(state, holder);
      },
    });

    // 손에 北이 있으면 빼놓기 후보를 낸다 (같은 종류라 한 장만 제시하면 충분)
    ctx.holderTurnOptions((state) => {
      const north = handIdsOf(state, holder).find((id) => isNorth(state, id));
      if (north === undefined) return [];
      return [{ type: ACTION, payload: { tileId: north } }];
    });
  },
  // 봇: 北이 손에 있으면 곧바로 뺀다 — 객풍패를 도라로 바꾸는 순수 이득이다.
  /*
   * 봇: 예전에는 옵션이 뜨면 무조건 빼서 **자기 손을 부쉈다** — 北 샹퐁 텐파이·北 커쯔
   * 후보·자일색 진행 중에도 北을 한 장씩 전부 뽑아냈고, 북가(자풍 北)에게는 역패가
   * 사라졌다(2026-07-29 감사). 이득이 명백할 때만 뺀다.
   */
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder, tenpai }) => {
      const opt = options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      if (tenpai) return null; // 텐파이면 손을 건드리지 않는다
      const kinds = handKindsOf(view, holder);
      const norths = kinds.filter(
        (k) => k.suit === "wind" && k.rank === NORTH_RANK,
      ).length;
      if (norths >= 2) return null; // 커쯔·샹퐁 재료 — 빼면 손해다
      if (seatWindOf(view, holder) === NORTH_RANK) return null; // 북가에겐 역패다
      return opt;
    },
  }),
});
