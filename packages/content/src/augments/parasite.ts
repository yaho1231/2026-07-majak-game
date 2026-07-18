/**
 * 기생충 (parasite, prism) — 자기 턴에 상대 한 명에게 기생한다 (게임당 1회 지정).
 * 숙주가 정산에서 얻는 점수의 절반(100점 단위)을 대신 받고, 잃는 점수의 절반을
 * 대신 잃는다. 숙주가 화료하거나 론을 맞으면 기생 대상이 숙주의 다음 차례
 * 플레이어로 옮겨간다 (그게 보유자 자신이면 한 자리 더 건너뜀).
 *
 * 구현 메모:
 * - 지정은 augmentData "parasite:target:{holder}"에 대상만 저장하고
 *   viewKey("*", ...)로 전원에게 공개한다. 기생은 해제되지 않고 옮겨갈 뿐이므로
 *   대상 키의 존재 자체가 "게임당 1회" 사용 플래그다 (별도 used 키 불필요).
 * - ROUND_SETTLED Interceptor에서 숙주 delta의 절반을 보유자에게 이전한다.
 *   숙주에게서 뺀 만큼 그대로 보유자에게 더하므로 정산 합계(제로섬)가 보존된다.
 * - ROUND_SETTLED Reaction에서 숙주의 화료·방총을 감지해 대상을 이동한다.
 */

import {
  ROUND_SETTLED,
  augmentDataSet,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { stringOf, viewKey } from "../util.js";

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
  name: "기생충",
  description:
    "자기 턴에 상대 한 명에게 기생한다(게임당 1회 지정). 숙주가 정산에서 얻는 점수의 절반을 대신 받고, 잃는 점수의 절반을 대신 잃는다. 숙주가 화료하거나 론을 맞으면 기생 대상이 다음 차례 플레이어로 옮겨간다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has("parasite_attach")) {
      engine.actions.register(parasiteAttachAction);
    }

    // 정산 가로채기 — 숙주 증감의 절반(100점 단위)을 보유자에게 이전한다.
    // 숙주에게서 뺀 share를 그대로 보유자에게 더하므로 deltas 합계는 불변.
    ctx.interceptor(ROUND_SETTLED, (event, ic) => {
      const host = stringOf(ic.state, targetKey(holder));
      if (host === null) return event;
      const p = event.payload as RoundSettledPayload;
      const d = p.deltas[host] ?? 0;
      if (d === 0) return event;
      const share = Math.round(d / 200) * 100;
      if (share === 0) return event;
      const deltas = {
        ...p.deltas,
        [host]: d - share,
        [holder]: (p.deltas[holder] ?? 0) + share,
      };
      return { type: event.type, payload: { ...p, deltas } };
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
});
