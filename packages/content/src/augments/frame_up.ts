/**
 * 누명 (frame_up, prism) — "내가 버린 걸로 친다고? 나 이제 후리텐이야?!"
 *
 * **2국에 1회**, 자기 턴에 **내가 버릴 패를 상대 한 명의 바닥에 놓는다**. 그 패는
 * 그 사람이 버린 것으로 기록되어(후리텐 근거 `discardedKinds`에 새겨진다) 그가 그 종류로
 * 론할 수 없게 되고, 동시에 **내 바닥에는 남지 않아 내 후리텐도 회피**된다.
 *
 * 구현: 코어 `TileDiscardedPayload.creditTo`(신규 선택 필드)를 쓴다 — 패가 놓이는 바닥과
 * 후리텐 이력만 지목 대상 명의로 가고, **손패 출처·방총 책임(`lastDiscard.player`)·턴 진행은
 * 실제로 버린 나 그대로**다. 즉 심는 순간 다른 상대의 론 반응은 정상적으로 열리고, 그 패로
 * 쏘이면 책임은 내가 진다(원안 대응 규칙 그대로).
 *
 * 표준 버림을 대체하는 액션이므로 손패 장수·턴 흐름은 일반 버림과 완전히 같다.
 * 리치 중에는 버릴 패가 쯔모패로 고정되므로 발동할 수 없다.
 */

import {
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isTerminalOrHonor,
  lockedDiscardIds,
  kindKey,
  kindOf,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "frame_up";
const ACTION = "frame_discard";

/**
 * 쿨다운 — 한 번 심으면 이만큼 국(본장 포함)이 지나야 다시 열린다.
 * 2026-08-02 사용자 지시로 "동풍1/반장2"에서 **2국당 1회**로 상향했다 —
 * 매치당 1~2회는 국이 흘러가는 동안 쓸 자리를 못 찾고 사장되기 일쑤였다.
 */
const COOLDOWN_ROUNDS = 2;
/** 지금 심을 수 있는가 — 쓴 적이 없거나, 마지막 사용 이후 2국이 지났다 */
const offCooldown = (state: GameState, h: PlayerId): boolean =>
  cooldownReady(state, ID, h, COOLDOWN_ROUNDS);

/** 리치 중인가 (버릴 패가 고정돼 지목 버림 불가) */
const inRiichi = (state: GameState, h: PlayerId): boolean =>
  state.round.byPlayer[h]?.riichi != null;

/**
 * 첫 바퀴(사풍연타 판정 창)인가 — 그 동안에는 심을 수 없다.
 *
 * 사풍연타는 "네 명의 **첫 버림**이 모두 같은 바람"으로 판정하는데, 엔진은 그것을
 * 각자 바닥의 장수로 센다(FlowController.isFourWindAbort). 누명은 버린 사람 바닥을
 * 0장, 지목당한 사람 바닥을 2장으로 만들어 그 판정을 조용히 무너뜨린다(성립해야 할
 * 도중유국이 안 나거나, 아직 버리지도 않은 사람이 1장으로 집계돼 오탐이 난다).
 * 창이 첫 바퀴뿐이라, 그 동안 발동을 막는 것이 판정을 건드리지 않는 가장 싼 해법이다.
 *
 * ⚠ `round.firstTurn` **하나만 보면 안 된다.** 그 플래그는 원래 천화·지화용이라
 * **후로가 일어나는 순간 내려간다** — 네 사람의 버림 수가 전부 0인데도(아무도 아직
 * 안 버렸는데) 퐁 한 번에 누명 후보가 0개에서 30개로 열렸다(QA text 확정 32).
 * detail이 말하는 '첫 바퀴'는 **네 사람이 한 번씩 버리기 전**이므로, 각자의 버림
 * 이력이 하나라도 비어 있으면 아직 첫 바퀴다. 두 조건의 논리합이라 보호창이 후로로
 * 깨지지도, 첫 바퀴가 끝난 뒤까지 늘어지지도 않는다.
 */
const inFirstGoAround = (state: GameState): boolean =>
  state.round.firstTurn ||
  state.players.some(
    (p) => (state.round.byPlayer[p.id]?.discardedKinds ?? []).length === 0,
  );

/**
 * 이번 국에 **중장패를 남의 바닥으로 흘렸는가** (유국만관 자격 박탈용, 국 스코프).
 *
 * 나가시 판정은 `round.byPlayer[x].discardedKinds`만 본다. 누명은 그 이력을 지목당한
 * 사람에게 새기므로 보유자의 이력에는 요구패만 남아, **중장패를 버리고도 유국만관이
 * 이어졌다** — 같은 손·같은 패인데 표준으로 버리면 −3,000, 누명으로 버리면 +9,000으로
 * 12,000점이 뒤집혔다(QA disrupt-b 확정 4). 누명이 광고하는 것은 후리텐 이력 오염과
 * 내 후리텐 회피 둘뿐이고, "유국만관 자격까지 지켜 준다"는 어디에도 없다.
 *
 * 코어의 나가시 판정은 `draw.nagashiMangan` 규칙으로 감싸여 있으므로(standardActions),
 * 그 규칙을 보유자에 한해 끄는 것으로 **판정 자체를 건드리지 않고** 바로잡는다.
 * 요구패를 심은 경우에는 표시를 남기지 않는다 — 표준으로 버려도 나가시가 안 깨지는
 * 패라 자격이 유지되는 것이 맞다.
 */
const brokeNagashiKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "brokeNagashi", state, h);

const frameAction: ActionDef<{ tileId: TileId; target: PlayerId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no frame_up augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!offCooldown(state, req.player)) return "on cooldown";
    if (inRiichi(state, req.player)) return "cannot frame during riichi";
    if (inFirstGoAround(state)) return "cannot frame on the first go-around";
    if (req.payload.target === req.player) return "cannot frame yourself";
    if (!state.players.some((p) => p.id === req.payload.target)) {
      return "unknown target";
    }
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    /*
     * 봉인된 패는 명의를 남에게 돌려서도 버릴 수 없다.
     *
     * ⚠ 누명은 표준 discard 액션을 거치지 않고 `TILE_DISCARDED`를 직접 낸다. 그래서
     * 봉인술사(discard_lock)가 잠근 패를 **"누명 한 번"으로 털어낼 수 있었다**
     * (docs/25 방해 #3). 리치 선언 버림이 같은 이유로 봉인을 우회하던 것과 같은 구멍이다.
     * 판정은 버림 액션·리치 선언과 같은 `lockedDiscardIds`를 쓴다.
     */
    if (lockedDiscardIds(state, rules, req.player, hand).has(req.payload.tileId)) {
      return "tile is sealed";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    ...(isTerminalOrHonor(kindOf(state, req.payload.tileId))
      ? []
      : [augmentDataSet(brokeNagashiKey(state, req.player), true)]),
    // 표준 버림과 동일하되 '명의'만 지목 대상에게 — 방총 책임·턴 진행은 나에게 남는다
    {
      type: TILE_DISCARDED,
      payload: {
        player: req.player,
        tileId: req.payload.tileId,
        riichi: false,
        riichiCost: 0,
        creditTo: req.payload.target,
      },
    },
    ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
    // 전원 공개 — 누구 바닥에 무엇이 심겼는지 보여야 대응할 수 있다
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), {
      target: req.payload.target,
      kind: kindKey(kindOf(state, req.payload.tileId)),
    }),
  ],
};

export const frameUp: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 3,
  name: "누명",
  description:
    "(2국에 1회) 자기 순에 내가 버릴 패를 지목한 상대의 바닥에 놓는다 — 그 사람이 버린 것으로 기록되어 후리텐에 걸리고, 내 바닥에는 남지 않아 내 후리텐은 회피된다.",
  detail:
    "(2국에 1회) 실제로 버린 사람은 나이므로 다른 상대의 론은 평소대로 열려 있고, 그 패로 쏘이면 책임도 내가 진다. 심긴 패는 전원에게 공개된다.\n\n리치 중이거나 국의 첫 바퀴에는 쓸 수 없고, 봉인술사에게 잠긴 패는 심을 수 없다. **중장패(2~8 수패)를 심으면 그 국의 유국만관 자격을 잃는다**(요구패는 무관).",
  /*
   * 예전 목록(seat_swap·suit_unify·alchemist·take_back)은 **전부 폐기했다.**
   *
   * 근거는 "누명이 creditTo로 버림을 남의 바닥에 심어 보유자의 discardedKinds가
   * 0으로 고정되고, 그 필드를 '내 첫 순'의 근거로 쓰는 증강의 제한이 무력화된다"
   * 였다. 그런데 네 증강 모두 그 뒤 `discardCount`로 옮겨졌고(각 파일에 이유가
   * 적혀 있다 — docs/25 P5), 지금은 누명이 그 값을 건드리지 않는다. 남겨 두면
   * 이유 없이 후보 4개를 뺏을 뿐이다(2026-08-08 QA §2-9).
   *
   * 대신 **피해자 쪽**을 하나 잠근다. 편식은 "한 무늬만 12장 버리기" 퀘스트를
   * 자기 바닥에서 세는데, 누명은 남의 바닥에 실물을 심는다(flowEvents.ts:329) —
   * 심긴 패 한 장이 퀘스트를 통째로 깨고, 피해자는 자기가 버리지도 않은 패
   * 때문에 그 국 능력을 잃는다. 플레이로 피할 수 없는 종류의 파괴다.
   */
  conflicts: ["picky_eater"],
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(frameAction);
    }

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    // 중장패를 남의 바닥에 심었으면 이번 국 내 유국만관 자격을 잃는다 (brokeNagashiKey 참고)
    engine.rules.addModifier<boolean>("draw.nagashiMangan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return state.augmentData[brokeNagashiKey(state, holder)] === true ? false : cur;
      },
    });

    // 손패 × 상대 조합을 후보로 낸다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (!offCooldown(state, holder)) return [];
      if (inRiichi(state, holder)) return [];
      if (inFirstGoAround(state)) return [];
      const opts: { type: string; payload: unknown }[] = [];
      for (const id of handIdsOf(state, holder)) {
        for (const p of state.players) {
          if (p.id === holder) continue;
          opts.push({ type: ACTION, payload: { tileId: id, target: p.id } });
        }
      }
      return opts;
    });
  },
  // 봇 정책 없음 — 어떤 패를 누구에게 심어야 이득인지는 상대 대기 추정이 필요하다.
});
