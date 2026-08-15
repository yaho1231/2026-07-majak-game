/**
 * 오픈 리치 (open_riichi_reveal, gold).
 * 멘젠·텐파이 상태에서 액티브 버튼으로 오픈 리치를 선언한다. 표준 리치와 똑같이
 * 공탁 1000점을 걸고 손이 잠기며, 자신의 오름패(대기)가 전원에게 공개된다:
 *  - 공개된 오름패를 **리치도 걸지 않은 사람**이 버려 론당하면 그 화료는 역만.
 *  - 그 외 화료(쯔모 · 리치자에게서 론)는 **그 리치를 3판으로 취급**한다
 *    (표준 리치 1판과의 차이 +2판을 얹는다).
 *
 * (표준 코어 증강 open_riichi="개문선언"(후로 손 리치 허용)과는 다른 능력이라
 *  id를 open_riichi_reveal로 분리한다.)
 *
 * 구현: raise_declaration 패턴의 커스텀 리치 액션 — 표준 리치 검증 후 TILE_DISCARDED
 * (riichi:true, 표준 공탁)를 낸다. 공탁 차감·회수·리치 상태는 표준 리듀서가 처리한다.
 * 오름패(대기)는 view:*:open_riichi_reveal:{holder}로 실어 클라이언트가 금색 대기
 * 배지로 강조한다. 직격 역만은 커스텀 역 open_riichi_strike(isYakuman) —
 * check가 state를 못 보므로 "이번 국에 선언했는가"는 win.blockedYaku Modifier로
 * 게이팅하고, 쏜 사람의 리치 여부는 코어가 채워 주는 WinContext.fromRiichi로 본다.
 * "리치 3판 취급"의 차액(+2판)은 addWinHanBonus로 얹는다 — 정산창에도 "+2판"으로 적힌다.
 */

import {
  TILE_DISCARDED,
  WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindKey,
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
  RuleRegistry,
  TileId,
  VisibilityRule,
} from "@majak/core";
import {
  addWinHanBonus,
  flagOf,
  roundKey,
  roundViewKey,
  addYakuHolder,
  yakuHolders,
} from "../util.js";
import { pickIsolatedDiscard } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "open_riichi_reveal";
const ACTION = "open_riichi";
/** 공개된 오름패를 비(非)리치자가 버려 직격당했을 때의 역만 역 id */
const STRIKE_YAKU = "open_riichi_strike";
/** 리치를 3판으로 취급한 차액 (표준 리치 1판은 이미 손패에 들어 있다) */
const RIICHI_UPGRADE_HAN = 2;
/** 이번 국에 오픈 리치를 선언했는가 (roundKey 스코프 — 국이 바뀌면 자동 만료) */
const declaredKey = (state: GameState, h: PlayerId): string =>
  `${ID}:declared:${roundKey(state)}:${h}`;

const wallLen = (state: GameState): number =>
  state.zones[WALL]?.tileIds.length ?? 0;

/** tileId를 버린 뒤 손의 대기패 kind 집합 (kindKey 문자열) */
function waitsAfterDiscard(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
  discardId: TileId,
): string[] {
  const kinds = handIdsOf(state, player)
    .filter((id) => id !== discardId)
    .map((id) => kindOf(state, id));
  return winningKinds(
    kinds,
    meldCountOf(state, player),
    undefined,
    scoringOptionsOf(state, rules, player),
  ).map(kindKey);
}

const openRiichiAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no open_riichi_reveal augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, declaredKey(state, req.player))) return "already declared";
    const rs = state.round.byPlayer[req.player];
    if (rs?.riichi != null) return "already riichi";
    if (rules.resolve<boolean>("riichi.blocked", { playerId: req.player, state })) {
      return "riichi is sealed this round";
    }
    if (
      rules.resolve<boolean>("riichi.requiresClosed", { playerId: req.player }) &&
      // 멘젠 판정은 **드러난** 후로만 센다 — meldCountOf를 쓰면 안깡·묵계 펑이 있는
      // 손에서 표준 리치는 되는데 개문 선언만 조용히 사라진다(2026-07-29 감사).
      openMeldCountOf(state, req.player) > 0
    ) {
      return "riichi requires a closed hand";
    }
    const cost = rules.resolve<number>("riichi.cost", {
      playerId: req.player,
      state,
    });
    if (playerOf(state, req.player).score < cost) return "not enough points";
    if (wallLen(state) < rules.resolve<number>("riichi.minWallTiles")) {
      return "not enough wall tiles";
    }
    const handIds = handIdsOf(state, req.player);
    if (!handIds.includes(req.payload.tileId)) return "tile not in hand";
    /*
     * 텐파이 요구는 **규칙에서 읽는다**(`riichi.requiresTenpai`) — 표준 리치 액션과 같다.
     * 하드코딩하면 공성계(siege_riichi)가 그 규칙을 false로 내려도 커스텀 리치 3종에는
     * 전혀 닿지 않아, "노텐 리치로 블러프한다"는 능력이 **이 리치들 앞에서만 조용히
     * 사라진다**(docs/25 리치 #11).
     */
    if (
      rules.resolve<boolean>("riichi.requiresTenpai", { playerId: req.player, state }) &&
      waitsAfterDiscard(state, rules, req.player, req.payload.tileId).length === 0
    ) {
      return "not tenpai after discard";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const waits = waitsAfterDiscard(state, rules, req.player, req.payload.tileId);
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
      augmentDataSet(declaredKey(state, req.player), true),
      // 오름패(대기)를 전원에게 공개 — 클라이언트가 상대 손패 위에 크게 표시한다
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), waits),
    ];
  },
};

export const openRiichiReveal: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "riichi",
  complexity: 3,
  name: "오픈 리치",
  description:
    "(매 국 1회 · 리치는 국당 한 번) 멘젠·텐파이 상태에서 공탁 1000점을 걸고 오픈 리치를 선언한다. 오름패가 전원에게 공개되며, 리치를 걸지 않은 사람이 그 오름패로 방총하면 그 화료는 역만이 된다.",
  detail:
    "(매 국 1회 · 리치는 국당 한 번) 멘젠 텐파이 상태에서 공탁 1000점을 걸고 오픈 리치를 선언한다. 표준 리치와 똑같이 손이 잠기고, 여기에 더해 자신의 오름패가 전원에게 공개된다. 리치를 걸지 않은 사람이 그 오름패를 버려 론당하면 그 화료는 역만이 되고, 그 외의 화료(쯔모 · 리치자에게서 론)에서는 그 리치를 3판으로 취급한다. 손패 전체가 드러나지는 않고 오름패만 공개된다.",
  // A급 파괴(docs/25 §conflicts): 직격 역만의 게이트가 "이번 국에 선언했는가"뿐이라,
  // 리치를 취소하고 완전히 다른 대기로 화료해도 역만이 성립한다. 공개된 대기는
  // 갱신되지 않아 상대는 이미 무효인 정보를 보고 판단한다 → 회피 불가능한 역만.
  /*
   * 공개한 대기를 바꿔 버리는 증강과는 함께 갖지 않는다.
   *
   * 이 증강은 선언 시점의 대기를 전원에게 공개하고, 비리치 상대가 그 손에 쏘면
   * 역만으로 값한다. 그런데 공개 목록은 한 번 게시된 뒤 갱신되지 않고, 직격 역만
   * 게이트도 "이번 국에 선언했는가"만 볼 뿐 **론 패가 공개 대기에 있는지 검사하지
   * 않는다**. 그래서 리치 중에 손패를 바꿀 수 있는 증강이 함께 있으면, 공개 목록을
   * 믿고 안전패를 버린 상대가 대응 불가능한 역만을 맞는다.
   *
   * `last_stand`는 리치 자체를 무르는 쪽이고, `palm_flip`은 리치를 유지한 채 손패를
   * 갈아 대기를 바꾼다(2026-08-15 개편 — 공개 목록과 실제 대기가 어긋나는 것은 같다).
   * `tile_dyeing`은 스스로
   * "리치 중에도 쓸 수 있다"고 적어 둔 유일한 손패 변경 증강이다(2026-08-08 QA §2-9).
   */
  conflicts: ["last_stand", "palm_flip", "tile_dyeing"],
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(openRiichiAction);
    }

    // 48차 무페널티: 손패 전체 공개를 삭제했다. 상대가 대기를 완벽히 회피할 수 있는
    // 구조는 "선언해 놓고 손해를 계산하게" 만든다. 대기(오름패) 공개는 유지한다 —
    // 전원 공개는 Rule #4의 전제이고, 좁은 대기여도 회피 난도가 남기 때문.

    // ── 정석 오픈리치 하우스룰: 공개된 오름패를 '리치도 안 건' 사람이 버리면 역만 ──
    // 리치는 손이 잠기므로 선언 후 대기가 바뀌지 않는다 → "론으로 잡았다"는 곧
    // "공개된 오름패를 버렸다"와 같다. 커스텀 역 check는 state를 못 보므로
    // "이번 국에 선언했는가"는 win.blockedYaku Modifier로 게이팅한다
    // (미선언이면 이 역을 금지 목록에 넣어 아예 성립하지 않게 한다).
    const yaku = ctx.yaku;
    if (yaku !== undefined && yaku.get(STRIKE_YAKU) === undefined) {
      yaku.register({
        // 무장해제되면 이 역도 함께 잠긴다 (evaluate가 disarmedSources와 대조)
        source: ctx.instanceId,
        id: STRIKE_YAKU,
        name: "오픈 리치 직격",
        closedHan: 13,
        openHan: 13,
        isYakuman: true,
        check: (_variant, wctx) =>
          wctx.winnerId !== undefined &&
          yakuHolders(yaku, ID).has(wctx.winnerId) &&
          wctx.winType === "ron" &&
          wctx.fromRiichi !== true,
      });
    }
    if (yaku !== undefined) addYakuHolder(ctx, yaku, ID);
    engine.rules.addModifier<string[]>("win.blockedYaku", {
      source: ctx.instanceId,
      layer: ctx.layer,
      // 자기 보유자의 판정에만 관여한다 (보유자가 여럿이어도 서로 덮어쓰지 않는다).
      // 비보유자는 yaku.check의 yakuHolders 검사에서 이미 걸러진다.
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        const declared =
          state !== undefined && flagOf(state, declaredKey(state, holder));
        if (declared) return cur.filter((id) => id !== STRIKE_YAKU);
        return cur.includes(STRIKE_YAKU) ? cur : [...cur, STRIKE_YAKU];
      },
    });

    // 역만이 터지지 않는 화료(쯔모·리치자에게서 론)는 리치를 3판으로 취급한다(차액 +2판).
    // (리치 자체 1판은 winPointsWithExtraHan의 기준 info.han에 이미 포함되어 별개다.)
    addWinHanBonus(ctx, (state, info) => {
      if (!flagOf(state, declaredKey(state, holder))) return 0;
      const from = info.from;
      const fromRiichi =
        from != null && state.round.byPlayer[from]?.riichi != null;
      // 비리치 상대 론 = 직격 역만이 이미 적용됐다 → 추가 판을 얹지 않는다
      if (info.winType === "ron" && !fromRiichi) return 0;
      /*
       * 차액이므로 **이미 붙어 있는 리치 판수**를 빼고 얹는다. 개문선언(open_riichi)을
       * 함께 들고 후로 손으로 선언하면 그쪽이 리치를 2판으로 만들어 두므로, 여기서
       * 2를 더 얹으면 "3판 취급"이 4판이 된다.
       */
      const alreadyOpenRiichi =
        openMeldCountOf(state, holder) > 0 &&
        playerOf(state, holder).augments.includes("open_riichi");
      return alreadyOpenRiichi ? RIICHI_UPGRADE_HAN - 1 : RIICHI_UPGRADE_HAN;
    });

    // 아직 리치 전이고 이번 국에 선언하지 않았을 때만, 버려도 텐파이가 유지되는
    // 손패만 선언 후보로 노출한다. 클라이언트는 이 후보 패만 무장 대상(클릭 가능)으로
    // 강조하므로, 실제 리치를 걸 수 있는 패를 직접 눌러 선언한다.
    // (멘젠·공탁·패산 등 나머지 합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (state.round.byPlayer[holder]?.riichi != null) return [];
      if (flagOf(state, declaredKey(state, holder))) return [];
      return handIdsOf(state, holder)
        .filter((tileId) => waitsAfterDiscard(state, engine.rules, holder, tileId).length > 0)
        .map((tileId) => ({ type: ACTION, payload: { tileId } }));
    });
  },
  // 손을 공개하는 대신 직격(론) 보너스를 노리는 오픈 리치 — 텐파이일 때, 대기를 가장
  // 덜 해치는(가장 고립된) 패로 선언한다. 후보 자체가 '버려도 대기가 남는' 패만 나온다.
  bot: plan({
    intent: "score",
    fleeting: true,
    pick: ({ options, view, holder, tenpai }) =>
      tenpai ? pickIsolatedDiscard(view, holder, options, ACTION) : null,
  }),
});
