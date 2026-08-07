/**
 * 무장해제 (disarm, prism) — "그 카드에 쇠사슬이 철컹."
 *
 * 동풍전 1·반장전 2회, 자기 턴에 상대 한 명의 증강 하나를 지목해 **이번 국 동안 무효화**한다.
 * 지목당한 증강의 규칙 Modifier와 Interceptor·Reaction이 이번 국 내내 전부 건너뛰어진다 —
 * 만년 오야·천하무적처럼 상시 규칙/효과로 굴러가는 증강이 통째로 잠긴다.
 *
 * 구현: 코어의 무장해제 게이트를 쓴다. 활성화 시 대상 증강 인스턴스 id
 * (`augmentInstanceId(target, augmentId)`)를 `DISARMED_SOURCES_KEY` 목록에 넣으면,
 * GameEngine이 RuleRegistry.resolve와 EventProcessor(Interceptor·Reaction)에서 그 source를
 * 건너뛴다. 목록은 state.augmentData에 있어 리플레이 안전하며, 국 종료(ROUND_SETTLED)에
 * 되돌린다. 동풍전 1·반장전 2회.
 *
 * 2026-07-27 (60차) — "진짜 무효화"로 승격. 예전엔 규칙·효과만 잠기고 두 구멍이 있었다.
 *
 * ① **액티브 버튼이 안 잠겼다** → `installAugment`가 `holderTurnOptions`를 무장해제
 *    게이트로 감싼다(core). 잠긴 증강은 후보가 비고, FlowController가 제시되지 않은
 *    옵션의 submit을 거부하므로 액션까지 함께 막힌다. 이걸로 "규칙도 효과도 없는
 *    순수 액션형 증강 26종에는 완전 무효"였던 문제가 사라진다.
 * ② **이미 만들어 둔 물리 상태가 안 돌아왔다** → 잠그기 **직전에** `AugmentDisarmed`를
 *    먼저 낸다(§toEvents의 순서가 계약). 대상 증강이 그 이벤트에 반응해 스스로
 *    원상복구한다 — 진짜 용은 배패 16장 중 3장을 패산으로 반납해 13/14장으로 돌아온다.
 *    예전엔 손패 17장 + 화료형 14장이 되어 그 국이 통째로 하드락이었다.
 */

import {
  DISARMED_SOURCES_KEY,
  ROUND_SCOPED_MARK,
  ROUND_SETTLED,
  augmentDataSet,
  augmentDisarmed,
  augmentInstanceId,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId } from "@majak/core";
import { counterOf, matchUses, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";
import { threatWeightOf } from "./botHelpers.js";

const ID = "disarm";
const ACTION = "disarm_lock";

/** 동풍전 1·반장전 2회 소진 (게임 단위 — roundKey 없음) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);
/**
 * 이번 국에 이 보유자가 잠근 대상 인스턴스 id **목록** (국 종료 시 해제용).
 *
 * ⚠ 예전에는 문자열 슬롯 하나였다. 그래서 한 국에 두 번 잠그면 첫 대상의 id가 덮여
 * **국이 끝나도 영영 풀리지 않았다** — 매치가 끝날 때까지 영구 무장해제(2026-07-29 감사).
 * 목록으로 두고 국 종료에 전부 되돌린다. 함께 '국당 1회' 가드도 건다.
 */
/**
 * 이번 국에 이 보유자가 잠근 대상 목록.
 *
 * **국 스코프 키**다 — 아래 ROUND_SETTLED 리액션이 정리하지만, 그 리액션의 source가
 * 자기 자신이라 **무장해제로 무장해제를 잠그면 게이트에 막혀 영영 돌지 않는다.**
 * 그러면 "이번 국 이미 씀" 판정이 매치 끝까지 참으로 남아 이 증강이 죽는다
 * (docs/25 방해 #1). 엔진이 국 경계에서 지우게 해 게이트와 무관하게 만든다.
 */
const lockedKey = (h: PlayerId): string => `${ID}:locked:${h}${ROUND_SCOPED_MARK}`;

/** 이번 국에 잠근 대상들 (없으면 빈 배열) */
function lockedList(state: GameState, h: PlayerId): string[] {
  const v = state.augmentData[lockedKey(h)];
  return Array.isArray(v) ? [...(v as string[])] : [];
}

/** 현재 무장해제된 source 목록 */
function disarmedList(state: GameState): string[] {
  const v = state.augmentData[DISARMED_SOURCES_KEY];
  return Array.isArray(v) ? [...(v as string[])] : [];
}

const disarmAction: ActionDef<{ target: PlayerId; augmentId: string }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no disarm augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left this game";
    // 국당 1회 — 한 국에 여러 증강을 동시에 잠그는 것은 설명에 없는 능력이다
    if (lockedList(state, req.player).length > 0) {
      return "already disarmed this round";
    }
    if (req.payload.target === req.player) return "cannot disarm yourself";
    const target = state.players.find((p) => p.id === req.payload.target);
    if (target === undefined) return "unknown target";
    if (!target.augments.includes(req.payload.augmentId)) {
      return "target does not have that augment";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const src = augmentInstanceId(req.payload.target, req.payload.augmentId);
    const list = disarmedList(state);
    if (!list.includes(src)) list.push(src);
    return [
      // ⚠ 순서가 계약이다 — 목록에 넣기 **전에** 통보한다.
      // 대상 증강은 이 이벤트에 반응해 자기가 만들어 둔 물리 상태를 되돌리는데
      // (진짜 용 → 손패 3장 반납), 먼저 잠가 버리면 그 Reaction까지 꺼진다.
      augmentDisarmed({
        target: req.payload.target,
        augmentId: req.payload.augmentId,
        source: src,
      }),
      augmentDataSet(DISARMED_SOURCES_KEY, list),
      augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
      augmentDataSet(lockedKey(req.player), [...lockedList(state, req.player), src]),
      // 전원 공개 지목 관계 (피격자·관전자 포함)
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), {
        target: req.payload.target,
        augmentId: req.payload.augmentId,
      }),
    ];
  },
};

export const disarm: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 1,
  name: "무장해제",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 상대 한 명의 증강 하나를 지목해 이번 국 동안 완전히 무효화한다 — 규칙도, 발동 효과도, 액티브 버튼도 전부 잠긴다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 자기 순에 상대 한 명의 증강 하나를 지목하면 그 증강이 이번 국이 끝날 때까지 완전히 잠긴다. 상시 규칙(만년 오야의 오야 고정·천하무적의 무방총)도, 정산 개입도, 액티브 버튼도 전부 사라진다. 손패 장수처럼 그 증강이 이미 바꿔 놓은 것이 있으면 잠기는 순간 원래대로 되돌아간다 — 진짜 용을 잠그면 필요 없는 패 3장이 패산으로 돌아가며 평범한 손패로 복귀한다. 한 국에 한 명의 증강 하나만 잠글 수 있고, 지목은 전원에게 공개되며 국이 끝나면 증강도 원래대로 돌아온다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(disarmAction);
    }

    // 국이 끝나면 이번 국에 잠근 대상을 **전부** 되돌린다 (다음 국엔 정상 작동)
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      const locked = lockedList(rc.state, holder);
      if (locked.length === 0) return;
      const list = disarmedList(rc.state).filter((s) => !locked.includes(s));
      rc.emit(augmentDataSet(DISARMED_SOURCES_KEY, list));
      rc.emit(augmentDataSet(lockedKey(holder), []));
    });

    // 아직 안 썼으면 보유자 턴에 각 상대의 각 증강을 지목 후보로 낸다
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (lockedList(state, holder).length > 0) return [];
      const opts: { type: string; payload: unknown }[] = [];
      for (const p of state.players) {
        if (p.id === holder) continue;
        for (const augId of p.augments) {
          opts.push({ type: ACTION, payload: { target: p.id, augmentId: augId } });
        }
      }
      return opts;
    });
  },
  /**
   * 봇 — **무엇이 무서운가**를 보고 잠근다.
   *
   * 예전에는 "증강을 가장 많이 든 상대"를 골라 그 사람의 증강 **아무거나** 잠갔다.
   * 옵션에는 `augmentId`가 실려 있는데 그 필드를 한 번도 안 봤다 — 뚫린 천장을 놔두고
   * 붉은 손길을 잠그는 일이 얼마든지 일어난다. 손에 든 장수는 위험의 척도가 아니다.
   *
   * 이제 `AUGMENT_PLAY`의 위협 배수로 고른다 — 그 표는 "이 증강을 든 상대에게 실점하는
   * 것이 몇 배 비싼가"를 담고 있어, 잠글 값어치와 정확히 같은 축이다. 표에 없는 증강은
   * 중립(1.0)이라 **위협이 같으면 예전처럼 많이 든 상대 쪽**으로 갈린다.
   *
   * 위협이 셋 다 도토리 키재기여도 손해는 없다 — 어차피 하나는 잠근다.
   */
  bot: plan({
    intent: "disrupt",
    // 무장해제는 자기 순이면 국이 끝날 때까지 언제든 쓴다 — 1순에 태우면 상대가
    // 무엇을 하려는지 보기도 전에 소모한다. 위협이 서거나 판이 무르익은 뒤가 맞다.
    pick: (ctx) => {
      const { options, view } = ctx;
      const mine = options.filter((o) => o.type === ACTION);
      if (mine.length === 0) return null;
      const augCount = new Map<string, number>();
      for (const p of view.players) augCount.set(p.id, p.augments.length);
      let best = mine[0] ?? null;
      let bestScore = -Infinity;
      for (const o of mine) {
        const p = o.payload as { target?: string; augmentId?: string };
        if (p.augmentId === undefined) continue;
        // 그 한 장이 만드는 위협이 먼저, 같으면 많이 무장한 쪽 (동점은 보유 순서로 끊긴다)
        const threat = threatWeightOf(ctx, [p.augmentId]);
        const count = p.target === undefined ? 0 : (augCount.get(p.target) ?? 0);
        const score = threat * 100 + count;
        if (score > bestScore) {
          bestScore = score;
          best = o;
        }
      }
      return best;
    },
  }),
});
