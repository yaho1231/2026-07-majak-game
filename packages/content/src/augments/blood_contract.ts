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
  roundKey,
  settleInterceptor,
  stringOf,
  viewKey,
} from "../util.js";
import { handKindsOf, kindCounts } from "./botHelpers.js";

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
  `${ID}:yaku:${roundKey(state)}:${h}`;

const discardCount = (state: GameState, h: PlayerId): number =>
  state.round.byPlayer[h]?.discardedKinds.length ?? 0;

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
    augmentDataSet(viewKey("*", `${ID}:${req.player}`), req.payload.yaku),
  ],
};

export const bloodContract: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  name: "핏빛 계약",
  description:
    "(매 국 1회) 자신의 첫 타패 전에 역 하나를 공개 계약할 수 있고, 계약한 역을 포함해 화료하면 그 국의 점수가 1.5배가 된다. 계약하지 않으면 평범한 국으로 진행된다.",
  detail:
    "(매 국 1회) 자신의 첫 타패 전에 지정 역 목록(탕야오·핑후·또이또이·혼일색·청일색·삼색·일기통관·치또이 등) 중 하나를 골라 전원에게 공개 계약한다. 그 국에 계약 역을 포함해 화료하면 획득 점수가 1.5배가 된다. 계약은 국당 하나뿐이고 하지 않아도 되며, 무엇을 걸었는지는 전원에게 공개된다.",
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
      return {
        type: event.type,
        payload: { ...p, deltas: { ...p.deltas, [holder]: round100(d * mult) } },
      };
    });

    ctx.holderTurnOptions((state) => {
      if (discardCount(state, holder) > 0) return [];
      if (stringOf(state, contractKey(state, holder)) !== null) return [];
      return CONTRACT_YAKU.map((yaku) => ({ type: ACTION, payload: { yaku } }));
    });
  },
  // 계약 역을 포함해 화료하면 점수 1.5배(빗나가도 벌점 없음) — 손 모양이 명백히 향하는
  // 역이 있을 때만 계약해 배율을 실현 가능성 높은 쪽에 건다. 애매하면 계약하지 않는다.
  bot: {
    choose({ options, view, holder }) {
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
      } else if (pairs >= 4) {
        target = "chiitoitsu"; // 짝이 많음
      }
      if (target === null) return null;
      return (
        options.find(
          (o) => o.type === ACTION && (o.payload as { yaku?: string }).yaku === target,
        ) ?? null
      );
    },
  },
});
