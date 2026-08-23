/**
 * 카르마 (karma, prism) — 업보 게이지를 태워 즉시 되갚는다.
 *
 * 52차 개편: "오라스에 화료하면 그동안 잃은 점수를 전액 환급"이라는 **지연 환급**
 * (유저 반려 취향 정면)을 통째로 들어내고, **즉시 발동하는 액티브**로 바꿨다.
 *
 * - 내가 점수를 잃는 국(방총·쯔모당함 — ROUND_SETTLED의 내 delta가 음수)마다
 *   그 손실액이 **업보 게이지**로 즉시 적립되고, 게이지는 전원 공개 뷰 채널에 뜬다.
 * - 자기 턴에 `karma_burn`을 누르면(게이지 8,000 이상일 때만) 게이지를 전부 태워
 *   **그만큼을 상대 셋에게서 균등하게 즉시 강탈**한다.
 *
 * 상대는 "쟤 게이지 찼다"를 보고 대응할 수 있고, 나는 언제 태울지 고른다.
 *
 * ## 2026-08-23 (사용자 지시) — **동풍전 1회 · 반장전 2회**
 *
 * 게이지만 차면 몇 번이든 태울 수 있었다. 업보는 "잃은 만큼 되갚는다"라 지고 있을수록
 * 자주 차고, 한 매치에서 서너 번 터지면 점수 이동의 총량이 다른 매치 예산 증강들과
 * 자릿수가 달라진다. 이제 매치 예산(`matchUses`)을 얹어 **언제 태우는가**가 진짜
 * 선택이 되게 한다 — 게이지 문턱(8,000)은 그대로다.
 *
 * 구현:
 * - 적립: ROUND_SETTLED 리액션에서 payload.deltas[holder] < 0이면 그 절댓값을 더한다.
 *   (리액션의 state는 리듀서 적용 후지만 국번에 의존하지 않으므로 문제없다.)
 * - 발동: 액션 `karma_burn {}` — turn.act·자기 턴·게이지 ≥ 8,000.
 *   scoreChanged로 상대 각 −몫, 나 +합계를 낸다. **제로섬**을 유지하려고
 *   1인당 몫은 내림(floor)으로 계산하고 내가 받는 값은 그 합계로 맞춘다.
 * - 게이지 키는 게임 단위(roundKey를 섞지 않는다).
 */

import {
  ROUND_SETTLED,
  augmentDataSet,
  defineAugment,
  playerAtSeat,
  scoreChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  ProposedEvent,
  RoundSettledPayload,
} from "@majak/core";
import { counterOf, matchUses, publishUsesLeft, viewKey } from "../util.js";
import { plan } from "./botPlan.js";

const ID = "karma";
const ACTION = "karma_burn";
/** 태울 수 있는 최소 게이지 */
const BURN_THRESHOLD = 8000;
/** 점수 이동 단위 — 마작 점수는 100점 단위로 떨어진다 (2026-08-01 사용자 지적) */
const UNIT = 100;

/** 누적 업보 게이지 (게임 단위) */
const gaugeKey = (holder: PlayerId): string => `${ID}:gauge:${holder}`;
/** 매치당 사용 횟수 — **게임 단위**라 roundKey를 섞지 않는다 (동풍전 1 · 반장전 2) */
const usesKey = (holder: PlayerId): string => `${ID}:uses:${holder}`;
/** 앞으로 몇 번 더 태울 수 있는가 */
const usesLeft = (state: GameState, holder: PlayerId): number =>
  Math.max(0, matchUses(state) - counterOf(state, usesKey(holder)));
/** 전원 공개 뷰 채널 */
const gaugeViewKey = (holder: PlayerId): string =>
  viewKey("*", `${ID}:${holder}`);

/**
 * 게이지를 태울 때의 분배 — 1인당 몫과 내가 받는 합계.
 *
 * 1인당 몫은 **100점 단위로 내림**한다 (9,100 / 3 → 3,000씩). 마작 점수는 100점
 * 단위로 움직이는데 예전엔 그냥 나누기 내림이라 3,033점 같은 값이 나왔다.
 * 내가 받는 값은 몫의 합계라 제로섬은 그대로 유지된다.
 */
/**
 * 태울 몫 — 대상별 지불액과 그 합.
 *
 * **각자의 잔여 점수를 넘겨 받지 않는다**(2026-08-04 사용자 확정). 예전에는
 * 게이지를 인원수로 나눈 값을 잔여 점수와 무관하게 물려서, 800점 남은 상대에게
 * 12,000이 터지면 그 사람이 **-11,200점이 된 채로 그 국을 계속 쳤다** — 도비
 * 판정은 국 정산 뒤에만 돌기 때문이다(docs/25 방해 #14).
 *
 * 못 받은 몫은 다른 사람에게 넘기지 않는다. 게이지가 그만큼 헛되이 타는 것이
 * "빈털터리에게서는 더 못 뜯는다"는 규칙에 맞다.
 */
function burnShares(
  state: GameState,
  holder: PlayerId,
): { shares: { id: PlayerId; amount: number }[]; total: number } {
  const others = state.players.filter((p) => p.id !== holder);
  const gauge = counterOf(state, gaugeKey(holder));
  const per =
    others.length > 0 ? Math.floor(gauge / others.length / UNIT) * UNIT : 0;
  const shares = others.map((p) => ({
    id: p.id,
    // 잔여 점수도 100점 격자로 내려 맞춘다 (음수 방지)
    amount: Math.max(0, Math.min(per, Math.floor(p.score / UNIT) * UNIT)),
  }));
  return { shares, total: shares.reduce((sum, x) => sum + x.amount, 0) };
}

const karmaBurnAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no karma augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (usesLeft(state, req.player) <= 0) return "karma no uses left";
    if (counterOf(state, gaugeKey(req.player)) < BURN_THRESHOLD) {
      return "karma gauge is not full enough";
    }
    if (burnShares(state, req.player).total <= 0) return "nothing to burn";
    return null;
  },
  toEvents: (req, { state }) => {
    const { shares, total } = burnShares(state, req.player);
    const events: ProposedEvent<string, unknown>[] = [];
    for (const t of shares) {
      if (t.amount > 0) events.push(scoreChanged(t.id, -t.amount, ID));
    }
    events.push(scoreChanged(req.player, total, ID));
    // 매치 예산 소모 — 태운 횟수는 게이지와 달리 국을 넘어 남는다
    events.push(
      augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
    );
    // 게이지를 전부 태운다 — 공개 뷰도 0으로
    events.push(augmentDataSet(gaugeKey(req.player), 0));
    events.push(augmentDataSet(gaugeViewKey(req.player), 0));
    return events;
  },
};

export const karma: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 2,
  name: "카르마",
  description:
    "(동풍전 1회 · 반장전 2회 · 게이지 8,000 이상) **국 정산에서** 잃은 점수가 업보 게이지로 상시 쌓이고(전원 공개), 자기 순에 게이지를 태워 상대 셋에게서 1/3씩 뜯는다 — 못 뜯은 몫은 사라진다.",
  detail:
    "(동풍전 1회 · 반장전 2회 · 게이지 8,000 이상) 1인당 몫은 게이지의 1/3을 100점 단위로 내림한 값이고, **그 사람의 남은 점수**가 상한이다. 리치 공탁이나 남의 업보에 뜯긴 점수는 쌓이지 않는다. 태우면 게이지는 0이 된다.\n\n적립은 횟수를 다 쓴 뒤에도 계속되지만, 태울 수 있는 것은 **매치 전체에서 동풍전 1번 · 반장전 2번**뿐이다 — 남은 횟수는 증강 표식에 표시된다.",
  /*
   * 봇: 태우는 데 자해 위험이 없다 — 게이지가 차서 옵션이 뜨면 즉시 태운다.
   *
   * 매치 예산(동풍전 1·반장전 2회)이 생긴 뒤에도 정책은 같다. 게이지는 **다시 잃어야만**
   * 차므로 아껴 두는 것이 곧 "더 크게 지고 오기를 기다린다"이고, 국이 끝날 때까지 안
   * 태우면 그 국의 적립은 그대로 남지만 태울 기회 자체가 상대의 도비·종국으로 사라진다.
   */
  bot: plan({
    intent: "score",
    fleeting: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(karmaBurnAction);
    }

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: usesLeft(state, holder),
      total: matchUses(state),
    }));

    // 잃은 만큼 즉시 적립 — 방총이든 쯔모당함이든 가리지 않는다
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const loss = Math.max(0, -(p.deltas[holder] ?? 0));
      if (loss <= 0) return;
      // 게이지도 100점 단위로 떨어뜨린다 — 증강이 100 단위가 아닌 점수를 옮겼더라도
      // 화면에 3,033 같은 수치가 뜨지 않게 한다. (통상 손실은 이미 100 단위다.)
      const gauge =
        Math.floor((counterOf(rc.state, gaugeKey(holder)) + loss) / UNIT) * UNIT;
      rc.emit(augmentDataSet(gaugeKey(holder), gauge));
      // 전원 공개 — 상대가 "쟤 게이지 찼다"를 보고 대응할 수 있어야 한다
      rc.emit(augmentDataSet(gaugeViewKey(holder), gauge));
    });

    // 보유자 턴에 후보 노출 — 합법성은 validate가 최종 판정.
    // 다 쓴 뒤에는 버튼 자체를 내지 않는다(게이지는 계속 차므로 남아 있으면 오해를 부른다).
    ctx.holderTurnOptions((state) =>
      usesLeft(state, holder) > 0 ? [{ type: ACTION, payload: {} }] : [],
    );
  },
});
