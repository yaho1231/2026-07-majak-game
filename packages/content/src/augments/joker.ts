/**
 * 조커 (joker, prism) — **백(白)이 무엇이든 된다.**
 *
 * (2국에 1회) 자기 순에 액티브 버튼을 누르고 **손패 1장을 골라 백으로 바꾸면**, 그 국 동안
 * 손패의 역패 백이 조커가 된다 (이미 백인 패를 고르면 바뀌는 것 없이 해석만 켜진다).
 * 조커는 머리가 되든 몸통이 되든 상관없이 빈자리를 스스로 메운다 — 23삭·백·23통이면
 * 백이 알아서 자리를 잡아 14삭·14통 대기가 된다. 무엇이 될지는 **고르지 않는다**:
 * 화료 순간에 가능한 변신을 전부 세어 보고 가장 비싼 손이 자동으로 채택된다.
 *
 * 부수는 상식: 리치마작에 만능패는 없다. 자패는 짝이 안 맞으면 그냥 버리는 패인데,
 * 그 백이 손에서 가장 아쉬운 자리를 정확히 메운다.
 *
 * 도파민 순간: 도저히 안 붙는 손에서 애물단지 한 장을 백으로 바꾸자 그 자리에서 텐파이가 된다.
 *
 * 대응: 발동은 전원 공개다. 백은 상대의 버림패로도 잡을 수 있으므로(론) 보유자가
 * 발동한 뒤에는 남은 백을 흘리지 않는 것이 상대의 수다.
 *
 * ## 구현
 *
 * 코어 규칙 `scoring.wildKinds`(보유자 전용, 이번 국 한정)에 백을 실는다. 그 뒤는
 * 코어가 한다 — `decompose`가 조커 자리를 실제 패로 바꿔 놓은 손을 전부 만들어
 * 분해하고, `scoringOptionsOf`가 같은 옵션을 **화료·텐파이·대기·후리텐**에 흘린다.
 * 채점은 `evaluateWin`이 변형 전부를 재고 가장 비싼 것을 고르므로 "가장 높은 점수가
 * 되는 패로 변한다"가 별도 코드 없이 성립한다.
 *
 * ⚠ 조커가 되는 것은 **손패 안에서만**이다. 백으로 치·펑·깡을 하지는 못한다
 *   (후로 판정은 실제 패 종류를 그대로 본다).
 * ⚠ 도라는 물리적인 패로 센다 — 백이 무엇으로 변하든 도라 판정은 백 그대로다.
 * ⚠ **조커가 넓힌 대기는 후리텐을 만들지 않는다** (2026-08-07 사용자 지시).
 *   조커는 대기를 통째로 넓히므로 그대로 세면 "무엇으로도 화료할 수 있는데 론만 못 한다"가
 *   되어 능력이 스스로를 잠근다 — 특히 4멘쯔 + 조커 형태는 34종 대기라 항상 후리텐이었다.
 *   기준은 `helpers.furitenOptionsOf` 한 곳이고, **조커가 없었어도 잡을 수 있었던 패**만
 *   후리텐을 만든다.
 */

import {
  Suits,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindKey,
  kindOf,
  meldCountOf,
  playerAtSeat,
  sameKind,
  shantenOf,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  TileKind,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  flagOf,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";
import { handAlteredKey } from "./handAltered.js";
import { handIdsOfView, handKindsOf, isolatedIndex } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "joker";
const ACTION = "joker_call";

/** 한 번 쓰면 이만큼 국(본장 포함)이 지나야 다시 열린다 */
const COOLDOWN_ROUNDS = 2;

/** 조커가 되는 패 — 역패 백(삼원패 1) */
const HAKU: TileKind = { suit: Suits.Dragon, rank: 1 };

/** 이번 국에 조커를 켰는가 (국 스코프 — 효과는 그 국에만 산다) */
const onKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "on", state, h);

const jokerOn = (state: GameState, h: PlayerId): boolean =>
  flagOf(state, onKey(state, h));

/** 이 패가 이미 백인가 — 백을 고르면 "아무것도 바꾸지 않는다"가 된다 */
const isHaku = (state: GameState, id: TileId): boolean =>
  kindKey(kindOf(state, id)) === kindKey(HAKU);

/**
 * 발동 payload — `tileId`는 **백으로 바꿀 손패 1장**이다.
 *
 * 화면은 손패 클릭(무장)으로 항상 한 장을 지목하므로 사람이 내는 요청에는 늘 들어 있다.
 * 생략하면 예전처럼 해석만 켠다(테스트·QA 스크립트 호환).
 */
type JokerPayload = { tileId?: TileId };

const jokerAction: ActionDef<JokerPayload> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no joker augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 리치 중에는 손이 동결된다 — 같은 계열(giant_god·tile_split·genesis·even_world·
    // full_hand_swap·future_sight)과 같은 규약(docs/21 D-2).
    // 조커는 패를 갈아 끼우지 않고 **해석만** 바꾸지만 결과는 더 나쁘다:
    // `scoring.wildKinds` 는 `scoringOptionsOf` 를 타고 화료·텐파이·대기·후리텐 전부에
    // 흘러가므로, 리치로 잠겨 있어야 할 대기 2종이 그 자리에서 34종으로 다시 계산됐다
    // (2026-08-22 QA aug-2 확정 6, 실측). 싼 대기로 압박해 두고 상대가 그 두 종만 피해
    // 밀어붙이는 순간 조커를 켜서 아무 패로나 론하는, 원리적으로 대응 불가능한 화료다.
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: hand is frozen";
    }
    if (!cooldownReady(state, ID, req.player, COOLDOWN_ROUNDS)) return "on cooldown";
    if (jokerOn(state, req.player)) return "already on";
    const { tileId } = req.payload;
    if (tileId !== undefined && !handIdsOf(state, req.player).includes(tileId)) {
      return "tile not in hand";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    /*
     * 지목한 손패 1장을 백으로 바꾼다 — 조커를 **손에 백이 없어도** 쓸 수 있게 하는
     * 자리다. 바꾼 백은 곧바로 아래 `scoring.wildKinds` 규칙을 타고 만능패가 된다.
     * 이미 백인 패를 고르면 아무것도 바꾸지 않는다(= 해석만 켠다).
     * 조커는 대상을 만능패로 **넓히기만** 하므로(만능패는 원래 패로도 쓸 수 있다)
     * 어떤 패를 골라도 손 모양이 나빠지지 않는다 — 다만 도라는 백으로 다시 세므로
     * 도라·적도라를 태우면 판수는 잃는다.
     */
    ...(req.payload.tileId !== undefined && !isHaku(state, req.payload.tileId)
      ? [
          tileKindChanged([
            { tileId: req.payload.tileId, kind: HAKU, attrs: { conjured: true } },
          ]),
        ]
      : []),
    augmentDataSet(onKey(state, req.player), true),
    ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
    // 전원 공개 — 백이 만능패가 됐다는 것을 알아야 상대가 백을 쥐고 있을 수 있다
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), true),
    /*
     * 천화·지화 게이트를 닫는다.
     *
     * 조커는 패를 갈아 끼우지 않고 **해석만** 바꾸므로 `handAltered` 규약의 문자적
     * 대상이 아니라고 읽을 수도 있다. 그런데 결과는 게이트가 막으려던 바로 그것이다 —
     * 천화는 "**배패가 첫 쯔모 시점에 이미 완성돼 있었다**"는 사실에 붙는 역만인데,
     * 오야가 첫 순에 조커를 켜면 완성돼 있지 **않던** 배패가 그 자리에서 완성형으로
     * 읽힌다. 버림 0장·`firstTurn` 은 그대로라 게이트는 열려 있었다 — 실측 48,000점
     * (2026-08-22 QA aug-2 의심 8 → 확정, `qa-lab/round2/aug-2/p_joker_tenhou.ts`).
     *
     * 발동한 국에만 걸리는 국 스코프 표식이라, 조커를 켜지 않은 국의 천화는 멀쩡하다.
     */
    augmentDataSet(handAlteredKey(state, req.player), true),
  ],
};

/**
 * 지금 발동하면 샹텐이 얼마나 줄어드는가 — **어느 패를 백으로 바꿀지까지 고른다.**
 *
 * 봇 정책 전용. 조커의 값어치는 "백을 들고 있는가"가 아니라 "이 손에 만능패 한 장이
 * 생기면 얼마나 나아지는가"다. 후보는 손패 전부이고(이미 백인 패 = 아무것도 바꾸지
 * 않는 선택), 바꾼 뒤의 샹텐이 가장 낮은 자리를 고른다.
 *
 * 같은 샹텐이면 ① 이미 백인 패(공짜) ② 가장 고립된 패(`isolatedIndex` — 분열과 같은
 * 규칙 한 벌) 순이다. 도라·적도라는 봇이 보는 `PlayerView`에 실물 판정을 걸기 어려워
 * 따로 피하지 않는다 — 고립도 순위가 대개 같은 답을 낸다.
 */
function jokerGain(view: Parameters<typeof handKindsOf>[0], holder: PlayerId): {
  gain: number;
  tenpai: boolean;
  tileId: TileId | undefined;
} {
  const hand = handKindsOf(view, holder);
  const ids = handIdsOfView(view, holder);
  const meldCount = view.round.byPlayer[holder]?.meldCount ?? 0;
  const opts = view.scoringOptions ?? {};
  const wild = { ...opts, wildKinds: [HAKU] };
  const base = shantenOf(hand, meldCount, opts);

  let best = Number.POSITIVE_INFINITY;
  let tied: number[] = [];
  for (let i = 0; i < hand.length; i++) {
    const after = hand.map((k, j) => (j === i ? HAKU : k));
    const sh = shantenOf(after, meldCount, wild);
    if (sh < best) {
      best = sh;
      tied = [i];
    } else if (sh === best) {
      tied.push(i);
    }
  }
  if (tied.length === 0) return { gain: 0, tenpai: false, tileId: undefined };

  const free = tied.find((i) => sameKind(hand[i] as TileKind, HAKU));
  const isolated = isolatedIndex(hand, -1);
  const pickIdx = free ?? (tied.includes(isolated) ? isolated : (tied[0] as number));
  return {
    gain: Math.max(0, base - best),
    tenpai: best <= 0,
    tileId: ids[pickIdx],
  };
}

export const joker: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  complexity: 3,
  name: "조커",
  description:
    "(2국에 1회) 자기 순에 손패 1장을 골라 백(白)으로 바꾸고, 이번 국 동안 손패의 백이 조커가 되어 손을 가장 비싸게 만드는 패로 알아서 변한다.",
  detail:
    "손패 1장을 골라 백으로 바꾼다 — 백이 손에 없어도 조커를 만들 수 있다. 손에 있는 백은 전부 조커이고 머리도 몸통도 된다. 무엇이 될지는 고르지 않으며 화료하는 순간 가장 높은 점수가 나오는 형태가 채택된다. 조커가 넓힌 대기는 후리텐이 되지 않는다.\n\n백으로 치·퐁·깡은 할 수 없고, 도라는 백 그대로 세므로 **도라를 백으로 바꾸면 그 판수는 사라진다**.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) engine.actions.register(jokerAction);

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    /**
     * 발동한 국 동안만 백을 조커로 올린다. 이 규칙 하나가 화료·텐파이·대기·후리텐에
     * 전부 흘러가므로(helpers.scoringOptionsOf) 판정 지점을 따로 손댈 것이 없다.
     */
    engine.rules.addModifier<readonly TileKind[]>("scoring.wildKinds", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined || !jokerOn(state, holder)) return cur;
        if (cur.some((k) => kindKey(k) === kindKey(HAKU))) return cur;
        return [...cur, HAKU];
      },
    });

    // 자기 순에 뜨는 액티브 버튼 (합법성 최종 판정은 validate)
    // 리치 중에는 후보 자체를 내지 않는다 — `FlowController` 의 리치 강제 쯔모기리
    // 자동 진행은 `options.length === 1` 일 때만 도는데, 여기서 후보가 하나 더 남으면
    // 리치 중 매 순 프롬프트가 떠 자동 진행이 사라진다.
    // 손패 1장마다 후보를 낸다 — 화면은 이 후보들을 손패 클릭(무장)으로 고르게 한다.
    // 이미 백인 패를 고르면 아무것도 바뀌지 않는다(= 해석만 켠다).
    ctx.holderTurnOptions((state) =>
      state.round.byPlayer[holder]?.riichi != null
        ? []
        : handIdsOf(state, holder).map((tileId) => ({ type: ACTION, payload: { tileId } })),
    );
  },
  /**
   * 손을 **전진시키는** 물건이라 `advance`다 — 남은 순목이 있고 손이 닿는 거리일 때
   * 값이 난다. 다만 두 가지를 정책이 직접 본다.
   *
   * ① **백을 들고 있어야 한다.** 백 없이 켜면 그 국 내내 아무 일도 안 일어난다.
   *    (봇은 백을 뽑은 그 순에 이 판단을 하고, 발동은 턴을 소비하지 않으므로
   *     같은 순의 버림 결정은 이미 조커가 켜진 손으로 계산된다 — 그래서 켠 직후의
   *     봇은 백을 버리지 않는다. `shantenOf`가 조커를 세기 때문이다.)
   * ② **그 백이 지금 빈자리를 메워야 한다.** 백백백을 커쯔로 쓰고 있는 손처럼
   *    조커로 만들어도 손이 나아지지 않으면 켤 이유가 없다.
   *
   * `oneShot`을 붙이지 않는다 — 아껴 두는 것이 이득인 물건이 아니다. 백을 손에
   * 쥔 순간이 곧 적기이고, 그 백을 흘리면 기회 자체가 사라진다.
   */
  bot: plan({
    intent: "advance",
    // 조커로 지금 텐파이가 서면 미룰 이유가 없다 — 적기 문턱을 건너뛴다
    fleeting: (ctx) => jokerGain(ctx.view, ctx.holder).tenpai,
    pick: (ctx) => {
      const { gain, tileId } = jokerGain(ctx.view, ctx.holder);
      if (gain <= 0) return null;
      // 고른 그 패로 내는 후보를 집는다 (없으면 아무 후보나 — 후보가 곧 손패다)
      return (
        ctx.options.find(
          (o) => o.type === ACTION && (o.payload as { tileId?: TileId }).tileId === tileId,
        ) ??
        ctx.options.find((o) => o.type === ACTION) ??
        null
      );
    },
  }),
});
