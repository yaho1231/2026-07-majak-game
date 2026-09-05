/**
 * 투시 (xray_hand) — 액티브. 발동한 국 내내 상대 세 명의 손패가 전부 나에게만 보인다.
 *
 * 재설계(2026-07-25, 사용자 지시): 이전엔 게임 내내 상시 공개되는 순수 패시브였다.
 * 이제 **매치당 사용 횟수**(동풍전 1·반장전 2회)를 쓰는 액티브가 됐다 — 자기 턴에
 * 버튼으로 발동하면 **그 국이 끝날 때까지** 상대 세 명의 손패가 전부 나에게만 열린다.
 * 언제 켜느냐가 선택이 된다(결정적 국을 골라 쓴다). 발동은 전원에게 공개돼 상대가 수비를
 * 조일 수 있다.
 *
 * 구현:
 * - 액션 `xray_reveal {}`: turn.act·자기 턴·사용 횟수 남음·그 국 미발동일 때.
 *   발동 시 국 스코프 활성 플래그(roundKey)와 매치 스코프 사용 카운터(uses)를 함께 쓴다.
 * - `visibility.hand` 모디파이어: 뷰어=보유자, 존 주인=타인이고 **그 국의 활성 플래그가
 *   켜져 있을 때만** "public"을 돌려준다. 그 외에는 기존 값을 유지해 다른 가시성 증강과
 *   합성된다. 활성 플래그는 roundKey 스코프라 국이 바뀌면 자연 만료된다.
 */

import { augmentDataSet, defineAugment, playerAtSeat } from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  VisibilityRule,
} from "@majak/core";
import { counterOf, flagOf, matchUses, publishUsesLeft, roundViewKey } from "../util.js";
import { clearViewOnDisarm } from "./disarmBanner.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "xray_hand";
const ACTION = "xray_reveal";

/** 이 국에 투시를 발동했는가 (국 스코프 — 국이 바뀌면 자연 만료) */
const activeKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "active", state, h);
/** 매치당 사용 횟수 카운터 (게임 단위 — roundKey 없음). 동풍전 1·반장전 2회. */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;

const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

/** 자기 턴(turn.act)이고, 사용 횟수가 남았고, 그 국에 아직 발동하지 않았으면 발동 가능 */
function canReveal(state: GameState, holder: PlayerId): boolean {
  if (state.round.phase !== "turn.act") return false;
  if (playerAtSeat(state, state.round.turnSeat).id !== holder) return false;
  if (!hasUsesLeft(state, holder)) return false;
  if (flagOf(state, activeKey(state, holder))) return false; // 이미 이 국에 켰다
  return true;
}

const xrayAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no xray_hand augment";
    }
    if (!canReveal(state, req.player)) return "cannot reveal now";
    return null;
  },
  toEvents: (req, { state }) => [
    // 이 국 활성화 + 매치 사용 횟수 +1
    augmentDataSet(activeKey(state, req.player), true),
    augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
    // 발동 사실은 전원 공개 — 상대가 수비를 조일 수 있게
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), true),
  ],
};

export const xrayHand: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "info",
  complexity: 1,
  name: "투시",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 발동하면 그 국이 끝날 때까지 상대 세 명의 손패가 전부 나에게만 보인다.",
  detail:
    "발동하면 그 국이 끝날 때까지 상대 셋의 손패가 전부 나에게만 보인다.\n\n켠 사실은 전원에게 공개된다.",
  // 봇: 순수 정보 이득이라 자해가 없다 — 옵션이 뜨면 곧바로 발동한다.
  bot: plan({
    intent: "inform",
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) engine.actions.register(xrayAction);

    // 뷰어가 보유자이고, 존 주인이 타인이고, 그 국에 투시를 켰을 때만 손패 전체 공개
    ctx.engine.rules.addModifier<VisibilityRule>("visibility.hand", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        if (rctx.zoneOwner === undefined || rctx.zoneOwner === holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return flagOf(state, activeKey(state, holder)) ? "public" : cur;
      },
    });


    /*
     * 무장해제로 잠기면 «투시 켜짐» 배너도 함께 내린다 (2026-08-23 QA synergy3 disrupt 확정 4).
     * 효과는 게이트가 막는데 배너만 남아 있으면 화면이 정확히 반대를 말한다 —
     * 눈먼 총알·초읽기와 같은 규약이다(disarmBanner.ts).
     */
    clearViewOnDisarm(ctx, () => [roundViewKey("*", `${ID}:${holder}`)]);

    // 아직 사용 횟수가 남았으면 보유자 턴에 발동 후보를 낸다
    ctx.holderTurnOptions((state) =>
      canReveal(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );
  },
});
