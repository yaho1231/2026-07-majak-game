/** hand-b 도메인 전용 불변식 (판을 뒤엎는 사람) */
import { DEAD_WALL, WALL, handZone, discardsZone, meldsZone, playerAtSeat } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import type { Violation } from "../harness.js";

export const MY_AUGMENTS = [
  "dead_wall_master", "genesis", "table_flip", "even_world", "giant_god",
  "conjure_draw", "regret", "honor_return", "tile_split", "three_dragons_will",
  "picky_eater",
] as const;

export interface Memo {
  totalTiles?: number;
  lastRoundKey?: string;
}

export function extraChecks(st: GameState, out: Violation[], memo: Memo): void {
  const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
  const add = (kind: string, detail: string, seat?: PlayerId): void => {
    if (out.length < 400) out.push(seat === undefined ? { kind, detail, round: rk } : { kind, detail, round: rk, seat });
  };

  // A) 패 총량 보존 — 모든 존의 타일 수 합은 게임 내내 불변이어야 한다
  let total = 0;
  for (const z of Object.values(st.zones)) total += z.tileIds.length;
  if (memo.totalTiles === undefined) memo.totalTiles = total;
  else if (total !== memo.totalTiles) {
    add("TILE_COUNT_DRIFT", `${memo.totalTiles} -> ${total}`);
    memo.totalTiles = total;
  }

  // B) 쯔모패는 반드시 그 차례 사람의 손에 있어야 한다
  const drawn = st.round.lastDrawnTile;
  if (drawn !== null && st.round.phase.startsWith("turn")) {
    const seat = playerAtSeat(st, st.round.turnSeat).id;
    const hand = st.zones[handZone(seat)]?.tileIds ?? [];
    if (!hand.includes(drawn)) {
      // 어디 있는지 찾아 준다
      let at = "?";
      for (const z of Object.values(st.zones)) if (z.tileIds.includes(drawn)) at = z.id;
      add("DRAWN_NOT_IN_HAND", `lastDrawnTile=${drawn} at ${at} phase=${st.round.phase}`, seat);
    }
  }

  // C) 왕패 크기 = 14 - 깡 횟수 (보충되지 않는다는 설계)
  const dw = st.zones[DEAD_WALL]?.tileIds.length ?? 0;
  const kan = st.round.kanCount ?? 0;
  if (st.round.phase !== "round.setup" && dw !== 14 - kan && dw !== 0) {
    add("DEADWALL_MISMATCH", `deadWall=${dw} kanCount=${kan} phase=${st.round.phase}`);
  }
  if (dw < 0) add("DEADWALL_NEG", `deadWall=${dw}`);

  // D) 도라 표시패는 실재하는 타일이어야 하고 왕패에 있어야 한다
  const dwSet = new Set(st.zones[DEAD_WALL]?.tileIds ?? []);
  for (const id of st.round.doraIndicators) {
    if (st.tiles[id] === undefined) add("DORA_GHOST", `indicator ${id} has no tile`);
    else if (!dwSet.has(id)) {
      let at = "?";
      for (const z of Object.values(st.zones)) if (z.tileIds.includes(id)) at = z.id;
      add("DORA_OUTSIDE_DEADWALL", `indicator ${id} at ${at}`);
    }
  }

  // E) 바닥(버림패 존)과 후리텐 이력의 장수 정합 — 후로로 빠진 만큼만 차이가 난다
  for (const seat of st.config.playerIds) {
    const pond = st.zones[discardsZone(seat)]?.tileIds.length ?? 0;
    const hist = st.round.byPlayer[seat]?.discardedKinds.length ?? 0;
    // 후로·바닥 강탈로 바닥이 이력보다 **적을** 수는 있다. 반대로 이력에 없는 패가
    // 바닥에 있으면(= 버린 적 없는 패가 쌓였다) 그게 이상이다.
    if (pond > hist) {
      add("POND_HISTORY_SKEW", `pond=${pond} history=${hist}`, seat);
    }
  }

  // F) 손패+후로 물리 장수
  for (const seat of st.config.playerIds) {
    const hand = st.zones[handZone(seat)]?.tileIds.length ?? 0;
    const meldZ = st.zones[meldsZone(seat)]?.tileIds.length ?? 0;
    const dealt = st.config.playerIds.some((s) => (st.zones[handZone(s)]?.tileIds.length ?? 0) > 0);
    if (!dealt) continue;
    const eff = hand + meldZ;
    if (eff !== 13 && eff !== 14 && eff !== 15 && eff !== 16 && eff !== 17 && eff !== 18) {
      add("PHYS_HAND_SIZE", `hand=${hand} meldZone=${meldZ} eff=${eff} phase=${st.round.phase}`, seat);
    }
  }

  // G) 패산 음수/이상
  const wall = st.zones[WALL]?.tileIds.length ?? 0;
  if (wall < 0) add("WALL_NEG", `wall=${wall}`);
}

/** 국 경계에서 지난 국 예약이 새는지 */
export function checkLeak(st: GameState, out: Violation[]): void {
  const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
  const cur = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
  for (const [k, v] of Object.entries(st.augmentData)) {
    if (v === null || v === false) continue;
    for (const id of ["giant_god:tsumo:", "conjure_draw:pending:"]) {
      if (!k.startsWith(id)) continue;
      // 키 형식: <id>:<roundKey>:<player>
      if (!k.includes(cur)) {
        out.push({ kind: "ROUND_SCOPE_LEAK", detail: `${k}=${JSON.stringify(v)} cur=${cur}`, round: rk });
      }
    }
  }
}
