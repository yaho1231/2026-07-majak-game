/**
 * 기생충 (parasite, prism) — 자기 턴에 상대 한 명에게 기생한다 (게임당 1회 지정).
 * 숙주가 정산에서 얻는 점수의 절반(100점 단위)을 대신 받는다. 숙주가 잃는 국에는
 * 아무 영향이 없다. 숙주가 화료하거나 론을 맞으면 기생 대상이 숙주의 다음 차례
 * 플레이어로 옮겨간다 (그게 보유자 자신이면 한 자리 더 건너뜀).
 *
 * 구현 메모:
 * - 지정은 augmentData "parasite:target:{holder}"에 대상만 저장하고
 *   viewKey("*", ...)로 전원에게 공개한다. 기생은 해제되지 않고 옮겨갈 뿐이므로
 *   대상 키의 존재 자체가 "게임당 1회" 사용 플래그다 (별도 used 키 불필요).
 * - ROUND_SETTLED Interceptor에서 숙주 delta가 양수일 때만 그 절반을 보유자에게
 *   이전한다. 숙주에게서 뺀 만큼 그대로 보유자에게 더하므로 정산 합계(제로섬)가 보존된다.
 * - ROUND_SETTLED Reaction에서 숙주의 화료·방총을 감지해 대상을 이동한다.
 */

import {
  augmentDataSet,
  defineAugment,
  playerAtSeat,
  ROUND_SETTLED,
  SETTLE_STAGE,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import {
  settleInterceptor,
  stringOf,
  viewKey,
  withAugPoint,
} from "../util.js";

/** 기생 대상 키: 지정 후엔 항상 PlayerId (이동만 하고 해제되지 않는다) */
const targetKey = (holder: PlayerId): string => `parasite:target:${holder}`;
/** 전원 공개 뷰 키 (현재 숙주 표시용) */
const targetViewKey = (holder: PlayerId): string =>
  viewKey("*", `parasite:${holder}`);

const parasiteAttachAction: ActionDef<{ target: PlayerId }> = {
  type: "parasite_attach",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes("parasite")) return "no parasite augment";
    if (stringOf(state, targetKey(req.player)) !== null) {
      return "parasite already attached";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (req.payload.target === req.player) return "cannot attach to yourself";
    if (!state.players.some((p) => p.id === req.payload.target)) {
      return "unknown target";
    }
    return null;
  },
  toEvents: (req) => [
    augmentDataSet(targetKey(req.player), req.payload.target),
    augmentDataSet(targetViewKey(req.player), req.payload.target),
  ],
};

export const parasite: AugmentDef = defineAugment({
  id: "parasite",
  tier: "prism",
  category: "disrupt",
  name: "기생충",
  description:
    "(게임 내 1회) 자기 순에 상대 한 명에게 기생한다. 숙주가 정산에서 얻는 점수의 절반을 대신 가져오며, 숙주가 화료하거나 론을 맞으면 기생 대상이 다음 차례 플레이어로 옮겨간다.",
  detail:
    "(게임 내 1회) 자기 순에 상대 한 명을 공개 지정해 기생한다. 숙주가 정산에서 얻는 점수의 절반(100점 단위)을 대신 가져오며, 숙주가 잃는 국에는 아무 영향이 없고 테이블 총점도 변하지 않는다. 숙주가 화료하거나 론을 맞으면 기생 대상이 그다음 차례 플레이어로 옮겨간다(자기 자리면 한 자리 더 건너뛴다). 기생은 해제되지 않고 옮겨 다니므로 지정 자체는 한 번뿐이다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has("parasite_attach")) {
      engine.actions.register(parasiteAttachAction);
    }

    // 정산 가로채기 — 숙주 증감의 절반(100점 단위)을 보유자에게 이전한다.
    // 숙주에게서 뺀 share를 그대로 보유자에게 더하므로 deltas 합계는 불변.
    // 정산 단계: Transfer — 숙주 획득의 절반 강탈 — 최종 획득 기준.
    settleInterceptor(ctx, SETTLE_STAGE.Transfer, (event, ic) => {
      const host = stringOf(ic.state, targetKey(holder));
      if (host === null) return event;
      const p = event.payload as RoundSettledPayload;
      const d = p.deltas[host] ?? 0;
      if (d === 0) return event;
      // 48차 무페널티: 숙주가 잃을 때는 함께 잃지 않는다 — 이득만 빨아먹는다
      if (d <= 0) return event;
      const share = Math.round(d / 200) * 100;
      if (share === 0) return event;
      const deltas = {
        ...p.deltas,
        [host]: d - share,
        [holder]: (p.deltas[holder] ?? 0) + share,
      };
      return {
        type: event.type,
        payload: { ...p, deltas, augPoints: withAugPoint(p, ctx, share) },
      };
    });

    // 숙주가 화료했거나(winner) 론을 맞았으면(ron의 from) 기생 대상을
    // 숙주의 다음 자리 플레이어로 옮긴다. 보유자 자신은 건너뛴다.
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const host = stringOf(rc.state, targetKey(holder));
      if (host === null) return;
      const p = event.payload as RoundSettledPayload;
      const hit = (p.winInfos ?? []).some(
        (w) => w.winner === host || (w.winType === "ron" && w.from === host),
      );
      if (!hit) return;
      const hostSeat = rc.state.players.find((x) => x.id === host)?.seat;
      if (hostSeat === undefined) return;
      const n = rc.state.players.length;
      let next = playerAtSeat(rc.state, (hostSeat + 1) % n);
      if (next.id === holder) next = playerAtSeat(rc.state, (hostSeat + 2) % n);
      rc.emit(augmentDataSet(targetKey(holder), next.id));
      rc.emit(augmentDataSet(targetViewKey(holder), next.id));
    });

    // 아직 지정 전에만 상대별 후보를 턴 프롬프트에 노출 (validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (stringOf(state, targetKey(holder)) !== null) return [];
      return state.players
        .filter((p) => p.id !== holder)
        .map((p) => ({ type: "parasite_attach", payload: { target: p.id } }));
    });
  },
  // 숙주가 버는 점수의 절반을 나눠 받는다(숙주가 화료할수록 이득) — 가장 점수가 높은
  // 상대(리드 중이라 계속 벌 가능성이 큰 쪽)에 기생한다. 없으면 첫 상대.
  bot: {
    choose({ options, view, holder }) {
      const mine = options.filter((o) => o.type === "parasite_attach");
      if (mine.length === 0) return null;
      const scoreOf = new Map<string, number>();
      for (const p of view.players) if (p.id !== holder) scoreOf.set(p.id, p.score);
      let best = mine[0] ?? null;
      let bestScore = -Infinity;
      for (const o of mine) {
        const target = (o.payload as { target?: string }).target;
        const s = target === undefined ? -Infinity : (scoreOf.get(target) ?? -Infinity);
        if (s > bestScore) {
          bestScore = s;
          best = o;
        }
      }
      return best;
    },
  },
});
