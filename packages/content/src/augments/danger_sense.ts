/**
 * 지뢰 탐지 (danger_sense, prism) — "내 손 안의 지뢰를 밝힌다".
 *
 * 국당 1회, 자기 턴에 선언하면 **내 손패 중 지금 버리면 상대에게 쏘이는 패**가
 * 어느 것인지 나에게만 알려 준다. 세 상대의 대기(오름패)를 전부 계산해, 그 대기와
 * 겹치는 내 손패 종류를 보유자 전용 정보 채널로 띄운다. 어떤 걸 던지면 방총인지
 * 한눈에 보인다 — 손을 바꾸지는 않는다. 순수 정보 증강이다.
 *
 * 구현 지점:
 * - 액티브 액션 `danger_sense_use` {}: turn.act·자기 턴·국당 1회.
 * - toEvents가 발동 시점의 state로 위험 집합을 계산해 viewKey(holder, "danger_sense")에
 *   싣는다(kindKey 문자열 배열). augmentDataSet의 코어 리듀서가 그대로 기록하므로
 *   커스텀 리듀서가 필요 없다. 계산은 스냅샷 1회 — 이후 손이 바뀌어도 갱신하지 않는다
 *   (선언 그 순간의 스캔 결과다).
 * - 각 상대 대기: winningKinds(winHandKindsOf, meldCountOf, undefined, scoringOptionsOf)로
 *   상대의 채점 변형(scoring.*)까지 반영해 계산한다(선언 간파 peek_riichi_waits와 동일 경로).
 *   노텐인 상대는 winningKinds가 []을 돌려주니 합집합에서 자연히 빠진다 — 텐파이한 상대의
 *   대기만 남는다.
 * - 세 상대 대기의 합집합 ∩ 내 손패 종류 = "내가 버리면 쏘이는 종류". 리치 여부와 무관하게
 *   텐파이면 전부 위험으로 잡는다(다마텐도 걸러낸다).
 *
 * 국 단위 1회라 사용 플래그 키에 roundKey를 섞는다(매 국 초기화).
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isFuriten,
  kindKey,
  kindOf,
  meldCountOf,
  playerAtSeat,
  scoringOptionsOf,
  winHandKindsOf,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
} from "@majak/core";
import { flagOf, roundKey, roundViewKey } from "../util.js";

const ID = "danger_sense";
/** 리치가 없을 때 봇이 스캔을 미루는 최소 순 — 이 전에는 위험패 정보가 거의 없다 */
const SCAN_MIN_TURN = 6;
const ACTION = "danger_sense_use";

/** 이미 이 국에서 발동했는가 (국 단위 — roundKey 스코프, 매 국 초기화) */
const usedKey = (state: GameState, holder: PlayerId): string =>
  `${ID}:used:${roundKey(state)}:${holder}`;

/**
 * 발동 시점 기준, 보유자 손패 중 지금 버리면 방총이 되는 종류(kindKey, 중복 제거·정렬).
 * = 세 상대의 대기 합집합 ∩ 보유자 손패 종류.
 */
function dangerKinds(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): string[] {
  // 세 상대의 대기(오름패)를 kindKey 집합으로 합친다. 노텐은 []이라 자연히 빠진다.
  const oppWaits = new Set<string>();
  for (const p of state.players) {
    if (p.id === holder) continue;
    // 후리텐인 상대는 그 대기로 **론할 수 없다**. 순수 대기만 보면 이미 자기
    // 대기패를 버려 둔 상대의 패까지 "쏘인다"로 표시돼, 안전패를 못 버리고
    // 손을 접게 만든다 — 설명("지금 버리면 상대에게 쏘이는 패")이 단언인 만큼
    // 오탐은 곧 능력값의 손실이다(docs/25 정보 #10).
    const opts = scoringOptionsOf(state, rules, p.id);
    if (isFuriten(state, p.id, opts, rules)) continue;
    const waits = winningKinds(
      winHandKindsOf(state, rules, p.id),
      meldCountOf(state, p.id),
      undefined,
      opts,
    );
    for (const kind of waits) oppWaits.add(kindKey(kind));
  }
  if (oppWaits.size === 0) return [];

  // 내 손패 종류 중 상대 대기와 겹치는 것 = 위험패
  const danger = new Set<string>();
  for (const id of handIdsOf(state, holder)) {
    const key = kindKey(kindOf(state, id));
    if (oppWaits.has(key)) danger.add(key);
  }
  return [...danger].sort();
}

const dangerSenseAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no danger_sense augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const danger = dangerKinds(state, rules, req.player);
    return [
      augmentDataSet(usedKey(state, req.player), true),
      // 위험패 목록은 보유자 화면에만 나간다 (비밀 정보)
      augmentDataSet(roundViewKey(req.player, ID), danger),
    ];
  },
};

export const dangerSense: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "info",
  name: "지뢰 탐지",
  description:
    "(매 국 1회) 자기 순에 선언하면 내 손패 중 지금 버리면 상대에게 쏘이는 패가 어느 것인지 나에게만 밝혀진다. 표시는 능력을 사용한 그 시점 기준이라 이후 상대의 대기가 바뀔 수 있다. 손은 바뀌지 않는 순수 정보 능력이다.",
  detail:
    "(매 국 1회) 자기 순에 선언하면 그 순간 세 상대의 손패를 읽어 대기(오름패)를 계산하고, 그와 겹치는 내 손패 종류를 나에게만 표시한다. 리치를 걸지 않은 다마텐 상대의 대기와 상대의 특수 화료형까지 반영된다. 손을 바꾸거나 점수를 옮기지는 않는다. **위험패 표시는 액티브 능력을 사용한 시점의 스냅샷**이며 이후 갱신되지 않는다 — 상대가 패를 갈아 대기가 바뀌면 표시되지 않은 패가 위험해질 수도, 표시된 패가 안전해질 수도 있다.",
  // 봇: 자해 위험이 없는 순수 정보다 — 옵션이 뜨면 곧바로 선언한다.
  /*
   * 봇: 국당 1회뿐인 스캔을 **정보가 0인 첫 순에 태워 버리던** 문제를 막는다
   * (2026-07-29 감사). 누가 리치를 걸었거나 어느 정도 순이 지난 뒤에만 쓴다.
   */
  bot: {
    choose({ options, view }) {
      const opt = options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      const someoneRiichi = Object.values(view.round.byPlayer).some(
        (r) => r.riichiDeclared,
      );
      if (!someoneRiichi && view.round.turnCount < SCAN_MIN_TURN) return null;
      return opt;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) engine.actions.register(dangerSenseAction);

    // 아직 안 썼으면 보유자 턴에 선언 후보를 낸다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) =>
      flagOf(state, usedKey(state, holder)) ? [] : [{ type: ACTION, payload: {} }],
    );
  },
});
