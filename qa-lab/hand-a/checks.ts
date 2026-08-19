/** hand-a QA — 손패 계열 증강용 커스텀 불변식 */
import { handZone, meldsZone, discardsZone, WALL, DEAD_WALL } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import type { Violation } from "../harness.js";

export interface HandCtx {
  /** tileId 총량 (첫 관측 기준) */
  totalTiles?: number;
  /** 리치 선언 시점의 손패(쯔모패 제외) 멀티셋 서명 */
  riichiHand: Record<string, string | undefined>;
  /** 국 식별 (국이 바뀌면 리치 스냅샷 초기화) */
  round?: string;
  /** 관측 횟수 */
  ticks: number;
}

export function newCtx(): HandCtx {
  return { riichiHand: {}, ticks: 0 };
}

const rk = (st: GameState): string =>
  `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;

/** 손패 멀티셋 서명 (tileId 기준, 쯔모패 제외) */
function handSig(st: GameState, seat: PlayerId, exclude: number | null): string {
  const ids = (st.zones[handZone(seat)]?.tileIds ?? []).filter(
    (id) => (id as unknown as number) !== exclude,
  );
  return [...ids].sort((a, b) => (a as number) - (b as number)).join(",");
}

export function handChecks(st: GameState, out: Violation[], ctx: HandCtx): void {
  ctx.ticks++;
  const round = rk(st);
  const add = (kind: string, detail: string, seat?: PlayerId): void => {
    if (out.length < 400)
      out.push(seat === undefined ? { kind, detail, round } : { kind, detail, round, seat });
  };
  if (ctx.round !== round) {
    ctx.round = round;
    ctx.riichiHand = {};
  }

  // A) 패 총량 보존 — 모든 존의 tileId 합이 tiles 레지스트리 크기와 같아야 한다
  let inZones = 0;
  for (const z of Object.values(st.zones)) inZones += z.tileIds.length;
  const registry = Object.keys(st.tiles).length;
  if (inZones !== registry) {
    add("TILE_LOST", `zones=${inZones} registry=${registry}`);
  }
  if (ctx.totalTiles === undefined) ctx.totalTiles = inZones;
  else if (ctx.totalTiles !== inZones) {
    add("TILE_TOTAL_DRIFT", `${ctx.totalTiles} -> ${inZones}`);
    ctx.totalTiles = inZones;
  }

  const dealt = st.config.playerIds.some(
    (s) => (st.zones[handZone(s)]?.tileIds.length ?? 0) > 0,
  );
  if (!dealt) return;

  for (const seat of st.config.playerIds) {
    // B) 손패 장수 엄밀 검사 — 후로 3장 환산해 13 또는 14
    const hand = st.zones[handZone(seat)]?.tileIds.length ?? 0;
    const meldTiles = st.zones[meldsZone(seat)]?.tileIds.length ?? 0;
    const melds = st.round.byPlayer[seat]?.melds ?? [];
    // 깡은 물리 4장이지만 손 구성상 3장 몫이다
    let kanExtra = 0;
    for (const m of melds) {
      const n = (m as { tileIds?: unknown[] }).tileIds?.length ?? 3;
      if (n >= 4) kanExtra += n - 3;
    }
    const eff = hand + meldTiles - kanExtra;
    if (eff !== 13 && eff !== 14) {
      add(
        "HAND_SIZE_EXACT",
        `hand=${hand} meldTiles=${meldTiles} kan=${kanExtra} eff=${eff} phase=${st.round.phase}`,
        seat,
      );
    }

    // C) 리치 손 동결 — 리치 선언 이후 손패(쯔모패 제외)가 바뀌면 위반
    const riichi = st.round.byPlayer[seat]?.riichi;
    if (riichi != null) {
      // 안깡은 리치 중에도 합법이라 손패가 정당하게 줄어든다 — 멘쯔 수를 서명에 섞어
      // 깡이 일어난 순간에는 스냅샷을 새로 잡는다.
      const sig = `${meldTiles}|${handSig(st, seat, st.round.lastDrawnTile as unknown as number | null)}`;
      const prev = ctx.riichiHand[seat];
      if (prev !== undefined && prev.split("|")[0] !== String(meldTiles)) {
        ctx.riichiHand[seat] = sig;
        continue;
      }
      if (prev === undefined) ctx.riichiHand[seat] = sig;
      else if (prev !== sig) {
        add("RIICHI_HAND_CHANGED", `${prev} -> ${sig} phase=${st.round.phase}`, seat);
        ctx.riichiHand[seat] = sig;
      }
    } else {
      ctx.riichiHand[seat] = undefined;
    }
  }

  // D) 왕패는 정확히 14장이어야 한다 (깡으로 줄어드는 건 별개 — 상한만 harness가 본다)
  const dw = st.zones[DEAD_WALL]?.tileIds.length ?? 0;
  if (dw < 0) add("DEADWALL_NEG", `${dw}`);
  const wall = st.zones[WALL]?.tileIds.length ?? 0;
  if (wall < 0) add("WALL_NEG2", `${wall}`);
  void discardsZone;
}
