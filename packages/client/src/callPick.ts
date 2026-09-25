/**
 * 후로 고르기(callPick) — 같은 종류의 후로 변형을 버튼 하나로 접고 손패로 좁힌다 (2026-09-25, docs/59 U56).
 *
 * 액션 바는 서버 옵션마다 버튼을 세웠다. 적도라가 끼면 치 5개, 무너진 국경을 선언하면 무늬 조합마다
 * 치가 22개(1280×800 실측)까지 서서, 리액션 타이머가 도는 동안 같은 [치] 버튼들을 미니패로 대조해야
 * 했다. 실제로 고르는 것은 «내 손패의 어느 두 장»이고 그 손패는 바로 아래에 크게 있다 — 버튼은
 * «무엇을 할지»(치·퐁·깡)만 고르고 «무엇으로»는 손패를 눌러 정한다(docs/59 §2 원칙 1·4).
 *
 * ⚠ 제출은 언제나 **서버가 준 옵션 객체 그대로**다. 서버(HumanAgent)는 payload를 JSON 완전일치로
 * 대조하므로, 누른 손패의 id로 payload를 다시 만들면 거부된다. 서버 후보는 종류마다 대표 id(일반 1·적 1)
 * 만 쓰므로 누른 패와는 (종류, 적도라) 서명으로 짝을 짓는다 — 같은 서명의 다른 장을 눌러도 같은 수다.
 *
 * App.tsx 밖에 두는 것은 순수 함수라 렌더 없이 동작을 시험할 수 있어서다(test/callPickB17.test.ts).
 */

import { kindKey } from "@majak/core";
import type { ActionOption, PlayerView } from "@majak/core";

/** 손패 몇 장을 함께 쓰는 콜 — 같은 타입이 여럿이면 버튼 하나로 접는다 */
export const CALL_PICK_TYPES: ReadonlySet<string> = new Set([
  "chi",
  "pon",
  "minkan",
  "ankan",
  "shouminkan",
  "kokushi_pon",
]);

/**
 * 후로 고르기 안내 줄에 남은 후보를 칩으로 늘어놓는 상한. 손패만으로는 못 가르는 드문 경우(가깡의 퐁이
 * 둘)와 키보드(숫자 1..N)의 길이다. 이보다 많으면 칩 없이 손패로 먼저 좁힌다 — 칩이 곧 옛 버튼 줄이
 * 되면 접은 뜻이 없다(§2 원칙 4 «5개 미만»).
 */
export const CALL_PICK_CHIP_MAX = 4;

/** 후로 고르기 상태 — 어느 종류를 고르는 중이고, 손패에서 무엇을 눌렀나 */
export interface CallPick {
  type: string;
  /** 그 종류의 서버 옵션 전부(프롬프트 그대로의 객체) */
  options: ActionOption[];
  /** 누른 내 손패 id — 서명으로만 대조한다 */
  picks: number[];
  /** 누른 패와 어긋나지 않는 후보(options 순서 그대로) */
  remaining: ActionOption[];
  /**
   * 키보드 ←→로 짚은 남은 후보의 자리(remaining 인덱스). 칩이 서지 않는 많은 후보(CALL_PICK_CHIP_MAX 초과)
   * 에서 키보드로 특정 후보를 고르는 길이다 — 누르기 전에는 null. 손패를 눌러 후보가 바뀌면 다시 null.
   */
  cursor: number | null;
  /**
   * 가깡: 누른 **내 퐁 후로**의 대표 패 id(payload.targetMeldTileId와 같은 값). 가깡이 무엇을 할지는
   * «어느 퐁에 붙이나»라 판의 실물 퐁을 눌러 고른다(docs/59 U56 3단계 · §2 원칙 1). 안 눌렀으면 null.
   * 선택적인 것은 치·퐁에는 없는 축이라서다(없으면 null과 같다).
   */
  meld?: number | null;
}

/** 가깡 후보가 붙는 퐁의 대표 패 id(payload.targetMeldTileId) — 가깡이 아니면 null */
export function callPickMeldTarget(o: ActionOption): number | null {
  const t = (o.payload as { targetMeldTileId?: unknown } | undefined)?.targetMeldTileId;
  return typeof t === "number" ? t : null;
}

/** 후로 후보가 쓰는 내 손패 id — chi·pon·깡·국사 퐁은 tileIds, 가깡은 손패 한 장(tileId) */
export function callPickTileIds(o: ActionOption): number[] | null {
  const p = (o.payload ?? {}) as { tileIds?: unknown; tileId?: unknown };
  if (Array.isArray(p.tileIds)) {
    return p.tileIds.every((x) => typeof x === "number") ? (p.tileIds as number[]) : null;
  }
  return typeof p.tileId === "number" ? [p.tileId] : null;
}

/** 패 서명 — 종류 + 적도라. 서버 후보가 가르는 기준이 이 둘이다(FlowController chiCandidates·퐁 조합) */
export function callTileSig(view: PlayerView, id: number): string | null {
  const t = view.tiles[id];
  if (t === undefined) return null;
  return `${kindKey(t.kind)}${t.attrs?.red === true ? "*" : ""}`;
}

/** 후보의 서명 멀티셋(정렬) — 쓰는 패가 전부 내 손패에 보일 때만. 아니면 null(묶지 않는다) */
export function callPickSigs(view: PlayerView, o: ActionOption): string[] | null {
  const ids = callPickTileIds(o);
  if (ids === null || ids.length === 0) return null;
  const hand = new Set(view.zones[`hand:${view.playerId}`]?.tileIds ?? []);
  const sigs: string[] = [];
  for (const id of ids) {
    if (!hand.has(id)) return null;
    const s = callTileSig(view, id);
    if (s === null) return null;
    sigs.push(s);
  }
  return sigs.sort();
}

/** 멀티셋 포함 — sub의 서명이 sup에 장수까지 들어 있는가 */
export function sigSubset(sub: readonly string[], sup: readonly string[]): boolean {
  const left = new Map<string, number>();
  for (const s of sup) left.set(s, (left.get(s) ?? 0) + 1);
  for (const s of sub) {
    const n = left.get(s) ?? 0;
    if (n === 0) return false;
    left.set(s, n - 1);
  }
  return true;
}

/**
 * 두 후보가 손패로는 같은 수인가 — 서명 멀티셋이 같고, 패 말고 나머지 payload(가깡의 대상 퐁 등)도 같다.
 * 같으면 어느 쪽을 내도 결과가 같으므로 더 고르게 하지 않는다.
 */
export function sameCallChoice(view: PlayerView, a: ActionOption, b: ActionOption): boolean {
  const sa = callPickSigs(view, a);
  const sb = callPickSigs(view, b);
  if (sa === null || sb === null || sa.join("|") !== sb.join("|")) return false;
  const rest = (o: ActionOption): string => {
    const other: Record<string, unknown> = { ...((o.payload ?? {}) as Record<string, unknown>) };
    delete other.tileIds;
    delete other.tileId;
    return JSON.stringify(other);
  };
  return rest(a) === rest(b);
}

/** 누른 패의 서명 멀티셋을 품는 후보만 — 가깡에서 퐁을 눌렀으면(meld) 그 퐁에 붙는 후보만 */
export function callPickRemaining(
  view: PlayerView,
  options: readonly ActionOption[],
  picks: readonly number[],
  meld: number | null = null,
): ActionOption[] {
  const pickSigs = picks.map((id) => callTileSig(view, id) ?? "");
  return options.filter((o) => {
    if (meld !== null && callPickMeldTarget(o) !== meld) return false;
    const sigs = callPickSigs(view, o);
    return sigs !== null && sigSubset(pickSigs, sigs);
  });
}

/**
 * 이 손패를 지금 누를 수 있는가 — 이미 고른 패이거나, 고른 패에 더해도 남는 후보가 있을 때.
 * 누를 수 있는 패만 밝히므로, 누르면 후보가 0개가 되는 일은 없다.
 */
export function callPickArmableIn(view: PlayerView, pick: CallPick, id: number): boolean {
  if (pick.picks.includes(id)) return true;
  const sig = callTileSig(view, id);
  if (sig === null) return false;
  const next = [...pick.picks.map((x) => callTileSig(view, x) ?? ""), sig];
  return pick.remaining.some((o) => {
    const sigs = callPickSigs(view, o);
    return sigs !== null && sigSubset(next, sigs);
  });
}

/**
 * 손패 한 장을 누른 결과 — 대상이 아니면 null, 아니면 새 고른 패와 (정해졌다면) 낼 서버 옵션.
 *
 * 하나로 정해지면(또는 남은 후보가 손패로는 모두 같은 수면) 곧바로 낸다 — [확인]은 두지 않는다.
 * 파괴적인 수가 아니고(치·퐁은 부르는 것뿐) 리액션 타이머가 돌고 있어 한 번이라도 덜 누르게 한다.
 * 다시 누르면 그 패를 뺀다.
 */
export function resolveCallPick(
  view: PlayerView,
  pick: CallPick,
  id: number,
): { picks: number[]; submit: ActionOption | null } | null {
  const on = pick.picks.includes(id);
  if (!on && !callPickArmableIn(view, pick, id)) return null;
  const picks = on ? pick.picks.filter((x) => x !== id) : [...pick.picks, id];
  const rem = callPickRemaining(view, pick.options, picks, pick.meld ?? null);
  const head = rem[0];
  const settled = head !== undefined && picks.length > 0 && rem.every((o) => sameCallChoice(view, o, head));
  return { picks, submit: settled ? head : null };
}

/**
 * 가깡 고르기에서 이 퐁 후로(meldTileIds)에 붙는 후보 — 누른 손패는 지키고, 앞서 누른 다른 퐁은 무시한다
 * (다른 퐁을 누르면 그쪽으로 갈아타는 것이라서). 가깡이 아니면 늘 빈 배열이다.
 */
export function callPickMeldOptions(
  view: PlayerView,
  pick: CallPick,
  meldTileIds: readonly number[],
): ActionOption[] {
  if (pick.type !== "shouminkan") return [];
  return callPickRemaining(view, pick.options, pick.picks).filter((o) => {
    const t = callPickMeldTarget(o);
    return t !== null && meldTileIds.includes(t);
  });
}

/**
 * 퐁 후로 한 벌을 누른 결과(가깡 고르기) — 대상이 아니면 null, 아니면 새 퐁 선택과 (정해졌다면) 낼 서버 옵션.
 *
 * 퐁 둘에 붙을 수 있는 가깡(1만 퐁·9통 퐁에 손패 1만·9통)은 퐁 한 번이면 정해진다. 같은 퐁에 붙는
 * 손패가 둘로 갈리면(일반 5·적5) 퐁을 고른 채 손패로 좁힌다. 이미 고른 퐁을 다시 누르면 푼다 —
 * 손패 누르기와 같은 규칙이다. 제출은 손패와 같이 **서버 옵션 객체 그대로**다.
 */
export function resolveCallPickMeld(
  view: PlayerView,
  pick: CallPick,
  meldTileIds: readonly number[],
): { meld: number | null; submit: ActionOption | null } | null {
  const cur = pick.meld ?? null;
  if (cur !== null && meldTileIds.includes(cur)) return { meld: null, submit: null };
  const hit = callPickMeldOptions(view, pick, meldTileIds);
  const head = hit[0];
  if (head === undefined) return null;
  const settled = hit.every((o) => sameCallChoice(view, o, head));
  return { meld: callPickMeldTarget(head), submit: settled ? head : null };
}
