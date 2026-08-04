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
  roundKey,
  roundSeqOf,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";

const ID = "dora_afterimage";
const ACTION = "dora_recall";

/** 한 번 쓰면 이만큼 국(본장 포함)이 지나야 다시 열린다 */
const COOLDOWN_ROUNDS = 2;
const usedSeqKey = (h: PlayerId): string => `${ID}:usedSeq:${h}`;

/** 직전 국의 도라 종류 (국을 넘어 유지되므로 국 스코프 키가 아니다) */
const prevDoraKey = `${ID}:prevDora`;
/** 이번 국에 되살아난 도라 종류 (발동 시 굳힌다) */
const recalledKey = (state: GameState, h: PlayerId): string =>
  `${ID}:recalled:${roundKey(state)}:${h}`;

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

const offCooldown = (state: GameState, h: PlayerId): boolean => {
  const used = state.augmentData[usedSeqKey(h)];
  if (typeof used !== "number") return true;
  return roundSeqOf(state, ID, h) - used >= COOLDOWN_ROUNDS;
};

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
      augmentDataSet(usedSeqKey(req.player), roundSeqOf(state, ID, req.player)),
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
  name: "잔상",
  description:
    "(2국에 1회) 자기 순에 발동하면 직전 국의 도라 표시패가 되살아나, 그 도라가 이번 국의 도라 위에 나만의 도라로 겹쳐진다.",
  detail:
    "(2국에 1회) 자기 순에 발동하면 직전 국에 뒤집혀 있던 도라 표시패가 전부 되살아난다. 그 표시패들이 가리키던 도라가 이번 국의 도라와 별개로 자신에게만 추가된다. 이번 국의 도라는 그대로 살아 있으므로 도라가 사라지는 것이 아니라 한 겹 더 겹치는 것이며, 두 국의 도라가 같은 종류였다면 그 종류는 두 배로 값한다.\n\n되살아나는 것은 직전 국에 공개돼 있던 표시패 전부다 — 배패 표시패와 그 국에 뒤집힌 깡도라 표시패가 모두 포함된다. 뒷도라 표시패는 그 국에도 공개되지 않았으므로 따라오지 않는다. 발동 순간 종류가 굳으므로 이번 국에 새 깡도라가 뒤집혀도 되살아난 도라는 변하지 않는다.\n\n첫 국에는 되살릴 직전 국이 없어 발동할 수 없고, 무엇이 되살아났는지는 전원에게 공개된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) engine.actions.register(recallAction);

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
    trackRoundSeq(ctx, ID);

    // 매 국 끝에 그 국의 도라 종류를 적어 둔다 (다음 국이 되살릴 대상).
    // 정산 시점에는 그 국의 표시패가 아직 상태에 그대로 있다.
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      const kinds = rc.state.round.doraIndicators.map((t) =>
        doraKindFor(kindOf(rc.state, t)),
      );
      if (kinds.length === 0) return;
      rc.emit(augmentDataSet(prevDoraKey, kinds));
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
  bot: {
    choose: (ctx) => {
      // 텐파이에 가까울수록 값이 크다 — 1샹텐 이내에서만 쓴다
      if (ctx.shanten > 1) return null;
      return ctx.options.find((o) => o.type === ACTION) ?? null;
    },
  },
});
