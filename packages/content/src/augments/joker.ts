/**
 * 조커 (joker, prism) — **백(白)이 무엇이든 된다.**
 *
 * (2국에 1회) 자기 순에 액티브 버튼을 누르면 그 국 동안 손패의 역패 백이 조커가 된다.
 * 조커는 머리가 되든 몸통이 되든 상관없이 빈자리를 스스로 메운다 — 23삭·백·23통이면
 * 백이 알아서 자리를 잡아 14삭·14통 대기가 된다. 무엇이 될지는 **고르지 않는다**:
 * 화료 순간에 가능한 변신을 전부 세어 보고 가장 비싼 손이 자동으로 채택된다.
 *
 * 부수는 상식: 리치마작에 만능패는 없다. 자패는 짝이 안 맞으면 그냥 버리는 패인데,
 * 그 백이 손에서 가장 아쉬운 자리를 정확히 메운다.
 *
 * 도파민 순간: 도저히 안 붙는 손에 백 한 장이 굴러들어와 그 자리에서 텐파이가 된다.
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
 * ⚠ 대기가 넓어지는 만큼 **후리텐도 넓어진다** — 표준 규칙 그대로다.
 */

import {
  Suits,
  augmentDataSet,
  defineAugment,
  kindKey,
  meldCountOf,
  playerAtSeat,
  sameKind,
  shantenOf,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileKind,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  flagOf,
  roundKey,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";
import { handKindsOf } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "joker";
const ACTION = "joker_call";

/** 한 번 쓰면 이만큼 국(본장 포함)이 지나야 다시 열린다 */
const COOLDOWN_ROUNDS = 2;

/** 조커가 되는 패 — 역패 백(삼원패 1) */
const HAKU: TileKind = { suit: Suits.Dragon, rank: 1 };

/** 이번 국에 조커를 켰는가 (국 스코프 — 효과는 그 국에만 산다) */
const onKey = (state: GameState, h: PlayerId): string =>
  `${ID}:on:${roundKey(state)}:${h}`;

const jokerOn = (state: GameState, h: PlayerId): boolean =>
  flagOf(state, onKey(state, h));

const jokerAction: ActionDef<Record<string, never>> = {
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
    if (!cooldownReady(state, ID, req.player, COOLDOWN_ROUNDS)) return "on cooldown";
    if (jokerOn(state, req.player)) return "already on";
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(onKey(state, req.player), true),
    ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
    // 전원 공개 — 백이 만능패가 됐다는 것을 알아야 상대가 백을 쥐고 있을 수 있다
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), true),
  ],
};

/**
 * 지금 발동하면 샹텐이 얼마나 줄어드는가 (0 = 백이 할 일이 없다).
 * 봇 정책 전용 — 조커의 값어치는 "백을 들고 있는가"가 아니라
 * "그 백이 지금 손의 빈자리를 메우는가"다.
 */
function jokerGain(view: Parameters<typeof handKindsOf>[0], holder: PlayerId): {
  gain: number;
  tenpai: boolean;
} {
  const hand = handKindsOf(view, holder);
  if (!hand.some((k) => sameKind(k, HAKU))) return { gain: 0, tenpai: false };
  const meldCount = view.round.byPlayer[holder]?.meldCount ?? 0;
  const opts = view.scoringOptions ?? {};
  const base = shantenOf(hand, meldCount, opts);
  const withJoker = shantenOf(hand, meldCount, { ...opts, wildKinds: [HAKU] });
  return { gain: Math.max(0, base - withJoker), tenpai: withJoker <= 0 };
}

export const joker: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  name: "조커",
  description:
    "(2국에 1회) 자기 순에 발동하면 이번 국 동안 손패의 백(白)이 조커가 되어, 손을 가장 비싸게 만드는 패로 알아서 변한다.",
  detail:
    "(2국에 1회) 자기 순에 발동하면 그 국이 끝날 때까지 손패의 백이 만능패가 된다. 백은 머리가 될 수도 몸통이 될 수도 있고, 손에서 비어 있는 자리를 스스로 메운다 — 23삭·백·23통을 들고 있으면 백이 자리를 잡아 14삭·14통 대기가 된다.\n\n무엇이 될지는 고르지 않는다. 화료하는 순간 백이 될 수 있는 모든 패를 따져 가장 높은 점수가 나오는 형태가 자동으로 채택된다. 손에 백이 여러 장이면 그 전부가 조커다.\n\n조커가 되는 것은 손패 안에서다 — 백으로 치·펑·깡을 할 수는 없다. 도라는 원래 패로 세므로 백이 무엇으로 변하든 도라 판정은 백 그대로이며, 대기가 넓어지면 후리텐도 그만큼 넓어진다. 발동 사실은 전원에게 공개된다.",
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
    ctx.holderTurnOptions(() => [{ type: ACTION, payload: {} }]);
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
      const option = ctx.options.find((o) => o.type === ACTION);
      if (option === undefined) return null;
      return jokerGain(ctx.view, ctx.holder).gain > 0 ? option : null;
    },
  }),
});
