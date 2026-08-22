/**
 * full_hand_swap (통째로 바꾸기) — 게임당 2회, 국의 첫 순(turnCount<=1)에
 * 상대의 손패를 **통째로 강탈**한다.
 *
 * 2026-07-22 (48차 재설계, 사용자 확정): 맞교환 → **일방적 강탈**.
 *   ① 상대의 손패 전체가 내 손으로 온다.
 *   ② 내 손패(쯔모패 제외)는 상대가 아니라 **패산 맨 밑으로** 들어간다.
 *   ③ 상대는 패산 위에서 같은 장수를 새로 받는다.
 * 예전 맞교환은 내 배패가 상대에게 넘어가 **상대를 강화**할 수 있었다 —
 * 무페널티 원칙(10_AUGMENT_SYSTEM §0)에 어긋나므로 그 경로를 끊었다.
 *
 * 패 수지: 내 13장이 패산에 들어가고 상대가 패산에서 13장을 받으므로 패산 총량은 불변.
 * 내 패는 배열 끝(맨 밑)에 들어가고 상대는 앞에서 받으므로, 상대가 방금 빼앗긴
 * 자기 패를 그대로 돌려받는 일은 없다.
 */

import {
  WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
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
import { counterOf, publishUsesLeft, roundViewKey, sameHandSize } from "../util.js";
import { handAlteredMark } from "./handAltered.js";
import { clearedHandMarks } from "./handMarkChannels.js";
import {
  breakStealthRiichiEvents,
  ensureStealthBreakReducer,
  riichiBlocksSwap,
} from "./stealthBreak.js";
import { handIsPoor } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "full_hand_swap";
const ACTION = "hand_swap";
/** 게임당 사용 가능 횟수 */
const MAX_USES = 2;
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const FULL_HAND_SWAP_PERFORMED = "FullHandSwapPerformed";
/** 게임 단위 사용 횟수 카운터 키 */
const usedKey = (player: PlayerId): string => `${ID}:used:${player}`;

interface FullHandSwapPayload {
  holder: PlayerId;
  target: PlayerId;
  /** 보유자 → 패산 맨 밑으로 들어가는 손패 (쯔모패 제외) */
  toWall: TileId[];
  /** 상대 → 보유자에게 통째로 넘어오는 손패 */
  steal: TileId[];
  /** 패산 위에서 상대에게 새로 지급되는 패 (steal과 같은 장수) */
  refill: TileId[];
}

// 배패 장수(deal.handSize)가 다른 상대는 강탈할 수 없다 — 진짜 용(16장) 등.
// 판정은 util.sameHandSize 한 곳으로 통일한다(사본이 갈라져 가드가 빠지는 것을 방지).

const wallLen = (state: GameState): number =>
  state.zones[WALL]?.tileIds.length ?? 0;

const handSwapAction: ActionDef<{ target: PlayerId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no full_hand_swap augment";
    if (counterOf(state, usedKey(req.player)) >= MAX_USES) {
      return "hand_swap already used";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.turnCount > 1) return "only on the first turn";
    // 보유자 자신이 리치 중이면 손패가 동결된다 — 대상의 리치만 보고 자기 리치를
    // 빠뜨리면 리치를 세워 둔 채 손 13장을 통째로 갈아치울 수 있었다
    // (2026-08-20 QA riichi 확정 7). `hand_swap3.commonReject`와 같은 규약.
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: hand is frozen";
    }
    // 쯔모를 마친 순이어야 한다. 치·펑 직후에도 turn.act이지만 그때는 lastDrawnTile이
    // null이고, 교환 로직이 "보유자는 쯔모패 한 장을 더 들고 있다"를 전제하므로
    // **손패가 한 장 모자란 채로 남아 그 국 내내 벽돌**이 된다(docs/25 손패 #1).
    // turnCount는 친의 쯔모에만 오르므로 첫 바퀴 내내 1이라, 후로 직후가 이 창에 든다.
    if (state.round.lastDrawnTile === null) return "no drawn tile";
    const target = state.players.find((p) => p.id === req.payload.target);
    if (target === undefined) return "unknown target";
    if (target.id === req.player) return "cannot target yourself";
    // 보이는 리치만 막는다 — 숨은 리치(스텔스)를 여기서 빼면 후보 목록의 빈자리가
    // 곧 "저 사람 리치다"가 된다. 숨은 리치는 대상으로 삼되 아래에서 해제한다.
    if (riichiBlocksSwap(rules, state, target.id)) {
      return "target is in riichi";
    }
    if (!sameHandSize(rules, state, req.player, target.id)) {
      return "hand sizes differ";
    }
    // 상대에게 지급할 보충패가 패산에 있어야 한다
    if (wallLen(state) < handIdsOf(state, target.id).length) {
      return "not enough wall tiles";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const drawn = state.round.lastDrawnTile;
    const steal = [...handIdsOf(state, req.payload.target)];
    const payload: FullHandSwapPayload = {
      holder: req.player,
      target: req.payload.target,
      toWall: handIdsOf(state, req.player).filter((id) => id !== drawn),
      steal,
      // 내 패는 배열 끝에 붙으므로 앞쪽 N장은 그대로다 (validate가 길이를 보장)
      refill: (state.zones[WALL]?.tileIds ?? []).slice(0, steal.length),
    };
    return [
      { type: FULL_HAND_SWAP_PERFORMED, payload },
      // 손을 통째로 뺏겼으면 그 손에 걸려 있던 숨은 리치는 풀린다 (당사자에게만 통보)
      ...breakStealthRiichiEvents(rules, state, req.payload.target, req.player),
    ];
  },
};

export const fullHandSwap: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 1,
  name: "통째로 바꾸기",
  description:
    "(게임 내 2회) 국의 첫 순에 상대를 지정해 그 손패를 통째로 강탈한다. 내 손패는 패산 맨 밑으로 들어가고, 상대는 패산에서 새로 받는다. 리치를 선언한 상대에게는 쓸 수 없다.",
  detail:
    "(게임 내 2회) 교환이 아니라 강탈이라 내 배패가 상대에게 넘어가지는 않는다. 손패 장수가 다른 상대도 지정할 수 없다.\n\n**숨은 리치는 리치가 아닌 사람으로 보여 그대로 지정할 수 있고**, 손을 뺏기는 순간 풀린다. 쯔모패가 없는 상태나 패산이 모자랄 때도 발동하지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, MAX_USES - counterOf(state, usedKey(holder))),
      total: MAX_USES,
    }));

    // 숨은 리치 해제 리듀서 (손을 바꾸는 증강 공용 — 등록은 멱등)
    ensureStealthBreakReducer(engine);

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(FULL_HAND_SWAP_PERFORMED)) {
      engine.reducers.register(FULL_HAND_SWAP_PERFORMED, (state, event) => {
        const p = event.payload as FullHandSwapPayload;
        // ① 내 손패를 패산 맨 밑(배열 끝)으로 — 상대에게 넘어가지 않는다
        let zones = moveTiles(state.zones, handZone(p.holder), WALL, p.toWall);
        // ② 상대 손패를 통째로 내 손으로
        zones = moveTiles(zones, handZone(p.target), handZone(p.holder), p.steal);
        // ③ 상대는 패산 위에서 같은 장수를 새로 받는다 (①에서 넣은 내 패는 맨 밑이라 안 걸린다)
        zones = moveTiles(zones, WALL, handZone(p.target), p.refill);
        const next: GameState = {
          ...state,
          zones,
          augmentData: {
            ...state.augmentData,
            [usedKey(p.holder)]: counterOf(state, usedKey(p.holder)) + 1,
            // 누구를 털었는지 전원 공개 (Rule #4 대응의 전제)
            [roundViewKey("*", `${ID}:${p.holder}`)]: p.target,
            // 천화·지화 게이트를 닫는다 — 발동 창(turnCount<=1)이 천화 창과 정확히
            // 겹치므로, 표식이 없으면 "상대 배패가 완성형이면 강탈해서 천화"가
            // 확률이 아니라 **선택**이 된다(2026-08-22 QA aug-2 확정 2, 48,000점 실측).
            // 손이 바뀐 것은 강탈자만이 아니다 — 대상도 패산에서 새 손을 받으므로
            // **양쪽 모두** 배패가 아닌 손이 된다.
            ...handAlteredMark(state, p.holder),
            ...handAlteredMark(state, p.target),
            /*
             * 손을 따라가지 못하는 **공개 표식**을 걷는다.
             *
             * 손패의 실물 흔적(생성패·`conjured`·적도라)은 이미 패를 따라간다.
             * 그런데 "누가 무슨 색으로 통일했다" 같은 국 스코프 채널은 원주인 자리에
             * 남아, 화면이 **엉뚱한 좌석을 가리키는 거짓말**이 됐다 — 세 좌석이 전부
             * 잘못된 대상에게 베타오리했다 (QA synergy3 handedit 확정 7, 2026-08-23).
             * 양쪽 다 지운다: 대상은 손을 빼앗겼고, 강탈자도 자기 손을 패산에 넘겼다.
             */
            ...clearedHandMarks(state, p.holder, p.target),
          },
        };
        return next;
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(handSwapAction);
    }

    // 보유자 턴에 상대마다 후보 노출 — 합법성은 validate가 최종 판정.
    // 배패 장수가 다른 상대(진짜 용 등)는 애초에 후보에서 제외한다.
    ctx.holderTurnOptions((state) =>
      state.round.byPlayer[holder]?.riichi != null
        ? []
        : state.players
        .filter(
          (p) =>
            p.id !== holder &&
            sameHandSize(engine.rules, state, holder, p.id),
        )
        .map((p) => ({ type: ACTION, payload: { target: p.id } })),
    );
  },
  // 내 손이 명백히 나쁠 때만 상대 손을 통째로 강탈한다. 상대 손 속은 볼 수 없으므로
  // 대상은 무작위로 고른다(누구를 뺏어도 내 쓰레기 손보다는 기대값이 높다).
  // 나쁜 손이 곧 발동 조건 — planner의 `advance` 적기와 방향이 반대다(위 개벽 참고)
  bot: plan({
    // 상대 손패를 통째로 강탈한다 — 갈아엎기다
    intent: "rewrite",
    fleeting: true,
    pick: (ctx) => {
      if (!handIsPoor(ctx)) return null;
      const mine = ctx.options.filter((o) => o.type === ACTION);
      if (mine.length === 0) return null;
      return mine[ctx.rng.int(mine.length)] ?? mine[0] ?? null;
    },
  }),
});
