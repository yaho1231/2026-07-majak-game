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
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindOf,
  openMeldCountOf,
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
import { flagOf, roundKey } from "../util.js";

const ID = "stealth_riichi";
const ACTION = "stealth_riichi";

/**
 * 이 국의 리치가 스텔스 액션으로 선언됐다는 표시 (표준 리치와 구분).
 *
 * 손을 바꾸는 증강이 이 리치를 해제할 때 표식도 함께 내려야 하므로 밖으로 연다
 * (`stealthBreak.ts`). 남겨 두면 같은 국에 다시 건 **표준 리치**까지 은닉된다.
 */
export const stealthActiveKey = (state: GameState, holder: PlayerId): string =>
  `${ID}:active:${roundKey(state)}:${holder}`;
const activeKey = stealthActiveKey;

/**
 * 노출 후로 수 — **코어 `openMeldCountOf`를 그대로 쓴다**.
 *
 * ⚠ 예전에는 여기에 사본을 두고 `kan_closed`만 뺐다. 코어는 묵계(`silent`) 후로도
 * 함께 빼므로, 묵계로 운 손은 **코어에서는 멘젠인데 스텔스 리치만 후로로 봐서**
 * 선언이 막혔다(docs/25 리치 #3). 주석은 "코어와 같은 규칙"이라고 적혀 있었지만
 * 실제로는 달랐다 — 멘젠 판정의 단일 진실은 코어다.
 */
function openMelds(state: GameState, player: PlayerId): number {
  return openMeldCountOf(state, player);
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
  toEvents: (req, { state }) => [
    /*
     * 은닉 표시를 **버림보다 먼저** 세운다.
     *
     * ⚠ root 이벤트는 순서대로 하나씩 완전히 처리된다(GameEngine.submit) — 버림을
     * 먼저 내면 그 버림의 리액션이 도는 시점에 이 플래그가 아직 없다. 그래서
     * `riichi.hidden`을 보고 갈라지는 분기(이중 선언의 트리플리치 표시 등)가
     * **한 번도 은닉 쪽으로 가지 못했고**, 스텔스 리치가 전원에게 새어 나갔다
     * (docs/25 리치 #4).
     *
     * 이 국의 리치가 스텔스 액션으로 선언됐다는 표시이기도 하다 — riichi.hidden이
     * 이 표시가 있을 때만 켜지므로, 홀더가 표준 riichi 액션으로 공탁 1000점을 내고
     * 선언한 경우까지 무조건 은닉되던 모순도 함께 막는다.
     */
    augmentDataSet(activeKey(state, req.player), true),
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
    "(매 국 1회 — 리치는 국당 한 번) 텐파이 상태에서 손패를 직접 눌러 발동한다. 그 패를 버리면서 리치가 성립하지만 리치 선언 표시도 리치봉도 타가의 화면에 나타나지 않으며, 공탁 1000점도 내지 않는다. 화료하면 리치로 취급되어 리치·일발·뒷도라가 전부 적용되고 정산 화면에서 리치였음이 그때 공개된다. 표준 리치와 마찬가지로 손은 잠겨 쯔모패만 버릴 수 있고 후로도 할 수 없다. ⚠ 은닉의 대가가 하나 있다 — 남들은 나를 리치가 아닌 사람으로 취급하므로, 손을 바꾸는 증강(통째로 바꾸기·손패 3장 교환·자리 바꿈)이 나를 대상으로 삼을 수 있다. 그렇게 손이 바뀌면 이 리치는 풀린다(나만 알게 된다).",
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

    // 코어가 타인 뷰에서 리치 상태를 가린다 (진행 중에만 — 정산 정보는 그대로 나간다).
    // 단, 이 국의 리치가 스텔스 액션으로 선언됐을 때만 — 홀더가 표준 riichi 액션(공탁
    // 1000점)으로 걸었다면 공탁까지 낸 정식 리치인데 아무에게도 안 보이는 모순이 생긴다.
    ctx.engine.rules.addModifier<boolean>("riichi.hidden", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const st = rctx.state as GameState | undefined;
        if (st === undefined) return cur;
        return flagOf(st, activeKey(st, holder)) ? true : cur;
      },
    });

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
