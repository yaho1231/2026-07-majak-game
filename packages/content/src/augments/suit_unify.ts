/**
 * suit_unify (단색 세계) — 동풍전 1·반장전 2회, **국의 첫 순에만** 액티브 버튼으로 발동한다.
 * **만·통·삭 중 원하는 색을 직접 골라** 손패의 수패를 전부 그 색으로 바꾼다.
 * **청일색까지 그대로 인정된다.**
 *
 * 2026-08-23: **발동창을 다시 «첫 순»으로 되돌렸다** (사용자 지시).
 * 2026-08-16에 개벽(genesis)과 같게 "자기 순이면 언제든"으로 넓혔던 창이다. 그런데
 * 그러면 이 증강이 **손을 보고 나서 확실한 자리에만 꽂는 물건**이 된다 — 배패를 걸고
 * 색을 정하는 도박이 사라지고, 남의 버림과 자기 진행을 다 본 뒤 청일색으로 갈아타는
 * 후반 확정타가 됐다. 지금 조건은: 자기 순(turn.act) · **이 국에서 아직 한 장도 안 버림**
 * · 리치 중이 아님 · 한 국에 한 번까지. 마지막 조건이 남아 있는 이유는 이 액션이 턴을
 * 넘기지 않기 때문이다 — 없으면 같은 첫 순에 남은 매치 횟수를 전부 태울 수 있다.
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
import {
  counterOf,
  flagOf,
  matchUses,
  publishUsesLeft,
  roundViewKey,
} from "../util.js";
import {
  NUMBER_SUITS,
  monoWorldEvent,
  registerMonoWorldReducer,
} from "./suitUnifyCore.js";
import { handKindsOf } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "suit_unify";
const ACTION = "mono_world";

/** 매치당 사용 횟수 카운터 (게임 단위). 동풍전 1·반장전 2회. */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

/**
 * 이번 국에 이미 물들였는가 (국 스코프).
 *
 * 이 액션은 손패를 통째로 바꾸면서도 **턴을 넘기지 않는다**. 국당 1회로 묶지 않으면
 * 같은 순에 남은 매치 횟수를 전부 태울 수 있다 (개벽 genesis와 같은 이유·같은 배관).
 */
const unifiedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "unified", state, h);

/**
 * 지금 발동할 수 있는가 — **자기 첫 순**(turn.act·이 국에서 아직 안 버림)·리치 중이
 * 아님·이 국에 아직 안 씀.
 *
 * 첫 순 판정은 `round.firstTurn`(첫 바퀴)이 아니라 **내 버림 횟수**로 센다. 그 플래그는
 * 천화·지화용이라 누구든 울면 꺼지고, 반대로 남이 울어서 내 순이 건너뛰어진 뒤에도
 * "내 첫 순"은 아직 오지 않은 것이라 남의 사정에 좌우되면 안 된다. 누명(frame_up)이
 * `discardedKinds`를 남의 이력으로 돌리므로 종류가 아니라 `discardCount`를 본다
 * (docs/25 P5).
 */
function canUnify(state: GameState, holder: PlayerId): boolean {
  const r = state.round;
  if (r.phase !== "turn.act") return false;
  if (playerAtSeat(state, r.turnSeat).id !== holder) return false;
  if (r.byPlayer[holder]?.riichi != null) return false;
  if ((r.byPlayer[holder]?.discardCount ?? 0) !== 0) return false; // 첫 순만
  if (flagOf(state, unifiedKey(state, holder))) return false; // 국당 1회
  return true;
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
    augmentDataSet(unifiedKey(state, holder), true),
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
    if (!canUnify(state, req.player)) {
      return "not your first turn (or riichi, or already this round)";
    }
    if (!NUMBER_SUITS.includes(req.payload.suit)) return "invalid suit";
    return null;
  },
  toEvents: (req, { state }) => unifyEvents(state, req.player, req.payload.suit),
};

export const suitUnify: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 2,
  name: "단색 세계",
  description:
    "(동풍전 1회 · 반장전 2회 · 매 국 1회) **국의 첫 순에만** 발동한다. 만·통·삭 중 색을 골라 손패의 수패를 전부 그 색으로 바꾼다. 숫자는 그대로다.",
  detail:
    "(동풍전 1회 · 반장전 2회 · 매 국 1회) 배패를 받고 **아직 한 장도 버리지 않은 자기 순**에만 발동한다 — 한 장이라도 버리면 그 국의 기회는 사라지고 다음 국의 첫 순에 다시 온다. 통일된 색으로 청일색이 인정되고, 어느 색인지는 전원에게 공개된다. 새 패는 패산의 같은 숫자와 맞바꿔 오고 내 패는 패산 맨 밑으로 간다. 리치 중에는 발동할 수 없다.\n\n⚠ **적도라(빨간 5)를 물들이면 그 빨간색은 사라진다.**",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능).
    // 실물 패 교환 리듀서는 편식(picky_eater)과 공유한다.
    registerMonoWorldReducer(engine);
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(monoWorldAction);
    }

    // 규칙 봉인 없음 — 통일해 준 색으로 청일색까지 그대로 노릴 수 있다 (48차).

    // 자기 순이면 언제든 발동 버튼을 노출한다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (!canUnify(state, holder)) return [];
      // 만·통·삭 세 후보를 제시 — 어떤 색으로 통일할지 플레이어가 고른다
      return NUMBER_SUITS.map((suit) => ({ type: ACTION, payload: { suit } }));
    });
  },
  // 수패를 전부 한 색으로 몰아 청일색을 노린다. 텐파이면 손을 깨므로 발동하지 않고,
  // 수패가 충분할 때(≥5장) 가장 많은 색으로 통일해 rank 충돌을 최소화한다.
  bot: plan({
    // 손패의 수패를 통째로 한 색으로 바꾼다 — 갈아엎기다
    intent: "rewrite",
    /*
     * 2026-08-23: 발동창이 다시 "그 국의 첫 순"으로 좁아졌다. 그래도 `fleeting`은 붙이지
     * 않는다 — 이 국을 넘겨도 **다음 국의 첫 순**에 같은 기회가 오므로 "지금 아니면 없는"
     * 발동이 아니다. 적기는 planner의 `rewrite` 판정(잡손일수록 값이 난다)에 맡기고,
     * 게임당 1~2회뿐이라 `oneShot`으로 문턱을 한 칸 더 올린다.
     */
    oneShot: true,
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
