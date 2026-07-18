/**
 * 봉인술사 (discard_lock, prism) — 첫 국 시작 시 자신을 제외한 각 상대의 손패에서
 * 무작위 수패 3종류를 봉인해 게임 내내 버릴 수 없게 한다.
 * 봉인 목록은 **봉인을 건 본인만** 확인할 수 있다 (상대·다른 플레이어에게는 비공개).
 *
 * 구현 메모:
 * - ROUND_STARTED 반응(완료 플래그 1회)에서 statePrng로 상대별 봉인 kind를 뽑고,
 *   커스텀 이벤트 DiscardLockSealed 하나로 봉인 목록과 전진된 prngState를 기록한다.
 * - 봉인 목록은 view:{holder}:sealed:{pid} (보유자 전용 뷰 키)에 kindKey[]로 저장 →
 *   buildPlayerView가 보유자에게만 augmentView로 노출한다.
 * - 실제 버림 금지는 discard.blockedKinds 규칙에 Modifier로 얹는다(보유자별 키를 읽음).
 *   상대는 봉인 목록을 못 봐도, 봉인된 패는 버림 후보에서 빠져 버릴 수 없다.
 *   보유자 본인은 영향 없음. 손패 전부가 봉인이어도 엔진이 소프트락을 막아준다.
 */

import {
  ROUND_STARTED,
  defineAugment,
  handIdsOf,
  isNumberSuit,
  kindKey,
  kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { statePrng, viewKey } from "../util.js";

/** 봉인 확정 이벤트 (증강 id에서 파생한 이름 — 다른 증강과 충돌 방지) */
const DISCARD_LOCK_SEALED = "DiscardLockSealed";

interface DiscardLockSealedPayload {
  /** 봉인을 건 보유자 (완료 플래그·보유자 전용 키에 쓴다) */
  holder: PlayerId;
  /** 상대별 봉인 kindKey 목록 */
  seals: Record<PlayerId, string[]>;
  /** 난수 소비 후 전진된 PRNG 상태 (결정론 유지) */
  prngState: number;
}

const doneKey = (holder: PlayerId): string => `discard_lock:done:${holder}`;

/** 보유자 전용 봉인 목록 키 (holder만 augmentView로 본다) */
const sealedKey = (holder: PlayerId, target: PlayerId): string =>
  viewKey(holder, `sealed:${target}`);

export const discardLock: AugmentDef = defineAugment({
  id: "discard_lock",
  tier: "prism",
  name: "봉인술사",
  description:
    "첫 국 시작 시 자신을 제외한 각 상대의 손패에서 무작위 수패 3종류가 봉인되어 게임 내내 버릴 수 없다. 봉인 목록은 나만 볼 수 있다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트는 게임당 한 번만 등록 (여러 보유자 대응 — payload의 holder로 구분)
    if (!engine.reducers.has(DISCARD_LOCK_SEALED)) {
      engine.reducers.register(DISCARD_LOCK_SEALED, (state, event) => {
        const p = event.payload as DiscardLockSealedPayload;
        const augmentData = { ...state.augmentData };
        // 보유자별 키에 저장 → 다른 보유자와 키가 겹치지 않아 합집합이 필요 없다
        for (const [pid, kinds] of Object.entries(p.seals)) {
          augmentData[sealedKey(p.holder, pid)] = kinds;
        }
        augmentData[doneKey(p.holder)] = true;
        return { ...state, augmentData, prngState: p.prngState };
      });
    }

    // 첫 국 시작(배패 완료) 시 1회: 상대별로 손패 수패 kind 중 무작위 최대 3종을 봉인
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const state = rc.state;
      if (state.augmentData[doneKey(holder)] === true) return;
      const prng = statePrng(state);
      const seals: Record<PlayerId, string[]> = {};
      for (const p of state.players) {
        if (p.id === holder) continue;
        // 손패의 수패 kind 종류 (등장 순서 유지 → 결정론)
        const kinds: string[] = [];
        for (const tileId of handIdsOf(state, p.id)) {
          const kind = kindOf(state, tileId);
          if (!isNumberSuit(kind)) continue;
          const key = kindKey(kind);
          if (!kinds.includes(key)) kinds.push(key);
        }
        // 무작위 최대 3종 선정 (수패가 3종 미만이면 있는 만큼)
        const picked: string[] = [];
        while (picked.length < 3 && kinds.length > 0) {
          const idx = prng.int(kinds.length);
          picked.push(kinds[idx] as string);
          kinds.splice(idx, 1);
        }
        seals[p.id] = picked;
      }
      rc.emit({
        type: DISCARD_LOCK_SEALED,
        payload: {
          holder,
          seals,
          prngState: prng.getState(),
        } satisfies DiscardLockSealedPayload,
      });
    });

    // 봉인된 kind는 버릴 수 없다 (보유자 본인은 영향 없음). 보유자별 키를 읽어
    // 여러 보유자가 있으면 각 봉인이 함께 적용된다 (Modifier 누적).
    engine.rules.addModifier<string[]>("discard.blockedKinds", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (current, rctx) => {
        if (rctx.playerId === undefined || rctx.playerId === holder) return current;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return current;
        const sealed = state.augmentData[sealedKey(holder, rctx.playerId)];
        if (!Array.isArray(sealed)) return current;
        return [...current, ...(sealed as string[])];
      },
    });
  },
});
