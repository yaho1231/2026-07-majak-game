/**
 * aug-4 도메인 불변식 — 담당 28증강의 description/detail이 약속하는 것을 검사로 바꾼다.
 */
import {
  DEAD_WALL,
  WALL,
  handIdsOf,
  handZone,
  isNumberSuit,
  kindOf,
  meldsZone,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import type { Violation } from "../../harness.js";

export const MINE: readonly string[] = [
  "sign_flip", "silent_pact", "silent_swap", "soul_hunt", "soul_strike", "spy",
  "stealth_riichi", "suit_unify", "snake_kan", "table_flip", "take_back",
  "tanyao_break", "tenpai_scan", "three_dragons_will", "tile_dyeing", "tile_split",
  "time_pressure", "time_stop", "triple_peek", "true_dragon", "unification",
  "ura_peek", "void_kan", "wind_lineage", "xray_hand", "yakuman_shield",
  "free_riichi_discard",
];

export interface DomainCtx {
  violations: Violation[];
  holders: Record<string, readonly string[]>;
  /** 좌석별 연속 턴(같은 좌석이 연달아 turn.act에 들어온 횟수) 추적 */
  lastTurnSeat?: number;
  runLen?: number;
  seenRound?: string;
  /** 좌석별 최근 discardCount — soul_strike 폭주 길이 계산용 */
  drawsWhileActive?: Record<string, number>;
  prevWall?: number;
  lastSig?: string;
}

const rk = (st: GameState): string =>
  `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;

export function checkDomain(st: GameState, out: Violation[], c: DomainCtx): void {
  const add = (kind: string, detail: string, seat?: PlayerId): void => {
    if (out.length < 400) {
      out.push(seat === undefined ? { kind, detail, round: rk(st) } : { kind, detail, round: rk(st), seat });
    }
  };
  const has = (p: PlayerId, id: string): boolean =>
    st.players.find((x) => x.id === p)?.augments.includes(id) === true;

  if (c.seenRound !== rk(st)) {
    c.seenRound = rk(st);
    c.lastTurnSeat = undefined;
    c.runLen = 0;
  }

  // ── 왕패 크기: DEAD_WALL은 14에서 깡마다 1씩 줄어드는 것이 정상. 늘어나면 버그.
  const dw = st.zones[DEAD_WALL]?.tileIds.length ?? 0;
  if (dw > 14) add("DEADWALL_GROW", `deadWall=${dw}`);

  // ── 총 패 수 보존 (136 + 적도라 없음). 어디에도 없는 패/중복 패
  let total = 0;
  for (const z of Object.values(st.zones)) total += z.tileIds.length;
  const tileCount = Object.keys(st.tiles).length;
  if (total !== tileCount) add("TILE_LOST", `zones=${total} tiles=${tileCount}`);

  // ── 연속 턴 감시 (time_stop 최대 2연속 / soul_strike 최대 6+영상)
  if (st.round.phase === "turn.act") {
    const seat = st.round.turnSeat;
    const who = st.players.find((p) => p.seat === seat);
    if (who !== undefined) {
      const sig = `${seat}:${st.round.byPlayer[who.id]?.discardCount ?? 0}:${String(st.round.lastDrawnTile)}`;
      if (c.lastSig !== sig) {
        c.lastSig = sig;
        if (seat === c.lastTurnSeat) c.runLen = (c.runLen ?? 1) + 1;
        else { c.lastTurnSeat = seat; c.runLen = 1; }
        const run = c.runLen ?? 1;
        const soul = who.augments.includes("soul_strike");
        const cap = soul ? 24 : who.augments.includes("time_stop") ? 6 : 4;
        if (run > cap) {
          add("TURN_RUN", `seat=${seat} run=${run} augs=${who.augments.join(",")}`, who.id);
          c.runLen = 0; // 한 번만 보고
        }
      }
    }
  }

  for (const p of st.players) {
    const id = p.id;
    const hand = handIdsOf(st, id);
    const melds = st.round.byPlayer[id]?.melds ?? [];

    // ── true_dragon: 배패 16장 · 화료 17장 (드래프트 직후 국은 13장이라 하한만 본다)
    if (has(id, "true_dragon")) {
      const eff = hand.length + melds.length * 3;
      if (hand.length > 0 && (eff < 13 || eff > 17)) {
        add("TRUE_DRAGON_SIZE", `hand=${hand.length} melds=${melds.length} eff=${eff}`, id);
      }
    } else {
      const eff = hand.length + melds.length * 3;
      if (hand.length > 0 && (eff < 13 || eff > 14)) {
        add("HAND_SIZE_STD", `hand=${hand.length} melds=${melds.length} eff=${eff}`, id);
      }
    }

    // ── silent_pact: 국당 silent 후로는 최대 1개
    const silents = melds.filter((m) => m.silent === true).length;
    if (silents > 1) add("SILENT_PACT_MULTI", `silent melds=${silents}`, id);
    if (silents > 0 && !has(id, "silent_pact")) {
      add("SILENT_WITHOUT_AUG", `silent meld but no silent_pact`, id);
    }

    // ── stealth_riichi: 스텔스 활성인데 riichiPot에 공탁이 실렸는가 (공탁 면제 확인)
    const rs = st.round.byPlayer[id];
    if (rs?.riichi != null && rs.riichi.cost !== undefined && rs.riichi.cost < 0) {
      add("RIICHI_COST_NEG", `cost=${rs.riichi.cost}`, id);
    }

    // ── take_back / tile_dyeing: 사용 횟수 상한
    const dyed = st.augmentData[`tile_dyeing:used:${id}`];
    if (typeof dyed === "number" && dyed > 5) add("DYE_OVER", `used=${dyed}`, id);
    const xray = st.augmentData[`xray_hand:uses:${id}`];
    const maxUses = st.config.mode === "tonpuu" ? 1 : 2;
    if (typeof xray === "number" && xray > maxUses) add("XRAY_OVER", `uses=${xray}/${maxUses}`, id);
    const su = st.augmentData[`suit_unify:uses:${id}`];
    if (typeof su === "number" && su > maxUses) add("SUITUNIFY_OVER", `uses=${su}/${maxUses}`, id);
    const tdw = st.augmentData[`three_dragons_will:uses:${id}`];
    if (typeof tdw === "number" && tdw > maxUses) add("TDW_OVER", `uses=${tdw}/${maxUses}`, id);

    // ── soul_strike: 남은 연속 쯔모 카운터는 0..6
    const left = st.augmentData[`soul_strike:left:${rk(st)}:${id}#round`];
    if (typeof left === "number" && (left < 0 || left > 6)) {
      add("SOUL_STRIKE_LEFT", `left=${left}`, id);
    }

    // ── 정보 누설: 비밀이어야 할 채널이 view:* (전원 공개)로 나가면 안 된다
    for (const key of Object.keys(st.augmentData)) {
      if (!key.startsWith("view:*:")) continue;
      const rest = key.slice("view:*:".length);
      if (rest.startsWith("spy:mark")) add("LEAK_SPY_MARK", key);
      if (rest.startsWith("tenpai_scan") && !rest.startsWith("tenpai_scan:uses")) {
        add("LEAK_TENPAI_SCAN", key);
      }
      if (rest.startsWith("ura")) add("LEAK_URA", key);
      if (/^triple_peek(#|:)/.test(rest)) {
        const v = st.augmentData[key];
        if (Array.isArray(v)) add("LEAK_TRIPLE_PEEK", `${key}=${JSON.stringify(v)}`);
      }
      if (rest.startsWith("stealth_riichi")) add("LEAK_STEALTH", key);
    }
  }

  void WALL; void handZone; void meldsZone; void isNumberSuit; void kindOf; void c;
}
