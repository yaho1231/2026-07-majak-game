/**
 * 도라의 잔상 (dora_afterimage, prism) — "지난 국의 도라가 아직 안 꺼졌다".
 *
 * (2국에 1회) 자기 순에 발동하면 **직전 국의 도라 표시패**가 되살아나, 그 표시패들이
 * 가리키던 도라가 **이번 국의 내 도라로 중첩**된다. 이번 국의 도라는 그대로 살아 있고,
 * 그 위에 지난 국의 도라가 한 겹 더 얹히는 것이다 — 두 국의 도라가 같은 종류였다면
 * 그 종류는 나에게 **두 배**로 값한다.
 *
 * 되살아나는 것은 그 국에 **뒤집혀 있던 표시패 전부**다(배패 표시패 + 그 국의 깡도라).
 * 뒷도라 표시패는 그 국에도 공개되지 않았으므로 따라오지 않는다.
 *
 * 구현: 코어 규칙 `scoring.extraDoraKinds`에 보유자 전용 Modifier를 건다(거울의 도라와
 * 같은 경로 — 화료패까지 포함한 정상 도라 계산을 그대로 탄다).
 * - `ROUND_SETTLED` 리액션이 매 국 끝에 그 국의 표시패 종류를 상태에 적어 둔다.
 *   국이 바뀌어도 남아 있어야 하므로 국 스코프 키가 아니다.
 * - 발동은 커스텀 액션 하나 — 되살릴 종류를 **국 스코프 키**에 굳히고 전원에게 공개한다.
 *   굳힐 때 값을 복사해 두므로, 이번 국에 새 깡도라가 뒤집혀도 되살아난 도라는 안 변한다.
 * - 첫 국(직전 국이 없다)에는 후보 자체가 뜨지 않는다.
 */

import {
  ROUND_SETTLED,
  augmentDataSet,
  defineAugment,
  doraKindFor,
  kindKey,
  kindOf,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileKind,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  roundViewKey,
  trackRoundSeq,
  viewKey,
} from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "dora_afterimage";
const ACTION = "dora_recall";

/** 한 번 쓰면 이만큼 국(본장 포함)이 지나야 다시 열린다 */
const COOLDOWN_ROUNDS = 2;

/** 직전 국의 도라 종류 (국을 넘어 유지되므로 국 스코프 키가 아니다) */
const prevDoraKey = `${ID}:prevDora`;
/**
 * 발동 전에 보유자에게만 보여 주는 "되살릴 수 있는 도라" 채널.
 * 무엇이 되살아나는지 모르면 쓸지 말지 판단할 수가 없다 — 그래서 국이 바뀔 때마다
 * 후보를 미리 알려 준다. **고정 키**다: 매 국 정산에서 덮어써야 다음 국 내내 남는다.
 * 상대에게는 안 보인다(발동해야 전원 공개된다).
 */
const candidateViewKey = (h: PlayerId): string => viewKey(h, `${ID}:prev:${h}`);
/** 이번 국에 되살아난 도라 종류 (발동 시 굳힌다) */
const recalledKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "recalled", state, h);

/** 값이 TileKind 배열인가 (augmentData는 unknown이라 읽을 때마다 확인한다) */
function asKinds(value: unknown): TileKind[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (k): k is TileKind =>
      typeof k === "object" &&
      k !== null &&
      typeof (k as TileKind).suit === "string" &&
      typeof (k as TileKind).rank === "number",
  );
}

/** 지금 되살릴 수 있는 직전 국의 도라 종류 */
const prevDora = (state: GameState): TileKind[] =>
  asKinds(state.augmentData[prevDoraKey]);

/** 이번 국에 이미 되살렸는가 */
const recalledNow = (state: GameState, h: PlayerId): TileKind[] =>
  asKinds(state.augmentData[recalledKey(state, h)]);

const offCooldown = (state: GameState, h: PlayerId): boolean =>
  cooldownReady(state, ID, h, COOLDOWN_ROUNDS);

const recallAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no dora_afterimage augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!offCooldown(state, req.player)) return "on cooldown";
    if (recalledNow(state, req.player).length > 0) return "already recalled";
    if (prevDora(state).length === 0) return "no previous round dora";
    return null;
  },
  toEvents: (req, { state }) => {
    const kinds = prevDora(state);
    return [
      augmentDataSet(recalledKey(state, req.player), kinds),
      ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
      // 전원 공개 — 무엇이 이 사람의 도라가 됐는지 보여야 대응할 수 있다
      augmentDataSet(
        roundViewKey("*", `${ID}:${req.player}`),
        kinds.map(kindKey),
      ),
    ];
  },
};

export const doraAfterimage: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 2,
  name: "잔상",
  description:
    "(2국에 1회) 자기 순에 발동하면 직전 국의 도라 표시패가 되살아나, 그 도라가 이번 국의 도라 위에 나만의 도라로 겹쳐진다.",
  detail:
    "(2국에 1회) 자기 순에 발동하면 직전 국에 공개돼 있던 도라 표시패가 가리키던 도라가 보유자에게만 추가된다. 이번 국의 도라는 그대로 유지되고 그 위에 겹친다.\n\n대상은 직전 국의 배패 표시패와 깡도라 표시패이며, 뒷도라 표시패는 포함되지 않는다. 발동 시점에 종류가 고정되어 이후 깡도라가 뒤집혀도 변하지 않는다. 첫 국에는 발동할 수 없고, 되살아난 종류는 전원에게 공개된다.\n\n되살릴 수 있는 도라는 발동 전에도 보유자에게만 미리 보인다 — 쓸 값어치가 있는지 보고 고르면 된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) engine.actions.register(recallAction);

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    // 매 국 끝에 그 국의 도라 종류를 적어 둔다 (다음 국이 되살릴 대상).
    // 정산 시점에는 그 국의 표시패가 아직 상태에 그대로 있다.
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      const kinds = rc.state.round.doraIndicators.map((t) =>
        doraKindFor(kindOf(rc.state, t)),
      );
      if (kinds.length === 0) return;
      rc.emit(augmentDataSet(prevDoraKey, kinds));
      // 보유자에게만 미리 보여 준다 — 다음 국에 되살릴 수 있는 도라가 이것이다
      rc.emit(augmentDataSet(candidateViewKey(holder), kinds.map(kindKey)));
    });

    // 되살아난 도라를 개인 도라로 얹는다 (거울의 도라와 같은 코어 경로)
    engine.rules.addModifier<readonly TileKind[]>("scoring.extraDoraKinds", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return [...cur, ...recalledNow(state, holder)];
      },
    });

    // 자기 순에 뜨는 액티브 버튼 (합법성 최종 판정은 validate)
    ctx.holderTurnOptions(() => [{ type: ACTION, payload: {} }]);
  },
  // 값을 키우는 증강이라 **이길 손에만** 값이 붙는다 — 손이 얼마나 여물었는지는
  // planner가 `score` 적기로 본다(예전의 `shanten > 1 → null`과 같은 판단이다).
  bot: plan({
    intent: "score",
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
