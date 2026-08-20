/**
 * 봉인술사 (discard_lock, prism) — 액티브 증강.
 * 자기 턴의 국 시작(첫 행동, 아직 아무것도 버리지 않은 순간)에만 액티브 버튼이 활성화되며,
 * 눌러 발동하면 자신을 제외한 각 상대의 현재 손패에서 무작위 수패 2종류를 골라
 * **그 순간 손에 있던 그 패들**을 버릴 수 없게 잠근다.
 * 한 번 쓰면 2국이 지나야 다시 쓸 수 있다(2국에 한 번).
 * (예전엔 첫 국 시작 시 자동으로 상대당 종류를 잠가 게임 내내 지속되는 영구 디버프였다 —
 *  액티브·쿨다운으로 바꿔, 언제 잠글지 고르는 판단과 재사용 타이밍이 걸리게 했다.)
 * 상대는 자기 봉인 패에 자물쇠 표시만 보고(view.sealedTileIds — 클릭해 보면 어차피
 * 드러나는 정보), 보유자는 각 상대의 봉인된 '실제' 손패를 진짜 패 그대로 본다
 * (discardLockReveal:* 채널로 특정 tile id만 노출 — 상대 손패 전체가 새지 않는다).
 *
 * # 봉인은 그 국까지, 잠기는 것은 그 2장뿐 (2026-07-31 사용자 확정)
 *
 * 두 가지가 과했다:
 * - **종류 단위**로 잠가서, 봉인 뒤 같은 종류를 새로 쯔모하면 그 새 패까지 함께 묶였다.
 *   지금은 발동 시점 손패의 그 패들(tileId)만 잠근다 — 새로 들어온 같은 종류는 자유다.
 * - 봉인이 **국을 넘어** 다음 봉인 때까지 유지됐다. 지금은 국이 끝나면 풀린다
 *   (봉인 키가 roundViewKey라 setupRound가 국 경계에서 지운다).
 *
 * 구현 메모:
 * - 액티브 액션 seal_hands: 자기 턴·turn.act·국 첫 행동(discardedKinds 비어 있음)·쿨다운 종료
 *   조건을 validate가 최종 판정. toEvents가 statePrng로 상대별 봉인 kind를 뽑아
 *   커스텀 이벤트 DiscardLockSealed 하나로 봉인 목록·사용 국 시퀀스·전진된 prngState를 기록.
 * - 봉인 목록은 view:{holder}:sealed:{pid}(종류 표시용)·view:{holder}:discardLockReveal:{pid}
 *   (실제 잠긴 tileId)에 저장한다 — 둘 다 국 스코프 키다.
 * - 쿨다운은 국 단위: ROUND_STARTED마다 discard_lock:seq:{holder}를 +1 하고,
 *   발동 국의 시퀀스를 discard_lock:used:{holder}에 남겨 seq-used>=2 일 때만 재발동 허용.
 * - 실제 버림 금지는 discard.blockedTileIds 규칙에 Modifier로 얹는다(보유자별 키를 읽음).
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
import { cooldownViewKey, roundViewKey, statePrng } from "../util.js";
import { plan } from "./botPlan.js";

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
  roundViewKey(holder, `sealed:${target}`);
/**
 * 봉인된 **실제 패의 tileId 목록**.
 *
 * 두 역할을 겸한다:
 * ① 보유자에게 진짜 패로 보여주는 공개 채널(`discardLockReveal:*` 전용 채널 — 명시된 tile id만
 *   노출. `revealTiles:*`는 hand_swap3 등 다른 증강도 같은 이름 규약을 써서 동시 보유 시
 *   충돌했다 — 봉인 판정의 실체이기도 한 이 값은 별도 채널을 쓴다, 2026-08 감사).
 * ② `discard.blockedTileIds` 규칙이 읽는 **봉인 판정의 실체** — 봉인은 종류가 아니라
 *    이 목록에 담긴 그 패들만 잠근다. 목록은 발동 시점의 손패로 고정되므로,
 *    그 뒤 같은 종류를 새로 쯔모해도 그 새 패는 잠기지 않는다.
 */
// 예전엔 `revealTiles:{target}`을 썼는데, 다른 view 채널 증강(hand_swap3 등)도
// 같은 이름 규약을 쓴다 — augmentData가 키 문자열 하나에 값 하나뿐이라, 두 증강을
// 동시에 보유하고 같은 상대를 지목하면 서로 덮어썼다(이 값은 discard.blockedTileIds가
// 읽는 봉인 판정의 실체이기도 해서 단순 표시 버그가 아니라 실제 봉인이 틀어졌다).
// 전용 채널로 분리해 충돌을 막는다(2026-08 감사, docs/22 §12-20).
// ⚠ 이름을 바꿀 때 코어의 '실제 패 공개' 루프(`PlayerView.ts`의 REVEAL_TILE_PREFIXES)에
// 같이 등록해야 한다 — 그때 빠뜨려서 보유자가 봉인된 실제 패를 못 보고 종류 폴백만
// 봤다(qa-lab disrupt-a 확정 1). 지금은 두 접두어가 모두 등록돼 있다.
const sealTilesKey = (holder: PlayerId, target: PlayerId): string =>
  roundViewKey(holder, `discardLockReveal:${target}`);

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
  return (state.round.byPlayer[holder]?.discardCount ?? 0) === 0;
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
  complexity: 2,
  name: "봉인술사",
  description:
    "(2국에 1회) 자기 순의 국 시작(아직 아무 패도 버리지 않은 시점)에 발동하면, 상대 각자의 손패에서 무작위 수패 2종류에 해당하는 그 순간의 패들이 이번 국 동안 봉인되어 버릴 수 없게 된다.",
  detail:
    "(2국에 1회) 자기 순의 국 시작 시점에만 액티브 버튼이 활성화된다. 발동하면 자신을 제외한 각 상대의 그 시점 손패에서 무작위 수패 2종류를 골라, 지금 손에 들고 있는 그 패들을 이번 국 동안 버릴 수 없게 잠근다. 잠기는 것은 그 순간의 패뿐이라 같은 종류를 나중에 새로 쯔모하면 그 패는 자유롭게 버릴 수 있고, 국이 끝나면 봉인은 모두 풀린다. 상대는 자기 봉인 패에 자물쇠 표시만 보고, 나는 각 상대의 봉인된 실제 패를 그대로 확인한다.",
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
          // 봉인된 실제 손패 tile id — 보유자에게 진짜 패로 보여준다 (discardLockReveal:* 채널)
          augmentData[sealTilesKey(p.holder, pid)] = p.sealTiles[pid] ?? [];
        }
        augmentData[usedKey(p.holder)] = p.usedSeq;
        return { ...state, augmentData, prngState: p.prngState };
      });
    }
    if (!engine.actions.has(SEAL_ACTION)) {
      engine.actions.register(sealHandsAction);
    }

    // 국이 시작될 때마다 진행 국 수 카운터를 올린다 (쿨다운 계산 기준).
    // 봉인 목록(종류·실물 tileId)은 국 스코프 키라 setupRound가 이미 지웠다 —
    // 지난 국의 tileId가 다음 국 내내 보유자에게 노출되던 문제(2026-07-29 감사)와
    // 봉인이 국을 넘어 살아남던 문제(2026-07-31)가 여기서 함께 끝난다.
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const seq = roundSeq(rc.state, holder) + 1;
      rc.emit(augmentDataSet(seqKey(holder), seq));
      // 남은 쿨다운을 공용 채널로도 낸다 — 자체 카운터만 쓰던 탓에 이름표의 `🕐N국`
      // 칩이 서지 않아, 버튼이 사라진 이유를 화면에서 알 수 없었다.
      const used = rc.state.augmentData[usedKey(holder)];
      const left = typeof used === "number" ? Math.max(0, COOLDOWN_ROUNDS - (seq - used)) : 0;
      rc.emit(augmentDataSet(cooldownViewKey("discard_lock", holder), left));
    });

    // 발동 조건이 충족된 자기 턴에만 봉인 선택지(액티브 버튼)를 노출
    ctx.holderTurnOptions((state) =>
      canSeal(state, holder) ? [{ type: SEAL_ACTION, payload: {} }] : [],
    );

    // 봉인된 **그 2장**만 버릴 수 없다 (보유자 본인은 영향 없음). 보유자별 키를 읽어
    // 여러 보유자가 있으면 각 봉인이 함께 적용된다 (Modifier 누적).
    //
    // ⚠ 종류 단위(discard.blockedKinds)가 아니라 개별 패(discard.blockedTileIds)다 —
    // 봉인 뒤 같은 종류를 새로 쯔모해도 그 새 패는 자유롭게 버릴 수 있어야 한다
    // (2026-07-31 사용자 확정: "처음 선택된 2개만 봉인").
    engine.rules.addModifier<number[]>("discard.blockedTileIds", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (current, rctx) => {
        if (rctx.playerId === undefined || rctx.playerId === holder) return current;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return current;
        const sealed = state.augmentData[sealTilesKey(holder, rctx.playerId)];
        if (!Array.isArray(sealed)) return current;
        return [...current, ...(sealed as number[])];
      },
    });
  },
  // 국 시작에만 제시되며 상대 전원의 손패를 묶는 순수 방해 이득(자해 없음) —
  // 제시되면 항상 발동한다.
  bot: plan({
    intent: "disrupt",
    fleeting: true,
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === SEAL_ACTION) ?? null,
  }),
});
