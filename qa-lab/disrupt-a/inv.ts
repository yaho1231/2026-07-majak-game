/** disrupt-a 도메인 불변식 — 8종 방해 증강 */
import { handZone, playerAtSeat } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import type { Violation } from "./h.js";

export const DISRUPT8 = [
  "pseudo_dealer", "scapegoat", "hidden_river", "discard_lock",
  "seat_swap", "parasite", "time_stop", "rank_gate",
] as const;

const rkOf = (st: GameState): string =>
  `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;

export interface Ctx {
  /** roundKey -> holder -> extra turns observed */
  lastTurnSeat?: number;
  turnRun: Record<string, number>;
  seenSeal: Record<string, number[]>; // holder:target -> tileIds at seal time
  dealerHistory: { rk: string; dealer: number; rotation: number }[];
  timeStopExtra: Record<string, number>;
  prevRk?: string;
  turnLog: string[];
}

export function newCtx(): Ctx {
  return { turnRun: {}, seenSeal: {}, dealerHistory: [], timeStopExtra: {}, turnLog: [] };
}

export function checkDisrupt(st: GameState, out: Violation[], c: Ctx): void {
  const rk = rkOf(st);
  const add = (kind: string, detail: string, seat?: PlayerId): void => {
    if (out.length < 400) out.push(seat === undefined ? { kind, detail, round: rk } : { kind, detail, round: rk, seat });
  };
  const ad = st.augmentData;

  // ── 1) 자리 집합 정합 (seat_swap) ────────────────────────────────
  const seats = st.players.map((p) => p.seat).sort((a, b) => a - b);
  if (seats.join(",") !== "0,1,2,3") add("SEAT_PERM", `seats=${seats.join(",")}`);
  if (st.round.dealerSeat < 0 || st.round.dealerSeat > 3) add("DEALER_RANGE", `${st.round.dealerSeat}`);
  const rot = st.round.rotationSeat;
  if (rot !== undefined && (rot < 0 || rot > 3)) add("ROTATION_RANGE", `${rot}`);

  // ── 2) 지목 대상 정합 (scapegoat / parasite / rank_gate) ─────────
  const ids = new Set(st.players.map((p) => p.id));
  for (const [k, v] of Object.entries(ad)) {
    let m = /^scapegoat:target:(.+):(p\d)$/.exec(k);
    if (m !== null) {
      const [, keyRk, holder] = m;
      if (typeof v === "string") {
        if (v === holder) add("TARGET_SELF", `scapegoat ${holder}->${v}`);
        if (!ids.has(v as PlayerId)) add("TARGET_UNKNOWN", `scapegoat ${holder}->${v}`);
        if (keyRk === rk) {
          const t = st.players.find((p) => p.id === v);
          if (t !== undefined && t.score < 0) add("TARGET_BUSTED", `scapegoat ${holder}->${v} score=${t.score}`);
        }
      }
      continue;
    }
    m = /^parasite:target:(p\d):(.+)$/.exec(k);
    if (m !== null) {
      const [, holder, keyRk] = m;
      if (typeof v === "string") {
        if (v === holder) add("TARGET_SELF", `parasite ${holder}->${v}`);
        if (!ids.has(v as PlayerId)) add("TARGET_UNKNOWN", `parasite ${holder}->${v}`);
        if (keyRk === rk) {
          const t = st.players.find((p) => p.id === v);
          if (t !== undefined && t.score < 0) add("TARGET_BUSTED", `parasite ${holder}->${v} score=${t.score}`);
        }
      }
      continue;
    }
    m = /^rank_gate:mark:(.+):(p\d)$/.exec(k);
    if (m !== null) {
      const [, , holder] = m;
      if (typeof v === "string" && v === holder) add("TARGET_SELF", `rank_gate ${holder}->${v}`);
      continue;
    }
  }

  // ── 3) discard_lock: 보유자 본인 패는 절대 봉인되지 않는다 ─────
  for (const [k, v] of Object.entries(ad)) {
    const m = /^view:(p\d):discardLockReveal:(p\d)/.exec(k);
    if (m === null || !Array.isArray(v)) continue;
    const [, holder, target] = m;
    if (holder === target) add("SEAL_SELF", `${k}`);
    // 봉인 목록의 패가 대상 손패에 남아 있으면서, 그 사람 손이 전부 봉인이면 소프트락 후보
    const hand = st.zones[handZone(target as PlayerId)]?.tileIds ?? [];
    const sealedInHand = (v as number[]).filter((t) => hand.includes(t as never));
    if (hand.length > 0 && sealedInHand.length === hand.length) {
      add("SEAL_ALL_HAND", `${target} hand=${hand.length} allSealed by ${holder}`);
    }
  }

  // ── 4) time_stop armed 플래그가 국을 넘어 남는가 ─────────────────
  for (const [k, v] of Object.entries(ad)) {
    const m = /^time_stop:armed:(.+):(p\d)$/.exec(k);
    if (m !== null && v === true && m[1] !== rk) {
      add("TIMESTOP_STALE_ARMED", `${k}`);
    }
  }

  // ── 5) 턴 연속 추적 — 같은 자리가 연속으로 turn.act를 받는 횟수 ──
  if (st.round.phase === "turn.act") {
    const cur = st.round.turnSeat;
    const pid = playerAtSeat(st, cur).id;
    const last = c.turnLog[c.turnLog.length - 1];
    const tag = `${rk}|${pid}`;
    if (last !== tag) c.turnLog.push(tag);
    if (c.turnLog.length > 4000) c.turnLog.shift();
  }
}
