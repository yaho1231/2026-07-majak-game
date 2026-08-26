/**
 * 천리안 (tenpai_scan, prism) — "지금 누가 완성 직전인지, 한 번 꿰뚫어 본다".
 *
 * 매 국 1회, 자기 턴에 선언하면 그 순간 **텐파이인 상대가 누구인지**가
 * 오직 보유자에게만 공개된다. 손패의 내용이나 대기패까지 보여 주는 게 아니라,
 * "이 사람은 완성 직전이다 / 아니다"라는 한 겹의 정보만 준다. 손을 바꾸지도,
 * 점수를 옮기지도 않는다 — 순수하게 판을 읽는 정보 능력이다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §2b.
 *
 * 구현:
 * - 커스텀 액션 `tenpai_scan_use {}` — turn.act·자기 턴·매 국 1회.
 * - toEvents(req, { state, rules })에서 나를 뺀 세 상대 각각에 대해
 *   isTenpai(winHandKindsOf, meldCountOf, undefined, scoringOptionsOf)로 텐파이를
 *   계산한다 — 채점 변형 증강(scoring.*)까지 그대로 반영한다(peek_riichi_waits와 동일 계보).
 * - 결과는 `{ players, turn }`(텐파이인 상대 id 배열 + 스캔한 순)로
 *   viewKey(holder, "tenpai_scan") 채널에 실어 **보유자 화면에만** 노출한다.
 *   발동 사실·상대 목록은 아무에게도 새지 않는다. turn은 화면이 "N순 기준"을
 *   밝히기 위한 것 — 스냅샷이 국 끝까지 남아 시간이 지날수록 틀려지기 때문이다.
 * - 선언은 **국 단위**다(국이 바뀌면 다시 한 번 쓸 수 있다) — 그래서 사용 카운터 키에
 *   roundKey를 섞는다. 2026-08-14 사용자 지시로 "동풍전 1·반장전 2회"에서 상향했다:
 *   결과가 국 끝까지 남는 스냅샷인데 판 전체에 한두 번뿐이라, 정작 위험한 국에는
 *   이미 소진돼 있기 일쑤였다. 정보만 주고 손도 점수도 건드리지 않는 증강이라
 *   국당 1회여도 판을 뒤집지 않는다.
 * - augmentDataSet만 발행하므로 별도 reducer가 필요 없다(코어 reducer가 처리).
 */

import {
  augmentDataSet,
  defineAugment,
  isTenpai,
  meldCountOf,
  playerAtSeat,
  scoringOptionsOf,
  winHandKindsOf,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
} from "@majak/core";
import { counterOf, publishUsesLeft, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "tenpai_scan";
const ACTION = "tenpai_scan_use";

/** 국당 사용 횟수 */
const USES_PER_ROUND = 1;
/** 이번 국에 이미 발동했는가 (국 단위 — roundKey를 섞는다) */
const usesKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(ID, "uses", state, holder);
const hasUsesLeft = (state: GameState, holder: PlayerId): boolean =>
  counterOf(state, usesKey(state, holder)) < USES_PER_ROUND;
/** 스캔 결과(텐파이인 상대 id 배열)를 실을 보유자 전용 뷰 채널 */
const resultKey = (holder: PlayerId): string => roundViewKey(holder, ID);

/** 나를 뺀 상대 중 지금 텐파이인 사람들의 id (채점 변형 반영) */
function tenpaiOpponents(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): PlayerId[] {
  return state.players
    .filter((p) => p.id !== holder)
    .filter((p) =>
      isTenpai(
        winHandKindsOf(state, rules, p.id),
        meldCountOf(state, p.id),
        undefined,
        scoringOptionsOf(state, rules, p.id),
      ),
    )
    .map((p) => p.id);
}

const scanAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no tenpai_scan augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left this round";
    return null;
  },
  toEvents: (req, { state, rules }) => [
    /*
     * 텐파이인 상대 목록을 보유자 화면에만 공개 (내용·대기는 주지 않는다).
     *
     * **스캔한 순(turnCount)을 함께 싣는다.** 결과는 국 끝까지 그대로 떠 있는
     * 스냅샷이라, 순이 지날수록 조용히 틀린 정보가 된다 — 노텐이던 사람이 텐파이가
     * 돼도 목록은 그대로다. 화면이 "N순 기준"이라고 밝히면 보는 사람이 그 나이를
     * 감안할 수 있다(docs/25 정보 계열 — 스냅샷 표시 잔류).
     */
    augmentDataSet(resultKey(req.player), {
      players: tenpaiOpponents(state, rules, req.player),
      turn: state.round.turnCount,
    }),
    // 국 단위 사용 카운터
    augmentDataSet(
      usesKey(state, req.player),
      counterOf(state, usesKey(state, req.player)) + 1,
    ),
  ],
};

export const tenpaiScan: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "info",
  complexity: 2,
  name: "천리안",
  description:
    "(매 국 1회) 자기 순에 선언하면 그 순간 텐파이인 상대가 누구인지 나에게만 밝혀진다.",
  detail:
    "리치를 걸지 않은 다마텐도 잡아내지만, 손패 내용이나 대기패까지는 알 수 없다. 결과는 선언한 순간의 스냅샷이다.\n\n발동 사실도 밝혀진 목록도 상대에게는 공개되지 않는다.",
  // 봇: 발동 타이밍(언제가 판이 무르익은 순간인지)을 정량화하기 어렵고,
  //     정보만 주므로 잘못 써도 자해가 없다 — 판단이 필요한 액티브라 봇에게 맡기지 않는다.
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(
      ctx,
      (state) => ({
        left: Math.max(0, USES_PER_ROUND - counterOf(state, usesKey(state, holder))),
        total: USES_PER_ROUND,
      }),
      "round",
    );

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) engine.actions.register(scanAction);

    // 아직 안 썼으면 보유자 턴에 선언 후보를 낸다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) =>
      hasUsesLeft(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );
  },
  // 상대들의 텐파이를 훑는 정보 증강(매 국 1회). 텐파이 여부와 무관하게
  // "밀지 접을지"의 정보라, 예전의 '내가 텐파이일 때만' 게이트는 정작 수비가 필요한
  // 노텐 구간을 막고 있었다(2026-07-26: 제시 31회에 발동 0회). 너무 이른 소모만
  // 피하도록 내 바닥이 5장 이상 쌓인 중반 이후로 연다.
  // "누가 텐파이인가"는 막는 데 쓰는 정보다 — 위험이 실재할 때 값이 있다.
  // 예전의 "버림패 5장 이상" 순목 조건을 planner의 `defend` 적기가 대신한다.
  bot: plan({
    intent: "defend",
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
