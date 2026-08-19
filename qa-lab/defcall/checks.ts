/**
 * defense 6 + call 8 도메인 불변식.
 * 설명(description/detail)이 약속한 것만 불변식으로 옮긴다.
 */
import { DEAD_WALL, WALL } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import type { Ev, Violation } from "./run.js";

const rk = (st: GameState): string =>
  `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;

export interface CheckCtx {
  onState: (st: GameState, out: Violation[]) => void;
  onEvent: (e: Ev, st: GameState | null, out: Violation[]) => void;
}

interface Mem {
  // 좌석별 "직전 버림 시점에 불가침 조약이 유효했나"
  pactAtDiscard: Record<string, boolean>;
  // 좌석별 "직전 버림 시점에 무적이 켜져 있었나"
  invAtDiscard: Record<string, boolean>;
  lastDiscarder: PlayerId | null;
  scoresBefore: Record<string, number>;
  cancelPerRound: Record<string, number>;
  round: string;
  lastKanKind: string | null;
  riichiThisRound: Set<string>;
  bloomedThisRound: Set<string>;
  silentThisRound: Set<string>;
  kokushiPonThisRound: Set<string>;
  lastKanPlayer: PlayerId | null;
  totalTiles: number;
  stats: Record<string, number>;
}

const bump = (m: Mem, k: string): void => { m.stats[k] = (m.stats[k] ?? 0) + 1; };

export function makeChecks(
  preset: Record<PlayerId, readonly string[]>,
  mode: "hanchan" | "tonpuu",
): CheckCtx & { stats: Record<string, number> } {
  const holders = (id: string): PlayerId[] =>
    (Object.keys(preset) as PlayerId[]).filter((s) => preset[s].includes(id));
  const mem: Mem = {
    pactAtDiscard: {}, invAtDiscard: {}, lastDiscarder: null,
    scoresBefore: {}, cancelPerRound: {}, round: "", lastKanKind: null,
    lastKanPlayer: null, totalTiles: 0, stats: {},
    riichiThisRound: new Set(), bloomedThisRound: new Set(),
    silentThisRound: new Set(), kokushiPonThisRound: new Set(),
  };
  const matchUses = mode === "tonpuu" ? 1 : 2;

  const add = (out: Violation[], kind: string, detail: string, round: string, seat?: PlayerId): void => {
    if (out.length < 400) out.push(seat === undefined ? { kind, detail, round } : { kind, detail, round, seat });
  };

  // ── no_ron_pact: 조약 유효 조건 (소스와 동일한 판정) ──
  const pactActive = (st: GameState, h: PlayerId): boolean => {
    if (st.round.turnCount > 6) return false;
    const rs = st.round.byPlayer[h];
    if (rs === undefined) return false;
    if (rs.riichi != null) return false;
    if (rs.melds.length > 0) return false;
    return true;
  };
  const invActive = (st: GameState, h: PlayerId): boolean => {
    for (const [k, v] of Object.entries(st.augmentData)) {
      if (v !== true) continue;
      if (k.startsWith("invincible:active:") && k.endsWith(`:${h}`)) {
        // roundKey 스코프: 현재 국의 것만
        const mid = k.slice("invincible:active:".length, k.length - h.length - 1);
        if (mid === rkOfKey(st)) return true;
      }
    }
    return false;
  };

  const onState = (st: GameState, out: Violation[]): void => {
    const round = rk(st);
    if (round !== mem.round) {
      mem.round = round;
      mem.cancelPerRound = {};
      mem.riichiThisRound = new Set();
      mem.bloomedThisRound = new Set();
      mem.silentThisRound = new Set();
      mem.kokushiPonThisRound = new Set();
    }
    // ── 전 구역 타일 총량 보존 ──
    let n = 0;
    for (const z of Object.values(st.zones)) n += z.tileIds.length;
    const all = Object.keys(st.tiles).length;
    if (mem.totalTiles === 0) mem.totalTiles = all;
    if (n !== all && n > 0) add(out, "TILE_TOTAL", `zones=${n} tiles=${all}`, round);

    // ── 왕패/깡 정합 ──
    const dw = st.zones[DEAD_WALL]?.tileIds.length ?? 0;
    if (dw > 0 && dw !== 14 - st.round.kanCount) {
      add(out, "DEADWALL_KAN_MISMATCH", `deadWall=${dw} kanCount=${st.round.kanCount}`, round);
    }
    if (st.round.kanCount > 4) add(out, "KAN_OVER4", `kanCount=${st.round.kanCount}`, round);

    // ── meldCount vs melds.length ──
    for (const seat of st.config.playerIds) {
      const rs = st.round.byPlayer[seat];
      if (rs === undefined) continue;
      const mc = (rs as any).meldCount;
      if (typeof mc === "number" && mc !== rs.melds.length) {
        add(out, "MELDCOUNT_MISMATCH", `meldCount=${mc} melds=${rs.melds.length}`, round, seat);
      }
    }

    // ── invincible: 쿨다운 범위 ──
    for (const h of holders("invincible")) {
      const cd = st.augmentData[`invincible:cd:${h}`];
      if (typeof cd === "number" && (cd < 0 || cd > 2)) {
        add(out, "INVINCIBLE_CD_RANGE", `cd=${cd}`, round, h);
      }
    }
    // ── die_hard: 남은 횟수가 있는데 점수가 음수 ──
    for (const h of holders("die_hard")) {
      const used = Number(st.augmentData[`die_hard:uses:${h}`] ?? 0);
      if (used > matchUses) add(out, "DIEHARD_USES_OVER", `used=${used}/${matchUses}`, round, h);
    }
    // 방어 증강 보유자의 점수 기록
    for (const p of st.players) mem.scoresBefore[p.id] = p.score;
  };

  const onEvent = (e: Ev, st: GameState | null, out: Violation[]): void => {
    const round = st === null ? mem.round : rk(st);
    if (e.type === "TileDiscarded") {
      const pl = e.payload?.player as PlayerId | undefined;
      if (pl !== undefined && st !== null) {
        mem.lastDiscarder = pl;
        mem.pactAtDiscard[pl] = holders("no_ron_pact").includes(pl) ? pactActive(st, pl) : false;
        mem.invAtDiscard[pl] = holders("invincible").includes(pl) ? invActive(st, pl) : false;
      }
    }
    if (e.type === "TileDiscarded" && e.payload?.riichi === true) {
      mem.riichiThisRound.add(String(e.payload?.player));
    }
    if (e.type === "CallMade" && e.payload?.silent === true) mem.silentThisRound.add(String(e.payload?.caller));
    if (e.type === "CallMade" && e.payload?.meldKind === "kokushi_pon") mem.kokushiPonThisRound.add(String(e.payload?.caller));
    if (e.type === "AugmentDataSet" || e.type === "AugmentData") {
      const k = String(e.payload?.key ?? "");
      if (k.startsWith("cliff_bloom:bloomed:") && e.payload?.value === true) {
        mem.bloomedThisRound.add(k.slice(k.lastIndexOf(":") + 1));
      }
    }
    if (e.type === "KanDeclared") {
      mem.lastKanKind = (e.payload?.kanKind as string) ?? null;
      mem.lastKanPlayer = (e.payload?.player as PlayerId) ?? null;
      bump(mem, `kan:${mem.lastKanKind}`);
    }
    if (e.type === "CallMade") {
      const mk = e.payload?.meldKind as string;
      bump(mem, `call:${mk}${e.payload?.silent === true ? ":silent" : ""}`);
    }
    if (e.type === "RiichiCanceled") {
      const p = e.payload?.player as PlayerId;
      bump(mem, "cancel_riichi");
      mem.cancelPerRound[p] = (mem.cancelPerRound[p] ?? 0) + 1;
      if (mem.cancelPerRound[p] > 1) {
        add(out, "LASTSTAND_TWICE", `cancels=${mem.cancelPerRound[p]}`, round, p);
      }
      if ((e.payload?.refund ?? 0) < 0) add(out, "LASTSTAND_NEG_REFUND", JSON.stringify(e.payload), round, p);
    }
    if (e.type === "MeldDissolved") bump(mem, "meld_dissolve");
    if (e.type === "BloomPickTaken") bump(mem, "bloom_pick");

    if (e.type === "WinDeclared") {
      const w = e.payload as { winner: PlayerId; from: PlayerId | null; winType: string };
      bump(mem, `win:${w.winType}`);
      if (w.winType === "ron" && w.from !== null) {
        // 불가침 조약: 조약이 유효한 채로 버린 패에 론이 나면 안 된다
        if (mem.pactAtDiscard[w.from] === true) {
          add(out, "NORONPACT_RON", `ron on pact-active holder ${w.from} by ${w.winner}`, round, w.from);
        }
        if (mem.invAtDiscard[w.from] === true) {
          add(out, "INVINCIBLE_RON", `ron on invincible holder ${w.from} by ${w.winner}`, round, w.from);
        }
      }
    }

    if (e.type === "RoundSettled") {
      const p = e.payload as any;
      bump(mem, `settle:${p.outcome}`);
      const sum = Object.values(p.deltas as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
      // 유국(draw)은 합=0, 화료는 공탁 회수만큼 +
      if (p.outcome === "draw" && sum !== 0) {
        add(out, "DRAW_SUM_NONZERO",
          `sum=${sum} deltas=${JSON.stringify(p.deltas)} tenpai=${JSON.stringify(p.tenpaiPlayers)} augPoints=${JSON.stringify(p.augPoints)}`,
          round);
      }
      // 리치를 건 화료자는 리치 역을 반드시 가진다 (묵계로 연 손 포함)
      for (const w of (p.winInfos ?? []) as any[]) {
        if (!mem.riichiThisRound.has(w.winner)) continue;
        const ids = (w.yaku ?? []).map((y: any) => String(y.id));
        if (!ids.some((i: string) => i.includes("riichi"))) {
          add(out, "RIICHI_YAKU_MISSING", `winner=${w.winner} yaku=${JSON.stringify(ids)} silent=${mem.silentThisRound.has(w.winner)}`, round, w.winner);
        }
        if (mem.silentThisRound.has(w.winner) && !mem.kokushiPonThisRound.has(w.winner)) {
          bump(mem, "silent_riichi_win");
        }
      }
      // 우는 국사무쌍 화료는 역만이어야 한다
      for (const w of (p.winInfos ?? []) as any[]) {
        if (!mem.kokushiPonThisRound.has(w.winner)) continue;
        bump(mem, "kokushi_pon_win");
        if ((w.yakumanCount ?? 0) < 1) {
          add(out, "OPENKOKUSHI_NOT_YAKUMAN", `yaku=${JSON.stringify((w.yaku ?? []).map((y: any) => y.id))} han=${w.han}`, round, w.winner);
        }
      }
      // 만개했는데 그 국에 화료하지 못했다 (설명: "즉시 영상개화로 화료")
      for (const h of mem.bloomedThisRound) {
        bump(mem, "bloom");
        const won = ((p.winInfos ?? []) as any[]).some((w) => w.winner === h);
        if (!won) add(out, "BLOOM_NO_WIN", `outcome=${p.outcome}`, round, h as PlayerId);
      }
      // always_tenpai
      for (const h of holders("always_tenpai")) {
        if (p.outcome !== "draw") continue;
        bump(mem, "at:draw");
        const tp: PlayerId[] | undefined = p.tenpaiPlayers;
        if (tp !== undefined && !tp.includes(h)) {
          add(out, "ALWAYSTENPAI_NOT_TENPAI", `tenpaiPlayers=${JSON.stringify(tp)}`, round, h);
        }
        const d = p.deltas[h] ?? 0;
        if (d < 0) add(out, "ALWAYSTENPAI_PAYS", `delta=${d} deltas=${JSON.stringify(p.deltas)}`, round, h);
      }
      // yakuman_shield
      const wis: any[] = p.winInfos ?? [];
      const yaku = wis.filter((w) => (w.yakumanCount ?? 0) > 0 || w.limit === "yakuman" || w.limit === "kazoe_yakuman");
      if (yaku.length > 0) {
        bump(mem, "yakuman");
        for (const h of holders("yakuman_shield")) {
          if (wis.some((w) => w.winner === h)) continue;
          const d = p.deltas[h] ?? 0;
          if (d <= -8000) {
            add(out, "YAKUMANSHIELD_PAID", `delta=${d} winInfos=${JSON.stringify(yaku.map((w) => ({ w: w.winner, y: w.yakumanCount, pts: w.points })))}`, round, h);
          }
        }
      }
      // die_hard: 남은 횟수가 있는데 정산 결과가 음수로 끝나면 안 된다
      for (const h of holders("die_hard")) {
        const before = mem.scoresBefore[h] ?? 0;
        const after = before + (p.deltas[h] ?? 0);
        const used = st === null ? 0 : Number(st.augmentData[`die_hard:uses:${h}`] ?? 0);
        if (after < 0 && used < matchUses) {
          add(out, "DIEHARD_NO_REVIVE", `before=${before} delta=${p.deltas[h]} after=${after} used=${used}`, round, h);
        }
      }
    }
  };

  return { onState, onEvent, stats: mem.stats };
}

/** roundKey 소스 구현과 동일해야 한다 — util.ts의 roundKey */
function rkOfKey(st: GameState): string {
  return `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
}

export { WALL };
