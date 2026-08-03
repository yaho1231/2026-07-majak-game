/**
 * 일확천금 (jackpot, prism) — 국당 1회, 자기 턴에 룰렛을 돌린다.
 *
 * 52차 개편: "얻는 점수 상시 2배"라는 보이지 않는 정산 배율(도파민 리트머스 ① 탈락)을
 * **눈앞에서 배수가 결정되는 액티브**로 바꿨다. 자기 턴에 `jackpot_roll`을 누르면
 * 0.5·2·3·4배 중 하나가 그 자리에서 뽑혀 전원 공개 뷰 채널에 실린다("이번 국 3배!").
 * 국이 끝나면 그 배수가 내 획득 델타에 곱해진다.
 *
 * 55차(사용자 피드백): 룰렛에 **0.5배**를 추가했다 — 사용자가 지시한 도박형 예외다
 * (MULTIPLIERS 주석 참조). 꽝이 생기면서 "돌릴까 말까"가 실제 선택이 됐다.
 *
 * 구현:
 * - 액션 `jackpot_roll {}` — turn.act·자기 턴·국당 1회.
 * - 전용 이벤트 `JackpotRolled` + 리듀서: 배수·공개 뷰를 augmentData에 쓰고,
 *   **소비한 PRNG 상태를 payload.prngState로 되돌린다**(결정론·리플레이 보장).
 *   패를 바꾸지 않으므로 tileKindChanged를 쓸 수 없어 전용 이벤트를 둔다
 *   (future_sight의 FutureSightExchanged와 같은 패턴).
 * - ROUND_SETTLED 인터셉터: 그 국에 뽑힌 배수만큼 delta를 곱한다.
 *   **양수 델타만** 곱한다(무페널티 — 잃는 쪽은 그대로). 안 굴린 국은 배수 1.
 * - 배수 키에 roundKey가 들어가 국이 바뀌면 자동 만료된다.
 */

import {
  ROUND_SETTLED,
  SETTLE_STAGE,
  defineAugment,
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
  counterOf,
  roundKey,
  roundViewKey,
  settleInterceptor,
  statePrng,
  withAugPoint,
} from "../util.js";

const ID = "jackpot";
const ACTION = "jackpot_roll";
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const JACKPOT_ROLLED = "JackpotRolled";

/**
 * 배수 룰렛 — 가중 추출표. (2026-07-27, 60차 사용자 확정 확률)
 *
 *   0.5배 30% · 1배 30% · 2배 30% · 3배 10%   → 기대값 1.45배
 *
 * ⚠ 0.5배는 획득이 **줄어드는** 결과다 — §0 무페널티 원칙의 예외이며,
 * **사용자가 명시적으로 지시한 밸런스 조정**이다(55차 피드백: "0.5배도 하나 넣어서
 * 밸런스 조절"). 도박형 예외로만 허용되며, 다른 증강에 이 패턴을 복제하지 말 것.
 * 곱셈은 여전히 **양수 델타에만** 적용하므로 잃는 국에는 아무 영향이 없다.
 *
 * 가중은 **정수 누적합 + prng.int(TOTAL)** 로 뽑는다 — float 비교를 쓰면 PRNG 구현이
 * 바뀔 때 경계가 흔들려 리플레이가 깨진다.
 */
const MULTIPLIER_WEIGHTS: readonly { multiplier: number; weight: number }[] = [
  { multiplier: 0.5, weight: 30 },
  { multiplier: 1, weight: 30 },
  { multiplier: 2, weight: 30 },
  { multiplier: 3, weight: 10 },
];
const WEIGHT_TOTAL = MULTIPLIER_WEIGHTS.reduce((s, m) => s + m.weight, 0);

/** 점수는 100점 단위다 — 0.5배 같은 배수 뒤에는 반드시 격자로 되돌린다 */
const round100 = (n: number): number => Math.round(n / 100) * 100;

/**
 * 지금이 이 플레이어의 **국 첫 순**인가 — 아직 아무것도 버리지 않은 자기 턴.
 * (단색 세계·밥상 뒤엎기의 atFirstHand과 같은 판정 규약.)
 */
function atFirstTurn(state: GameState, player: PlayerId): boolean {
  if (state.round.phase !== "turn.act") return false;
  if (playerAtSeat(state, state.round.turnSeat).id !== player) return false;
  return (state.round.byPlayer[player]?.discardedKinds.length ?? 0) === 0;
}

/** 이번 국에 확정된 배수 (국이 바뀌면 키가 달라져 자동 만료) */
const multKey = (state: GameState, player: PlayerId): string =>
  `${ID}:mult:${roundKey(state)}:${player}`;

interface JackpotRolledPayload {
  player: PlayerId;
  /** 이번 국에 확정된 배수 (0.5·2·3·4) */
  multiplier: number;
  /** 배수를 기록할 키 (국이 섞인 키를 액션이 확정해 넘긴다) */
  key: string;
  /** 난수 소비 후 전진된 PRNG 상태 (결정론 유지) */
  prngState: number;
}

/** state가 같으면 항상 같은 결과 — 후보 제시와 확정이 어긋나지 않는다 */
function rollMultiplier(state: GameState): {
  multiplier: number;
  prngState: number;
} {
  const prng = statePrng(state);
  let roll = prng.int(WEIGHT_TOTAL);
  let multiplier = 1;
  for (const m of MULTIPLIER_WEIGHTS) {
    if (roll < m.weight) {
      multiplier = m.multiplier;
      break;
    }
    roll -= m.weight;
  }
  return { multiplier, prngState: prng.getState() };
}

const jackpotRollAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no jackpot augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (counterOf(state, multKey(state, req.player)) > 0) {
      return "jackpot already rolled this round";
    }
    // 국의 첫 순 한정 (2026-07-27, 60차) — 예전엔 그 국 아무 때나 굴릴 수 있어
    // "텐파이를 확인하고 나서 배수를 결정"하는 무위험 선택이었다. 배패만 보고
    // 걸어야 도박이 된다.
    if (!atFirstTurn(state, req.player)) return "only on your first turn";
    return null;
  },
  toEvents: (req, { state }) => {
    const { multiplier, prngState } = rollMultiplier(state);
    const payload: JackpotRolledPayload = {
      player: req.player,
      multiplier,
      key: multKey(state, req.player),
      prngState,
    };
    return [{ type: JACKPOT_ROLLED, payload }];
  },
};

export const jackpot: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  name: "일확천금",
  description:
    "(매 국 1회 · 국의 첫 순) 배패를 받은 직후 룰렛을 돌려 0.5·1·2·3배 중 하나를 뽑는다. 그 국에 얻는 점수에 뽑힌 배수가 곱해지며, 꽝(0.5배)도 있다.",
  detail:
    "(매 국 1회 · 국의 첫 순) 아직 아무것도 버리지 않은 첫 순에만 룰렛을 돌릴 수 있다. 그 자리에서 0.5배(30%)·1배(30%)·2배(30%)·3배(10%) 중 하나가 뽑혀 전원에게 공개된다. 그 국의 정산에서 자신의 획득 점수가 양수이면 뽑힌 배수만큼 곱해지고(0.5배는 절반으로 줄고 소수점은 반올림, 1배는 그대로) 늘어난 몫은 뱅크가 지급한다. 지불로 끝난 국에는 적용되지 않으며, 굴리지 않은 국에는 아무 효과가 없다.",
  // 봇: 기대값이 여전히 플러스다(0.5×.3 + 1×.3 + 2×.3 + 3×.1 = 1.35배) — 옵션이 뜨면 무조건 굴린다.
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(JACKPOT_ROLLED)) {
      engine.reducers.register(JACKPOT_ROLLED, (state, event) => {
        const p = event.payload as JackpotRolledPayload;
        return {
          ...state,
          // 소비한 난수를 되돌려 놓는다 (결정론·리플레이)
          prngState: p.prngState,
          augmentData: {
            ...state.augmentData,
            [p.key]: p.multiplier,
            // 전원 공개 — "이번 국 3배!"가 테이블에 뜬다
            [roundViewKey("*", `${ID}:${p.player}`)]: `${p.multiplier}배`,
          },
        };
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(jackpotRollAction);
    }

    // 정산: 그 국에 뽑힌 배수만큼 (안 굴렸으면 배수 1 = 효과 없음)
    // 정산 단계: Multiply — 내 획득에 배수. 뱅크 가산(BankTopUp)보다 먼저 — 뒤에 오면
      // 뚫린 천장의 보전액까지 배로 불어난다.
    settleInterceptor(ctx, SETTLE_STAGE.Multiply, (event, ic) => {
      // ic.state = 리듀서 적용 전 = 지금 정산되는 국
      const mult = counterOf(ic.state, multKey(ic.state, holder));
      // 굴리지 않은 국(0)·배수 1은 효과 없음. 0.5배는 그대로 적용된다(도박형 예외).
      if (mult <= 0 || mult === 1) return event;
      const p = event.payload as RoundSettledPayload;
      const d = p.deltas[holder] ?? 0;
      // 무페널티: 잃을 때는 곱하지 않는다 — 버는 쪽만 불어나거나 줄어든다
      if (d <= 0) return event;

      // 공탁(리치봉)은 배수 대상이 아니다 — 남이 낸 봉을 3배로 불리면 그만큼을
      // 뱅크가 새로 발행하게 되어 공탁 총량 불변식이 깨진다. 공탁은 첫 화료자에게
      // 통째로 가므로, 그 사람일 때만 떼어 놓고 곱한 뒤 되돌려 붙인다.
      const pot = (p.winInfos ?? [])[0]?.winner === holder ? p.riichiPot : 0;
      const base = Math.max(0, d - pot);
      // 0.5배가 있으므로 100점 격자로 맞춘다 — 안 맞추면 소지점이 100의 배수가
      // 아니게 되어 결과창·순위 표시가 깨진다(docs/25 역/점수 #7).
      const after = round100(base * mult) + pot;
      return {
        type: event.type,
        payload: {
          ...p,
          deltas: { ...p.deltas, [holder]: after },
          augPoints: withAugPoint(p, ctx, after - d),
        },
      };
    });

    // 보유자의 국 첫 순에만 후보 노출 — 합법성은 validate가 최종 판정
    ctx.holderTurnOptions((state) =>
      atFirstTurn(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );
  },
});
