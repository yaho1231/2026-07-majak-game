/**
 * 덤터기 (scapegoat, gold).
 * 자기 턴에 상대 1명을 공개 지목할 수 있다(국당 1회 — 한 번 정하면 그 국에는 못 바꾼다).
 * 지목이 걸려 있는
 * 동안 자신의 쯔모 화료 지불은 분담 없이 그 상대가 전액 부담한다
 * (총액 불변, 분배만 변경).
 *
 * 2026-08-27 (사용자 지시, 밸런스 웨이브): 여기에 **쯔모 화료 +2판**을 얹었다. 예전에는
 * 지불자만 바꿀 뿐 보유자의 순이득이 정확히 0이라, 카드를 뽑아도 내 점수는 한 푼도
 * 움직이지 않았다. 거울상인 책임전가(`blame_shift`)의 **론 +2판**과 대칭이다.
 * 론 화료에는 붙지 않는다 — 이 카드가 아무 일도 하지 않는 화료다.
 *
 * 구현: parasite 패턴. 지목 커스텀 액션 + augmentData(공개 뷰), ROUND_SETTLED
 * 인터셉터에서 보유자 쯔모 시 나머지 두 명의 지불(음수 delta)을 지목 대상에게 이전.
 */

import {
  augmentDataSet,
  defineAugment,
  playerAtSeat,
  ROUND_SETTLED,
  SETTLE_STAGE,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  SettleStage,
} from "@majak/core";
import {
  addWinHanBonus,
  roundViewKey,
  settleInterceptor,
  stringOf,
  withAugNoteFor,
} from "../util.js";
import { clearViewOnDisarm } from "./disarmBanner.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "scapegoat";
const ACTION = "scapegoat_mark";
/** 쯔모 화료에 얹히는 판수 (2026-08-27 사용자 지시 — 책임전가의 론 +2판과 대칭) */
const TSUMO_BONUS_HAN = 2;
const targetKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "target", state, h);

/**
 * 이번 국에 `marker`가 지목해 둔 사람 (없으면 null).
 *
 * 바깥에 여는 이유: 지불을 통째로 옮기는 재배선이라, **뒤에 도는 정산 단계**가
 * "이 사람이 왜 이만큼을 무는가"를 알아야 하는 경우가 있다. 역만 방어술이 그렇다 —
 * 쯔모 환급 상한을 표준 분담(1/3)으로 잡던 시절, 덤터기가 몰아준 역만 쯔모에서
 * 96,000 중 64,000이 그대로 남았다(2026-08-23 QA synergy3 disrupt 확정 1).
 * 무장해제 여부는 부르는 쪽이 본다 — 잠긴 덤터기는 재배선을 하지 않으므로.
 */
export function scapegoatTargetOf(
  state: GameState,
  marker: PlayerId,
): PlayerId | null {
  return stringOf(state, targetKey(state, marker));
}

const markAction: ActionDef<{ target: PlayerId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no scapegoat augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (req.payload.target === req.player) return "cannot target yourself";
    if (!state.players.some((p) => p.id === req.payload.target)) {
      return "unknown target";
    }
    if (stringOf(state, targetKey(state, req.player)) !== null) {
      return "already marked this round";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(targetKey(state, req.player), req.payload.target),
    augmentDataSet(
      roundViewKey("*", `${ID}:${req.player}`),
      req.payload.target,
    ),
  ],
};

export const scapegoat: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  // 계열은 `scoring` — 책임전가(blame_shift)의 거울상인데 둘이 다른 칩에 있어
  // 도감의 계열 필터가 반쪽만 찾아 줬다(2026-08-22 QA round2 확정 15).
  category: "scoring",
  complexity: 2,
  name: "덤터기",
  description:
    "(매 국 1회) 자기 순에 상대 한 명을 공개 지목한다. 지목해 둔 국에 내가 쯔모로 화료하면 **+2판**을 얻고, 그 쯔모 점수 전액을 지목당한 사람 혼자 낸다.",
  detail:
    "상대 한 명을 공개 지목하면, 그 국에 내가 쯔모 화료할 때 +2판(역만 제외)이 붙고 쯔모 점수 전액을 그 사람 혼자 낸다.\n\n론에는 아무것도 붙지 않는다. 지목은 한 국에 한 번이고 바꿀 수 없다. 전액을 문 사람은 점수가 모자라면 마이너스로 탈락할 수 있다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(markAction);
    }

    /*
     * **지목을 해 둔 국의 쯔모 화료에만** +2판 (2026-08-27 사용자 지시).
     *
     * 처음에는 «쯔모면 무조건»이었다. 그러면 능력을 한 번도 쓰지 않은 국에도 판수가
     * 붙어, 이 카드가 «지목해서 지불을 몰아준다»가 아니라 «쯔모 보너스»가 된다 —
     * 지목이 본체인데 값이 지목과 무관한 곳에서 나왔다. 이제 판수와 지불 재배선이
     * **같은 조건**(그 국에 지목이 걸려 있다)에서 함께 선다.
     *
     * 화료 유형은 **내 WinInfo**로 본다 — 더블론에 내가 끼어 있어도 그건 론이라
     * 붙지 않는다. (`addWinHanBonus`는 역만에서 자동으로 무시된다.)
     */
    addWinHanBonus(ctx, (state, info) =>
      info.winType === "tsumo" && scapegoatTargetOf(state, holder) !== null
        ? TSUMO_BONUS_HAN
        : 0,
    );

    // 정산 단계: Redistribute — 쯔모 지불을 지목 대상 한 명에게 몰아준다 — 총액 불변, 분배만 변경.
    //
    // 그리고 `Reassert`(이동이 전부 끝난 뒤)에서 **한 번 더** 훑는다. Redistribute만으로는
    // 뒤에 도는 Transfer 단계(뚫린 천장의 초과분·가불 인생 상환 …)가 나머지 둘에게 새로
    // 부과하는 지불을 볼 수 없어서, 카드가 굵게 약속한 "나머지 두 명은 한 푼도 내지
    // 않는다"가 깨졌다(QA text 확정 28). 두 번째 패스에서 그 둘이 다시 음수라면 그것도
    // 지목당한 사람에게 옮긴다 — 첫 패스가 이미 둘을 0으로 만들어 두므로, 두 번째 패스가
    // 보는 음수는 **정확히 그 뒤에 새로 붙은 부담**뿐이다.
    const sweep = (stage: SettleStage): void =>
      settleInterceptor(ctx, stage, (event, ic) => {
        const p = event.payload as RoundSettledPayload;
        if (p.outcome !== "win") return event;
        const info = (p.winInfos ?? []).find(
          (w) => w.winner === holder && w.winType === "tsumo",
        );
        if (info === undefined) return event;
        const target = stringOf(ic.state, targetKey(ic.state, holder));
        if (target === null || target === holder) return event;
        // 나머지 두 명(보유자·대상 제외)의 지불을 대상에게 이전
        const deltas = { ...p.deltas };
        // 총액도 내 수령액도 그대로라 `withAugPoint`에 남길 것은 없지만, 대신 무는 사람과
        // 면제된 사람의 줄에는 근거가 있어야 한다.
        let notes = p.augPoints ?? [];
        for (const pl of ic.state.players) {
          if (pl.id === holder || pl.id === target) continue;
          const owed = deltas[pl.id] ?? 0;
          if (owed >= 0) continue; // 지불(음수)만 이전
          deltas[target] = (deltas[target] ?? 0) + owed;
          deltas[pl.id] = 0;
          notes = withAugNoteFor({ ...p, augPoints: notes }, ID, target, owed);
          notes = withAugNoteFor({ ...p, augPoints: notes }, ID, pl.id, -owed);
        }
        return {
          type: event.type,
          payload: { ...p, deltas, augPoints: notes },
        };
      });
    sweep(SETTLE_STAGE.Redistribute);
    sweep(SETTLE_STAGE.Reassert);

    /*
     * 무장해제로 잠기면 지목 관계선도 함께 내린다 (2026-08-23 QA synergy3 disrupt 확정 4).
     * 효과는 게이트가 막는데 관계선만 남아 있으면 화면이 정확히 반대를 말한다 —
     * 눈먼 총알·초읽기와 같은 규약이다(disarmBanner.ts).
     */
    clearViewOnDisarm(ctx, () => [roundViewKey("*", `${ID}:${holder}`)]);

    // 매 국 1회만 지목 — 이번 국에 이미 지목했으면 버튼을 내리지 않는다
    ctx.holderTurnOptions((state) => {
      if (stringOf(state, targetKey(state, holder)) !== null) return [];
      return state.players
        .filter((p) => p.id !== holder)
        .map((p) => ({ type: ACTION, payload: { target: p.id } }));
    });
  },
  // 쯔모 화료 시 지불을 한 상대에게 몰아준다(총액 불변) — 내가 텐파이라 화료가 가시권일
  // 때, 점수가 가장 높은 상대에게 몰아 그 상대의 순위를 끌어내린다.
  bot: plan({
    intent: "defend",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder, tenpai }) => {
      if (!tenpai) return null;
      const mine = options.filter((o) => o.type === ACTION);
      if (mine.length === 0) return null;
      const scoreOf = new Map<string, number>();
      for (const p of view.players)
        if (p.id !== holder) scoreOf.set(p.id, p.score);
      let best = mine[0] ?? null;
      let bestScore = -Infinity;
      for (const o of mine) {
        const target = (o.payload as { target?: string }).target;
        const s =
          target === undefined ? -Infinity : (scoreOf.get(target) ?? -Infinity);
        if (s > bestScore) {
          bestScore = s;
          best = o;
        }
      }
      return best;
    },
  }),
});
