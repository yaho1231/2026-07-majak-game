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
import { counterOf, viewKey } from "../util.js";

const ID = "karma";
const ACTION = "karma_burn";
/** 태울 수 있는 최소 게이지 */
const BURN_THRESHOLD = 8000;

/** 누적 업보 게이지 (게임 단위) */
const gaugeKey = (holder: PlayerId): string => `${ID}:gauge:${holder}`;
/** 전원 공개 뷰 채널 */
const gaugeViewKey = (holder: PlayerId): string =>
  viewKey("*", `${ID}:${holder}`);

/** 게이지를 태울 때의 분배 — 1인당 몫(내림)과 내가 받는 합계 */
function burnShares(
  state: GameState,
  holder: PlayerId,
): { targets: PlayerId[]; per: number; total: number } {
  const targets = state.players.filter((p) => p.id !== holder).map((p) => p.id);
  const gauge = counterOf(state, gaugeKey(holder));
  const per = targets.length > 0 ? Math.floor(gauge / targets.length) : 0;
  return { targets, per, total: per * targets.length };
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
    if (counterOf(state, gaugeKey(req.player)) < BURN_THRESHOLD) {
      return "karma gauge is not full enough";
    }
    if (burnShares(state, req.player).total <= 0) return "nothing to burn";
    return null;
  },
  toEvents: (req, { state }) => {
    const { targets, per, total } = burnShares(state, req.player);
    const events: ProposedEvent<string, unknown>[] = [];
    for (const t of targets) events.push(scoreChanged(t, -per, ID));
    events.push(scoreChanged(req.player, total, ID));
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
  name: "카르마",
  description:
    "(상시 적립 · 게이지 8,000 이상일 때 발동) 점수를 잃을 때마다 그 손실이 '업보' 게이지로 쌓이고(전원 공개), 자기 순에 게이지를 태워 쌓인 만큼을 상대 셋에게서 균등하게 즉시 강탈한다.",
  detail:
    "(상시 적립 · 게이지 8,000 이상일 때 발동) 국 정산에서 점수를 잃으면 방총이든 쯔모당함이든 그 손실액이 업보 게이지에 그대로 적립되고, 게이지 수치는 전원에게 공개된다. 게이지가 8,000 이상이면 자기 순에 게이지를 태워 쌓인 만큼을 상대 세 명에게서 균등하게 뜯어낸다(뱅크가 아니라 상대 주머니에서 나온다). 태우면 게이지는 0이 되고 다시 처음부터 쌓인다.",
  // 봇: 태우는 데 자해 위험이 없다 — 게이지가 차서 옵션이 뜨면 즉시 태운다.
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(karmaBurnAction);
    }

    // 잃은 만큼 즉시 적립 — 방총이든 쯔모당함이든 가리지 않는다
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const loss = Math.max(0, -(p.deltas[holder] ?? 0));
      if (loss <= 0) return;
      const gauge = counterOf(rc.state, gaugeKey(holder)) + loss;
      rc.emit(augmentDataSet(gaugeKey(holder), gauge));
      // 전원 공개 — 상대가 "쟤 게이지 찼다"를 보고 대응할 수 있어야 한다
      rc.emit(augmentDataSet(gaugeViewKey(holder), gauge));
    });

    // 보유자 턴에 후보 노출 — 합법성은 validate가 최종 판정
    ctx.holderTurnOptions(() => [{ type: ACTION, payload: {} }]);
  },
});
