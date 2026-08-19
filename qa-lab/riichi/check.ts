/**
 * 리치 도메인 불변식 검사기 (QA 전용, qa-lab 밖으로 나가지 않는다)
 */
import { WALL, handZone, meldsZone } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import type { Violation } from "../harness.js";

const RIICHI_ACTORS = new Set([
  "free_riichi_discard",
  "palm_flip",
  "last_stand",
  "tile_dyeing",
  "silent_swap",
]);

interface SeatSnap {
  score: number;
  riichiTile: number | null;
  riichiCost: number;
  ippatsu: boolean;
  double: boolean;
  declDiscardCount: number;
  declMeldTotal: number;
  /** 선언 시점 **남들**의 후로 총합 (일발은 남의 후로에 죽는다) */
  declOtherMelds: number;
  declHand: string; // sorted tileIds at declaration (13장)
  discardCount: number;
}

export interface RiichiWatch {
  roundKey: string;
  pot: number;
  seats: Record<string, SeatSnap>;
  firstRiichi: PlayerId | null;
  /** 이 국에서 리치를 건 적 있는 좌석 */
  everRiichi: Set<string>;
}

export function makeWatch(): { w: RiichiWatch | null } {
  return { w: null };
}

/** 국 식별 — 하네스가 ROUND_STARTED마다 올려 주는 시퀀스를 쓴다.
 * roundKey만으로는 안 된다: ROUND_SETTLED 리듀서가 이미 다음 국의 번호·본장을 적용한
 * 뒤 마지막 브로드캐스트가 나가므로, 국 경계에서 같은 키가 두 국에 걸친다. */
let SEQ = 0;
export function bumpRound(): void {
  SEQ++;
}

const rkOf = (st: GameState): string =>
  `${SEQ}|${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;

const handIds = (st: GameState, s: PlayerId): number[] =>
  ((st.zones[handZone(s)]?.tileIds ?? []) as unknown as number[]).slice().sort((a, b) => a - b);

/**
 * 리치 손 고정 비교용 집합 — **손패 + 후로 존**.
 * 리치 중 안깡(코어가 대기 불변일 때만 허용)은 손패에서 후로 존으로 4장을 옮기므로
 * 손패만 비교하면 합법 이동이 전부 위반으로 잡힌다.
 */
const lockedSet = (st: GameState, s: PlayerId): number[] =>
  [
    ...((st.zones[handZone(s)]?.tileIds ?? []) as unknown as number[]),
    ...((st.zones[meldsZone(s)]?.tileIds ?? []) as unknown as number[]),
  ]
    .slice()
    .sort((a, b) => a - b);

export function riichiCheck(
  st: GameState,
  out: Violation[],
  box: { w: RiichiWatch | null },
): void {
  const rk = rkOf(st);
  const add = (kind: string, detail: string, seat?: PlayerId): void => {
    if (out.length < 400)
      out.push(seat === undefined ? { kind, detail, round: rk } : { kind, detail, round: rk, seat });
  };
  const seats = st.config.playerIds;
  const meldTotal = seats.reduce((n, s) => n + (st.round.byPlayer[s]?.melds.length ?? 0), 0);
  const wall = st.zones[WALL]?.tileIds.length ?? 0;
  const augOf = (s: PlayerId): string[] => st.players.find((p) => p.id === s)?.augments ?? [];

  // (KIND_OVER4 검사는 제거했다 — 단색 세계·염색 등 대량 kind 변경 증강이 드래프트로
  //  들어오면 전부 오탐이라 다른 위반을 400건 상한으로 밀어낸다. off_by_one의 5번째 장
  //  문제는 probe_offbyone_fifth.ts로 따로 확정했다.)

  const cur: RiichiWatch = {
    roundKey: rk,
    pot: st.round.riichiPot,
    seats: {},
    firstRiichi: box.w?.roundKey === rk ? (box.w.firstRiichi ?? null) : null,
    everRiichi: box.w?.roundKey === rk ? box.w.everRiichi : new Set<string>(),
  };

  const prev = box.w?.roundKey === rk ? box.w : null;

  for (const s of seats) {
    const rs = st.round.byPlayer[s];
    const r = rs?.riichi ?? null;
    const p = st.players.find((x) => x.id === s)!;
    const old = prev?.seats[s];
    const snap: SeatSnap = {
      score: p.score,
      riichiTile: r === null ? null : ((r.discardTileId as unknown as number) ?? r.discardIndex),
      riichiCost: r === null ? 0 : (r.cost ?? -1),
      ippatsu: r?.ippatsu === true,
      double: r?.double === true,
      declDiscardCount: old?.declDiscardCount ?? 0,
      declMeldTotal: old?.declMeldTotal ?? 0,
      declOtherMelds: old?.declOtherMelds ?? 0,
      declHand: old?.declHand ?? "",
      discardCount: rs?.discardCount ?? 0,
    };

    if (prev === null) {
      // 국의 첫 브로드캐스트는 아직 **이전 국의 끝 상태**다(번호만 새 국).
      // 여기서는 기준선만 잡고 아무것도 검사하지 않는다.
      if (r !== null) {
        snap.declDiscardCount = rs?.discardCount ?? 0;
        snap.declMeldTotal = meldTotal;
        snap.declOtherMelds = meldTotal - (rs?.melds.length ?? 0);
        snap.declHand = lockedSet(st, s)
          .filter((t) => t !== (st.round.lastDrawnTile as unknown as number | null))
          .join(",");
      }
      cur.seats[s] = snap;
      continue;
    }
    if (r !== null && (old === undefined || old.riichiTile === null)) {
      // ── 새 리치 선언 ──
      snap.declDiscardCount = rs?.discardCount ?? 0;
      snap.declMeldTotal = meldTotal;
      snap.declOtherMelds = meldTotal - (rs?.melds.length ?? 0);
      snap.declHand = lockedSet(st, s)
        .filter((t) => t !== (st.round.lastDrawnTile as unknown as number | null))
        .join(",");
      const cost = r.cost ?? 1000;
      if (old !== undefined) {
        const potDelta = st.round.riichiPot - (prev?.pot ?? 0);
        // 공탁은 낸 만큼 정확히 쌓여야 한다 (점수 차분은 같은 구간의 정산과 섞여
        // 오탐이 나므로 보지 않는다 — 총합 보존은 하네스가 따로 검사한다).
        if (potDelta !== cost)
          add("RIICHI_POT", `cost=${cost} but pot moved ${potDelta}`, s);
        // 공탁 면제는 스텔스 리치·물러설 수 없는 선언만의 권리다.
        const free = augOf(s).some((a) => a === "stealth_riichi" || a === "no_retreat");
        if (cost === 0 && !free)
          add("RIICHI_FREE", `cost=0 without stealth_riichi/no_retreat (augs ${augOf(s).join("+")})`, s);
        if (cost !== 0 && cost !== 1000)
          add("RIICHI_ODD_COST", `cost=${cost}`, s);
      }
      if (wall < 4)
        add(
          "RIICHI_WALL_LOW",
          `wall=${wall} at declaration (phase=${st.round.phase} cost=${cost} augs ${augOf(s).join("+")})`,
          s,
        );
      // 봉인 우회 — riichi_seal
      for (const o of seats) {
        if (o === s) continue;
        const ors = st.round.byPlayer[o];
        if (ors?.riichi == null) continue;
        if (augOf(o).includes("riichi_seal") && cur.firstRiichi === o)
          add("SEAL_BYPASS", `${s} declared while ${o}'s riichi_seal active`, s);
        if (augOf(o).includes("riichi_upgrade")) {
          const oseat = st.players.find((x) => x.id === o)!.seat;
          const target = st.players.find((x) => x.seat === (oseat + 1) % seats.length)?.id;
          if (target === s)
            add("UPGRADE_SEAL_BYPASS", `${s} (shimocha of ${o}) declared while ${o} in riichi`, s);
        }
      }
      if (cur.firstRiichi === null) cur.firstRiichi = s;
      cur.everRiichi.add(s);
      // 더블리치 플래그
      const hasUp = augOf(s).includes("riichi_upgrade");
      const hasLate = augOf(s).includes("late_double");
      if (r.double && !hasUp && !hasLate && (rs?.discardCount ?? 0) > 1)
        add(
          "DOUBLE_BAD",
          `double=true at discardCount=${rs?.discardCount} turnCount=${st.round.turnCount} augs ${augOf(s).join("+")}`,
          s,
        );
    } else if (r !== null && old !== undefined && old.riichiTile !== null) {
      if (snap.riichiTile !== old.riichiTile)
        add("RIICHI_REDECLARE", `riichi tile ${old.riichiTile} -> ${snap.riichiTile} without release`, s);
      // ippatsu 잔류
      if (r.ippatsu) {
        if (!augOf(s).includes("soul_strike") && (rs?.discardCount ?? 0) > snap.declDiscardCount)
          add("IPPATSU_STALE", `ippatsu alive after ${(rs?.discardCount ?? 0) - snap.declDiscardCount} extra discards`, s);
        const otherMelds = meldTotal - (rs?.melds.length ?? 0);
        if (otherMelds > snap.declOtherMelds)
          add(
            "IPPATSU_AFTER_CALL",
            `ippatsu alive after another seat called (남의 후로 ${snap.declOtherMelds}->${otherMelds}) augs ${augOf(s).join("+")}`,
            s,
          );
      }
      // 손 고정 — **자기 차례가 아닐 때만** 본다.
      // 자기 차례에는 쯔모패가 손에 얹혔다 빠지고, 깡·교환 증강이 round.lastDrawnTile을
      // 갈아 끼우기도 해서 "쯔모패 한 장"을 정확히 빼기가 어렵다. 남의 차례에 리치자의
      // 손은 반드시 선언 시점 그대로여야 하므로 그 순간만 비교하면 오탐이 사라진다.
      const myTurn = st.players.find((x) => x.seat === st.round.turnSeat)?.id === s;
      const canMove = myTurn || augOf(s).some((a) => RIICHI_ACTORS.has(a));
      if (!canMove) {
        // 올바른 불변식은 "선언 시점의 13장이 **하나도 빠져나가지 않았다**"이다(부분집합).
        // 안깡은 쯔모패를 후로 존으로 흡수해 집합이 커질 수 있으므로 동등 비교는 틀리다.
        const nowSet = new Set(lockedSet(st, s));
        const gone = snap.declHand === "" ? [] : snap.declHand.split(",").filter((t) => !nowSet.has(Number(t)));
        const now = `-${gone.join(",")}`;
        if (gone.length > 0)
          add(
            "RIICHI_HAND_MOVED",
            `hand ${snap.declHand} -> ${now} | augs ${st.players.map((x) => `${x.id}:${x.augments.join("+")}`).join(" ")}`,
            s,
          );
      }
    } else if (r === null && old !== undefined && old.riichiTile !== null) {
      add("RIICHI_RELEASED", `riichi cleared (cost was ${old.riichiCost}); pot ${prev?.pot} -> ${st.round.riichiPot}, score ${old.score} -> ${p.score}`, s);
    }
    cur.seats[s] = snap;
  }
  box.w = cur;
}
