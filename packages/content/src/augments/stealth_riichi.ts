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
  lockedDiscardIds,
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
import { flagOf } from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "stealth_riichi";
const ACTION = "stealth_riichi";

/**
 * 이 국의 리치가 스텔스 액션으로 선언됐다는 표시 (표준 리치와 구분).
 *
 * 손을 바꾸는 증강이 이 리치를 해제할 때 표식도 함께 내려야 하므로 밖으로 연다
 * (`stealthBreak.ts`). 남겨 두면 같은 국에 다시 건 **표준 리치**까지 은닉된다.
 */
export const stealthActiveKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(ID, "active", state, holder);
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
    const handIds = handIdsOf(state, req.player);
    if (!handIds.includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    /*
     * 봉인된 패는 이 리치로도 못 버린다 — 표준 리치와 같은 규칙이다
     * (`standardActions.ts` 리치 선언, docs/25 방해 #2). 이 검사가 빠져 있어서
     * 봉인술사에 잠긴 패를 스텔스 리치 한 번으로 털어낼 수 있었다. 리치가 걸린
     * 뒤에는 `lockedDiscardIds`가 빈 집합을 돌려주므로 나중에 잡을 방법도 없다
     * (2026-08-08 QA 2-9).
     */
    if (lockedDiscardIds(state, rules, req.player, handIds).has(req.payload.tileId)) {
      return "tile is sealed";
    }
    /*
     * 텐파이 요구는 **규칙에서 읽는다**(`riichi.requiresTenpai`) — 표준 리치 액션과 같다.
     * 하드코딩하면 공성계(siege_riichi)가 그 규칙을 false로 내려도 커스텀 리치 3종에는
     * 전혀 닿지 않아, "노텐 리치로 블러프한다"는 능력이 **이 리치들 앞에서만 조용히
     * 사라진다**(docs/25 리치 #11).
     */
    if (
      rules.resolve<boolean>("riichi.requiresTenpai", { playerId: req.player, state }) &&
      !tenpaiAfterDiscard(state, rules, req.player, req.payload.tileId)
    ) {
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
  complexity: 2,
  name: "스텔스 리치",
  /**
   * **은닉을 자기 손 안에서 깨는 증강과는 함께 갖지 않는다** (2026-08-05 사용자 지시).
   *
   * 이 증강의 존재 이유는 "아무도 내가 리치인 줄 모른다" 하나뿐이다. 그런데 내가 든
   * 다른 증강이 리치를 **전원 공개로 알리면** 그 순간 은닉이 통째로 무너진다 —
   * 상대가 막을 수 없는 곳(내 손패)에서 내 능력이 죽는 것이라 플레이로 피할 수도 없다.
   *
   * 두 부류를 잠근다.
   *
   * ① **능력으로 리치를 걸면서 그 사실을 공개하는 것** — 스텔스로 걸면 그쪽이 죽고,
   *    그쪽으로 걸면 스텔스가 죽는다(상호 무효).
   *      - `open_riichi_reveal` 오픈 리치 — 오름패를 전원 공개
   *      - `all_or_nothing` 모 아니면 도 — 판돈을 전원 공개
   *      - `soul_strike` 영혼의 일격 — 남은 쯔모 수를 전원 공개
   *      - `riichi_seal` 리치 봉인 — 첫 리치자로서 "봉인"을 전원 공개
   *        (2026-07-27 확인: `view:*:riichi_seal:<holder>` = "봉인"이 뜬다)
   *
   * ② **리치 중에만 일어나는 일을 전원 공개하는 것** — 내가 고르지 않아도 터진다.
   *      - `off_by_one` 한 끗 차이 — 리치 필수이고, 밀려서 바뀐 패를 전원 공개한다.
   *        스텔스 리치 중에 한 번만 발동해도 "저 사람 리치였구나"가 확정된다.
   *      - `palm_flip` 손바닥 뒤집기 — 리치 중에만 쓸 수 있고 발동을 전원 공개한다.
   *        (2026-08-15부터 리치 해제가 아니라 대기 교체지만, 공개 채널은 그대로라
   *         한 번 쓰면 "저 사람 리치였구나"가 확정된다.)
   *
   *      - `riichi_upgrade` 이중 선언 — 트리플리치 **표시**는 스텔스일 때 홀더 전용
   *        채널로 보내지만, 같은 리액션이 하가 봉인을 `view:*` 로 전원에게 알리고
   *        하가의 리치 버튼을 눈에 보이게 잠근다. 선언 즉시 "누가 리치를 걸었다"가
   *        확정되므로 은닉이 통째로 무너진다(2026-08-08 QA §2-9).
   *
   * ③ **내가 리치인 동안 손을 갈아 끼울 수 있게 하는 것** — 은닉 자체는 안 깨지지만
   *    리치로 잠긴 손을 자유롭게 바꾸는 조합이 되어 카드 두 장의 약속이 모두 거짓이 된다.
   *      - `silent_swap` 정적의 손 — 홀더 자신의 리치를 막지 않고, "아무도 리치를 안
   *        건 국"이라는 조건도 스텔스 리치를 세지 않아 그대로 통과한다.
   *
   *      - `no_ron_pact` 불가침 조약 — 조약 상태를 **국 내내 전원 공개**로 동기화하는데,
   *        파기 사유가 "리치 아니면 몸통"뿐이다. 몸통(후로)은 눈에 보이므로, 후로가
   *        없는데 배너가 «조약 파기»로 뒤집히면 **리치임이 확정된다.** 은닉 리치를
   *        건 그 순간 폭로되고, 화면 두 곳이 서로 다른 말을 한다(리치 표시는 false)
   *        — 2026-08-23 QA synergy3 riichi 확정 4.
   *
   * 반대로 **잠그지 않는 것**: `free_riichi_discard`·`late_double`·`no_retreat`·
   * `siege_riichi`는 공개 채널을 쓰지 않는다. `push_riichi`는 남을 리치시키는 것이라
   * 내 은닉과 무관하다.
   */
  conflicts: [
    "riichi_seal",
    "no_ron_pact",
    "open_riichi_reveal",
    "all_or_nothing",
    "soul_strike",
    "off_by_one",
    "palm_flip",
    "riichi_upgrade",
    "silent_swap",
  ],
  description:
    "(매 국 1회 · 리치는 국당 한 번) 텐파이에서 보이지 않는 리치를 건다. 남에게는 평범한 타패로 보이지만 화료 시 리치로 취급되고(리치 1판·일발·뒷도라), 공탁 1,000점도 내지 않는다.",
  detail:
    "리치 표시도 리치봉도 상대 화면에 뜨지 않고, 정산 화면에서 공개된다. 손이 잠기는 것은 표준 리치와 같다. 남들은 나를 리치가 아닌 사람으로 보므로 손을 바꾸는 증강의 대상이 되고, 그때 이 리치는 풀린다.",
  // 봇: 텐파이일 때 무조건 건다 — 공탁도 없고 잃는 것이 없다.
  bot: plan({
    intent: "score",
    fleeting: true,
    pick: ({ options, tenpai }) =>
      tenpai ? (options.find((o) => o.type === ACTION) ?? null) : null,
  }),
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
      // 텐파이 요구는 validate와 **같은 규칙**에서 읽는다 — 여기서 하드 필터링하면
      // 공성계(siege_riichi)가 `riichi.requiresTenpai`를 false로 내려도 후보가 0개라
      // 프롬프트에 액션이 실리지 않아, validate의 수정이 그대로 무효가 된다.
      const needTenpai = engine.rules.resolve<boolean>("riichi.requiresTenpai", {
        playerId: holder,
        state,
      });
      return handIdsOf(state, holder)
        .filter((tileId) => !needTenpai || tenpaiAfterDiscard(state, engine.rules, holder, tileId))
        .map((tileId) => ({ type: ACTION, payload: { tileId } }));
    });
  },
});
