/**
 * aug-1 도메인 불변식 — runMatch의 onState/onRound에 꽂아 쓴다.
 * 각 증강의 description/detail이 약속한 한도·게이트를 상태에서 직접 확인한다.
 */
import {
  DEAD_WALL,
  DISARMED_SOURCES_KEY,
  ROUND_SCOPED_MARK,
  handIdsOf,
  isWinningShape,
  kindOf,
  meldCountOf,
  meldInfosOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import type { Violation } from "../../harness.js";

const matchUses = (st: GameState): number => (st.config.mode === "tonpuu" ? 1 : 2);
const num = (st: GameState, k: string): number => {
  const v = st.augmentData[k];
  return typeof v === "number" ? v : 0;
};
const roundKey = (st: GameState): string =>
  `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
const rsKey = (id: string, tag: string, st: GameState, h: PlayerId): string =>
  `${id}:${tag}:${roundKey(st)}:${h}${ROUND_SCOPED_MARK}`;

export function makeChecks(): (st: GameState, out: Violation[]) => void {
  const seen = new Set<string>();
  return (st, out) => {
    const rk = roundKey(st);
    const add = (kind: string, detail: string, seat?: PlayerId): void => {
      const k = `${kind}|${detail}|${seat ?? ""}`;
      if (seen.has(k) || out.length > 300) return;
      seen.add(k);
      out.push(seat === undefined ? { kind, detail, round: rk } : { kind, detail, round: rk, seat });
    };
    const has = (p: { augments: readonly string[] }, id: string): boolean =>
      p.augments.includes(id);

    for (const p of st.players) {
      const h = p.id;
      // ── 게임 단위 횟수 한도 ──
      const mu = matchUses(st);
      for (const id of ["brief_fog", "call_seal", "disarm", "die_hard"]) {
        if (!has(p, id)) continue;
        const used = num(st, `${id}:uses:${h}`);
        if (used > mu) add("USES_OVER", `${id} used=${used} > ${mu}`, h);
      }
      if (has(p, "alchemist")) {
        const used = num(st, `alchemist:used:${h}`);
        if (used > 5) add("USES_OVER", `alchemist used=${used} > 5`, h);
      }
      // ── 국 단위 횟수 ──
      if (has(p, "all_or_nothing")) {
        const u = num(st, rsKey("all_or_nothing", "uses", st, h));
        if (u > 1) add("USES_OVER", `all_or_nothing round uses=${u}`, h);
      }
      if (has(p, "dead_wall_master")) {
        const u = num(st, rsKey("dead_wall_master", "swaps", st, h));
        if (u > 2) add("USES_OVER", `dead_wall_master swaps=${u} > 2`, h);
      }
      // ── cliff_bloom: 만개는 깡 2회 뒤에만 ──
      if (has(p, "cliff_bloom")) {
        const bloomed = st.augmentData[rsKey("cliff_bloom", "bloomed", st, h)] === true;
        const kans = num(st, rsKey("cliff_bloom", "kans", st, h));
        if (bloomed && kans < 2) {
          add("BLOOM_EARLY", `bloomed but kans=${kans}`, h);
        }
        if (bloomed && st.round.phase === "turn.act") {
          // "손패가 완성형으로 재구성되어 즉시 화료" — 진짜 화료형인가
          const SHAPE = ["broken_border", "broken_wall", "async_chiitoi", "true_dragon", "mixed_triplet", "royal_kokushi", "open_kokushi"];
          if (!p.augments.some((x) => SHAPE.includes(x))) {
            const kinds = handIdsOf(st, h).map((id) => kindOf(st, id));
            if (kinds.length > 0 && !isWinningShape(kinds, meldCountOf(st, h))) {
              add("BLOOM_NOT_WINNING", `만개했는데 화료형이 아니다 (hand=${kinds.length}, melds=${meldCountOf(st, h)})`, h);
            }
          }
        }
        const realKans = meldInfosOf(st, h).filter((m) => m.kind.startsWith("kan")).length;
        if (kans > realKans + 1) {
          add("KAN_COUNT_DRIFT", `counter=${kans} melds=${realKans}`, h);
        }
      }
      // ── counter: 국당 1회 ──
      if (has(p, "counter")) {
        const struck = st.augmentData[`counter:struck:${h}`] === true;
        const prev = st.augmentData[`counter:prev:${h}`];
        if (struck && (typeof prev !== "string" || prev === "")) {
          add("COUNTER_NO_TARGET", `struck=true but prev=${JSON.stringify(prev)}`, h);
        }
      }
      // ── avenger: 원수는 자기 자신이 될 수 없다 ──
      if (has(p, "avenger")) {
        const nem = st.augmentData[`avenger:nemesis:${h}`];
        if (nem === h) add("AVENGER_SELF", `nemesis=self`, h);
      }
      // ── 적도라가 생성패로 살아남지 않는다 (연금술사) ──
      if (has(p, "alchemist")) {
        for (const [idStr, t] of Object.entries(st.tiles)) {
          const attrs = (t as { attrs?: Record<string, unknown> }).attrs ?? {};
          const kind = (t as { kind: { suit: string; rank: number } }).kind;
          if (attrs["red"] === true && attrs["conjured"] === true && kind.rank !== 5) {
            add("RED_MOVED", `tile ${idStr} red+conjured rank=${kind.rank}`, h);
          }
        }
      }
    }

    // ── 왕패는 늘어나지 않는다 ──
    const dw = st.zones[DEAD_WALL]?.tileIds.length ?? 0;
    if (dw > 14) add("DEADWALL_GROW", `deadWall=${dw}`);

    // ── 무장해제 목록에 자기 자신을 넣지 않았는가 ──
    const dis = st.augmentData[DISARMED_SOURCES_KEY];
    if (Array.isArray(dis)) {
      for (const s of dis as string[]) {
        const [owner] = String(s).split(":");
        const holder = st.players.find((p) => p.id === owner);
        if (holder === undefined) add("DISARM_UNKNOWN", `src=${s}`);
      }
    }
  };
}

/** 국이 끝난 시점(정산 반영 후) 검사 */
export function makeRoundChecks(): (st: GameState, phase: "start" | "end", out: Violation[]) => void {
  const lastScores = new Map<PlayerId, number>();
  return (st, phase, out) => {
    const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
    const add = (kind: string, detail: string, seat?: PlayerId): void => {
      if (out.length > 300) return;
      out.push(seat === undefined ? { kind, detail, round: rk } : { kind, detail, round: rk, seat });
    };
    if (phase === "start") {
      // 국 시작에 무장해제가 남아 있으면 안 된다 (disarm은 국 종료에 해제)
      const dis = st.augmentData[DISARMED_SOURCES_KEY];
      if (Array.isArray(dis) && dis.length > 0) {
        add("DISARM_LEAKED", `국 시작인데 잠긴 채: ${(dis as string[]).join(",")}`);
      }
      for (const p of st.players) lastScores.set(p.id, p.score);
      return;
    }
    // 국 종료: 죽기살기 보유자는 0 미만으로 끝나지 않는다 (횟수가 남아 있는 한)
    for (const p of st.players) {
      if (!p.augments.includes("die_hard")) continue;
      const mu = st.config.mode === "tonpuu" ? 1 : 2;
      const used = typeof st.augmentData[`die_hard:uses:${p.id}`] === "number"
        ? (st.augmentData[`die_hard:uses:${p.id}`] as number)
        : 0;
      if (p.score < 0 && used < mu) {
        add("DIEHARD_MISS", `score=${p.score} used=${used}/${mu}`, p.id);
      }
    }
  };
}
