/**
 * shape 축 시너지 검증 공용 도구.
 *
 * 한 장면(손패·멜드·버림패)을 (없음 / A / B / A+B) 네 번 채점해 표로 찍는다.
 * 채점은 buildWinContext + evaluateWin(코어 진짜 경로) + score.extraHan 규칙 resolve.
 */

import {
  buildWinContext,
  calculateScore,
  createStandardGameFromState,
  evaluateWin,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  playerOf,
  scoringOptionsOf,
  shantenOf,
  winningKinds,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  Meld,
  PlayerId,
  TileId,
} from "@majak/core";
import { craft, h } from "../../../packages/content/test/helpers.js";
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";

export { craft, h };

export interface Scene {
  /** 화료자 손패 — 화료패까지 포함한 전체 (14장 / true_dragon이면 17장) */
  hand: string;
  melds?: { kind: Meld["kind"]; spec: string; from?: PlayerId }[];
  discards?: string;
  /** 화료패 — 손패 안의 이 종류 한 장을 화료패로 본다. 없으면 손패 마지막 장 */
  winTile?: string;
  winType?: "tsumo" | "ron";
  /** 장풍 (0=동) / 국 */
  prevalentWind?: number;
  roundNumber?: number;
  riichi?: boolean;
  /** augmentData 직접 주입 (액티브 증강의 "켜짐" 플래그 등) */
  data?: (state: GameState, holder: PlayerId) => Record<string, unknown>;
}

export interface Measured {
  ok: boolean;
  shapeOk: boolean;
  yaku: string[];
  yakumanCount: number;
  yakuHan: number;
  doraHan: number;
  han: number;
  fu: number;
  extraHan: number;
  /** 정산이 실제로 쓰는 판수 (역만이면 extraHan 무시) */
  totalHan: number;
  points: number;
  shanten13?: number;
  waits?: string[];
}

function stateFor(sc: Scene, augs: AugmentDef[], holder: PlayerId = "p0") {
  let st: GameState = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*", [holder]: sc.hand } as never,
    ...(sc.discards !== undefined ? { discards: { [holder]: sc.discards } as never } : {}),
    ...(sc.melds !== undefined ? { melds: { [holder]: sc.melds } as never } : {}),
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: holder,
  });
  if (sc.prevalentWind !== undefined || sc.roundNumber !== undefined) {
    st = {
      ...st,
      round: {
        ...st.round,
        prevalentWind: sc.prevalentWind ?? st.round.prevalentWind,
        roundNumber: sc.roundNumber ?? st.round.roundNumber,
      },
    };
  }
  if (sc.riichi === true) {
    const rs = st.round.byPlayer[holder];
    st = {
      ...st,
      round: {
        ...st.round,
        byPlayer: {
          ...st.round.byPlayer,
          [holder]: { ...rs, riichi: { turn: 1, double: false, ippatsu: false, snapshot: null } },
        } as never,
      },
    };
  }
  if (sc.data !== undefined) {
    st = { ...st, augmentData: { ...st.augmentData, ...sc.data(st, holder) } };
  }
  st = {
    ...st,
    players: st.players.map((p) =>
      p.id === holder ? { ...p, augments: augs.map((a) => a.id) } : p,
    ),
  };
  const game = createStandardGameFromState(st);
  for (const a of augs) installAugment(game.engine, a, holder, { yaku: game.yaku });
  return game;
}

export function measure(
  sc: Scene,
  augs: AugmentDef[],
  holder: PlayerId = "p0",
): Measured {
  const game = stateFor(sc, augs, holder);
  const st = game.engine.state;
  const ids = st.zones[handZone(holder)]?.tileIds ?? [];
  let winId: TileId | undefined;
  if (sc.winTile !== undefined) {
    const key = kindKey(h(sc.winTile)[0]!);
    winId = ids.find((t) => kindKey(kindOf(st, t)) === key);
    if (winId === undefined) throw new Error(`화료패가 손에 없다: ${sc.winTile}`);
  } else {
    winId = ids[ids.length - 1];
  }
  const ctx = buildWinContext(st, holder, sc.winType ?? "tsumo", winId!, {
    rules: game.engine.rules,
  });
  const ev = evaluateWin(ctx, game.yaku);
  const extraHan = Math.max(
    0,
    game.engine.rules.resolve<number>("score.extraHan", { playerId: holder, state: st }),
  );
  const isDealer = playerOf(st, holder).seat === st.round.dealerSeat;
  if (ev === null) {
    return {
      ok: false,
      shapeOk: false,
      yaku: [],
      yakumanCount: 0,
      yakuHan: 0,
      doraHan: 0,
      han: 0,
      fu: 0,
      extraHan,
      totalHan: 0,
      points: 0,
    };
  }
  const totalHan = ev.han + (ev.yakumanCount > 0 ? 0 : extraHan);
  const points = calculateScore({
    han: totalHan,
    fu: ev.fu,
    yakumanCount: ev.yakumanCount,
    isDealer,
    winType: sc.winType ?? "tsumo",
  }).total;
  return {
    ok: ev.ok,
    shapeOk: true,
    yaku: ev.yaku.map((y) => `${y.id}(${y.han})`),
    yakumanCount: ev.yakumanCount,
    yakuHan: ev.yakuHan,
    doraHan: ev.doraHan,
    han: ev.han,
    fu: ev.fu,
    extraHan,
    totalHan,
    points: ev.ok ? points : 0,
  };
}

/** 조커를 이번 국에 켜 두는 augmentData (액티브 발동을 흉내 낸다) */
export const jokerOnData = (state: GameState, holder: PlayerId): Record<string, unknown> => ({
  [roundScopedKey("joker", "on", state, holder)]: true,
});

/** 13장 대기 계산 — 손패 그대로(화료패 포함 X)를 넣어라 */
export function waitsOf(
  handSpec: string,
  augs: AugmentDef[],
  melds?: Scene["melds"],
  data?: Scene["data"],
): { shanten: number; waits: string[] } {
  const game = stateFor({ hand: handSpec, ...(melds ? { melds } : {}), ...(data ? { data } : {}) }, augs);
  const st = game.engine.state;
  const opts = scoringOptionsOf(st, game.engine.rules, "p0");
  const kinds = (st.zones[handZone("p0")]?.tileIds ?? []).map((t) => kindOf(st, t));
  const meldCount = st.round.byPlayer["p0"]?.melds.length ?? 0;
  return {
    shanten: shantenOf(kinds, meldCount, opts),
    waits: winningKinds(kinds, meldCount, undefined, opts).map(kindKey),
  };
}

export function optionsOf(handSpec: string, augs: AugmentDef[], data?: Scene["data"]): unknown {
  const game = stateFor({ hand: handSpec, ...(data ? { data } : {}) }, augs);
  return scoringOptionsOf(game.engine.state, game.engine.rules, "p0");
}

const fmt = (m: Measured): string =>
  m.shapeOk === false
    ? "화료형 아님"
    : `${m.ok ? "" : "[역없음] "}yakuman=${m.yakumanCount} han=${m.han}(+${m.extraHan}) fu=${m.fu} → ${m.points} :: ${m.yaku.join(" ")}`;

/** 대조군 4칸 표 */
export function table(
  title: string,
  sc: Scene,
  a: { name: string; augs: AugmentDef[] },
  b: { name: string; augs: AugmentDef[] },
): { none: Measured; a: Measured; b: Measured; ab: Measured } {
  const none = measure(sc, []);
  const ra = measure(sc, a.augs);
  const rb = measure(sc, b.augs);
  const rab = measure(sc, [...a.augs, ...b.augs]);
  console.log(`\n### ${title}`);
  console.log(`  손: ${sc.hand}${sc.melds ? ` + 멜드 ${sc.melds.map((m) => m.spec).join(",")}` : ""} (${sc.winType ?? "tsumo"}, 화료패 ${sc.winTile ?? "손패 마지막"})`);
  console.log(`  없음   | ${fmt(none)}`);
  console.log(`  ${a.name.padEnd(6)} | ${fmt(ra)}`);
  console.log(`  ${b.name.padEnd(6)} | ${fmt(rb)}`);
  console.log(`  A+B    | ${fmt(rab)}`);
  return { none, a: ra, b: rb, ab: rab };
}

export function line(label: string, m: Measured): void {
  console.log(`  ${label.padEnd(24)} | ${fmt(m)}`);
}

// ───────────────────────── 실제 정산 (sys.settleWin) ─────────────────────────

export interface SettleScene extends Scene {
  /** 좌석별 증강 (winner 포함) */
  augs: Partial<Record<PlayerId, AugmentDef[]>>;
  winner?: PlayerId;
  /** 론이면 방총자 */
  from?: PlayerId;
  honba?: number;
  riichiSticks?: number;
}

export interface Settled {
  deltas: Record<string, number>;
  sum: number;
  info?: Record<string, unknown>;
  augPoints?: unknown;
  payload: Record<string, unknown>;
}

export function settle(sc: SettleScene): Settled {
  const winner = sc.winner ?? "p0";
  const ronFromPond = sc.from !== undefined && sc.winTile !== undefined;
  let st: GameState = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*", [winner]: sc.hand } as never,
    ...(sc.discards !== undefined ? { discards: { [winner]: sc.discards } as never } : {}),
    ...(sc.melds !== undefined ? { melds: { [winner]: sc.melds } as never } : {}),
    phase: ronFromPond ? "reaction" : "turn.act",
    turnSeat: 0,
    ...(ronFromPond
      ? { lastDiscard: { player: sc.from as PlayerId, spec: sc.winTile as string } }
      : { drawnLastFor: winner }),
  });
  st = {
    ...st,
    round: {
      ...st.round,
      prevalentWind: sc.prevalentWind ?? st.round.prevalentWind,
      roundNumber: sc.roundNumber ?? st.round.roundNumber,
      honba: sc.honba ?? st.round.honba,
      riichiSticks: sc.riichiSticks ?? st.round.riichiSticks,
    },
  };
  if (sc.data !== undefined) {
    st = { ...st, augmentData: { ...st.augmentData, ...sc.data(st, winner) } };
  }
  st = {
    ...st,
    players: st.players.map((p) => ({
      ...p,
      augments: (sc.augs[p.id] ?? []).map((a) => a.id),
    })),
  };
  const game = createStandardGameFromState(st);
  for (const [pid, defs] of Object.entries(sc.augs)) {
    for (const d of defs ?? []) {
      installAugment(game.engine, d, pid as PlayerId, { yaku: game.yaku });
    }
  }
  const ids = game.engine.state.zones[handZone(winner)]?.tileIds ?? [];
  let winId: TileId | undefined = ids[ids.length - 1];
  if (ronFromPond) {
    winId = game.engine.state.round.lastDiscard?.tileId;
  } else if (sc.winTile !== undefined) {
    const key = kindKey(h(sc.winTile)[0]!);
    winId = ids.find((t) => kindKey(kindOf(game.engine.state, t)) === key);
  }
  const r = game.engine.submit({
    player: "__system" as PlayerId,
    type: "sys.settleWin",
    payload: {
      wins: [
        {
          winner,
          from: sc.from ?? null,
          tileId: winId,
          winType: sc.winType ?? "tsumo",
        },
      ],
    },
  } as never);
  if (!(r as { ok: boolean }).ok) throw new Error((r as { reason: string }).reason);
  const log = game.engine.eventLog;
  let payload: Record<string, unknown> | undefined;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === "RoundSettled") {
      payload = log[i]!.payload as Record<string, unknown>;
      break;
    }
  }
  if (payload === undefined) throw new Error("no RoundSettled");
  const deltas = payload["deltas"] as Record<string, number>;
  return {
    deltas,
    sum: Object.values(deltas).reduce((a, b) => a + b, 0),
    info: (payload["winInfos"] as Record<string, unknown>[] | undefined)?.[0],
    augPoints: payload["augPoints"],
    payload,
  };
}
