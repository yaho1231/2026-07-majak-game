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
 * - 기준은 **실제로 쏘이는가**다. 후리텐이라 론이 막힌 상대와 역이 없어 론이 성립하지 않는
 *   대기는 빼고(가상 론을 평가한다), `win.furiten.enabled`를 끈 상대(철벽 등)는
 *   후리텐이어도 그대로 센다. 판정 순서는 표준 론 검증과 같다 — 후리텐 → evaluateWin →
 *   역 → **내 버림의 론 면역(`win.ronImmune`)** → **격(`win.minHan`)** 까지 전부 본다.
 *
 * 국 단위 1회라 사용 플래그 키에 roundKey를 섞는다(매 국 초기화).
 */

import {
  augmentDataSet,
  buildWinContext,
  defineAugment,
  evaluateWin,
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
  TileId,
  TileKind,
  YakuRegistry,
} from "@majak/core";
import { flagOf, publishUsesLeft, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "danger_sense";
const ACTION = "danger_sense_use";

/** 이미 이 국에서 발동했는가 (국 단위 — roundKey 스코프, 매 국 초기화) */
const usedKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(ID, "used", state, holder);

/**
 * 이 상대가 **지금 후리텐 때문에 론이 막히는가**.
 *
 * ⚠ 후리텐이라는 사실만으로 빼면 안 된다 — 철벽(iron_wall)·만개(late_bloomer) 계열은
 * `win.furiten.enabled`를 꺼서 **후리텐인 채로 론한다**. 그 상대를 통째로 건너뛰면
 * 실제로 쏘이는 패가 "안전"으로 칠해져, 오탐을 없애려던 필터가 정반대의 **거짓 안전**을
 * 만든다(qa-lab text 확정 1). 표준 론 검증(standardActions의 win validate)과 **같은 순서**로
 * `win.furiten.enabled`를 먼저 묻는다.
 */
function furitenBlocksRon(
  state: GameState,
  rules: RuleRegistry,
  pid: PlayerId,
): boolean {
  if (
    rules.has("win.furiten.enabled") &&
    !rules.resolve<boolean>("win.furiten.enabled", { playerId: pid, state })
  ) {
    return false;
  }
  return isFuriten(state, pid, scoringOptionsOf(state, rules, pid), rules);
}

/** 이 사람의 화료에 역이 필요한가 (규칙이 없으면 표준대로 true) */
function needsYaku(state: GameState, rules: RuleRegistry, pid: PlayerId): boolean {
  if (!rules.has("win.requiresYaku")) return true;
  return rules.resolve<boolean>("win.requiresYaku", { playerId: pid, state });
}

/**
 * **내 버림이 론당하지 않는 국인가** (천하무적 `invincible`·불가침 조약 `no_ron_pact`).
 *
 * `win.ronImmune`의 playerId는 표준 론 검증에서 **버리는 사람**이다
 * (`standardActions.ts`의 win validate: `source = last?.player`). 보유자 자신이 면역인
 * 국에서는 무엇을 버려도 쏘이지 않는데 예전에는 손패 대부분이 빨갛게 칠해졌다
 * (2026-08-22 QA aug-1 확정 5). "실제로 쏘이는가"가 기준인 카드에서 이건 순수 오탐이다.
 */
function discarderImmune(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): boolean {
  if (!rules.has("win.ronImmune")) return false;
  return rules.resolve<boolean>("win.ronImmune", { playerId: holder, state });
}

/**
 * 그 종류로 실제 **론이 성립하는가** — 가상 화료를 평가해 역 성립까지 본다.
 *
 * 대기(winningKinds)만 보면 후로해서 역이 하나도 없는 상대(론 불가)의 대기까지
 * 위험으로 칠한다 — 후리텐은 빼면서 무역은 안 빼는 반쪽 기준이었다(qa-lab text 확정 2).
 * 화료패는 반드시 **손패 밖**의 실물이어야 한다(손 안의 같은 종류를 집으면
 * buildWinContext가 그 패를 뺐다 붙여 13장이 되어 분해가 실패한다).
 */
function canRonWith(
  state: GameState,
  rules: RuleRegistry,
  yaku: YakuRegistry,
  pid: PlayerId,
  waitKind: TileKind,
): boolean {
  const key = kindKey(waitKind);
  const inHand = new Set<TileId>(handIdsOf(state, pid));
  const tileId = Object.keys(state.tiles)
    .map(Number)
    .find((t) => !inHand.has(t) && kindKey(state.tiles[t]!.kind) === key);
  if (tileId === undefined) return true; // 실물을 못 찾으면 방어적으로 위험으로 둔다
  const ev = evaluateWin(buildWinContext(state, pid, "ron", tileId, { rules }), yaku);
  if (ev === null) return false;
  if (needsYaku(state, rules, pid) && !ev.ok) return false;
  /*
   * 격(`win.minHan` — rank_gate)에 걸려 **론할 수 없는 싼 손**도 위험이 아니다.
   * 표준 론 검증의 `belowMinHan`과 같은 계산이다(역만 면제 + score.extraHan 합산).
   */
  return !belowMinHan(state, rules, pid, ev);
}

/**
 * 최소 판 게이트에 걸리는가 — `standardActions.ts`의 `belowMinHan`을 그대로 옮긴 것.
 * (코어가 내보내지 않는 내부 함수라 여기서 같은 계산을 다시 쓴다. 판정이 갈리면
 * "위험하다고 칠했는데 실제로는 론이 거부되는" 오탐이 된다.)
 */
function belowMinHan(
  state: GameState,
  rules: RuleRegistry,
  pid: PlayerId,
  ev: { han: number; yakumanCount: number },
): boolean {
  if (ev.yakumanCount > 0) return false;
  if (!rules.has("win.minHan")) return false;
  const min = rules.resolve<number>("win.minHan", { playerId: pid, state });
  if (min <= 0) return false;
  const extra = rules.has("score.extraHan")
    ? Math.max(0, rules.resolve<number>("score.extraHan", { playerId: pid, state }))
    : 0;
  return ev.han + extra < min;
}

/**
 * 발동 시점 기준, 보유자 손패 중 지금 버리면 방총이 되는 종류(kindKey, 중복 제거·정렬).
 * = 세 상대의 **실제로 론이 되는** 대기 합집합 ∩ 보유자 손패 종류.
 */
function dangerKinds(
  state: GameState,
  rules: RuleRegistry,
  yaku: YakuRegistry | undefined,
  holder: PlayerId,
): string[] {
  // 내가 론 면역인 국에는 위험패가 존재하지 않는다 — 무엇을 버려도 쏘이지 않는다.
  if (discarderImmune(state, rules, holder)) return [];
  // 세 상대의 대기(오름패)를 kindKey 집합으로 합친다. 노텐은 []이라 자연히 빠진다.
  const oppWaits = new Set<string>();
  for (const p of state.players) {
    if (p.id === holder) continue;
    // 후리텐이라 **론이 막히는** 상대만 건너뛴다. 순수 대기만 보면 이미 자기
    // 대기패를 버려 둔 상대의 패까지 "쏘인다"로 표시돼, 안전패를 못 버리고
    // 손을 접게 만든다 — 설명("지금 버리면 상대에게 쏘이는 패")이 단언인 만큼
    // 오탐은 곧 능력값의 손실이다(docs/25 정보 #10). 반대로 후리텐을 무시하고
    // 론하는 상대까지 빼면 거짓 안전이 된다 — `furitenBlocksRon` 주석 참고.
    if (furitenBlocksRon(state, rules, p.id)) continue;
    const opts = scoringOptionsOf(state, rules, p.id);
    const waits = winningKinds(
      winHandKindsOf(state, rules, p.id),
      meldCountOf(state, p.id),
      undefined,
      opts,
    );
    for (const kind of waits) {
      // 역이 없어 론 자체가 불가능한 대기는 위험이 아니다.
      // yaku 레지스트리가 없는 최소 문맥에서는 예전대로 대기 전부를 위험으로 둔다.
      if (yaku !== undefined && !canRonWith(state, rules, yaku, p.id, kind)) continue;
      oppWaits.add(kindKey(kind));
    }
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

/**
 * 액션 정의 — 역 성립 판정에 YakuRegistry가 필요해 install 시점의 `ctx.yaku`를
 * 클로저로 잡는다(무덤 도굴 grave_rob과 같은 꼴). 액션은 게임당 한 번만 등록되고
 * 한 게임에는 엔진이 하나뿐이라 레지스트리도 하나다.
 */
const makeDangerSenseAction = (
  yaku: YakuRegistry | undefined,
): ActionDef<Record<string, never>> => ({
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
    const danger = dangerKinds(state, rules, yaku, req.player);
    return [
      augmentDataSet(usedKey(state, req.player), true),
      /*
       * 위험패 목록은 보유자 화면에만 나간다 (비밀 정보).
       * 스캔한 순(turnCount)을 함께 싣는다 — 이 결과는 갱신되지 않는 스냅샷이라
       * 순이 지날수록 틀려진다(상대가 새로 텐파이하면 잡히지 않는다).
       * 화면이 "N순 기준"이라고 밝혀 그 나이를 드러낸다.
       */
      augmentDataSet(roundViewKey(req.player, ID), {
        kinds: danger,
        turn: state.round.turnCount,
      }),
    ];
  },
});

export const dangerSense: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "info",
  complexity: 1,
  name: "지뢰 탐지",
  description:
    "(매 국 1회) 자기 순에 선언하면 내 손패 중 지금 버리면 상대에게 쏘이는 패가 나에게만 표시된다. 손은 바뀌지 않는다.",
  detail:
    "(매 국 1회) 세 상대의 대기(오름패)를 계산해 그와 겹치는 내 손패 종류만 센다. 리치를 걸지 않은 다마텐도 잡히고, 후리텐이라 론이 막힌 상대와 역이 없어 론이 안 되는 대기는 빠진다.\n\n표시는 **선언한 시점의 스냅샷**이라 이후 갱신되지 않는다.",
  // 봇: 자해 위험이 없는 순수 정보다 — 옵션이 뜨면 곧바로 선언한다.
  /*
   * 봇: 국당 1회뿐인 스캔을 **정보가 0인 첫 순에 태워 버리던** 문제를 막는다
   * (2026-07-29 감사). 누가 리치를 걸었거나 어느 정도 순이 지난 뒤에만 쓴다.
   */
  // 위험을 보는 증강 — 위험이 실재할 때만 값이 있다. 예전의
  // `!someoneRiichi && turnCount < N → null`을 planner의 `defend` 적기가 대신한다.
  bot: plan({
    intent: "defend",
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // "이번 국 1회"는 이미 썼는지가 화면 어디에도 없어서, 액티브 버튼이 사라지고
    // 나서야 소진을 알 수 있었다(2026-08-15 사용자 지적: "횟수류 전부 안 나온다").
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(makeDangerSenseAction(ctx.yaku));
    }

    // 아직 안 썼으면 보유자 턴에 선언 후보를 낸다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) =>
      flagOf(state, usedKey(state, holder)) ? [] : [{ type: ACTION, payload: {} }],
    );
  },
});
