/**
 * 스텔스 리치 (stealth_riichi, prism) — 보이지 않는 리치.
 *
 * 텐파이 상태에서 발동하면 **리치를 걸었다는 사실 자체가 타가에게 보이지 않는다.**
 * 타가의 화면에는 평범한 타패로 보이고(리치봉도 놓이지 않는다), 정작 화료하는 순간
 * 리치 1판·일발·뒷도라가 전부 붙은 채로 정산이 열린다 — "사실 리치였다"가 그때 드러난다.
 *
 * 구현 지점:
 * - riichi.hidden 규칙(코어): 타인 뷰에서 riichiDeclared·doubleRiichi·riichiTileIndex를
 *   가린다. 정산(RoundOverMessage)의 WinInfo는 뷰 필터를 타지 않으므로 리치 역·뒷도라가
 *   그대로 공개된다 — 은닉은 '진행 중'에만 걸린다.
 * - stealth_riichi 액션: 표준 riichi와 같은 검증(멘젠·텐파이 유지·패산 잔량·리치 봉인)을
 *   거쳐 TILE_DISCARDED{riichi:true, riichiCost:0}을 낸다. **riichiCost 0이 곧 공탁 면제** —
 *   1000점이 빠져나가 리치봉이 놓이면 그 자리에서 들키기 때문이다.
 *   (점수 차감·공탁 적립·리치 상태 기록은 전부 표준 리듀서가 payload를 보고 처리한다.)
 * - 손이 잠기는 제약(쯔모패만 버릴 수 있고 후로 불가)은 표준 리치와 똑같이 진다 —
 *   페널티가 아니라 마작 규칙과의 정합성이다.
 * - 리치는 국당 1회이므로(이미 리치 중이면 발동 불가) 별도 횟수 제한을 두지 않는다.
 */

import {
  TILE_DISCARDED,
  defineAugment,
  handIdsOf,
  kindOf,
  meldInfosOf,
  playerAtSeat,
  scoringOptionsOf,
  winningKinds,
  WALL,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
} from "@majak/core";

const ID = "stealth_riichi";
const ACTION = "stealth_riichi";

/** 노출 후로 수 (안깡은 멘젠을 깨지 않는다 — 코어 openMeldCountOf와 같은 규칙) */
function openMelds(state: GameState, player: PlayerId): number {
  return meldInfosOf(state, player).filter((m) => m.kind !== "kan_closed").length;
}

/** tileId를 버려도 텐파이가 유지되는가 */
function tenpaiAfterDiscard(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
  discardId: TileId,
): boolean {
  const kinds = handIdsOf(state, player)
    .filter((id) => id !== discardId)
    .map((id) => kindOf(state, id));
  const melds = state.round.byPlayer[player]?.melds.length ?? 0;
  return (
    winningKinds(kinds, melds, undefined, scoringOptionsOf(state, rules, player))
      .length > 0
  );
}

const stealthRiichiAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no stealth_riichi augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi != null) return "already riichi";
    if (rules.resolve<boolean>("riichi.blocked", { playerId: req.player, state })) {
      return "riichi is sealed this round";
    }
    if (
      rules.resolve<boolean>("riichi.requiresClosed", { playerId: req.player }) &&
      openMelds(state, req.player) > 0
    ) {
      return "riichi requires a closed hand";
    }
    // 공탁이 없으므로 표준 리치의 '점수 1000점 이상' 조건은 보지 않는다
    if (
      (state.zones[WALL]?.tileIds.length ?? 0) <
      rules.resolve<number>("riichi.minWallTiles")
    ) {
      return "not enough wall tiles";
    }
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    if (!tenpaiAfterDiscard(state, rules, req.player, req.payload.tileId)) {
      return "not tenpai after discard";
    }
    return null;
  },
  toEvents: (req) => [
    {
      type: TILE_DISCARDED,
      payload: {
        player: req.player,
        tileId: req.payload.tileId,
        riichi: true,
        // 공탁 면제 — 리치봉이 놓이지 않아야 은닉이 완성된다
        riichiCost: 0,
      },
    },
  ],
};

export const stealthRiichi: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  name: "스텔스 리치",
  // 리치 봉인은 "내가 그 국의 첫 리치를 걸면" 발동해 **전원 공개 채널**로 봉인을 알린다.
  // 스텔스 리치도 TILE_DISCARDED{riichi:true}를 내므로 그 공개가 그대로 터져,
  // "아무도 내가 리치인 줄 모른다"는 이 증강의 존재 이유가 자기 손 안에서 무너진다
  // (2026-07-27 확인: view:*:riichi_seal:<holder> = "봉인"이 뜬다). 함께 못 갖게 잠근다.
  conflicts: ["riichi_seal"],
  description:
    "(매 국 1회 — 리치는 국당 한 번) 텐파이 상태에서 보이지 않는 리치를 건다. 타가에게는 평범한 타패로 보이지만 화료 시에는 리치로 취급되며(리치 1판·일발·뒷도라), 공탁 1000점도 내지 않는다.",
  detail:
    "(매 국 1회 — 리치는 국당 한 번) 텐파이 상태에서 손패를 직접 눌러 발동한다. 그 패를 버리면서 리치가 성립하지만 리치 선언 표시도 리치봉도 타가의 화면에 나타나지 않으며, 공탁 1000점도 내지 않는다. 화료하면 리치로 취급되어 리치·일발·뒷도라가 전부 적용되고 정산 화면에서 리치였음이 그때 공개된다. 표준 리치와 마찬가지로 손은 잠겨 쯔모패만 버릴 수 있고 후로도 할 수 없다.",
  // 봇: 텐파이일 때 무조건 건다 — 공탁도 없고 잃는 것이 없다.
  bot: {
    choose({ options, tenpai }) {
      if (!tenpai) return null;
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(stealthRiichiAction);
    }

    // 코어가 타인 뷰에서 리치 상태를 가린다 (진행 중에만 — 정산 정보는 그대로 나간다)
    ctx.setHolderRule("riichi.hidden", true);

    // 아직 리치 전일 때, 버려도 텐파이가 유지되는 손패만 후보로 노출한다.
    // 클라이언트는 이 후보 패만 무장 대상으로 강조해 손패 직접 클릭으로 발동시킨다.
    ctx.holderTurnOptions((state) => {
      if (state.round.phase !== "turn.act") return [];
      if (state.round.byPlayer[holder]?.riichi != null) return [];
      return handIdsOf(state, holder)
        .filter((tileId) => tenpaiAfterDiscard(state, engine.rules, holder, tileId))
        .map((tileId) => ({ type: ACTION, payload: { tileId } }));
    });
  },
});
