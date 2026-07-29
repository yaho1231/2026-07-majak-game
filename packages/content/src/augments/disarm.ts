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
  ROUND_SETTLED,
  augmentDataSet,
  augmentDisarmed,
  augmentInstanceId,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId } from "@majak/core";
import { counterOf, matchUses, viewKey } from "../util.js";

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
const lockedKey = (h: PlayerId): string => `${ID}:locked:${h}`;

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
      augmentDataSet(viewKey("*", `${ID}:${req.player}`), {
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
  // 동풍전 1·반장전 2회 — 증강을 가장 많이 든 상대의 능력 하나를 잠근다(방해 이득, 자해 없음).
  // 대상 증강의 강약까지는 판단하지 못하므로, 가장 많이 무장한 상대를 노려 무장 하나를 뺀다.
  bot: {
    choose({ options, view }) {
      const mine = options.filter((o) => o.type === ACTION);
      if (mine.length === 0) return null;
      const augCount = new Map<string, number>();
      for (const p of view.players) augCount.set(p.id, p.augments.length);
      let best = mine[0] ?? null;
      let bestN = -1;
      for (const o of mine) {
        const target = (o.payload as { target?: string }).target;
        const n = target === undefined ? 0 : (augCount.get(target) ?? 0);
        if (n > bestN) {
          bestN = n;
          best = o;
        }
      }
      return best;
    },
  },
});
