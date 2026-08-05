/**
 * 천하무적 (invincible, gold) — 2국당 1회, 자기 턴에 선언하면 **이번 국 동안
 * 타가는 당신을 론할 수 없다**. 무엇을 버려도 방총이 나지 않는다.
 *
 * 예전엔 "게임 내내 무방총이면 최종 정산 +8000"이었다 — 아무 순간도 없고,
 * 잘해야 정산 로그에 한 줄 뜨는 조용한 보너스였다(CHARTER 1.2 노잼 조항).
 * 지금은 켜는 순간 그 국의 위험패 개념이 사라진다: 리치가 셋 걸려 있어도
 * 오름패를 그대로 통과시키며 손을 밀어붙일 수 있다.
 *
 * 구현:
 * - 커스텀 액션 invincible_guard: 자기 턴에 선언. roundKey 스코프 플래그 + 쿨다운 2국.
 * - 코어 규칙 `win.ronImmune`(playerId = '쏘일 사람') Modifier — 표준 win 액션의
 *   리액션 분기가 이 규칙을 보고 론을 거부한다. 프롬프트(FlowController)는
 *   validate를 통해 후보를 만들므로 론 버튼 자체가 뜨지 않는다.
 * - 쯔모·유국은 그대로다. 막는 것은 오직 "내 버림패로 쏘이는 것"뿐.
 */

import {
  ROUND_SETTLED,
  augmentDataSet,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId } from "@majak/core";
import { flagOf, roundKey } from "../util.js";
import { plan } from "./botPlan.js";

const ID = "invincible";
const ACTION = "invincible_guard";
/** 선언한 국과 다음 국까지 잠긴다 */
const COOLDOWN_ROUNDS = 2;

/** 이번 국에 무적을 켰는가 (roundKey 스코프 — 국이 바뀌면 자동 만료) */
const activeKey = (state: GameState, h: PlayerId): string =>
  `${ID}:active:${roundKey(state)}:${h}`;
/** 남은 쿨다운(국 수). 0/미설정이면 사용 가능 */
const cooldownKey = (h: PlayerId): string => `${ID}:cd:${h}`;

const guardAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no invincible augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, activeKey(state, req.player))) return "already active";
    const cooldown = state.augmentData[cooldownKey(req.player)];
    if (typeof cooldown === "number" && cooldown > 0) {
      return "invincible on cooldown";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(activeKey(state, req.player), true),
    augmentDataSet(cooldownKey(req.player), COOLDOWN_ROUNDS),
  ],
};

export const invincible: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "defense",
  name: "천하무적",
  description:
    "(2국에 1회) 자기 순에 선언하면 이번 국이 끝날 때까지 타가는 당신을 론할 수 없다. 무엇을 버려도 방총이 나지 않는다.",
  detail:
    "(2국에 1회) 자기 순에 선언하면 그 국이 끝날 때까지 타가가 내 버림패로 론할 수 없다. 다만 상대의 쯔모 화료나 유국 노텐 벌점은 막지 못한다.",
  // 봇: 상대가 리치를 걸었을 때 켠다 — 방총 위험이 가장 큰 순간이 켤 값어치가 가장 크다.
  // 상대 리치가 실재할 때만 켠다 = 방어가 급한 국면. 예전에는 그 판정과 강도를
  // 이 파일이 직접 들고 있었는데, 둘 다 증강이 아니라 판의 문제라 planner가 맡는다.
  bot: plan({
    intent: "defend",
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
  // B급 무효(docs/25 §conflicts): 같은 win.ronImmune 키를 같은 값으로 쓴다.
  // 조약이 살아 있는 구간에 무적을 선언하면 그 발동이 통째로 낭비된다.
  conflicts: ["no_ron_pact"],
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(guardAction);
    }

    // 이번 국에 켜져 있으면, 이 사람의 버림패는 론당하지 않는다
    engine.rules.addModifier<boolean>("win.ronImmune", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return flagOf(state, activeKey(state, holder)) ? true : cur;
      },
    });

    // 국 종료마다 쿨다운 1 감소 (무적 자체는 roundKey 스코프라 저절로 꺼진다)
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      const cooldown = rc.state.augmentData[cooldownKey(holder)];
      if (typeof cooldown === "number" && cooldown > 0) {
        rc.emit(augmentDataSet(cooldownKey(holder), cooldown - 1));
      }
    });

    ctx.holderTurnOptions(() => [{ type: ACTION, payload: {} }]);
  },
});
