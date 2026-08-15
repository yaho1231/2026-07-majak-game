/**
 * 손바닥 뒤집기 (palm_flip, prism) — "리치를 건 채로, 손바닥 뒤집듯 대기를 바꾼다."
 *
 * 동풍전 1·반장전 2회. **리치 중** 자기 순에 손패 한 장을 골라 패산 맨 위 한 장과 맞바꾼다.
 * 리치는 그대로 서 있고(공탁도 그대로) 오름패만 갈린다 — 첫 리치를 기준으로 짠 세 사람의
 * 안전패 계산이 통째로 휴지조각이 된다.
 *
 * ## 2026-08-15 (사용자 지시) — 승부수와 겹쳐서 갈랐다
 *
 * 예전의 손바닥 뒤집기는 **리치 해제 + 같은 국 재리치 무료**였다. 그런데 승부수
 * (`last_stand`)가 **리치 해제 + 리치봉 환급**이라, 둘 다 "자기 순에 리치를 취소하는
 * 버튼"이어서 화면에서도 손놀림에서도 사실상 같은 증강이었다(사용자 지적).
 * 그래서 이쪽에서 **해제를 걷어냈다** — 리치를 유지한 채 대기만 갈아탄다.
 *
 *  · 승부수 = 리치를 **접는** 수단(폴드). 봉을 돌려받고 손이 풀린다.
 *  · 손바닥 뒤집기 = 리치를 **유지한 채 갈아타는** 수단(공격). 손은 계속 잠겨 있다.
 *
 * ## 규칙 하나: 바꿔도 텐파이가 유지되는 패만 고를 수 있다
 *
 * 리치는 텐파이가 전제인데 교환으로 텐파이가 깨지면 그 리치는 유국까지 아무 일도 못 하는
 * 죽은 리치가 된다(무페널티 원칙 §0에 어긋난다). 그래서 **교환 후에도 텐파이인 패만**
 * 후보로 낸다 — 들어올 패는 엔진이 이미 알고 있으므로 결정적으로 판정된다.
 * 쯔모패 자신은 후보가 아니다(그건 무르기의 몫이다).
 *
 * 리치 후리텐은 함께 풀린다 — 오름패가 통째로 바뀌었는데 예전 대기 때문에 못 나는 것은
 * 이 증강이 약속한 "갈아타기"가 아니다.
 *
 * 구현: 커스텀 이벤트 `RiichiPalmFlipped` 리듀서가 패 두 장을 옮기고 riichiFuriten만 내린다.
 * 리치 상태(`riichi`)와 공탁(`riichiPot`)은 손대지 않는다 — 환급도 재선언도 없다.
 */

import {
  WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  kindOf,
  moveTiles,
  playerAtSeat,
  scoringOptionsOf,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
} from "@majak/core";
import {
  counterOf,
  matchUses,
  publishUsesLeft,
  roundKey,
  roundViewKey,
} from "../util.js";
import { waitTilesLeft } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "palm_flip";
const ACTION = "flip_riichi";
const EVENT = "RiichiPalmFlipped";

/** 매치당 사용 횟수 (동풍1/반장2) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

interface FlipPayload {
  player: PlayerId;
  /** 손에서 패산 맨 밑으로 내려가는 패 */
  out: TileId;
  /** 패산 맨 위에서 손으로 들어오는 패 */
  in: TileId;
}

/** 패산 맨 위 한 장 (없으면 null) */
function wallTop(state: GameState): TileId | null {
  return state.zones[WALL]?.tileIds[0] ?? null;
}

/**
 * `out`을 내보내고 `incoming`을 받은 뒤, 쯔모패를 버리고 나면 텐파이인가.
 * 리치 중이므로 이번 순에 버릴 패는 쯔모패로 정해져 있다(쯔모기리 강제).
 */
function tenpaiAfterSwap(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
  out: TileId,
  incoming: TileId,
): boolean {
  const drawn = state.round.lastDrawnTile;
  if (drawn === null) return false;
  const ids = handIdsOf(state, player).filter((id) => id !== out && id !== drawn);
  const kinds = [...ids, incoming].map((id) => kindOf(state, id));
  const melds = state.round.byPlayer[player]?.melds.length ?? 0;
  return (
    winningKinds(kinds, melds, undefined, scoringOptionsOf(state, rules, player))
      .length > 0
  );
}

/** 지금 이 사람이 교환을 시도할 수 있는 상황인가 (패 선택과 무관한 공통 조건) */
function commonReject(state: GameState, player: PlayerId): string | null {
  const p = state.players.find((x) => x.id === player);
  if (p === undefined || !p.augments.includes(ID)) return "no palm_flip augment";
  if (state.round.phase !== "turn.act") return "not in act phase";
  if (playerAtSeat(state, state.round.turnSeat).id !== player) return "not your turn";
  if (state.round.byPlayer[player]?.riichi == null) return "not in riichi";
  if (!hasUsesLeft(state, player)) return "no uses left this game";
  if (state.round.lastDrawnTile === null) return "no drawn tile";
  if (wallTop(state) === null) return "wall is empty";
  return null;
}

/** 교환 후보가 되는 손패 (쯔모패 제외 + 바꿔도 텐파이가 유지되는 패만) */
function swappable(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
): TileId[] {
  const incoming = wallTop(state);
  if (incoming === null) return [];
  const drawn = state.round.lastDrawnTile;
  return handIdsOf(state, player).filter(
    (id) => id !== drawn && tenpaiAfterSwap(state, rules, player, id, incoming),
  );
}

const flipAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const common = commonReject(state, req.player);
    if (common !== null) return common;
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    if (req.payload.tileId === state.round.lastDrawnTile) {
      return "cannot swap the drawn tile";
    }
    const incoming = wallTop(state);
    if (incoming === null) return "wall is empty";
    if (!tenpaiAfterSwap(state, rules, req.player, req.payload.tileId, incoming)) {
      return "not tenpai after swap";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: EVENT,
      payload: {
        player: req.player,
        out: req.payload.tileId,
        in: wallTop(state) as TileId,
      } satisfies FlipPayload,
    },
    augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
    // 전원 공개 — 상대는 이 사람의 리치 정보에 유통기한이 있다는 걸 알아야 한다
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), roundKey(state)),
  ],
};

export const palmFlip: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  complexity: 2,
  name: "손바닥 뒤집기",
  description:
    "(동풍전 1회 · 반장전 2회) 리치 중 자기 순에 손패 한 장을 패산 맨 위 한 장과 맞바꾼다 — 리치는 그대로인데 오름패만 갈린다. 상대가 짜 둔 안전패 계산이 그 자리에서 무너진다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 리치를 건 채로 자기 순에 발동하면 손패 한 장이 패산 맨 위 한 장과 맞바뀐다. 내보낸 패는 패산 맨 밑으로 내려가고 패산 총량은 변하지 않는다. 리치는 유지되므로 공탁을 돌려받지도, 다시 걸지도 않는다 — 바뀌는 것은 오직 대기다.\n\n고를 수 있는 패는 **바꿔도 텐파이가 유지되는 패**뿐이다(텐파이가 깨지는 교환은 후보에 뜨지 않는다). 이번 순에 뽑은 쯔모패 자체는 바꿀 수 없다.\n\n리치로 생긴 후리텐(오름패를 넘겨 생긴 영구 후리텐 포함)은 함께 풀린다 — 대기가 통째로 바뀌었기 때문이다. 발동 사실은 전원에게 공개된다.",
  /**
   * 스텔스 리치와는 함께 갖지 않는다 — 저쪽의 conflicts에도 같은 이유가 적혀 있다.
   * 이 증강은 발동을 **전원에게 공개**하고, 그 공개는 곧 "저 사람 리치였구나"의 확정이다.
   */
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(flipAction);
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as FlipPayload;
        const rs = state.round.byPlayer[p.player];
        if (rs === undefined) return state;
        // ① 고른 패를 패산 맨 밑으로 ② 패산 맨 위 한 장을 손으로
        let zones = moveTiles(state.zones, handZone(p.player), WALL, [p.out]);
        zones = moveTiles(zones, WALL, handZone(p.player), [p.in]);
        return {
          ...state,
          zones,
          round: {
            ...state.round,
            byPlayer: {
              ...state.round.byPlayer,
              // 리치(riichi)는 그대로 — 대기가 바뀌었으므로 리치 후리텐만 내린다
              [p.player]: { ...rs, riichiFuriten: false },
            },
          },
        };
      });
    }

    ctx.holderTurnOptions((state) => {
      if (commonReject(state, holder) !== null) return [];
      return swappable(state, engine.rules, holder).map((tileId) => ({
        type: ACTION,
        payload: { tileId },
      }));
    });
  },
  /**
   * 승부수(`last_stand`)가 물러서는 수단이라면 이쪽은 **대기를 갈아타는 수단**이다.
   * 그래서 판단 기준도 위험이 아니라 "지금 대기가 죽었는가"다 — 오름패가 세상에 한 장도
   * 남지 않은 리치는 그대로 두면 유국까지 아무 일도 일어나지 않는다.
   *
   * 후보로 뜨는 패는 이미 "바꿔도 텐파이가 유지되는 패"라 손을 망칠 걱정이 없다.
   * 남은 판단은 시점뿐이다 — 아직 새 대기로 화료할 순목이 남아 있을 때만 켠다.
   */
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: (ctx) => {
      const opt = ctx.options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      if (!ctx.tenpai) return null;
      if (ctx.wallLeft < 12) return null; // 새 대기로 화료할 시간이 없다
      return waitTilesLeft(ctx) === 0 ? opt : null;
    },
  }),
});
