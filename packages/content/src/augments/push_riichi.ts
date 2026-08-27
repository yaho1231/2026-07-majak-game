/**
 * 등 떠밀기 (push_riichi, prism) — "숨을 수 없다."
 *
 * 매 국 1회, 자기 턴에 상대 한 명에게 **낙인**을 찍는다(전원 공개). 이후 그가
 * 리치 가능한 상태(멘젠 텐파이·공탁 여유·리치 미봉쇄)에서 패를 버리는 순간, 그 버림이
 * **자동으로 강제 리치**가 된다. 다마텐으로 숨으려는 바로 그 순간 시스템이 리치봉을 던지게 만든다.
 *
 * 낙인은 **찍은 국 동안만** 살아 있고, 터지거나 국이 끝나면 사라진다. 일부러 후로해 손을
 * 열면 멘젠이 깨져 조건이 안 서므로 그 국은 넘길 수 있다 — 텐파이를 늦추거나 싸게 여는
 * 것이 회피 루트다.
 *
 * 2026-08-27 (사용자 지시, 밸런스 웨이브): **내가 떠밀어 리치를 걸게 만든 바로 그 사람을
 * 직격 론으로 잡으면 +3판.** 이 카드는 파워 티어 23점으로 카탈로그 최하위권이었다 —
 * 상대에게 리치봉 1,000점과 일발·우라도라를 쥐여 주면서 내가 얻는 것은 "다마텐을 못 쓴다"는
 * 정보뿐이라, 순수 손해로 끝나는 국이 흔했다. 판수는 이웃 카드 카운터(`counter`)의
 * "선리치자 직격 론 +3판"과 같은 값으로 맞췄다 — 조건의 무게가 같다(내가 지목한 한 사람에게서,
 * 론으로, 그 국에). 원수 한정 +2판인 복수자(`avenger`)보다 한 판 높은 것은 이쪽이
 * **미리 지목한 한 사람**으로 좁혀져 있고 상대에게 리치라는 이득을 먼저 건네기 때문이다.
 *
 * ⚠ 예전에는 낙인이 **국을 넘어** 살아남았다. 그런데 "매 국 1회" 표식(usedKey)은 낙인을
 * **찍은 국**에 찍히므로, E1에 찍은 낙인이 E2에 터지면 E2에는 표식이 없어 **같은 국에
 * 낙인을 한 번 더** 찍을 수 있었다(2026-08-12 사용자 보고: "국이 지나갔는데 남아 있고
 * 증강이 재사용된다"). 낙인 자체를 국 단위로 내려 "매 국 1회 = 그 국 동안"으로 맞췄다 —
 * 표시 채널도 국 스코프(roundViewKey)라 국 경계에서 함께 내려간다.
 *
 * 구현: 순수 콘텐츠. 지목은 국 단위 augmentData. `TILE_DISCARDED` **Interceptor**가
 * 낙인 대상의 버림을 가로채, 그 버림이 리치 성립 조건(멘젠 + 버린 뒤 텐파이 + 공탁 여유 +
 * 벽 잔여 + riichi.blocked 아님)을 만족하고 스스로 리치를 걸지 않았다면 `riichi:true`+riichiCost를
 * 실어 강제 리치로 만든다. 별도 `TILE_DISCARDED` **Reaction**이 낙인 대상의 리치 성립을 감지해
 * 낙인을 소멸시킨다(자발적 리치도 낙인을 소진한다 — 리치 가능 상태에 도달했으므로).
 * §2 지목형 연출 규칙 적용.
 */

import {
  ROUND_SETTLED,
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isTenpai,
  kindOf,
  meldCountOf,
  playerAtSeat,
  playerOf,
  scoringOptionsOf,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileDiscardedPayload,
  TileKind,
} from "@majak/core";
import {
  addWinHanBonus,
  flagOf,
  publishUsesLeft,
  roundViewKey,
  stringOf,
} from "../util.js";
import { clearViewOnDisarm } from "./disarmBanner.js";
import { roundScopedKey } from "./roundScope.js";
import { plan } from "./botPlan.js";

const ID = "push_riichi";
const ACTION = "push_brand";

/** 국당 1회 — 국이 바뀌면 다시 찍을 수 있다 (단, 살아 있는 낙인이 있으면 못 찍는다) */
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  !flagOf(state, usedKey(state, h));
/**
 * 현재 낙인 대상 (**국 단위** — 국이 바뀌면 키가 달라져 저절로 풀린다, 발동 시 소멸).
 * `usedKey`와 같은 국을 가리켜야 "매 국 1회"가 어긋나지 않는다 — 위 ⚠ 참고.
 */
const brandKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "brand", state, h);
/**
 * **내가 실제로 떠밀어 리치를 걸게 만든 사람** (국 단위, 없으면 null).
 *
 * `brandKey`는 리치가 성립하는 순간 비워지므로(낙인 소진) 화료 시점에는 아무 흔적이
 * 남지 않는다 — 직격 보너스를 판정하려면 별도 기록이 필요하다. **강제 리치일 때만**
 * 적는다: 낙인 대상이 스스로 건 리치는 이 카드가 한 일이 아니다.
 */
const forcedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "forced", state, h);
/** 떠밀린 그 사람을 직격 론으로 잡았을 때 얻는 판수 (카운터의 선리치자 직격과 같은 값) */
const DIRECT_HIT_HAN = 3;
/** 낙인 표시 채널 (전원 공개, 국 스코프 — 국 경계에서 엔진이 지운다) */
const brandViewKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);
/** 강제 리치 발동 연출 채널 (전원 공개, 국 스코프) */
const firedViewKey = (h: PlayerId): string => roundViewKey("*", `${ID}:fired:${h}`);

/** 대상이 멘젠인가 (안깡·묵계는 손을 열지 않는다) */
function isMenzen(state: GameState, id: PlayerId): boolean {
  return (state.round.byPlayer[id]?.melds ?? []).every(
    (m) => m.kind === "kan_closed" || m.silent === true,
  );
}

/** wall 잔여 장수 */
const wallLen = (state: GameState): number =>
  state.zones["wall"]?.tileIds.length ?? 0;

/**
 * 대상이 이 패(discardTileId)를 버리면 강제 리치가 성립하는가 —
 * 멘젠 + 버린 뒤 텐파이 + 공탁 여유 + 벽 잔여 + riichi 미봉쇄.
 */
function riichiEligibleOnDiscard(
  state: GameState,
  rules: import("@majak/core").RuleRegistry,
  target: PlayerId,
  discardTileId: number,
): boolean {
  if (state.round.byPlayer[target]?.riichi != null) return false;
  if (!isMenzen(state, target)) return false;
  if (rules.resolve<boolean>("riichi.blocked", { playerId: target, state })) return false;
  const cost = rules.resolve<number>("riichi.cost", { playerId: target, state });
  if (playerOf(state, target).score < cost) return false;
  if (wallLen(state) < rules.resolve<number>("riichi.minWallTiles")) return false;
  // 버린 뒤 손패가 텐파이인가
  const after: TileKind[] = handIdsOf(state, target)
    .filter((t) => t !== discardTileId)
    .map((t) => kindOf(state, t));
  return isTenpai(after, meldCountOf(state, target), undefined, scoringOptionsOf(state, rules, target));
}

const brandAction: ActionDef<{ target: PlayerId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no push_riichi augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "already used this round";
    if (stringOf(state, brandKey(state, req.player)) !== null) return "a brand is already active";
    if (req.payload.target === req.player) return "cannot brand yourself";
    if (!state.players.some((p) => p.id === req.payload.target)) return "unknown target";
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(brandKey(state, req.player), req.payload.target),
    augmentDataSet(usedKey(state, req.player), true),
    // 전원 공개 지목 관계
    augmentDataSet(brandViewKey(req.player), req.payload.target),
  ],
};

export const pushRiichi: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 2,
  name: "등 떠밀기",
  description:
    "(매 국 1회) 자기 순에 상대 한 명에게 낙인을 찍는다(전원 공개). 그가 리치 가능한 상태에서 패를 버리는 순간 그 버림이 강제 리치가 된다. 그렇게 떠민 사람을 **직격 론**으로 잡으면 **+3판**.",
  detail:
    "내가 떠밀어 리치를 걸게 만든 바로 그 사람의 버림패로 화료하면 +3판을 얻는다(역만 제외). 낙인만 찍고 리치가 터지지 않았거나, 그가 스스로 건 리치이거나, 다른 사람에게 론하거나 쯔모로 나면 붙지 않는다.\n\n낙인자가 멘젠 텐파이로 패를 버리려 하면 리치봉이 강제로 던져진다 — 다마텐으로 숨을 수 없다. 리치봉을 낼 점수와 패산이 남아 있어야 성립한다. 후로한 손이나 리치가 봉인된 손에는 조건이 서지 않는다.\n\n낙인은 찍은 국 동안만 살아 있고, **강제든 스스로 건 것이든** 리치가 성립하거나 국이 끝나면 소멸한다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // "이번 국 1회"는 이미 썼는지가 화면 어디에도 없어서, 액티브 버튼이 사라지고
    // 나서야 소진을 알 수 있었다(2026-08-15 사용자 지적: "횟수류 전부 안 나온다").
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(brandAction);
    }

    /*
     * 떠밀린 그 사람에게서 **직격 론**으로 화료하면 +3판.
     *
     * 대상은 `forcedKey`가 단일 진실이다 — 낙인만 찍고 터지지 않았거나, 대상이 스스로
     * 리치를 걸어 낙인이 소진된 국에는 값이 없어 0판이다. 다른 사람에게 론했거나
     * 쯔모로 났으면 붙지 않는다. (`addWinHanBonus`는 역만에서 자동으로 무시된다.)
     */
    addWinHanBonus(ctx, (state, info) => {
      if (info.winType !== "ron") return 0;
      const forced = stringOf(state, forcedKey(state, holder));
      if (forced === null || forced === "") return 0;
      return info.from === forced ? DIRECT_HIT_HAN : 0;
    });

    // 낙인 대상의 버림을 가로채, 리치 성립 조건이면 강제 리치로 만든다.
    ctx.interceptor(TILE_DISCARDED, (event, ic) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.riichi) return event; // 이미 리치면 그대로
      /*
       * **명의가 남에게 가는 버림(누명)에는 강제 리치를 얹지 않는다.**
       *
       * 리치 선언패는 선언자의 바닥에 옆으로 눕혀 놓이는 것이 선언 시점의 단일 진실인데,
       * 누명(`creditTo`)의 패는 지목당한 사람 바닥으로 간다. 여기에 riichi를 얹으면
       * `riichi.discardTileId`는 남의 바닥에 심긴 패, `discardIndex`는 0(빈 내 바닥)이 되어
       * **어느 바닥에도 리치 표식이 그려지지 않는 리치**가 성립한다(리치봉 1000점만 나간다).
       * 같은 값을 보는 `riichi_upgrade`의 더블리치 판정도 자기 바닥 인덱스를 본다
       * (QA disrupt-b 확정 6).
       *
       * 낙인은 **비우지 않는다** — 이 버림으로 밀린 것이 없으므로, 낙인 대상이 다음에
       * 평범하게 버리는 순간 예정대로 강제 리치가 걸린다(누명은 2국에 1회라 한 번
       * 미루는 것이 전부다).
       */
      if (p.creditTo !== undefined && p.creditTo !== p.player) return event;
      const target = stringOf(ic.state, brandKey(ic.state, holder));
      if (target === null || p.player !== target) return event;
      if (!riichiEligibleOnDiscard(ic.state, ic.rules, target, p.tileId)) return event;
      const cost = ic.rules.resolve<number>("riichi.cost", { playerId: target, state: ic.state });
      // `riichiForced`는 "이건 내가 밀어서 걸린 리치"라는 표식이다 — 아래 reaction이
      // 이걸 보고 **강제일 때만** 발동 연출 채널을 쏜다(자발적 리치와 구별).
      return {
        type: event.type,
        payload: { ...p, riichi: true, riichiCost: cost, riichiForced: holder },
      };
    });

    // 낙인 대상이 리치를 성립시키면(강제든 자발이든) 낙인을 소멸시킨다.
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi) return;
      const target = stringOf(rc.state, brandKey(rc.state, holder));
      if (target === null || p.player !== target) return;
      rc.emit(augmentDataSet(brandKey(rc.state, holder), ""));
      /*
       * 낙인 표시도 **그 자리에서** 함께 내린다.
       *
       * ⚠ 예전에는 상태(brandKey)만 비우고 공개 채널은 그대로 뒀다. 표시 키가
       * 게임 단위(viewKey)였던 탓에, 이미 사라진 낙인이 매치가 끝날 때까지 이름표에
       * 떠 있었다(docs/25 리치 #8, P4). 상대는 없는 낙인을 피해 계속 다마텐을
       * 포기하게 된다. 지금은 국 스코프라 국 경계에서도 저절로 내려가지만, 국 도중에
       * 터진 낙인은 여기서 비워야 한다. 클라이언트는 빈 문자열을 관계 없음으로 읽는다.
       */
      rc.emit(augmentDataSet(brandViewKey(holder), ""));
      /*
       * 발동 연출 채널 — **내가 밀어서 걸린 리치일 때만** 쏜다.
       *
       * 낙인은 자발적 리치로도 소진되므로(위 참고), 여기까지는 두 경우 모두 온다.
       * 예전에는 그 구별 없이 채널을 쏴서, 낙인 대상이 스스로 건 리치에도 "등 떠밀기"
       * 관계선이 그어졌다. 클라이언트는 이 채널을 보고 리치 연출 **앞에** 발동 컷인을
       * 끼워 넣으므로(2026-08-17 사용자 요청), 강제가 아닐 때 쏘면 없는 사건을 그린다.
       */
      if (p.riichiForced !== holder) return;
      rc.emit(augmentDataSet(firedViewKey(holder), target));
      // 직격 보너스의 근거 — 낙인이 비워진 뒤에도 "내가 떠민 사람"이 남아야 한다.
      rc.emit(augmentDataSet(forcedKey(rc.state, holder), target));
    });

    /*
     * 낙인 표시를 **정산에서** 내린다 (2026-08-20 QA disrupt 확정 2).
     *
     * 표시 채널은 국 스코프(roundViewKey)라 **다음 국 setupRound**에서 지워진다. 그런데
     * 국이 끝나고 다음 국이 시작되기까지 정산 화면과 증강 드래프트가 통째로 끼어 있어서,
     * 이미 효과가 끝난 낙인이 그 내내 이름표 관계선(RELATION_HEADS)과 당사자 뱃지로
     * 서 있었다 — 상대는 죽은 낙인을 보고 다음 국 드래프트를 고르게 된다.
     * 완전히 같은 모양을 blind_ron(2026-08-12 사용자 신고)·rank_gate가 이미 이렇게 고쳤다.
     * 값을 비우면 PlayerView가 채널 자체를 내려보내지 않는다.
     */
    // 발동 연출 채널(`{ID}:fired:{holder}`)도 같은 이유로 함께 내린다 — 이쪽도
    // RELATION_HEADS 에 걸려 관계선을 긋는다(App.tsx의 "중간 마디가 낀 키" 주석).
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      for (const key of [brandViewKey(holder), firedViewKey(holder)]) {
        if (rc.state.augmentData[key] === undefined) continue;
        rc.emit(augmentDataSet(key, ""));
      }
    });

    /*
     * 무장해제로 잠기면 낙인 관계선도 함께 내린다 (2026-08-23 QA synergy3 disrupt 확정 4).
     * 효과는 게이트가 막는데 관계선만 남아 있으면 화면이 정확히 반대를 말한다 —
     * 눈먼 총알·초읽기와 같은 규약이다(disarmBanner.ts).
     */
    clearViewOnDisarm(ctx, () => [brandViewKey(holder)]);

    // 사용 횟수가 남았고 활성 낙인이 없으면 보유자 턴에 각 상대를 지목 후보로 낸다
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (stringOf(state, brandKey(state, holder)) !== null) return [];
      return state.players
        .filter((p) => p.id !== holder)
        .map((p) => ({ type: ACTION, payload: { target: p.id } }));
    });
  },
  // 봇: 점수가 가장 높은 상대(선두)에게 낙인을 찍는다 — 다마텐 봉쇄로 압박(자해 없음).
  // 누구를 찍을지의 최적은 미묘하나, 선두 견제는 언제나 방어적으로 유효하다.
  bot: plan({
    // 상대에게 강제 리치를 건다 — 내 손이 아니라 **상대**를 건드리는 물건이다
    intent: "disrupt",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder }) => {
      const mine = options.filter((o) => o.type === ACTION);
      if (mine.length === 0) return null;
      const scoreOf = new Map<string, number>();
      for (const p of view.players) scoreOf.set(p.id, p.score);
      let best = mine[0] ?? null;
      let bestScore = -Infinity;
      for (const o of mine) {
        const target = (o.payload as { target?: string }).target;
        if (target === undefined || target === holder) continue;
        const s = scoreOf.get(target) ?? 0;
        if (s > bestScore) {
          bestScore = s;
          best = o;
        }
      }
      return best;
    },
  }),
});
