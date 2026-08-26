/**
 * 핏빛 계약 (blood_contract, prism).
 * 매 국 자신의 첫 타패 전에 지정 목록의 역 하나를 공개 계약할 수 있다.
 * 그 국 계약 역을 포함해 화료하면 점수 1.5배. 계약하지 않으면 평범한 국이다.
 *
 * ⚠ 밸런스(2026-07-26): 2배 → **1.5배**. 탕야오·핑후 같은 흔한 역을 걸면
 * 사실상 상시 2배라 파워 티어 상위였다(docs/20 §7c).
 *
 * 구현: 계약 커스텀 액션(바닥이 빈 상태) + roundKey 기록·공개 뷰. ROUND_SETTLED
 * 인터셉터에서 보유자 화료 delta에 배율(계약 역 포함 ×2) 적용.
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
} from "@majak/core";
import {
  honbaGainOf,
  riichiPotGainOf,
  roundViewKey,
  settleInterceptor,
  stringOf,
  withAugPoint,
} from "../util.js";
import { handKindsOf, kindCounts } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "blood_contract";
const ACTION = "blood_contract_declare";
/** 계약 가능한 역 (단일 id로 판별 가능한 것) */
const CONTRACT_YAKU = [
  "tanyao",
  "pinfu",
  "toitoi",
  "honitsu",
  "chinitsu",
  "sanshoku",
  "ittsuu",
  "chiitoitsu",
] as const;
const contractKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "yaku", state, h);

const discardCount = (state: GameState, h: PlayerId): number =>
  state.round.byPlayer[h]?.discardCount ?? 0;

const round100 = (n: number): number => Math.round(n / 100) * 100;

const declareAction: ActionDef<{ yaku: string }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no blood_contract augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (discardCount(state, req.player) > 0) return "must declare before first discard";
    if (stringOf(state, contractKey(state, req.player)) !== null) {
      return "already contracted this round";
    }
    if (!CONTRACT_YAKU.includes(req.payload.yaku as (typeof CONTRACT_YAKU)[number])) {
      return "not a contractable yaku";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(contractKey(state, req.player), req.payload.yaku),
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), req.payload.yaku),
  ],
};

export const bloodContract: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 3,
  name: "핏빛 계약",
  description:
    "(매 국 1회) 자신의 첫 타패 전에 역 하나를 공개 계약할 수 있고, 계약한 역을 포함해 화료하면 그 국의 점수가 1.5배가 된다.",
  detail:
    "계약 대상은 탕야오·핑후·또이또이·혼일색·청일색·삼색·일기통관·치또이 중 하나이며, 무엇을 걸었는지는 전원에게 공개된다.\n\n배수가 걸리는 것은 **손의 화료점뿐**이다 — 회수하는 리치봉과 본장 수령분은 그대로 더해진다. 계약하지 않고 그냥 쳐도 된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(declareAction);
    }

    // 정산 단계: Multiply — 내 획득에 1.5배. 다른 배수 증강과 같은 단계라 서로 곱해진다.
    settleInterceptor(ctx, SETTLE_STAGE.Multiply, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      const contract = stringOf(ic.state, contractKey(ic.state, holder));
      if (contract === null) return event;
      const info = (p.winInfos ?? []).find((w) => w.winner === holder);
      if (info === undefined) return event; // 계약했지만 화료 못함 — 변화 없음
      const d = p.deltas[holder] ?? 0;
      if (d <= 0) return event;
      const hasContract = info.yaku.some((y) => y.id === contract);
      // 48차 무페널티: 계약을 못 지켜도 깎이지 않는다 (예전엔 0.5배)
      const mult = hasContract ? 1.5 : 1;
      // 공탁(리치봉)은 배수 대상이 아니다 — 남이 낸 봉을 1.5배로 불리면 그만큼을
      // 뱅크가 새로 발행해 공탁 총량 불변식이 깨진다(docs/25 방해 #13).
      // 공탁은 첫 화료자에게 통째로 가므로 그 사람일 때만 떼어 놓고 곱한 뒤 되돌린다.
      // 본장도 배수 대상이 아니다 — 공탁과 같은 이유다. 본장은 상대가 실제로
      // 더 내는 돈인데, 여기서 1.5배로 불리면 그 차액을 뱅크가 새로 발행한다
      // (3본장 론 900 → 1,350). 론 본장은 첫 화료자에게만 붙는다(standardActions).
      // 본장은 론·쯔모 양쪽에서 붙는다(쯔모는 셋에게서 100씩) — 실제로 받은
      // 금액이 winInfo.honbaBonus에 그대로 실려 있으므로 그걸 쓴다. 예전에는
      // 론만 떼어 내 쯔모 본장이 1.5배로 불어났다(QA score-a 확정 2).
      const honba = honbaGainOf(p, holder);
      // ⚠ `p.riichiPot`은 화료 정산에서 항상 0이다(다음 국으로 넘길 값).
      // 회수액은 winInfo.riichiPotGain에만 있다 — 그 탓에 공탁 제외가 죽어 있었다.
      const pot = riichiPotGainOf(p, holder);
      // ⚠ 밑값은 **손의 화료점**이지 델타 전체가 아니다. 같은 Multiply 단계의
      // let_it_ride·jackpot이 먼저 돌아 델타를 부풀려 놓으면, 델타를 밑값으로
      // 삼는 순간 그 부풀린 몫에까지 1.5배가 걸려 detail의 "손의 화료점뿐"이
      // 거짓이 된다(손 8,000·연승 4배에서 기대 +4,000 → 실제 +16,000,
      // QA verify-score 확정 1). let_it_ride:96-99와 같은 규약으로 맞춘다 —
      // winInfos[].points를 밑값으로 쓰고, 앞 단계가 얹은 몫에는 손대지 않는다.
      const winPoints = (p.winInfos ?? [])
        .filter((w) => w.winner === holder)
        .reduce((sum, w) => sum + w.points, 0);
      const base = Math.min(Math.max(0, winPoints), Math.max(0, d - pot - honba));
      const bonus = round100(base * mult) - base;
      const after = d + bonus;
      return {
        type: event.type,
        payload: {
          ...p,
          deltas: { ...p.deltas, [holder]: after },
          augPoints: withAugPoint(p, ctx, after - d),
        },
      };
    });

    // 계약 배지는 roundViewKey라 국 경계에서 엔진이 지운다 — 계약하지 않은 국에
    // 지난 계약이 전원 화면에 남아 있던 문제(2026-07-29 감사)는 이제 구조로 막힌다.

    ctx.holderTurnOptions((state) => {
      if (discardCount(state, holder) > 0) return [];
      if (stringOf(state, contractKey(state, holder)) !== null) return [];
      return CONTRACT_YAKU.map((yaku) => ({ type: ACTION, payload: { yaku } }));
    });
  },
  // 계약 역을 포함해 화료하면 점수 1.5배(빗나가도 벌점 없음) — 손 모양이 명백히 향하는
  // 역이 있을 때만 계약해 배율을 실현 가능성 높은 쪽에 건다. 애매하면 계약하지 않는다.
  bot: plan({
    intent: "score",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder }) => {
      const kinds = handKindsOf(view, holder);
      if (kinds.length === 0) return null;
      const isNum = (s: string): boolean => s === "man" || s === "pin" || s === "sou";
      const suitCount: Record<string, number> = { man: 0, pin: 0, sou: 0 };
      let honors = 0;
      for (const k of kinds) {
        if (isNum(k.suit)) suitCount[k.suit] = (suitCount[k.suit] ?? 0) + 1;
        else honors++;
      }
      const numbers = kinds.length - honors;
      const usedSuits = ["man", "pin", "sou"].filter((s) => (suitCount[s] ?? 0) > 0);
      let dom = "man";
      for (const s of ["man", "pin", "sou"]) {
        if ((suitCount[s] ?? 0) > (suitCount[dom] ?? 0)) dom = s;
      }
      const offSuit = numbers - (suitCount[dom] ?? 0);
      const pairs = [...kindCounts(kinds).values()].filter((c) => c >= 2).length;

      let target: string | null = null;
      if (kinds.every((k) => isNum(k.suit) && k.rank >= 2 && k.rank <= 8)) {
        target = "tanyao"; // 전부 심플
      } else if (honors === 0 && usedSuits.length === 1) {
        target = "chinitsu"; // 한 색 수패뿐
      } else if (offSuit <= 1 && (suitCount[dom] ?? 0) >= 5) {
        target = "honitsu"; // 한 색 + 자패로 몰림
      } else if (pairs >= 4 && kinds.length <= 14) {
        // 짝이 많음. 단 **손패가 14장을 넘으면 치또이가 아예 성립하지 않는다**
        // (진짜 용 = 5멘쯔·17장). 그런 손에 치또이를 걸면 배율이 통째로 죽는다.
        target = "chiitoitsu";
      }
      if (target === null) return null;
      return (
        options.find(
          (o) => o.type === ACTION && (o.payload as { yaku?: string }).yaku === target,
        ) ?? null
      );
    },
  }),
});
