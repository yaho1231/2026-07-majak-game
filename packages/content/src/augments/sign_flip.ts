/**
 * 반전 (sign_flip, prism) — "이 국만은, 잃을수록 번다".
 *
 * **자기 첫 순에 직접 발동하는 액티브**(3국에 1회)로, 발동한 **그 국 하나 동안** 내 점수의
 * 부호가 통째로 뒤집힌다.
 * 8000점을 쏘이면 잃는 대신 **뱅크에서 8000점을 받고**, 화료해서 1000점을 벌면
 * 그 1000점을 뱅크에 빼앗긴다. 리치 공탁 1000점도, 유국 텐파이료도, 본장도 예외가 없다.
 *
 * **상대의 점수는 정상이다** — 내가 쏘인 8000점은 화료자에게 그대로 가고, 내가 받는
 * 8000점은 뱅크가 따로 발행한다. 그 국만 테이블 합계가 맞지 않는다(사용자 확정).
 *
 * 그래서 이 국의 최적 플레이는 리치마작의 상식을 정면으로 뒤집는다 — 위험패를 골라
 * 버리고, 상대의 큰 손에 일부러 쏘이고, 화료는 피한다. 전원 공개라 상대는 "저 사람에게는
 * 쏘지 않는다(=화료를 미룬다)"로 맞설 수 있다.
 *
 * # 발동 방식 (2026-09-01 사용자 지시)
 *
 * 예전에는 뽑는 순간 자동으로 켜져 그 국 하나만 타고 끝나는 **선발동형**이었고(게임 내
 * 1회), 반장전에만 게임 내 1회 재장전이 붙어 있었다. 이제는 **액티브 · 3국에 1회 ·
 * 동풍전 반장전 공통**이다 — 언제 터뜨릴지를 플레이어가 고르고, 판이 길어져도 카드가
 * 죽은 칸으로 남지 않는다.
 *
 * 발동은 **자기 첫 순에만** 열린다(그 국에 아직 한 장도 버리지 않았을 때). 판이 굳은
 * 뒤에 «지금 위험하니 켠다»가 되면 이 카드는 «이번 국을 통째로 건다»가 아니라 방총
 * 보험이 된다 — 상대가 국 초반에 대응(저 사람에게는 쏘지 않는다)을 정할 수 있어야
 * 전원 공개가 의미를 갖는다는 것도 같은 이유다.
 *
 * 구현:
 * - `ROUND_SETTLED` 인터셉터(`SignFlip` 단계 — 돈이 움직이는 모든 단계 뒤, 방어 앞)에서
 *   보유자의 최종 delta에 -1을 곱한다. 차액은 뱅크가 발행하며 남의 delta는 손대지 않는다.
 * - 리치 공탁 1000점은 정산이 아니라 **버림 리듀서**에서 즉시 빠져나간다. 그래서
 *   보유자의 리치 선언 직후 `ScoreChanged(+2×공탁)`을 얹어 "낸 1000점 환원 + 1000점 획득"을
 *   만든다. 공탁 자체는 그대로 쌓이므로 리치봉의 흐름은 정상이다.
 * - 증강이 국 중에 직접 옮기는 점수(`ScoreChanged`)도 같은 국이면 부호를 뒤집는다.
 */

import {
  SCORE_CHANGED,
  SETTLE_STAGE,
  TILE_DISCARDED,
  augmentDataSet,
  augmentInstanceId,
  defineAugment,
  isSourceDisarmed,
  playerAtSeat,
  scoreChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  ProposedEvent,
  RoundSettledPayload,
  ScoreChangedPayload,
  TileDiscardedPayload,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  roundKey,
  roundViewKey,
  settleInterceptor,
  stringOf,
  trackRoundSeq,
  withAugPoint,
} from "../util.js";
import { plan } from "./botPlan.js";

const ID = "sign_flip";

/**
 * **뱅크가 이 카드 하나로 새로 발행하는 액수의 상한** — 판의 시작 점수 한 벌.
 *
 * 형제 카드인 죽기살기(`die_hard.REVIVE_CAP`)와 **같은 값·같은 이유**다(2026-08-23
 * QA synergy3 score 확정 3 → 2026-08-31 synergy4 A-10에서 이쪽에도 옮겼다).
 * 손실을 한 사람에게 몰아 주는 증강(덤터기 `scapegoat`·눈먼 총알 `blind_ron`·
 * 책임전가)과 겹치면 «내가 잃는 액수»에 상한이 없다 — 실측으로 8,000 방총이
 * 덤터기로 24,000이 되고 반전이 그것을 뒤집어 **뱅크가 48,000을 발행, 테이블 합
 * +60,000**이 됐다. 뚫린 천장까지 끼면 아예 무제한이다.
 *
 * 자르는 것은 **뱅크 발행(잃는 국)뿐**이다. 버는 국을 뒤집어 뱅크가 **거둬들이는**
 * 쪽에는 상한이 없다 — 그쪽은 새 점수를 만들지 않으므로 자를 이유가 없고, 자르면
 * "번 만큼 빼앗긴다"는 카드 문구가 큰 손에서만 거짓이 된다.
 */
const FLIP_CAP = 25_000;

/** 발동 주기 — 켠 국으로부터 몇 국이 지나야 다시 켤 수 있는가 (2026-09-01) */
const COOLDOWN_ROUNDS = 3;
const ACTION = "sign_flip_use";

/**
 * 이 증강이 켜진 국 (보유자별).
 *
 * 선발동형의 `armedRound`(util)와 **일부러 다른 키**다. 그쪽 이름을 쓰면 재장전·복구가
 * 상태만 보고 «이건 선발동형»으로 판정하는데(`preArmInstalled`), 반전은 더 이상
 * 선발동형이 아니다.
 */
const armedKey = (h: PlayerId): string => `${ID}:onRound:${h}`;

/** 지금 이 국에 켜져 있는가 */
function armedNow(state: GameState, holder: PlayerId): boolean {
  return stringOf(state, armedKey(holder)) === roundKey(state);
}

/** 이 국에서 아직 한 장도 버리지 않았는가 — «자기 첫 순» */
function firstTurn(state: GameState, holder: PlayerId): boolean {
  return (state.round.byPlayer[holder]?.discardCount ?? 0) === 0;
}

/**
 * 지금 켤 수 있는가 — 자기 첫 순, 쿨다운이 풀렸고, 이미 켜져 있지 않다.
 * (액션 validate와 후보 열거가 같은 판정을 봐야 하므로 한 곳에 둔다.)
 */
function canUse(state: GameState, holder: PlayerId): boolean {
  const player = state.players.find((p) => p.id === holder);
  if (player === undefined || !player.augments.includes(ID)) return false;
  if (state.round.phase !== "turn.act") return false;
  if (playerAtSeat(state, state.round.turnSeat).id !== holder) return false;
  if (isSourceDisarmed(state, augmentInstanceId(holder, ID))) return false;
  if (!firstTurn(state, holder)) return false;
  if (armedNow(state, holder)) return false;
  return cooldownReady(state, ID, holder, COOLDOWN_ROUNDS);
}

/** 이미 이 증강이 서명한 발행인가 — 자기 보정(`sign_flip`)과 뒤집은 발행(`X+sign_flip`) 둘 다. */
function isOwnReason(reason: string | undefined): boolean {
  return reason === ID || (reason !== undefined && reason.endsWith(`+${ID}`));
}

export const signFlip: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 1,
  name: "반전",
  description:
    "(3국에 1회 · 자기 첫 순 · 이번 국만) 이번 국 내 점수의 부호가 뒤집힌다. −8,000 → +8,000, +1,000 → −1,000.",
  detail:
    "자기 첫 순에 켜면 이번 국 내 점수 변동의 부호가 뒤집힌다 — −8,000 → +8,000, +1,000 → −1,000.\n\n방총·쯔모 지불·리치 공탁·본장·유국 텐파이료가 전부 포함되고, 뒤집혀 돌아오는 몫은 25,000점까지다. 상대 점수는 그대로 움직이고 차액은 뱅크가 낸다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 3국에 1회 — 국 카운터와 잔여 쿨다운 표시(이름표의 🕐N국 칩)를 함께 돌린다.
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    const action: ActionDef<Record<string, never>> = {
      type: ACTION,
      validate: (req, { state }) => (canUse(state, req.player) ? null : "cannot flip now"),
      toEvents: (req, { state }) => [
        // 이 국에 켠다
        augmentDataSet(armedKey(req.player), roundKey(state)),
        ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
        // 켜지는 순간 전원 공개 — 상대가 "저 사람에게는 쏘지 않는다"로 맞설 수 있어야 한다
        augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), true),
      ],
    };
    if (!engine.actions.has(ACTION)) engine.actions.register(action);

    // 합법성의 최종 판정은 validate가 한다 — 같은 `canUse`를 본다.
    ctx.holderTurnOptions((state) => (canUse(state, holder) ? [{ type: ACTION, payload: {} }] : []));

    // 리치 공탁 — 정산이 아니라 버림 리듀서가 즉시 깎는다.
    // 낸 만큼 되돌리고(+cost) 부호를 뒤집은 만큼 더 준다(+cost) = +2×cost.
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.player !== holder || !p.riichi || p.riichiCost <= 0) return;
      if (!armedNow(rc.state, holder)) return;
      rc.emit(scoreChanged(holder, p.riichiCost * 2, ID));
    });

    // 국 중에 증강이 직접 옮기는 점수도 같은 국이면 뒤집는다.
    // (내가 스스로 낸 보정은 제외 — 뒤집으면 위 공탁 보정이 도로 사라진다.)
    ctx.interceptor(SCORE_CHANGED, (event, ic) => {
      const p = event.payload as ScoreChangedPayload;
      if (p.player !== holder || isOwnReason(p.reason)) return event;
      if (!armedNow(ic.state, holder)) return event;
      // 뒤집은 발행에는 **반드시 서명한다**. reason을 그대로 두면 원장이
      // "카르마가 피해자에게 +4,000을 줬다"고 거짓말을 한다(QA verify-score 확정 3).
      // 원인을 지우지 않고 뒤에 붙여 "karma+sign_flip"으로 남긴다.
      return {
        type: event.type,
        payload: {
          ...p,
          delta: -p.delta,
          reason: p.reason === undefined ? ID : `${p.reason}+${ID}`,
        },
      };
    });

    // 정산 단계: SignFlip — 돈이 움직이는 모든 단계 뒤, 방어 앞.
    settleInterceptor(ctx, SETTLE_STAGE.SignFlip, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (!armedNow(ic.state, holder)) return event;
      const before = p.deltas[holder] ?? 0;
      if (before === 0) return event;
      // 잃는 국을 뒤집어 **뱅크가 발행하는** 폭만 상한을 둔다 (FLIP_CAP 주석 참조).
      const after = before < 0 ? Math.min(-before, FLIP_CAP) : -before;
      const deltas = { ...p.deltas, [holder]: after };
      return {
        type: event.type,
        payload: {
          ...p,
          deltas,
          // 결과 화면에 "부호 반전으로 이만큼 움직였다" 한 줄
          augPoints: withAugPoint(p, ctx, after - before),
        },
      };
    });
  },
  /*
   * 봇 정책 — 열리면 미룬다 없이 누른다.
   *
   * 사람은 «어느 국에 터뜨릴까»를 고르지만, 발동 창이 자기 첫 순 하나뿐이라 미루는
   * 것은 곧 그 국을 통째로 버리는 것이다. 정책이 없으면 봇은 이 버튼을 영영 누르지
   * 않는다(docs/27).
   */
  bot: plan({
    intent: "setup",
    fleeting: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
