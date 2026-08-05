/**
 * suit_unify (단색 세계) — 동풍전 1·반장전 2회, 어느 국이든 첫 패를 받은 직후 액티브 버튼으로 발동한다.
 * **만·통·삭 중 원하는 색을 직접 골라** 손패의 수패를 전부 그 색으로 바꾼다.
 * **청일색까지 그대로 인정된다.**
 *
 * 버튼은 각 국에서 자기 첫 타패 전(자기 턴)에 뜨며, 동풍전 1·반장전 2회만 쓸 수 있다(usedKey). 어느
 * 국의 첫 순에 쓸지 스스로 고르며, 한 국의 첫 순을 넘겨도 다음 국의 첫 순에 다시 기회가 온다.
 *
 * 2026-07-22 (48차): **청일색 봉인 삭제 + 색 무작위 → 플레이어 선택.** "동풍전 1·반장전 2회"라는 횟수 제한이 이미 리미트이므로
 * 능력에 페널티를 겹쳐 붙이지 않는다 — 수패를 한 색으로 만들어 주면서 청일색을 막는 것은
 * 스스로 준 것을 도로 빼앗는 설계였다 (10_AUGMENT_SYSTEM §0 "리미트는 횟수로 준다").
 *
 * # 패 수지: 개벽과 같은 실물 교환 (2026-07-31 사용자 확정)
 *
 * 예전에는 손패의 kind를 그 자리에서 덮어써(conjured) 색만 바꿨다. 그러면 같은 종류가
 * 게임에 5장 이상 존재하는 비정상 분포가 생기고, 남은 패를 세는 쪽(대기·안전패 계산)이
 * 전부 틀어진다. 지금은 **개벽(genesis)과 같은 규약**으로 처리한다:
 *  - 바꿔야 할 수패는 패산에 있는 **같은 숫자·목표 색의 실물 패**와 1:1로 맞바꾼다.
 *    (숫자를 유지해야 손 모양이 그대로 한 색으로 옮겨진다 — 이 증강의 본질이다.)
 *  - 내보낸 손패는 패산 맨 밑으로 반납되어 계속 돈다.
 *  - 패산에 그 숫자의 목표 색 패가 남아 있지 않을 때만, 잔여를 그 자리에서 종류 변경으로
 *    생성한다(conjured 표식). 적도라(red)는 새 종류로 이어지지 않는다.
 *  - 쯔모패가 교환되어 나가면 그 자리에 들어온 패가 새 쯔모패가 된다("14번째 패" 불변식).
 */

import { augmentDataSet, defineAugment, playerAtSeat } from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  ProposedEvent,
  Suit,
} from "@majak/core";
import { counterOf, matchUses, roundViewKey } from "../util.js";
import {
  NUMBER_SUITS,
  monoWorldEvent,
  registerMonoWorldReducer,
} from "./suitUnifyCore.js";
import { handKindsOf } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "suit_unify";
const ACTION = "mono_world";

/** 매치당 사용 횟수 카운터 (게임 단위). 동풍전 1·반장전 2회. */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

/** 지금이 '첫 패를 받은 직후'인가 — 어느 국이든 자기 턴·아직 이 국에서 안 버렸을 때 */
function atFirstHand(state: GameState, holder: PlayerId): boolean {
  const r = state.round;
  if (r.phase !== "turn.act") return false;
  if (playerAtSeat(state, r.turnSeat).id !== holder) return false;
  // 누명이 discardedKinds를 남의 이력으로 돌리므로 실제 버림 횟수로 센다(docs/25 P5)
  return (r.byPlayer[holder]?.discardCount ?? 0) === 0;
}

/**
 * 통일 이벤트 + 이 증강의 기록(사용 횟수·공개 채널).
 * 실물 패 교환 자체는 `suitUnifyCore`가 단일 진실이다 — 편식(picky_eater)과 공유한다.
 */
function unifyEvents(
  state: GameState,
  holder: PlayerId,
  suit: Suit,
): ProposedEvent<string, unknown>[] {
  return [
    monoWorldEvent(state, holder, suit),
    augmentDataSet(usesKey(holder), counterOf(state, usesKey(holder)) + 1),
    // 어떤 색으로 통일됐는지 전원 공개
    augmentDataSet(roundViewKey("*", `${ID}:${holder}`), suit),
  ];
}

const monoWorldAction: ActionDef<{ suit: Suit }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no suit_unify augment";
    }
    if (!hasUsesLeft(state, req.player)) return "already used";
    if (!atFirstHand(state, req.player)) return "only on the first hand";
    if (!NUMBER_SUITS.includes(req.payload.suit)) return "invalid suit";
    return null;
  },
  toEvents: (req, { state }) => unifyEvents(state, req.player, req.payload.suit),
};

export const suitUnify: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "단색 세계",
  description:
    "(동풍전 1회 · 반장전 2회) 국의 첫 패를 받은 뒤 자기 첫 타패 전에 발동하며, 만·통·삭 중 원하는 색을 골라 손패의 수패를 전부 그 색으로 바꾼다. 숫자는 그대로 유지되고 청일색도 인정된다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 어느 국이든 첫 패를 받은 뒤 자기 첫 타패 전에 액티브 버튼이 뜬다. 만·통·삭 중 색을 직접 골라 손패의 수패를 숫자는 그대로 둔 채 전부 그 색으로 바꾸며, 통일된 색으로 청일색까지 그대로 인정된다. 새 패는 패산에 있는 같은 숫자의 실물과 맞바꿔 오고(내 패는 패산 맨 밑으로 돌아간다), 패산에 그 숫자가 남아 있지 않을 때만 그 자리에서 새로 만들어진다. 어느 색으로 물들였는지는 전원에게 공개된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능).
    // 실물 패 교환 리듀서는 편식(picky_eater)과 공유한다.
    registerMonoWorldReducer(engine);
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(monoWorldAction);
    }

    // 규칙 봉인 없음 — 통일해 준 색으로 청일색까지 그대로 노릴 수 있다 (48차).

    // 첫 국 첫 패를 받은 자기 턴에만 발동 버튼을 노출한다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (!atFirstHand(state, holder)) return [];
      // 만·통·삭 세 후보를 제시 — 어떤 색으로 통일할지 플레이어가 고른다
      return NUMBER_SUITS.map((suit) => ({ type: ACTION, payload: { suit } }));
    });
  },
  // 수패를 전부 한 색으로 몰아 청일색을 노린다. 텐파이면 손을 깨므로 발동하지 않고,
  // 수패가 충분할 때(≥5장) 가장 많은 색으로 통일해 rank 충돌을 최소화한다.
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder, tenpai }) => {
      if (tenpai) return null;
      const counts: Record<string, number> = { man: 0, pin: 0, sou: 0 };
      let total = 0;
      for (const k of handKindsOf(view, holder)) {
        if (k.suit in counts) {
          counts[k.suit] = (counts[k.suit] ?? 0) + 1;
          total++;
        }
      }
      if (total < 5) return null; // 수패가 적으면 청일색 전환 이득이 작다
      let bestSuit = "man";
      for (const s of ["man", "pin", "sou"]) {
        if ((counts[s] ?? 0) > (counts[bestSuit] ?? 0)) bestSuit = s;
      }
      return (
        options.find(
          (o) => o.type === ACTION && (o.payload as { suit?: string }).suit === bestSuit,
        ) ?? null
      );
    },
  }),
});
