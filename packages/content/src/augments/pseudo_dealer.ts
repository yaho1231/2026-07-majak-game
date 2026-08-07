/**
 * 찬탈자 (pseudo_dealer, gold) — 자기 턴에 선언하면 그 자리에서 **오야 자리를 빼앗는다**.
 * 2국당 1회 (선언한 국 포함 다음 국까지 쿨다운).
 *
 * 예전엔 "점수 계산에서만 오야 취급"(win.treatAsDealer)이라 화면에는 아무 일도
 * 일어나지 않는 조용한 배율 증강이었다. 지금은 round.dealerSeat 자체를 보유자
 * 자리로 옮긴다 — 그 순간 테이블의 오야 표식이 넘어오고, **자풍이 보유자를 기준으로
 * 다시 매겨진다**(자풍은 `(seat − dealerSeat) % 4`로 유도되므로 규칙 하나로 전파된다).
 *
 * 따라오는 결과 — 코어를 건드리지 않고 전부 자동:
 *  - 화료 점수 오야 배율(1.5배)·오야 쯔모 지불이 보유자 기준으로 계산된다.
 *  - 자풍패 역패가 네 사람 모두 다시 정해진다 (동을 안고 있던 사람이 객풍이 된다).
 *  - 보유자가 화료·텐파이하면 **진짜 연장(렌짱)** 이 된다. 원래 오야는 오야 자격과
 *    연장 권리를 함께 잃는다.
 *
 * ⚠ 오야 **로테이션 순번**(round.rotationSeat)은 건드리지 않는다. 강탈은 그 국의
 * 오야를 빼앗는 것이지 순번표를 다시 쓰는 것이 아니다. 순번까지 옮기면 국 번호는
 * 무조건 +1로 오르므로 한 장 안에서 어떤 자리는 오야를 두 번 하고 어떤 자리는 한 번도
 * 못 한다 — 강탈한 국이 끝나면 원래 순번(다음 자리)에서 이어진다.
 *
 * 상태 흐름 (augmentData):
 *   "pseudo_dealer:cd:{holder}" — 남은 쿨다운(국 수). 선언 시 2, 매 국 종료마다 −1.
 *     0(또는 미설정)일 때만 다시 선언할 수 있다.
 */

import {
  ROUND_SETTLED,
  augmentDataSet,
  defineAugment,
  playerAtSeat,
  playerOf,
} from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId } from "@majak/core";
import { plan } from "./botPlan.js";

const ID = "pseudo_dealer";
const ACTION = "claim_dealer";
const EVENT = "DealerUsurped";
/** 남은 쿨다운(국 수). 0/미설정이면 사용 가능 */
const cooldownKey = (player: PlayerId): string => `${ID}:cd:${player}`;
/** 선언 시 설정하는 쿨다운(선언한 국 + 다음 국) */
const COOLDOWN_ROUNDS = 2;

interface DealerUsurpedPayload {
  holder: PlayerId;
  /** 새 오야 자리 = 보유자의 자리 */
  seat: number;
}

const claimDealerAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no pseudo_dealer augment";
    const cooldown = state.augmentData[cooldownKey(req.player)];
    if (typeof cooldown === "number" && cooldown > 0) {
      return "claim_dealer on cooldown";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.dealerSeat === player.seat) return "already the dealer";
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: EVENT,
      payload: {
        holder: req.player,
        seat: playerOf(state, req.player).seat,
      } satisfies DealerUsurpedPayload,
    },
    augmentDataSet(cooldownKey(req.player), COOLDOWN_ROUNDS),
  ],
};

export const pseudoDealer: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "disrupt",
  complexity: 3,
  name: "찬탈자",
  description:
    "(2국에 1회) 자기 순에 선언하면 그 자리에서 오야를 빼앗는다 — 오야 자리가 나에게 넘어오고 자풍이 나를 기준으로 다시 정해진다. 내가 오르면 진짜 연장(렌짱)이다.",
  detail:
    "(2국에 1회) 자기 순에 선언하면 오야 자리가 즉시 나에게 넘어오고 네 사람의 자풍이 내 자리를 기준으로 다시 매겨진다 — 동을 안고 있던 사람이 객풍이 되기도 한다. 화료 점수는 오야 배율(1.5배)이 되고, 그 국에 화료하거나 텐파이로 유국하면 연장이 걸린다. 원래 오야는 오야 자격과 연장 권리를 함께 잃는다. 다만 오야 순번표 자체는 그대로라, 이 국이 끝나면 원래 순번에서 이어진다. 이미 내가 오야인 국에는 선언할 수 없다.",
  // 봇: 텐파이일 때 선언한다 — 화료가 유력한 국에서 오야 자리를 가져와 점수를 키운다.
  //     (쿨다운·이미 오야면 validate가 옵션을 걸러 자동으로 건너뛴다.)
  bot: plan({
    intent: "score",
    oneShot: true,
    pick: ({ options, tenpai }) =>
      tenpai ? (options.find((o) => o.type === ACTION) ?? null) : null,
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(EVENT)) {
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as DealerUsurpedPayload;
        const next: GameState = {
          ...state,
          round: { ...state.round, dealerSeat: p.seat },
        };
        return next;
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(claimDealerAction);
    }

    // 국 종료마다 쿨다운 1 감소 (오야 자리는 되돌리지 않는다 — 진짜로 빼앗은 것이다)
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      const cooldown = rc.state.augmentData[cooldownKey(holder)];
      if (typeof cooldown === "number" && cooldown > 0) {
        rc.emit(augmentDataSet(cooldownKey(holder), cooldown - 1));
      }
    });

    // 보유자 턴 프롬프트에 선언 후보 노출 (validate가 최종 판정)
    ctx.holderTurnOptions(() => [{ type: ACTION, payload: {} }]);
  },
});
