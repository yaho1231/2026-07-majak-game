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
import type { PlayerView, SpectateInsightMessage, TileKind } from "@majak/core";
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
    const value = estimateHandValue({
      kinds: [...hand, ...meldKinds],
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
      shanten: shantenOf(hand.length % 3 === 2 ? hand.slice(0, -1) : hand, meldCount),
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
