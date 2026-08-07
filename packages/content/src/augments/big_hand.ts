/**
 * 큰손 (big_hand, prism) — 액티브 선언형.
 * 첫 패를 받은 자기 첫 턴에만 액티브 버튼이 활성화되며, 2국에 1회 선언할 수 있다.
 * 선언한 그 국에 화료하면 그 손은 최소 만관(오야 12000 / 자 8000)이 된다 —
 * 값이 만관에 못 미치면 판(뱅크)에서 차액을 채워 받는다.
 *
 * 선언은 그 국 시작 시점(첫 턴)에 미리 걸어야 하므로, 어느 국에 걸지 고르는 것이
 * 전부다 — 빠르게 선제 화료할수록 값싼 손이 그대로 만관이 된다.
 *
 * 구현(국 단위 게이팅 — declared=roundKey일 때만):
 * - addWinPointBonus로 (만관 하한 − 실제 화료점)만큼 화료 보너스를 얹는다.
 * info.points는 "본장·공탁 제외 화료 획득점"이라 하한 비교에 그대로 쓴다.
 */

import {
  ROUND_SETTLED,
  SETTLE_STAGE,
  augmentDataSet,
  defineAugment,
  meldCountOf,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  roundKey,
  settleInterceptor,
  stringOf,
  trackRoundSeq,
  withAugPoint,
} from "../util.js";
import { plan } from "./botPlan.js";

/** 만관 하한 — 자(子) 8000 / 오야(親) 12000 */
const MANGAN_NONDEALER = 8000;
const MANGAN_DEALER = 12000;

const ID = "big_hand";
const ACTION = "declare_big_hand";
/** 쿨다운 — 한 번 선언하면 이만큼 국(본장 포함)이 지나야 다시 열린다 */
const COOLDOWN_ROUNDS = 2;
/** 마지막으로 선언한 국의 roundKey (효과 게이팅용 — 그 국에만 효과가 산다) */
const declaredKey = (h: PlayerId): string => `${ID}:round:${h}`;

/** 이번 국에 큰손을 선언한 상태인가 (효과는 선언한 그 국에만 적용) */
function declaredThisRound(state: GameState, holder: PlayerId): boolean {
  return stringOf(state, declaredKey(holder)) === roundKey(state);
}

/**
 * 선언 가능 여부 — 2국에 1회. 선언 이력이 없거나, 마지막 선언 이후 배패가 2번
 * 더 이루어졌을 때만 다시 선언할 수 있다.
 *
 * ⚠ **본장도 한 국으로 센다** — 동1국0본장에 쓰고 동1국1본장을 지나 동2국에 가면
 * 두 국이 지난 것이다(2026-08-01 사용자 확정). roundKey를 자릿수로 쪼개 비교하던
 * 예전 방식은 이 경우를 쿨다운에 가뒀다(no_retreat와 동일 결함).
 */
function canDeclare(state: GameState, holder: PlayerId): boolean {
  if (declaredThisRound(state, holder)) return false; // 이번 국엔 이미 걸었다
  return cooldownReady(state, ID, holder, COOLDOWN_ROUNDS);
}

const declareAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no big_hand augment";
    }
    // 2국에 1회 — 선언한 국·바로 다음 국은 쿨다운
    if (!canDeclare(state, req.player)) return "on cooldown";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 첫 패를 받은 첫 턴 — 아직 버리지도, 울지도 않은 상태
    if ((state.round.byPlayer[req.player]?.discardCount ?? 0) > 0) {
      return "not your first turn";
    }
    if (meldCountOf(state, req.player) > 0) return "not your first turn";
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(declaredKey(req.player), roundKey(state)),
    ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
  ],
};

export const bigHand: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  name: "큰손",
  description:
    "(2국에 1회) 국의 첫 순에 액티브 버튼이 활성화되며, 선언하면 그 국에 화료했을 때 **내가 받는 총액**이 최소 만관(오야 12000 · 자 8000)이 된다 — 손의 값이 아니라 본장·공탁까지 합친 수령액 기준이다.",
  detail:
    "(2국에 1회) 아직 버리지도 울지도 않은 국의 첫 순에만 선언할 수 있다. 선언한 국에 화료하면 부족한 차액을 뱅크가 채워 만관(오야 12000 · 자 8000)을 맞춰 준다.\n\n⚠ **하한이 걸리는 것은 손의 값이 아니라 그 국에 내가 받는 총액이다.** 본장 수령분과 회수하는 리치봉(공탁)이 전부 이 총액에 들어간다. 리치봉 두 개를 회수했다면 손 자체는 6000점이어도 총액은 8000이 되어 뱅크가 한 푼도 채워 주지 않는다. 배수 증강(일확천금 등)이 걸려 있으면 배수가 다 적용된 **뒤의** 값을 보고 채운다.\n\n그 국에 화료하지 못하면 아무 일도 일어나지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(declareAction);
    }

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    // 업사이드 — 선언한 국에 화료 수령액이 만관 미만이면 뱅크에서 채워 받는다.
    //
    // 하한은 **배수가 다 적용된 최종 수령액** 기준이다(BankTopUp은 Multiply 뒤).
    // 예전에는 배수 전 값(info.points)으로 차액을 계산해, 일확천금 0.5배와 겹치면
    // 1000 → 500(배수) → +7000(차액) = **7500**으로 만관 하한이 무너지고, 3배와
    // 겹치면 3000 + 7000 = **10000**으로 만관을 넘겨 줬다(docs/25 역/점수 #6).
    //
    // 기준을 deltas로 잡으면 공탁·본장 수령분도 함께 세어진다 — "그 국에 내가
    // 받는 것이 최소 만관"이라는 단순한 규칙으로 확정한다.
    settleInterceptor(ctx, SETTLE_STAGE.BankTopUp, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      if (!declaredThisRound(ic.state, holder)) return event;
      if (!(p.winInfos ?? []).some((w) => w.winner === holder)) return event;

      // 오야 취급 증강(찬탈자 등)도 오야 하한을 쓴다 — 좌석만 보면 어긋난다
      const me = ic.state.players.find((pl) => pl.id === holder);
      const isDealer =
        (me !== undefined && me.seat === ic.state.round.dealerSeat) ||
        ic.rules.resolve<boolean>("win.treatAsDealer", {
          playerId: holder,
          state: ic.state,
        });
      const floor = isDealer ? MANGAN_DEALER : MANGAN_NONDEALER;

      const current = p.deltas[holder] ?? 0;
      const topUp = Math.max(0, floor - current);
      if (topUp === 0) return event;
      return {
        type: event.type,
        payload: {
          ...p,
          deltas: { ...p.deltas, [holder]: current + topUp },
          augPoints: withAugPoint(p, ctx, topUp),
        },
      };
    });

    // 48차 무페널티: "선언한 국에 방총하면 만관을 문다"는 다운사이드 삭제.
    // 선언은 이제 순수한 상향 — 그 국의 내 화료가 최소 만관이 된다.

    // 첫 턴에만 선언 버튼 노출 (합법성은 validate가 최종 판정)
    // 2국에 1회 — 쿨다운 중이면 숨긴다.
    ctx.holderTurnOptions((state) =>
      canDeclare(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );
  },
  // 첫 턴에만 제시되고, 그 국 화료를 최소 만관으로 끌어올리는 순수 이득 —
  // 제시되면 무조건 선언한다.
  bot: plan({
    intent: "score",
    fleeting: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
