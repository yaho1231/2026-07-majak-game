/**
 * 봉인술사 (discard_lock, prism) — 액티브 증강.
 * 자기 턴의 국 시작(첫 행동, 아직 아무것도 버리지 않은 순간)에만 액티브 버튼이 활성화되며,
 * 눌러 발동하면 자신을 제외한 각 상대의 현재 손패에서 무작위 수패 2종류를 봉인해
 * 그 종류의 패를 버릴 수 없게 만든다.
 * 한 번 쓰면 2국이 지나야 다시 쓸 수 있다(2국에 한 번). 재발동하면 상대의 그 시점 손패를
 * 다시 읽어 새 봉인으로 덮어쓴다.
 * (예전엔 첫 국 시작 시 자동으로 상대당 종류를 잠가 게임 내내 지속되는 영구 디버프였다 —
 *  액티브·쿨다운으로 바꿔, 언제 잠글지 고르는 판단과 재사용 타이밍이 걸리게 했다.)
 * 상대는 자기 봉인 패에 자물쇠 표시만 보고(view.sealedKinds — 클릭해 보면 어차피
 * 드러나는 정보), 보유자는 각 상대의 봉인된 '실제' 손패를 진짜 패 그대로 본다
 * (revealTiles:* 채널로 특정 tile id만 노출 — 상대 손패 전체가 새지 않는다).
 *
 * 구현 메모:
 * - 액티브 액션 seal_hands: 자기 턴·turn.act·국 첫 행동(discardedKinds 비어 있음)·쿨다운 종료
 *   조건을 validate가 최종 판정. toEvents가 statePrng로 상대별 봉인 kind를 뽑아
 *   커스텀 이벤트 DiscardLockSealed 하나로 봉인 목록·사용 국 시퀀스·전진된 prngState를 기록.
 * - 봉인 목록은 view:{holder}:sealed:{pid} (보유자 전용 뷰 키)에 kindKey[]로 저장 →
 *   buildPlayerView가 보유자에게만 augmentView로 노출한다. 재발동 시 상대별로 덮어쓴다.
 * - 쿨다운은 국 단위: ROUND_STARTED마다 discard_lock:seq:{holder}를 +1 하고,
 *   발동 국의 시퀀스를 discard_lock:used:{holder}에 남겨 seq-used>=2 일 때만 재발동 허용.
 * - 실제 버림 금지는 discard.blockedKinds 규칙에 Modifier로 얹는다(보유자별 키를 읽음).
 *   보유자 본인은 영향 없음. 손패 전부가 봉인이어도 엔진이 소프트락을 막아준다.
 */

import {
  ROUND_STARTED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isNumberSuit,
  kindKey,
  kindOf,
  playerAtSeat,
} from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId } from "@majak/core";
import { statePrng, viewKey } from "../util.js";

/** 봉인 확정 이벤트 (증강 id에서 파생한 이름 — 다른 증강과 충돌 방지) */
const DISCARD_LOCK_SEALED = "DiscardLockSealed";
/** 액티브 발동 액션 */
const SEAL_ACTION = "seal_hands";
/** 쿨다운(국 단위) — 한 번 쓰면 이만큼 국이 지나야 다시 쓸 수 있다. */
const COOLDOWN_ROUNDS = 2;

interface DiscardLockSealedPayload {
  /** 봉인을 건 보유자 (보유자 전용 키·쿨다운 키에 쓴다) */
  holder: PlayerId;
  /** 상대별 봉인 kindKey 목록 */
  seals: Record<PlayerId, string[]>;
  /** 상대별 봉인된 실제 손패 tile id 목록 (보유자에게 진짜 패로 보여주는 용) */
  sealTiles: Record<PlayerId, number[]>;
  /** 이 발동이 일어난 국 시퀀스 (쿨다운 계산용) */
  usedSeq: number;
  /** 난수 소비 후 전진된 PRNG 상태 (결정론 유지) */
  prngState: number;
}

/** 진행된 국 수 카운터 키 (ROUND_STARTED마다 +1) */
const seqKey = (holder: PlayerId): string => `discard_lock:seq:${holder}`;
/** 마지막으로 봉인을 발동한 국 시퀀스 */
const usedKey = (holder: PlayerId): string => `discard_lock:used:${holder}`;
/** 보유자 전용 봉인 목록 키 (holder만 augmentView로 본다) */
const sealedKey = (holder: PlayerId, target: PlayerId): string =>
  viewKey(holder, `sealed:${target}`);
/** 보유자 전용 봉인 '실제 패' 공개 키 (revealTiles:* 채널 → 진짜 패 메타데이터 노출) */
const revealTilesKey = (holder: PlayerId, target: PlayerId): string =>
  viewKey(holder, `revealTiles:${target}`);

/** 지금까지 진행된 국 시퀀스 (없으면 0) */
function roundSeq(state: GameState, holder: PlayerId): number {
  const v = state.augmentData[seqKey(holder)];
  return typeof v === "number" ? v : 0;
}

/** 쿨다운이 끝나 지금 봉인을 발동할 수 있는가 */
function offCooldown(state: GameState, holder: PlayerId): boolean {
  const used = state.augmentData[usedKey(holder)];
  if (typeof used !== "number") return true; // 한 번도 안 씀
  return roundSeq(state, holder) - used >= COOLDOWN_ROUNDS;
}

/** 보유자의 이번 국 첫 행동인가 (아직 아무 패도 버리지 않음 = "첫 시작") */
function atRoundStart(state: GameState, holder: PlayerId): boolean {
  return (state.round.byPlayer[holder]?.discardedKinds.length ?? 0) === 0;
}

/** 현재 봉인을 발동할 수 있는 상태인지 종합 판정 (턴·페이즈·첫 시작·쿨다운) */
function canSeal(state: GameState, holder: PlayerId): boolean {
  if (state.round.phase !== "turn.act") return false;
  if (playerAtSeat(state, state.round.turnSeat).id !== holder) return false;
  if (!atRoundStart(state, holder)) return false;
  return offCooldown(state, holder);
}

/** 상대별로 현재 손패 수패 kind 중 무작위 최대 2종을 골라 봉인 목록을 만든다. */
function pickSeals(state: GameState, holder: PlayerId): {
  seals: Record<PlayerId, string[]>;
  sealTiles: Record<PlayerId, number[]>;
  prngState: number;
} {
  const prng = statePrng(state);
  const seals: Record<PlayerId, string[]> = {};
  const sealTiles: Record<PlayerId, number[]> = {};
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
    // 무작위 최대 2종 선정 (수패가 2종 미만이면 있는 만큼)
    const picked: string[] = [];
    while (picked.length < 2 && kinds.length > 0) {
      const idx = prng.int(kinds.length);
      picked.push(kinds[idx] as string);
      kinds.splice(idx, 1);
    }
    seals[p.id] = picked;
    // 봉인된 종류에 해당하는 상대의 실제 손패 tile id (보유자에게 진짜 패로 노출)
    const pickedSet = new Set(picked);
    sealTiles[p.id] = handIdsOf(state, p.id).filter((tileId) =>
      pickedSet.has(kindKey(kindOf(state, tileId))),
    );
  }
  return { seals, sealTiles, prngState: prng.getState() };
}

const sealHandsAction: ActionDef<Record<string, never>> = {
  type: SEAL_ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes("discard_lock")) {
      return "no discard_lock augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!atRoundStart(state, req.player)) return "not at round start";
    if (!offCooldown(state, req.player)) return "on cooldown";
    return null;
  },
  toEvents: (req, { state }) => {
    const holder = req.player;
    const { seals, sealTiles, prngState } = pickSeals(state, holder);
    return [
      {
        type: DISCARD_LOCK_SEALED,
        payload: {
          holder,
          seals,
          sealTiles,
          usedSeq: roundSeq(state, holder),
          prngState,
        } satisfies DiscardLockSealedPayload,
      },
    ];
  },
};

export const discardLock: AugmentDef = defineAugment({
  id: "discard_lock",
  tier: "prism",
  category: "disrupt",
  name: "봉인술사",
  description:
    "(2국에 1회) 자기 순의 국 시작(아직 아무 패도 버리지 않은 시점)에 발동하면, 상대 각자의 손패에서 무작위 수패 2종류가 봉인되어 버릴 수 없게 된다.",
  detail:
    "(2국에 1회) 자기 순의 국 시작 시점에만 액티브 버튼이 활성화된다. 발동하면 자신을 제외한 각 상대의 그 시점 손패에서 무작위 수패 2종류가 봉인되어 다음 봉인 전까지 버릴 수 없게 된다. 상대는 자기 봉인 패에 자물쇠 표시만 보고, 나는 각 상대의 봉인된 실제 패를 그대로 확인한다. 재발동하면 상대의 그 시점 손패를 다시 읽어 새 봉인으로 덮어쓴다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 보유자 대응 — payload의 holder로 구분)
    if (!engine.reducers.has(DISCARD_LOCK_SEALED)) {
      engine.reducers.register(DISCARD_LOCK_SEALED, (state, event) => {
        const p = event.payload as DiscardLockSealedPayload;
        const augmentData = { ...state.augmentData };
        // 보유자별 키에 저장 → 다른 보유자와 키가 겹치지 않아 합집합이 필요 없다.
        // 재발동 시 상대별로 새 봉인으로 덮어쓴다.
        for (const [pid, kinds] of Object.entries(p.seals)) {
          augmentData[sealedKey(p.holder, pid)] = kinds;
          // 봉인된 실제 손패 tile id — 보유자에게 진짜 패로 보여준다 (revealTiles:* 채널)
          augmentData[revealTilesKey(p.holder, pid)] = p.sealTiles[pid] ?? [];
        }
        augmentData[usedKey(p.holder)] = p.usedSeq;
        return { ...state, augmentData, prngState: p.prngState };
      });
    }
    if (!engine.actions.has(SEAL_ACTION)) {
      engine.actions.register(sealHandsAction);
    }

    // 국이 시작될 때마다 진행 국 수 카운터를 올린다 (쿨다운 계산 기준)
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      rc.emit(augmentDataSet(seqKey(holder), roundSeq(rc.state, holder) + 1));
    });

    // 발동 조건이 충족된 자기 턴에만 봉인 선택지(액티브 버튼)를 노출
    ctx.holderTurnOptions((state) =>
      canSeal(state, holder) ? [{ type: SEAL_ACTION, payload: {} }] : [],
    );

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
  // 국 시작에만 제시되며 상대 전원의 손패를 묶는 순수 방해 이득(자해 없음) —
  // 제시되면 항상 발동한다.
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === SEAL_ACTION) ?? null;
    },
  },
});
