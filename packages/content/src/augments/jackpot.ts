/**
 * 일확천금 (jackpot, prism) — 국당 1회, 자기 턴에 룰렛을 돌린다.
 *
 * 52차 개편: "얻는 점수 상시 2배"라는 보이지 않는 정산 배율(도파민 리트머스 ① 탈락)을
 * **눈앞에서 배수가 결정되는 액티브**로 바꿨다. 자기 턴에 `jackpot_roll`을 누르면
 * 0.5·1·2·3배 중 하나가 그 자리에서 뽑혀 전원 공개 뷰 채널에 실린다("이번 국 3배!").
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
 *   1배 초과분은 뱅크가 발행하고, **1배 미만(0.5배)로 깎인 몫은 지불자에게 되돌린다**
 *   (아래 settleInterceptor 주석 참조 — 2026-08-07 점수 보존 수정).
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
  honbaGainOf,
  riichiPotGainOf,
  roundViewKey,
  settleInterceptor,
  statePrng,
  withAugPoint,
} from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "jackpot";
const ACTION = "jackpot_roll";
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const JACKPOT_ROLLED = "JackpotRolled";

/**
 * 배수 룰렛 — 가중 추출표. (2026-07-27, 60차 사용자 확정 확률)
 *
 *   0.5배 30% · 1배 30% · 2배 30% · 3배 10%   → 기대값 1.35배
 *
 * ⚠ 0.5배는 획득이 **줄어드는** 결과다 — §0 무페널티 원칙의 예외이며,
 * **사용자가 명시적으로 지시한 밸런스 조정**이다(55차 피드백: "0.5배도 하나 넣어서
 * 밸런스 조절"). 도박형 예외로만 허용되며, 다른 증강에 이 패턴을 복제하지 말 것.
 * 곱셈은 여전히 **양수 델타에만** 적용하므로 보유자가 잃는 국에는 아무 영향이 없다.
 * 다만 깎인 몫은 **지불자에게 되돌려야** 한다 — settleInterceptor 주석 참조.
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
 * 깎인 몫을 지불자들에게 **낸 비율대로** 되돌린다 (100점 격자, 합계 정확).
 *
 * 남는 100점은 많이 낸 쪽부터 한 칸씩 얹어 결정적으로 배분한다(리플레이 안정).
 * 각자에게 되돌리는 액수는 그 사람이 낸 액수를 절대 넘지 않는다 — 넘으면 지불자가
 * 정산으로 오히려 점수를 버는 기이한 결과가 된다. 캡에 걸려 남은 몫은 배분하지
 * 않고 버린다 — 호출 측이 `refunded` 합계만큼만 보유자에게서 깎으므로 총합은
 * 그래도 보존된다.
 *
 * (util.ts의 splitOnGrid은 가중치가 1·2 같은 작은 정수일 때만 비례가 맞는다 —
 *  여기서는 가중치가 지불액 자체라 별도 계산이 필요하다.)
 */
function refundShares(
  payers: readonly { id: PlayerId; paid: number }[],
  amount: number,
): { id: PlayerId; amount: number }[] {
  const sorted = [...payers]
    .filter((p) => p.paid > 0)
    .sort((a, b) => b.paid - a.paid || (a.id < b.id ? -1 : 1));
  const total = sorted.reduce((s, p) => s + p.paid, 0);
  const cap = Math.min(Math.max(0, amount), total);
  if (cap <= 0) return [];
  const out = sorted.map((p) => ({
    id: p.id,
    paid: p.paid,
    amount: Math.min(p.paid, Math.floor((cap * p.paid) / total / 100) * 100),
  }));
  let left = cap - out.reduce((s, o) => s + o.amount, 0);
  let stuck = 0;
  for (let i = 0; left >= 100 && stuck < out.length; i = (i + 1) % out.length) {
    const o = out[i];
    if (o === undefined || o.amount + 100 > o.paid) {
      stuck++;
      continue;
    }
    o.amount += 100;
    left -= 100;
    stuck = 0;
  }
  return out.map(({ id, amount: a }) => ({ id, amount: a }));
}

/**
 * 지금이 이 플레이어의 **국 첫 순**인가 — 아직 아무것도 버리지 않은 자기 턴.
 * (단색 세계·밥상 뒤엎기의 atFirstHand과 같은 판정 규약.)
 */
function atFirstTurn(state: GameState, player: PlayerId): boolean {
  if (state.round.phase !== "turn.act") return false;
  if (playerAtSeat(state, state.round.turnSeat).id !== player) return false;
  return (state.round.byPlayer[player]?.discardCount ?? 0) === 0;
}

/** 이번 국에 확정된 배수 (국이 바뀌면 키가 달라져 자동 만료) */
const multKey = (state: GameState, player: PlayerId): string =>
  roundScopedKey(ID, "mult", state, player);

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
  /**
   * 순수 배수 3종(일확천금·판돈 굴리기·핏빛 계약)은 **서로 배제한다**
   * (2026-08-31 사용자 결정). 밑값 규약을 원본 화료점 고정으로 통일해
   * 겹쳐도 곱셈 폭발은 나지 않게 고쳤지만(QA synergy4 A-1·A-2), 배수를 여러 장
   * 겹치는 것 자체가 한 국의 진폭으로 판을 끝낸다 — 애초에 함께 들 수 없게 잠근다.
   */
  conflicts: ["let_it_ride", "blood_contract"],
  complexity: 1,
  name: "일확천금",
  description:
    "(매 국 1회 · 국의 첫 순) 배패를 받은 직후 룰렛을 돌려 0.5·1·2·3배 중 하나를 뽑는다. 그 국에 얻는 점수(본장·공탁 회수분 제외)에 뽑힌 배수가 곱해진다.",
  detail:
    "룰렛 결과(0.5배 30%·1배 30%·2배 30%·3배 10%)는 전원에게 공개된다. 배수는 그 국 획득 점수가 양수일 때만 걸리며, 본장 보너스와 공탁(리치봉) 회수분은 곱해지지 않는다. 다른 배수 증강이 이미 불린 몫에도 겹쳐 걸리지 않는다 — 밑값은 언제나 손의 화료점이다.\n\n**늘어난 몫은 뱅크가 내고 줄어든 몫은 지불자에게 돌아간다.**",
  // 봇: 기대값이 여전히 플러스다(0.5×.3 + 1×.3 + 2×.3 + 3×.1 = 1.35배) — 옵션이 뜨면 무조건 굴린다.
  bot: plan({
    intent: "score",
    fleeting: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
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
      /*
       * 무페널티: 잃을 때는 곱하지 않는다 — 버는 쪽만 불어나거나 줄어든다.
       *
       * ⚠ 이 한 줄이 «유국 노텐 벌부는 규칙이 정한 정액이니 남의 룰렛으로 달라지면
       * 안 된다»(QA score-a 확정 3)를 **혼자서 완전히** 달성한다 — 벌부는 언제나
       * 음수 델타이기 때문이다. 예전에는 그 위에 `if (p.outcome !== "win") return`
       * 컷이 하나 더 있었는데, 그 컷은 벌부뿐 아니라 **유국의 양수 획득까지 함께**
       * 밀어냈다: 유국 텐파이 수령(+1,000~3,000)·유국만관(+8,000)·유국역만이 전부
       * 배수 밖이었다. 카드는 "**그 국에 얻는 점수**(공탁 회수분 제외)에 뽑힌 배수가
       * 곱해지며"라고만 적고 어디에도 "화료했을 때만"이라 하지 않는다 — 3배를 뽑은
       * 국이 황패유국으로 끝나면 문구와 달리 아무 일도 일어나지 않았다
       * (2026-08-22 QA aug-2 확정 9). 컷을 지워 문구에 맞춘다.
       *
       * 도중유국(`abort`)은 애초에 델타가 전부 0이라 여기서 걸러진다.
       */
      if (d <= 0) return event;

      // 공탁(리치봉)은 배수 대상이 아니다 — 남이 낸 봉을 3배로 불리면 그만큼을
      // 뱅크가 새로 발행하게 되어 공탁 총량 불변식이 깨진다. 공탁은 첫 화료자에게
      // 통째로 가므로, 그 사람일 때만 떼어 놓고 곱한 뒤 되돌려 붙인다.
      // ⚠ `p.riichiPot`은 **다음 국으로 넘길 값이라 화료 정산에서 항상 0**이다 —
      // 회수액은 winInfo.riichiPotGain에만 있다(riichiPotGainOf).
      const pot = riichiPotGainOf(p, holder);
      /*
       * 본장도 배수 대상이 아니다 — 공탁과 같은 이유다(형제 두 장과 통일,
       * 2026-08-31 QA synergy4 B-6). 본장은 상대가 실제로 더 내는 돈이라
       * 여기서 3배로 불리면 그 차액을 뱅크가 새로 발행한다. `jackpot`만
       * 본장을 배수에 태워, `honba_hunter`와 겹치면 본장분만으로 뱅크 발행이
       * +12,000까지 갔다.
       */
      const honba = honbaGainOf(p, holder);
      /*
       * ⚠ 밑값은 **손의 화료점**이지 델타 전체가 아니다 (2026-08-31 QA synergy4
       * A-1·A-2). 같은 Multiply 단계의 let_it_ride·blood_contract가 먼저 돌아
       * 델타를 부풀려 놓으면, 델타를 밑값으로 삼는 순간 그 부풀린 몫에까지 배수가
       * 다시 걸려 **곱으로 겹친다** — 8,000 쯔모 + 4배 + 3배가 48,000이 아니라
       * 96,000이 됐고, 0.5배는 부푼 밑값에서 계산된 축소액이 지불액 전액을 덮어
       * 지불자 셋이 전원 0원이 됐다. 형제 두 장(let_it_ride:96-99,
       * blood_contract:129-138)과 같은 규약으로 맞춘다 — winInfos[].points를
       * 밑값으로 쓰고, 앞 단계가 얹은 몫에는 손대지 않는다.
       *
       * 화료가 아닌 국(유국 텐파이 수령·유국만관·유국역만)은 winInfos가 비어
       * 있으므로 종전대로 «공탁을 뺀 델타 전부»가 밑값이다 — 그 경로는
       * 위 §무페널티 주석이 지키려는 바로 그 경로다.
       */
      const outside = Math.max(0, d - pot - honba);
      const winPoints = (p.winInfos ?? [])
        .filter((w) => w.winner === holder)
        .reduce((sum, w) => sum + w.points, 0);
      const base = winPoints > 0 ? Math.min(winPoints, outside) : outside;
      // 0.5배가 있으므로 100점 격자로 맞춘다 — 안 맞추면 소지점이 100의 배수가
      // 아니게 되어 결과창·순위 표시가 깨진다(docs/25 역/점수 #7).
      const scaled = round100(base * mult);

      /*
       * 배수의 **양쪽 방향을 다르게** 다룬다 (2026-08-07 점수 보존 수정).
       *
       * ① 1배 초과(2·3배) — 늘어난 몫은 **뱅크가 발행한다.** 지불자는 표준 정산
       *    금액 그대로 낸다. 이것이 §0 무페널티가 요구하는 설계다: 남의 룰렛 운
       *    때문에 방총자가 더 물어서는 안 된다. 이 경로는 그대로 둔다.
       *
       * ② 1배 미만(0.5배) — 예전에는 보유자의 델타만 줄이고 지불자의 델타는
       *    표준 금액 그대로 뒀다. 그러면 그 차액이 **어디에도 가지 않고 사라진다.**
       *    실측: p2 -48300 / p3 +24200 → 합계 -24100 (100,000점 총합이 80,300까지
       *    떨어졌다). 게다가 방총자는 화료자가 받지도 않는 점수를 물게 되어
       *    "증강이 없었을 때보다 나빠진다" — 무페널티 위반이다.
       *
       *    이제 깎인 몫을 **지금 실제로 내는 사람들에게 되돌린다.** 이동이 양쪽
       *    모두에서 같은 금액만큼 줄어 총합이 보존되고, 지불자는 표준 금액보다
       *    절대 더 내지 않는다(되돌려 받으므로 오히려 덜 낸다).
       *
       *    되돌릴 대상은 winInfo가 아니라 **현재 음수 델타**로 고른다 — 이 단계는
       *    Redistribute(책임전가·덤터기) 뒤라, 실제로 내는 사람이 이미 바뀌었을 수
       *    있다. 지불자가 아예 없으면(전액이 뱅크·공탁에서 온 경우) 깎지 않는다 —
       *    되돌릴 곳이 없는데 깎으면 그게 곧 점수 소멸이다.
       */
      if (scaled >= base) {
        // 밑값이 델타 전체가 아니므로 «늘어난 몫»만 델타에 얹는다.
        const after = d + (scaled - base);
        if (after === d) return event;
        return {
          type: event.type,
          payload: {
            ...p,
            deltas: { ...p.deltas, [holder]: after },
            augPoints: withAugPoint(p, ctx, after - d),
          },
        };
      }

      const payers = Object.entries(p.deltas)
        .filter(([id, v]) => id !== holder && v < 0)
        .map(([id, v]) => ({ id: id as PlayerId, paid: -v }));
      const shares = refundShares(payers, base - scaled);
      const refunded = shares.reduce((s, r) => s + r.amount, 0);
      if (refunded <= 0) return event;

      const deltas = { ...p.deltas };
      for (const r of shares) deltas[r.id] = (deltas[r.id] ?? 0) + r.amount;
      deltas[holder] = d - refunded;
      return {
        type: event.type,
        payload: {
          ...p,
          deltas,
          augPoints: withAugPoint(p, ctx, -refunded),
        },
      };
    });

    // 보유자의 국 첫 순에만 후보 노출 — 합법성은 validate가 최종 판정
    ctx.holderTurnOptions((state) =>
      atFirstTurn(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );
  },
});
