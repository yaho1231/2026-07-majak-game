/**
 * aug-3 도메인 불변식 — onState/onRound에 꽂아 쓴다.
 * packages/** 는 건드리지 않는다 (읽기 전용 검사).
 */
import {
  DEAD_WALL,
  WALL,
  discardsZone,
  handZone,
  kindKey,
  meldsZone,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import type { Violation } from "../../harness.js";

export interface InvOpts {
  /** 좌석별 preset (누가 무엇을 들었는지) */
  preset: Record<string, readonly string[]>;
  /**
   * 종류 5장째 검사. 이 게임에는 "패를 만들어내는" 증강이 여럿 있어(genesis·take_back·
   * tile_dyeing…) 광역 스위프에서는 의미 없는 소음이다 — 격리 실험에서만 켠다.
   */
  kindOverflow?: boolean;
}

const has = (o: InvOpts, seat: string, aug: string): boolean =>
  (o.preset[seat] ?? []).includes(aug);

export function makeChecks(o: InvOpts) {
  const out: Violation[] = [];
  let n = 0;
  const add = (kind: string, detail: string, st: GameState, seat?: PlayerId): void => {
    if (out.length > 300) return;
    const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
    out.push(seat === undefined ? { kind, detail, round: rk } : { kind, detail, round: rk, seat });
  };

  /** 종류별 실물 장수 — 5장째가 생기면 세상에 없는 패다 */
  const kindOverflow = (st: GameState): void => {
    const cnt = new Map<string, number>();
    for (const z of Object.values(st.zones)) {
      for (const id of z.tileIds) {
        const k = st.tiles[id as unknown as number]?.kind;
        if (k === undefined) continue;
        const key = kindKey(k);
        cnt.set(key, (cnt.get(key) ?? 0) + 1);
      }
    }
    for (const [k, c] of cnt) {
      if (c > 4) add("KIND_OVERFLOW", `${k} x${c}`, st);
    }
  };

  /** 좌석 번호는 늘 0..3의 순열 */
  const seatPerm = (st: GameState): void => {
    const seats = st.players.map((p) => p.seat).sort((a, b) => a - b);
    if (seats.join(",") !== "0,1,2,3") add("SEAT_PERM", `seats=${seats.join(",")}`, st);
    const ds = st.round.dealerSeat;
    if (!(ds >= 0 && ds <= 3)) add("DEALER_SEAT", `dealerSeat=${ds}`, st);
  };

  /** 왕패는 표시패 10장 밑으로 내려가지 않는다 (배패 후) */
  const deadWall = (st: GameState): void => {
    const dealt = st.config.playerIds.some((s) => (st.zones[handZone(s)]?.tileIds.length ?? 0) > 0);
    if (!dealt) return;
    const len = st.zones[DEAD_WALL]?.tileIds.length ?? 0;
    if (len < 10) add("DEADWALL_SMALL", `deadWall=${len}`, st);
  };

  /** riichi_seal: 봉인이 살아 있는데 남이 리치 중이면 규칙이 샌 것 */
  const riichiSeal = (st: GameState): void => {
    for (const p of st.players) {
      if (!has(o, p.id, "riichi_seal")) continue;
      const banner = st.augmentData[`view:*:riichi_seal:${p.id}#round`];
      if (banner !== "봉인") continue;
      if (st.round.byPlayer[p.id]?.riichi == null) continue;
      const others = st.players.filter(
        (q) => q.id !== p.id && st.round.byPlayer[q.id]?.riichi != null,
      );
      if (others.length > 0) {
        add("SEAL_LEAK", `봉인 중인데 ${others.map((q) => q.id).join(",")}가 리치`, st, p.id);
      }
    }
  };

  /** no_ron_pact: 공개 채널(active)이 실제 조약 상태와 맞는가 */
  const pact = (st: GameState): void => {
    for (const p of st.players) {
      if (!has(o, p.id, "no_ron_pact")) continue;
      const rs = st.round.byPlayer[p.id];
      if (rs === undefined) continue;
      const shown = st.augmentData[`view:*:no_ron_pact:active:${p.id}#round`];
      if (shown === undefined) continue;
      const real =
        (rs.discardCount ?? 0) <= 6 && rs.riichi == null && (rs.melds?.length ?? 0) === 0 &&
        st.augmentData[`no_ron_pact:declared:${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}:${p.id}#round`] !== true;
      if (shown !== real) {
        add("PACT_VIEW_STALE", `shown=${String(shown)} real=${String(real)} dc=${rs.discardCount}`, st, p.id);
      }
    }
  };

  /** north_trader: 빼놓은 北 표시와 실물 */
  const north = (st: GameState): void => {
    for (const p of st.players) {
      if (!has(o, p.id, "north_trader")) continue;
      const inMelds = new Set((st.round.byPlayer[p.id]?.melds ?? []).flatMap((m) => m.tileIds));
      const actual = (st.zones[meldsZone(p.id)]?.tileIds ?? []).filter((id) => {
        if (inMelds.has(id)) return false;
        const k = st.tiles[id as unknown as number]?.kind;
        return k?.suit === "wind" && k.rank === 4;
      }).length;
      if (actual > 4) add("NORTH_TOO_MANY", `pulled=${actual}`, st, p.id);
    }
  };

  /** pond_snatch: 사용 횟수 상한 3 */
  const uses = (st: GameState): void => {
    for (const p of st.players) {
      const v = st.augmentData[`pond_snatch:used:${p.id}`];
      if (typeof v === "number" && v > 3) add("SNATCH_USES", `used=${v}`, st, p.id);
      const sw = st.augmentData[`seat_swap:uses:${p.id}`];
      if (typeof sw === "number" && sw > 3) add("SEATSWAP_USES", `uses=${sw}`, st, p.id);
    }
  };

  /** 리치 중인데 멘젠이 깨진 손 (리치 후 후로) */
  const riichiOpen = (st: GameState): void => {
    for (const p of st.players) {
      const rs = st.round.byPlayer[p.id];
      if (rs?.riichi == null) continue;
      const open = (rs.melds ?? []).filter((m) => m.kind !== "kan_closed" && m.silent !== true);
      if (open.length > 0) {
        add("RIICHI_OPEN", `리치인데 드러난 후로 ${open.length}`, st, p.id);
      }
    }
  };

  const onState = (st: GameState, sink: Violation[]): void => {
    n++;
    if (o.kindOverflow === true) kindOverflow(st);
    seatPerm(st);
    deadWall(st);
    riichiSeal(st);
    pact(st);
    north(st);
    uses(st);
    riichiOpen(st);
    for (const v of out.splice(0)) sink.push(v);
  };

  return { onState, count: () => n };
}

export { discardsZone, WALL };
