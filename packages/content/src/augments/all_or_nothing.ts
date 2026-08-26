/**
 * 모 아니면 도 (all_or_nothing, prism).
 * **매 국 1회**, 리치 선언 시 '올인'을 함께 선언해 현재 점수의 절반(1000점 단위 내림)을
 * 판돈으로 건다. 그 리치로 화료하면 판돈만큼을 뱅크에서 더 받고, **타가가 론·쯔모로
 * 화료하면 판돈의 절반을 뱅크에 잃는다**(절반만 돌려받는 셈). 유국은 잃지 않는다.
 *
 * 2026-08-15 사용자 지시로 두 곳이 바뀌었다. ① 횟수가 게임당(동풍전1·반장전2)에서
 * **국당 1회**로 — 매 국 걸 수 있는 대신, ② "빗나가도 잃는 것이 없다"는 무손실이
 * 사라졌다. 타가 화료에만 벌금이 붙는다 — 유국은 아무도 이기지 않은 국이라 그대로다.
 *
 * 구현: 표준 리치와 같은 검증 + 국 단위 카운터·금액을 기록하는 커스텀 액션(선언 시점에
 * 점수를 깎지는 않는다 — 순 결과가 같고 도중 점수가 왜곡되지 않는다). 정산 인터셉터
 * (BankTopUp)에서 내 화료면 판돈만큼 가산, 타가 화료면 절반만큼 차감한다.
 */

import {
  SETTLE_STAGE,
  TILE_DISCARDED,
  WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindOf,
  meldCountOf,
  openMeldCountOf,
  playerAtSeat,
  playerOf,
  scoringOptionsOf,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import {
  counterOf,
  publishUsesLeft,
  roundViewKey,
  settleInterceptor,
  withAugPoint,
} from "../util.js";
import { pickIsolatedDiscard } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "all_or_nothing";
const ACTION = "all_in_riichi";
/** 국당 허용 횟수 */
const USES_PER_ROUND = 1;
/** 이번 국에 이미 걸었는가 — **국 스코프** 카운터라 국이 바뀌면 다시 1회다 */
const usesKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "uses", state, h);
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(state, h)) < USES_PER_ROUND;
/**
 * 이번 국에 건 올인 금액 (국 스코프 — 국이 바뀌면 자동 만료).
 *
 * ⚠ 예전에는 게임 스코프 키에 `"<roundKey>|<금액>"`을 넣고 정산 **리액션**에서 현재
 * roundKey와 비교했다. 그런데 ROUND_SETTLED 리듀서는 이미 **다음 국의** honba·roundNumber를
 * 적용한 뒤라 비교가 항상 어긋났고, 그래서 **판돈이 한 번도 지급되지 않았다**(2026-07-29 감사).
 * 지금은 국 스코프 키 + 정산 인터셉터(정산 전 state)라 두 문제가 함께 사라진다.
 */
const activeKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "active", state, h);

const wallLen = (state: GameState): number =>
  state.zones[WALL]?.tileIds.length ?? 0;

/** 올인 금액 = 현재 점수 절반(1000 단위 내림) */
function allInAmount(state: GameState, h: PlayerId): number {
  const score = playerOf(state, h).score;
  return Math.max(0, Math.floor(score / 2 / 1000) * 1000);
}

const allInRiichiAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no all_or_nothing augment";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    const rs = state.round.byPlayer[req.player];
    if (rs?.riichi != null) return "already riichi";
    if (rules.resolve<boolean>("riichi.blocked", { playerId: req.player, state })) {
      return "riichi is sealed this round";
    }
    if (
      rules.resolve<boolean>("riichi.requiresClosed", { playerId: req.player }) &&
      // 멘젠 판정은 **드러난** 후로만 센다 — meldCountOf를 쓰면 안깡·묵계 펑이 있는
      // 손에서 표준 riichi는 되는데 all_in_riichi만 조용히 사라졌다(2026-07-29 감사).
      openMeldCountOf(state, req.player) > 0
    ) {
      return "riichi requires a closed hand";
    }
    const allIn = allInAmount(state, req.player);
    if (allIn <= 0) return "not enough points to go all-in";
    const cost = rules.resolve<number>("riichi.cost", { playerId: req.player, state });
    if (playerOf(state, req.player).score < cost) return "not enough points";
    if (wallLen(state) < rules.resolve<number>("riichi.minWallTiles")) {
      return "not enough wall tiles";
    }
    const handIds = handIdsOf(state, req.player);
    if (!handIds.includes(req.payload.tileId)) return "tile not in hand";
    const after = handIds
      .filter((t) => t !== req.payload.tileId)
      .map((t) => kindOf(state, t));
    const opts = scoringOptionsOf(state, rules, req.player);
    /*
     * 텐파이 요구는 **규칙에서 읽는다**(`riichi.requiresTenpai`) — 표준 리치 액션과 같다.
     * 하드코딩하면 공성계(siege_riichi)가 그 규칙을 false로 내려도 커스텀 리치 3종에는
     * 전혀 닿지 않아, "노텐 리치로 블러프한다"는 능력이 **이 리치들 앞에서만 조용히
     * 사라진다**(docs/25 리치 #11).
     */
    if (
      rules.resolve<boolean>("riichi.requiresTenpai", { playerId: req.player, state }) &&
      winningKinds(after, meldCountOf(state, req.player), undefined, opts).length === 0
    ) {
      return "not tenpai after discard";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const allIn = allInAmount(state, req.player);
    return [
      {
        type: TILE_DISCARDED,
        payload: {
          player: req.player,
          tileId: req.payload.tileId,
          riichi: true,
          riichiCost: rules.resolve<number>("riichi.cost", {
            playerId: req.player,
            state,
          }),
        },
      },
      // 선언 시점에는 차감하지 않는다 — 기록만 남기고(국당 1회 소진), 정산에서
      // 내 화료면 판돈만큼 받고 타가 화료면 절반을 잃는다(순 결과가 같다).
      augmentDataSet(
        usesKey(state, req.player),
        counterOf(state, usesKey(state, req.player)) + 1,
      ),
      augmentDataSet(activeKey(state, req.player), allIn),
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), allIn),
    ];
  },
};

export const allOrNothing: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  complexity: 2,
  name: "모 아니면 도",
  description:
    "(매 국 1회) 리치를 선언할 때 '올인'을 함께 걸어 현재 점수의 절반을 판돈으로 내건다(전원 공개).",
  detail:
    "판돈은 1,000점 단위 내림이다. 그 리치로 화료하면 판돈과 같은 금액을 뱅크에서 추가로 받고, 상대가 론이나 쯔모로 화료하면 판돈의 **절반**이 뱅크로 넘어간다.\n\n유국으로 끝난 국은 아무도 이기지 않았으므로 잃지 않으며, 그 리치가 풀리면 판돈도 함께 사라진다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(allInRiichiAction);
    }

    // 판돈 지급은 뱅크가 발행하는 가산이므로 BankTopUp 단계다 — 배수(Multiply) 뒤에 와야
    // 일확천금 등에 판돈까지 곱해지지 않는다. deltas에 얹으므로 결과 화면 증감에도 그대로 뜬다.
    settleInterceptor(ctx, SETTLE_STAGE.BankTopUp, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      // 유국은 아무도 이기지 않은 국이다 — 받지도 잃지도 않는다.
      if (p.outcome !== "win") return event;
      const allIn = counterOf(ic.state, activeKey(ic.state, holder));
      if (allIn <= 0) return event;
      const iWon = (p.winInfos ?? []).some((w) => w.winner === holder);
      /*
       * 타가 화료 — 판돈의 절반이 뱅크로 넘어간다(절반만 돌려받는 셈).
       * 판돈은 1000점 단위라 절반은 항상 100점 단위로 떨어진다.
       * 리치가 살아 있어야 판돈이 걸려 있는 것이므로, 지급과 같은 게이트를 쓴다.
       */
      if (!iWon) {
        if (ic.state.round.byPlayer[holder]?.riichi == null) return event;
        const lost = allIn / 2;
        return {
          type: event.type,
          payload: {
            ...p,
            deltas: { ...p.deltas, [holder]: (p.deltas[holder] ?? 0) - lost },
            augPoints: withAugPoint(p, ctx, -lost),
          },
        };
      }
      /*
       * **그 리치가 아직 살아 있어야** 판돈이 나온다.
       *
       * ⚠ 예전에는 "판돈이 걸려 있고 내가 화료했는가"만 봤다. 승부수(last_stand)로
       * 리치를 풀고 완전히 다른 손으로 화료해도 판돈이
       * 전액 지급됐다(docs/25 P10) — detail이 약속하는 것은 "그 리치로 화료하면"이다.
       */
      if (ic.state.round.byPlayer[holder]?.riichi == null) return event;
      return {
        type: event.type,
        payload: {
          ...p,
          deltas: { ...p.deltas, [holder]: (p.deltas[holder] ?? 0) + allIn },
          augPoints: withAugPoint(p, ctx, allIn),
        },
      };
    });

    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      return handIdsOf(state, holder).map((tileId) => ({
        type: ACTION,
        payload: { tileId },
      }));
    });
  },
  /*
   * 리치에 올인을 얹는다. 남은 손의 대기를 가장 덜 해치는(가장 고립된) 패로 선언한다.
   *
   * 예전에는 `fleeting: true`로 적기 판단을 건너뛰었다 — 빗나가도 잃는 것이 없어
   * "텐파이면 무조건"이 옳은 답이었기 때문이다. 타가 화료에 판돈 절반을 잃게 된
   * 지금은 그 답이 틀렸다(2026-08-15). 적기 문턱을 다시 켜서, 손이 값하고 자리가
   * 맞을 때만 건다. 국당 1회라 이번 순을 넘겨도 기회는 남아 있다.
   */
  bot: plan({
    intent: "score",
    pick: ({ options, view, holder, tenpai }) =>
      tenpai ? pickIsolatedDiscard(view, holder, options, ACTION) : null,
  }),
});
