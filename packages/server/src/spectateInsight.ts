/**
 * 중계 관전 보조 계산 — **예상 타점**과 **위험패** (docs/36 A2·A4).
 *
 * ## 왜 서버인가
 * 둘 다 이미 이 저장소 안에 있다 — 봇이 매 순 쓰는 값어치 모형(`bot/value.ts`)과
 * 위협 읽기(`bot/danger.ts`)다. 중계용으로 같은 계산을 클라이언트에 한 벌 더 쓰면
 * 두 모형이 조용히 갈라진다: 화면이 「5200점」이라 적는데 봇은 8000점으로 판단하는
 * 순간, 둘 중 하나는 거짓말이고 어느 쪽인지 알 수 없다. **판이 실제로 쓰는 눈**을
 * 그대로 중계에 얹는다.
 *
 * ## 이 값들은 추정이다
 * `estimateHandValue`는 «지금 이 손이 화료하면 대략 얼마»를 재는 휴리스틱이다 —
 * 실제 정산기(코어)가 아니다. 아직 완성되지 않은 손의 확정 타점이라는 것은 존재하지
 * 않으므로 그게 맞는 층위지만, 화면에는 **추정임을 적어야 한다**.
 *
 * ## 관전 뷰에서만 돈다
 * 손패가 전부 공개된 시점에서만 의미가 있고, 그 시점은 관전자에게만 간다.
 * 대국자에게는 이 메시지가 한 글자도 가지 않는다.
 */

import {
  SPECTATOR_ID,
  doraKindFor,
  handZone,
  kindKey,
  meldsZone,
  shantenOf,
} from "@majak/core";
import type {
  DecomposeOptions,
  PlayerView,
  SpectateInsightMessage,
  TileKind,
} from "@majak/core";
import { estimateHandValue } from "./bot/value.js";
import { NEUTRAL_DEFENSE, readThreats, safetyOf, tileTracker } from "./bot/danger.js";

/** 이 뷰에서 한 좌석이 쥔 패의 종류 (관전 뷰라 전부 보인다). */
function kindsOf(view: PlayerView, zoneId: string): TileKind[] {
  const out: TileKind[] = [];
  for (const id of view.zones[zoneId]?.tileIds ?? []) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) out.push(k);
  }
  return out;
}

/**
 * **한 장 버린 뒤의 최선 샹텐** — 14장(3n+2) 시점의 옳은 셈 (docs/36:101).
 *
 * 예전에는 `hand.slice(0, -1)`, 즉 **배열의 마지막 한 장**을 그냥 잘라 냈다. 그 자리는
 * 손패 배치(`handOrder`)에 따라 아무 패나 될 수 있고 최선의 버림도 아니다 — 실측에서
 * 14장 시점 64건 중 22건(34%)이 좌석 뱃지와 어긋났고, 어긋날 때는 언제나 «한 단계 나쁘게»
 * 나왔다. 텐파이인 좌석을 1샹텐이라 읽는 일이 실제로 났다. 해설이 읽는 숫자다.
 *
 * 클라이언트 좌석 뱃지(`App.tsx`)는 처음부터 모든 버림 후보를 돌려 최소값을 쓴다 —
 * 같은 화면의 두 숫자가 다른 셈을 쓸 이유가 없으므로 여기를 그쪽에 맞춘다
 * (QA 2차 spectate 확정 2).
 *
 * 같은 종류가 여러 장이면 결과가 같으므로 **종류 단위로 한 번씩만** 잰다 — 14장이면
 * 최대 14회가 최대 13회로 줄고, 실제로는 대개 그보다 훨씬 적다(`s12`가 잰 1회 0.44ms의
 * 예산 안에 있어야 한다).
 */
function bestShanten(
  hand: readonly TileKind[],
  meldCount: number,
  options: DecomposeOptions | undefined,
): number {
  if (hand.length % 3 !== 2) return shantenOf(hand, meldCount, options);
  let best = Number.POSITIVE_INFINITY;
  const tried = new Set<string>();
  for (let i = 0; i < hand.length; i++) {
    const key = kindKey(hand[i]!);
    if (tried.has(key)) continue;
    tried.add(key);
    const rest = hand.filter((_, j) => j !== i);
    const s = shantenOf(rest, meldCount, options);
    if (s < best) best = s;
  }
  return Number.isFinite(best) ? best : shantenOf(hand.slice(0, -1), meldCount, options);
}

/**
 * 관전 뷰 하나에서 중계 보조값을 만든다. 관전 뷰가 아니면 null —
 * 손패가 가려진 시점에서 이 값을 만들면 그건 계산이 아니라 지어내기다.
 */
export function buildSpectateInsight(view: PlayerView): SpectateInsightMessage | null {
  if (view.playerId !== SPECTATOR_ID) return null;

  const doraKinds: TileKind[] = [];
  for (const id of view.round.doraIndicators) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) doraKinds.push(doraKindFor(k));
  }
  const doraCount = new Map<string, number>();
  for (const d of doraKinds) doraCount.set(kindKey(d), (doraCount.get(kindKey(d)) ?? 0) + 1);
  const doraIn = (kinds: readonly TileKind[]): number => {
    let n = 0;
    for (const k of kinds) n += doraCount.get(kindKey(k)) ?? 0;
    return n;
  };

  const seats: SpectateInsightMessage["seats"] = [];
  for (const p of view.players) {
    const handIds = view.zones[handZone(p.id)]?.tileIds ?? [];
    const meldIds = view.zones[meldsZone(p.id)]?.tileIds ?? [];
    const hand = kindsOf(view, handZone(p.id));
    const meldKinds = kindsOf(view, meldsZone(p.id));
    if (hand.length === 0) continue; // 배패 전 — 잴 것이 없다
    const pr = view.round.byPlayer[p.id];
    const meldCount = pr?.meldCount ?? 0;
    let reds = 0;
    for (const id of [...handIds, ...meldIds]) {
      if (view.tiles[id]?.attrs.red === true) reds++;
    }
    /*
     * 안깡은 손을 열지 않는다 — 샹텐에서는 멘쯔 하나로 세면서 리치·멘젠쯔모·
     * 우라도라는 그대로다. `bot/value.ts`가 `menzen`을 따로 받는 이유가 이것이라,
     * 여기서도 그 규칙을 그대로 따른다(공개된 후로가 하나도 없으면 멘젠).
     */
    const menzen = (pr?.melds ?? []).every((m) => m.kind === "kan_closed");
    // 샹텐과 **같은 옵션**을 쓴다 — 한 좌석의 두 숫자(예상 타점·샹텐)가 서로 다른
    // 규칙으로 계산되면 화면 안에서도 어긋난다 (QA 2차 spectate 확정 3).
    const seatOpts = view.seatScoringOptions?.[p.id];
    const value = estimateHandValue({
      kinds: [...hand, ...meldKinds],
      ...(seatOpts !== undefined ? { opts: seatOpts } : {}),
      handDora: doraIn(hand) + doraIn(meldKinds) + reds,
      meldCount,
      menzen,
      plan: null,
      isDealer: p.seat === view.round.dealerSeat,
      riichiDeclared: pr?.riichiDeclared === true,
    });
    seats.push({
      id: p.id,
      han: Math.round(value.han * 10) / 10,
      fu: value.fu,
      points: value.points,
      /*
       * **그 좌석의 규칙으로** 잰다 (QA 2차 spectate 확정 3).
       *
       * 관전 뷰의 `scoringOptions`는 «관전자는 특정 플레이어가 아니다»라서 `{}`(표준)다.
       * 그걸 그대로 네 좌석에 쓰면 화료형을 바꾸는 증강(진짜 용 5멘쯔 · 조커 만능패 ·
       * 국사무쌍 전용)을 든 좌석에서 정확히 틀린다 — 좌석 뱃지는 그 좌석의 증강을 보고
       * 재므로 같은 화면에 숫자가 둘 뜬다. 좌석별 옵션은 뷰가 실어 준다
       * (`PlayerView.seatScoringOptions`). 없으면(옛 뷰) 표준 규칙으로 떨어진다.
       */
      shanten: bestShanten(hand, meldCount, seatOpts),
    });
  }

  /*
   * 위험패 — **지금 두는 사람의 손패**에만 매긴다.
   *
   * 네 좌석 모두에 색을 칠하면 화면이 통째로 신호등이 된다. 실제로 궁금한 것은 언제나
   * 「지금 이 사람이 무엇을 버릴 수 있나」 하나다. 값은 봇이 쓰는 그 눈 그대로다
   * (`safetyOf` 0~1, 1이 가장 안전 → 화면에는 뒤집어 위험도로 준다).
   */
  const turnPlayer = view.players.find((p) => p.seat === view.round.turnSeat);
  const danger: Record<number, number> = {};
  if (turnPlayer !== undefined) {
    const threats = readThreats(view, turnPlayer.id, doraKinds);
    if (threats.some((t) => t.level > 0)) {
      const remainingOf = tileTracker(view);
      for (const id of view.zones[handZone(turnPlayer.id)]?.tileIds ?? []) {
        const kind = view.tiles[id]?.kind;
        if (kind === undefined) continue;
        danger[id] = Math.round((1 - safetyOf(kind, threats, remainingOf, NEUTRAL_DEFENSE)) * 100) / 100;
      }
    }
  }

  return {
    type: "spectateInsight",
    seats,
    ...(turnPlayer !== undefined && Object.keys(danger).length > 0
      ? { dangerSeat: turnPlayer.id, danger }
      : {}),
  };
}
