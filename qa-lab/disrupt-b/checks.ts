/** disrupt-b 도메인 불변식 */
import { DEAD_WALL, WALL, discardsZone } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { byId, type Violation } from "../harness.js";

const MY = [
  "call_seal", "brief_fog", "disarm", "push_riichi", "frame_up",
  "hourglass", "time_pressure", "blind_ron", "reload", "cornucopia",
] as const;

export const MINE: readonly string[] = MY;

const roundKey = (st: GameState): string =>
  `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
const matchUses = (st: GameState): number => (st.config.mode === "tonpuu" ? 1 : 2);
const num = (st: GameState, k: string): number => {
  const v = st.augmentData[k];
  return typeof v === "number" ? v : 0;
};

export interface Ctx {
  /** 국별로 한 번만 보고하기 위한 중복 제거 */
  seen: Set<string>;
  /** 좌석별 후로(열린 멘쯔) 수 스냅샷 */
  openMelds: Record<string, number>;
  /** `<id>:uses:<holder>` 카운터 스냅샷 */
  uses: Record<string, number>;
  /** 좌석별 관측된 복구(카운터 감소) 횟수 */
  restored: Record<string, number>;
}

export function makeCtx(): Ctx {
  return { seen: new Set(), openMelds: {}, uses: {}, restored: {} };
}

export function domainCheck(st: GameState, out: Violation[], ctx: Ctx): void {
  const rk = roundKey(st);
  const add = (kind: string, detail: string, seat?: PlayerId): void => {
    const key = `${kind}|${detail}|${rk}|${seat ?? ""}`;
    if (ctx.seen.has(key)) return;
    ctx.seen.add(key);
    if (out.length < 400) out.push(seat === undefined ? { kind, detail, round: rk } : { kind, detail, round: rk, seat });
  };

  // 1) 같은 증강을 두 사람이 들고 있다 (수상한 주사위 지급 경로)
  const owner = new Map<string, PlayerId>();
  for (const p of st.players) {
    for (const a of p.augments) {
      const prev = owner.get(a);
      if (prev !== undefined && prev !== p.id) add("AUG_DUP", `${a}: ${prev} & ${p.id}`);
      else owner.set(a, p.id);
    }
    // 2) 상호 배제 조합을 한 사람이 들고 있다
    for (const a of p.augments) {
      for (const b of p.augments) {
        if (a === b) continue;
        if ((byId.get(a)?.conflicts ?? []).includes(b)) add("AUG_CONFLICT_HELD", `${a} + ${b}`, p.id);
      }
    }
  }

  // 3) 사용 카운터 회계 — 음수, 또는 한도를 넘는 값
  for (const [k, v] of Object.entries(st.augmentData)) {
    if (typeof v !== "number") continue;
    if (/:uses:|:used:/.test(k) && v < 0) add("USES_NEGATIVE", `${k}=${v}`);
  }

  // 4) 함구령 — 봉인이 끝났는데 공개 표식이 남아 있다
  for (const p of st.players) {
    if (!p.augments.includes("call_seal")) continue;
    const declared = st.augmentData[`call_seal:turn:${rk}:${p.id}#round`];
    const active =
      num(st, `call_seal:uses:${p.id}`) > 0 &&
      typeof declared === "number" &&
      st.round.turnCount - declared < 6;
    const noticeRaw = Object.entries(st.augmentData).find(([k]) =>
      k.includes(`view:*:call_seal:${p.id}`),
    );
    const notice = noticeRaw?.[1];
    const shown = notice !== undefined && notice !== "" && notice !== null;
    if (!active && shown && typeof declared === "number") {
      add("CALLSEAL_STALE_NOTICE", `turnCount=${st.round.turnCount} declared=${declared} notice=${JSON.stringify(notice)}`, p.id);
    }
  }

  // 5) 박무 — 안개가 걷혔는데 표식/공개 tileId가 남아 있다
  for (const p of st.players) {
    if (!p.augments.includes("brief_fog")) continue;
    const declared = st.augmentData[`brief_fog:turn:${rk}:${p.id}#round`];
    const active =
      num(st, `brief_fog:uses:${p.id}`) > 0 &&
      typeof declared === "number" &&
      st.round.turnCount - declared < 6;
    const revealed = Object.entries(st.augmentData).find(([k]) =>
      k.includes(`view:*:revealTiles:fog:${p.id}`),
    )?.[1];
    if (!active && Array.isArray(revealed) && revealed.length > 0) {
      add("FOG_STALE_REVEAL", `turnCount=${st.round.turnCount} declared=${String(declared)} n=${revealed.length}`, p.id);
    }
  }

  // 6) 등 떠밀기 — 낙인 표시와 실제 낙인 상태가 어긋난다
  for (const p of st.players) {
    if (!p.augments.includes("push_riichi")) continue;
    const brand = st.augmentData[`push_riichi:brand:${rk}:${p.id}#round`];
    const view = Object.entries(st.augmentData).find(([k]) =>
      k.includes(`view:*:push_riichi:${p.id}`) && !k.includes("fired"),
    )?.[1];
    const b = typeof brand === "string" && brand !== "" ? brand : null;
    const v = typeof view === "string" && view !== "" ? view : null;
    if (b !== v) add("BRAND_VIEW_MISMATCH", `brand=${String(b)} view=${String(v)}`, p.id);
  }

  // 7) 무장해제 — 잠금 목록이 국을 넘어 살아 있는지 (국 시작 시점에서만 의미)
  const disarmed = st.augmentData["engine:disarmed#round"];
  if (Array.isArray(disarmed) && disarmed.length > 3) {
    add("DISARM_PILEUP", `n=${disarmed.length}: ${JSON.stringify(disarmed)}`);
  }

  // 8) 왕패 — 뒤집힌 모래시계가 도라 표시패 영역까지 가져갔는가
  const dw = st.zones[DEAD_WALL]?.tileIds.length ?? 0;
  if (dw < 10 && (st.zones[WALL]?.tileIds.length ?? 0) < 136) add("DEADWALL_SMALL", `deadWall=${dw} wall=${st.zones[WALL]?.tileIds.length ?? 0}`);

  // 10) 함구령 — 봉인 중에 비보유자의 후로(열린 멘쯔)가 늘었는가
  for (const p of st.players) {
    if (!p.augments.includes("call_seal")) continue;
    const declared = st.augmentData[`call_seal:turn:${rk}:${p.id}#round`];
    const active =
      num(st, `call_seal:uses:${p.id}`) > 0 &&
      typeof declared === "number" &&
      st.round.turnCount - declared < 6;
    if (!active) continue;
    for (const q of st.players) {
      if (q.id === p.id) continue;
      const melds = st.round.byPlayer[q.id]?.melds ?? [];
      const open = melds.filter((m) => m.kind !== "kan_closed" && m.silent !== true).length;
      const key = `${rk}:${q.id}`;
      const prev = ctx.openMelds[key] ?? 0;
      if (open > prev) {
        add("SEAL_BROKEN_CALL", `seal by ${p.id} (declared=${String(declared)} now=${st.round.turnCount}) but ${q.id} open melds ${prev}->${open} kinds=${melds.map((m) => m.kind).join(",")} disarmed=${JSON.stringify(st.augmentData["engine:disarmed#round"])}`, q.id);
      }
    }
  }
  for (const q of st.players) {
    const melds = st.round.byPlayer[q.id]?.melds ?? [];
    ctx.openMelds[`${rk}:${q.id}`] = melds.filter((m) => m.kind !== "kan_closed" && m.silent !== true).length;
  }

  // 11) 재장전 회계 — 사용 카운터가 줄어든 총 횟수는 재장전 사용 횟수를 넘을 수 없다
  for (const [k, v] of Object.entries(st.augmentData)) {
    if (typeof v !== "number") continue;
    const m = /^([a-z_0-9]+):(uses|used):(p[0-3])$/.exec(k);
    if (m === null) continue;
    const prev = ctx.uses[k];
    if (prev !== undefined && v < prev) {
      const holder = m[3] as PlayerId;
      ctx.restored[holder] = (ctx.restored[holder] ?? 0) + (prev - v);
      const reloadUses = num(st, `reload:uses:${holder}`);
      if ((ctx.restored[holder] ?? 0) > reloadUses) {
        add("RELOAD_OVER_RESTORE", `${holder}: 복구 누적 ${ctx.restored[holder]} > reload 사용 ${reloadUses} (key ${k} ${prev}->${v})`, holder);
      }
    }
    ctx.uses[k] = v;
  }

  // 9) 버림패 총량 — 누명이 실물을 복제하지 않는가 (전체 tile 수 불변은 harness가 봄)
  let disc = 0;
  for (const p of st.players) disc += st.zones[discardsZone(p.id)]?.tileIds.length ?? 0;
  if (disc > 4 * 30) add("DISCARDS_HUGE", `total=${disc}`);
}

/** 국이 끝난 뒤(다음 국 시작 시) 남아 있으면 안 되는 것들 */
export function crossRoundCheck(st: GameState, out: Violation[], ctx: Ctx): void {
  const rk = roundKey(st);
  const add = (kind: string, detail: string, seat?: PlayerId): void => {
    const key = `${kind}|${detail}|${rk}|${seat ?? ""}`;
    if (ctx.seen.has(key)) return;
    ctx.seen.add(key);
    out.push(seat === undefined ? { kind, detail, round: rk } : { kind, detail, round: rk, seat });
  };
  const disarmed = st.augmentData["engine:disarmed#round"];
  if (Array.isArray(disarmed) && disarmed.length > 0) {
    add("DISARM_LEAK_ACROSS_ROUND", JSON.stringify(disarmed));
  }
  for (const p of st.players) {
    const lk = Object.entries(st.augmentData).filter(([k, v]) =>
      k.startsWith(`disarm:locked:${p.id}`) && Array.isArray(v) && (v as unknown[]).length > 0,
    );
    if (lk.length > 0) add("DISARM_LOCKED_LEAK", JSON.stringify(lk), p.id);
  }
}

export const MATCH_USES = matchUses;
