/**
 * 선발동형 **재무장** 공용 배선 (반장전 QA 2026-08-25).
 *
 * ## 무엇을 고치는가
 *
 * 눈먼 총알·초읽기·반전은 뽑는 순간 자동으로 켜져 **그 국 하나**만 타고 끝난다
 * (`armOnNextRound`). 효과의 절대 크기는 모드와 무관한데 분모인 국 수는 동풍전 4국에서
 * 반장전 8국으로 늘어난다 — 판의 25%를 차지하던 카드가 12.5%가 되고, 그 뒤로는 영영
 * 죽은 칸으로 남는다. 세 증강 모두 `matchUses`·`scaledUses`·국 스코프 중 어디에도
 * 붙어 있지 않아 길이 보정을 한 톨도 못 받는 유일한 부류였다(docs/qa-hanchan/disrupt.md).
 *
 * 처방은 **반장전에서만 게임 내 1회, 원하는 타이밍에 다시 장전**이다. 횟수를 늘리는
 * 대신 «언제 한 번 더 터뜨릴지»를 플레이어가 고르게 해서, 동풍전 카드의 성질(한 국을
 * 통째로 뒤집는 일회성 사건)을 그대로 둔 채 판 길이만 따라가게 한다.
 *
 * ## 어떻게 도는가
 *
 * 재장전(`reload`)이 이미 하고 있는 일과 **같은 규약**이다 — `preArmRestoreEvents`로
 * 표식 둘을 지우면 다음 `ROUND_STARTED`에서 `armOnNextRound`가 "아직 켜진 적 없는
 * 증강"으로 보고 그 국에 다시 켠다(공개 표시도 그때 함께 나간다). 그래서 «지금 눌러서
 * **다음 국**에 터뜨린다»가 되고, 고르는 것은 발동 국이다.
 *
 * 조건은 셋뿐이다.
 *  - **반장전에서만.** 동풍전은 기준선 그대로 두는 것이 이 수정의 전제다.
 *  - **이미 다 타 버렸을 때만**(`preArmSpent`). 타는 중인 국에 누르면 그 국을 덮어쓰며
 *    한 번을 그냥 버리게 된다 — 재장전이 같은 이유로 막는 자리다.
 *  - **게임 내 1회**, 자기 순에. 카운터는 매치 스코프(`<id>:recharge:<holder>`)라
 *    국이 바뀌어도 남는다.
 *
 * 무장해제(`AUGMENT_DISARMED`)로 잠긴 동안에는 누를 수 없다 — 잠긴 증강을 장전해 두면
 * 잠금이 풀리는 시점에 조용히 되살아나 «무장해제됐다»는 정보가 거짓이 된다.
 */

import {
  augmentDataSet,
  augmentInstanceId,
  isSourceDisarmed,
  playerAtSeat,
} from "@majak/core";
import type { AugmentContext, ActionDef, GameState, PlayerId } from "@majak/core";
import { counterOf, preArmRestoreEvents, preArmSpent, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";

/** 재무장을 몇 번 썼는가 (매치 스코프 — 국이 바뀌어도 남는다) */
const rechargeKey = (augmentId: string, holder: PlayerId): string =>
  `${augmentId}:recharge:${holder}`;

/** 이 판에서 재무장을 쓸 수 있는 모드인가 — 반장전 전용 */
function rechargeMode(state: GameState): boolean {
  return (state.config.mode ?? "hanchan") !== "tonpuu";
}

/** 재무장 액션 이름 (증강 id에서 파생 — 충돌 방지) */
export const rechargeActionType = (augmentId: string): string =>
  `${augmentId}_recharge`;

/**
 * 지금 이 보유자가 재무장을 누를 수 있는가.
 * (액션 validate와 봇 정책이 같은 판정을 봐야 하므로 한 곳에 둔다.)
 */
export function canRecharge(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
): boolean {
  if (!rechargeMode(state)) return false;
  const player = state.players.find((p) => p.id === holder);
  if (player === undefined || !player.augments.includes(augmentId)) return false;
  if (state.round.phase !== "turn.act") return false;
  if (playerAtSeat(state, state.round.turnSeat).id !== holder) return false;
  if (isSourceDisarmed(state, augmentInstanceId(holder, augmentId))) return false;
  if (counterOf(state, rechargeKey(augmentId, holder)) >= 1) return false;
  // 아직 타는 중인 국을 덮어쓰지 않는다 — 그 국이 지나간 뒤부터 후보다
  return preArmSpent(state, augmentId, holder);
}

/**
 * 선발동형에 «반장전 게임 내 1회 재무장» 버튼을 붙인다 (`install`에서 호출).
 *
 * 액션은 게임당 한 번만 등록한다(여러 플레이어가 같은 증강을 들 수 있다).
 */
export function installPreArmRecharge(ctx: AugmentContext, augmentId: string): void {
  const { engine, holder } = ctx;
  const type = rechargeActionType(augmentId);

  const action: ActionDef<Record<string, never>> = {
    type,
    validate: (req, { state }) =>
      canRecharge(state, augmentId, req.player) ? null : "cannot recharge now",
    toEvents: (req, { state }) => [
      // 표식 둘을 지운다 → 다음 국 시작에 armOnNextRound가 다시 켠다
      ...preArmRestoreEvents(augmentId, req.player),
      augmentDataSet(
        rechargeKey(augmentId, req.player),
        counterOf(state, rechargeKey(augmentId, req.player)) + 1,
      ),
      // 전원 공개 — 다 탔다고 믿던 증강이 다시 장전됐음을 알린다
      // (이 증강들은 전부 상대가 대응해야 하는 공개 효과다)
      augmentDataSet(roundViewKey("*", `${augmentId}:recharged:${req.player}`), true),
    ],
  };

  if (!engine.actions.has(type)) engine.actions.register(action);

  // 자기 턴에, 다 탔고, 아직 재장전을 안 썼을 때만 버튼을 노출한다
  // (합법성의 최종 판정은 위 validate가 한다 — 같은 `canRecharge`를 본다).
  ctx.holderTurnOptions((state) =>
    canRecharge(state, augmentId, holder) ? [{ type, payload: {} }] : [],
  );
}

/**
 * 재무장 버튼의 봇 정책 — 쓸 수 있게 되면 미루지 않고 누른다.
 *
 * 사람은 «어느 국에 터뜨릴까»를 고르지만 봇에게 그 판단을 맡기면 결국 한 번도 안 쓰고
 * 게임이 끝난다(정책이 없는 증강은 봇이 영영 발동하지 않는다 — docs/27). 남은 국이
 * 많을수록 다시 터뜨릴 값도 크므로, 가능한 가장 이른 국에 장전하는 것이 봇에게는
 * 손해 보지 않는 기본값이다.
 */
export const rechargeBotPolicy = (augmentId: string): ReturnType<typeof plan> =>
  plan({
    intent: "setup",
    // 적기 판단을 기다리지 않는다 — 이 버튼은 판 상황과 무관하게 이르면 이를수록 좋다
    fleeting: true,
    pick: ({ options }) =>
      options.find((o) => o.type === rechargeActionType(augmentId)) ?? null,
  });
