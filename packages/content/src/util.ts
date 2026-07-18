/**
 * content util — 콘텐츠 팩 증강이 공유하는 작은 도우미들.
 *
 * 규칙:
 * - 모든 난수는 state.prngState에서 이어받고, 소비 결과를 이벤트 payload의
 *   prngState로 되돌려 놓는다 (결정론·리플레이 보장).
 * - 증강 전용 데이터 키는 "<augmentId>:" 접두를 쓴다.
 * - 클라이언트에 보여줄 값은 view:{playerId}:{key} / view:*:{key} 로 쓴다.
 */

import { Prng, ROUND_SETTLED } from "@majak/core";
import type {
  AugmentContext,
  GameState,
  PlayerId,
  RoundSettledPayload,
  WinInfo,
  YakuRegistry,
} from "@majak/core";

/** state.prngState에서 이어지는 PRNG. 사용 후 getState()를 이벤트에 실어라 */
export function statePrng(state: GameState): Prng {
  const prng = new Prng(0);
  prng.setState(state.prngState);
  return prng;
}

/** 현재 국을 식별하는 키 (국이 바뀌면 달라진다 — 국 단위 플래그용) */
export function roundKey(state: GameState): string {
  const r = state.round;
  return `${r.prevalentWind}-${r.roundNumber}-${r.honba}`;
}

/** 본인 전용 뷰 채널 키 (PlayerView.augmentView로 전달됨) */
export function viewKey(player: PlayerId | "*", key: string): string {
  return `view:${player}:${key}`;
}

/**
 * YakuRegistry 단위로 "이 역을 쓸 수 있는 보유자" 집합을 관리한다.
 * 같은 증강을 여러 명이 가져도 역은 한 번만 등록하고,
 * check에서 ctx.winnerId ∈ holders로 판별하는 패턴.
 */
const holderSets = new WeakMap<YakuRegistry, Map<string, Set<PlayerId>>>();

export function yakuHolders(yaku: YakuRegistry, yakuId: string): Set<PlayerId> {
  let byId = holderSets.get(yaku);
  if (byId === undefined) {
    byId = new Map();
    holderSets.set(yaku, byId);
  }
  let holders = byId.get(yakuId);
  if (holders === undefined) {
    holders = new Set();
    byId.set(yakuId, holders);
  }
  return holders;
}

/** augmentData 숫자 카운터 읽기 (없으면 0) */
export function counterOf(state: GameState, key: string): number {
  const v = state.augmentData[key];
  return typeof v === "number" ? v : 0;
}

/** augmentData 불리언 플래그 읽기 */
export function flagOf(state: GameState, key: string): boolean {
  return state.augmentData[key] === true;
}

/** augmentData 문자열 읽기 (없거나 빈 문자열이면 null) */
export function stringOf(state: GameState, key: string): string | null {
  const v = state.augmentData[key];
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * 보유자 화료 시 판을 더하는 score.extraHan 모디파이어를 등록한다.
 * han(state)은 정산 시점의 state로 계산되며, 음수는 0으로 막고 역만에는
 * 엔진이 자동으로 적용하지 않는다. 대부분의 "+N판" 증강이 이걸 쓴다.
 */
export function addHanBonus(
  ctx: AugmentContext,
  han: (state: GameState) => number,
): void {
  ctx.engine.rules.addModifier<number>("score.extraHan", {
    source: ctx.instanceId,
    layer: ctx.layer,
    apply: (cur, rctx) => {
      if (rctx.playerId !== ctx.holder) return cur;
      const state = rctx.state as GameState | undefined;
      if (state === undefined) return cur;
      return cur + Math.max(0, han(state));
    },
  });
}

/**
 * 보유자가 화료한 국의 정산에 보너스 점수를 얹는 ROUND_SETTLED 인터셉터를 등록한다.
 * points(state, info)는 정산 적용 전 state와 보유자의 WinInfo로 계산한다.
 * (판이 아니라 점수를 직접 주므로 상대가 내는 게 아니라 추가로 생기는 점수다.)
 */
export function addWinPointBonus(
  ctx: AugmentContext,
  points: (state: GameState, info: WinInfo) => number,
): void {
  ctx.interceptor(ROUND_SETTLED, (event, ic) => {
    const p = event.payload as RoundSettledPayload;
    if (p.outcome !== "win") return event;
    const info = (p.winInfos ?? []).find((w) => w.winner === ctx.holder);
    if (info === undefined) return event;
    const bonus = Math.max(0, Math.round(points(ic.state, info)));
    if (bonus === 0) return event;
    const deltas = {
      ...p.deltas,
      [ctx.holder]: (p.deltas[ctx.holder] ?? 0) + bonus,
    };
    return { type: event.type, payload: { ...p, deltas } };
  });
}

/**
 * 현상금 계열 헬퍼 — 보유자가 지정된 역(yakuIds 중 하나 이상)을 포함해 화료하면
 * 고정 보너스 점수를 준다. 본인 전용이며, 상대에게는 아무 영향이 없다.
 */
export function yakuBountyBonus(
  ctx: AugmentContext,
  yakuIds: readonly string[],
  points: number,
): void {
  const targets = new Set(yakuIds);
  addWinPointBonus(ctx, (_state, info) =>
    info.yaku.some((y) => targets.has(y.id)) ? points : 0,
  );
}
