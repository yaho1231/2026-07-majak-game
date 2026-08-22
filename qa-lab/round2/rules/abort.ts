/**
 * abort.ts — 도중유국 4종의 실전 발동 (증강 없음).
 *   사풍연타 · 사가리치 · 삼가화 · 사깡산료
 */
import { FlowController, handZone, kindKey } from "@majak/core";
import type { PlayerId, TileId, TileKind, StandardGame, FlowStatus, GameState } from "@majak/core";
import { craft, gameOf, h } from "./flow.js";

const results: { name: string; ok: boolean; note: string }[] = [];
const check = (name: string, ok: boolean, note = ""): void => { results.push({ name, ok, note }); };
const idOf = (game: StandardGame, player: PlayerId, spec: string, nth = 0): TileId => {
  const kind = h(spec)[0] as TileKind;
  const ids = (game.engine.state.zones[handZone(player)]?.tileIds ?? []).filter(
    (id) => kindKey(game.engine.state.tiles[id]!.kind) === kindKey(kind));
  const got = ids[nth];
  if (got === undefined) throw new Error(`${player} has no ${spec}`);
  return got;
};
const drive = (flow: FlowController, s0: FlowStatus, stop: (s: FlowStatus) => boolean, n = 40): FlowStatus => {
  let s = s0;
  for (let i = 0; i < n && s.kind === "awaiting" && !stop(s); i++) {
    let moved = false;
    for (const pr of s.prompts) {
      const pick = pr.options.find((o) => o.type === "discard") ?? pr.options.find((o) => o.type === "pass");
      if (pick === undefined) continue;
      try { s = flow.submit(pr.player, pick as never); moved = true; break; } catch { /* decided */ }
    }
    if (!moved) break;
  }
  return s;
};
const withFirstTurn = (st: GameState): GameState => ({ ...st, round: { ...st.round, firstTurn: true } });

// ── 1. 사풍연타 ─────────────────────────────────────────────────
function testFourWind(): void {
  const st = withFirstTurn(craft({
    hands: {
      p0: "1z234m567m234p567s9s", p1: "1z234m567m234p567s9m",
      p2: "1z345m678m345p678s9p", p3: "1z345m678m345p678s1s",
    },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  }));
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  for (const p of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
    if (s.kind !== "awaiting") break;
    if (!s.prompts.some((x) => x.player === p && x.options.some((o) => o.type === "discard"))) {
      // 리액션 정리
      for (const pr of s.prompts) { try { s = flow.submit(pr.player, { type: "pass", payload: {} }); } catch { /* */ } }
    }
    try { s = flow.submit(p, { type: "discard", payload: { tileId: idOf(game, p, "1z") } }); } catch (e) { check(`사풍연타: ${p} 동 버리기`, false, String(e)); return; }
    for (const pr of s.kind === "awaiting" ? s.prompts : []) {
      if (pr.options.every((o) => o.type === "pass")) { try { s = flow.submit(pr.player, { type: "pass", payload: {} }); } catch { /* */ } }
    }
  }
  const ph = game.engine.state.round.phase;
  check("사풍연타: 네 명이 첫 순에 동을 버리면 도중유국",
    ph === "round.over" || ph === "setup", `phase=${ph} firstTurn=${game.engine.state.round.firstTurn}`);
}

// ── 2. 사가리치 ─────────────────────────────────────────────────
function testFourRiichi(): void {
  const st = craft({
    hands: {
      p0: "123456789m111p22p", p1: "123456789p222s3s",
      p2: "123456789s111z2z", p3: "333z444z555z666z7z",
    },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  let declared = 0;
  for (const p of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
    if (s.kind !== "awaiting") break;
    const pr = s.prompts.find((x) => x.player === p);
    const r = pr?.options.find((o) => o.type === "riichi");
    if (r === undefined) { check(`사가리치: ${p} 리치 옵션`, false, `${pr?.options.map((o) => o.type).join(",")}`); return; }
    s = flow.submit(p, r as never);
    declared++;
    for (let i = 0; i < 6; i++) {
      if (s.kind !== "awaiting") break;
      const q = s.prompts.find((x) => x.options.some((o) => o.type === "pass") && !x.options.some((o) => o.type === "riichi"));
      if (q === undefined) break;
      try { s = flow.submit(q.player, { type: "pass", payload: {} }); } catch { break; }
    }
  }
  const ph = game.engine.state.round.phase;
  check("사가리치: 네 명이 리치를 걸면 도중유국", declared === 4 && (ph === "round.over" || ph === "setup"),
    `declared=${declared} phase=${ph}`);
}

// ── 3. 삼가화 ───────────────────────────────────────────────────
function testTripleRon(): void {
  const st = craft({
    hands: {
      p0: "5p99m111z222z333z44z",     // 14장 → 5p 버림
      p1: "234m678m222m46p55s",       // 5p 칸찬, 탕야오 (13장)
      p2: "234s678s222s46p55m",       // 5p 칸찬, 탕야오 (13장)
      p3: "345m345s777s46p88m",       // 5p 칸찬, 탕야오 (13장)
    },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  s = flow.submit("p0", { type: "discard", payload: { tileId: idOf(game, "p0", "5p") } });
  const winners = s.kind === "awaiting" ? s.prompts.filter((x) => x.options.some((o) => o.type === "win")).map((x) => x.player) : [];
  check("삼가화 준비: 셋 다 론 가능", winners.length === 3, `가능=${winners.join(",")}`);
  if (winners.length !== 3) return;
  for (const w of winners) { try { s = flow.submit(w, { type: "win", payload: {} }); } catch { /* */ } }
  const st2 = game.engine.state;
  const deltas = st2.players.map((p) => `${p.id}:${p.score - 25000}`).join(" ");
  check("삼가화: 세 명이 동시 론하면 도중유국 (점수 이동 없음)",
    st2.players.every((p) => p.score === 25000), `점수변화 ${deltas}`);
}

// ── 4. 사깡산료 (두 사람이 합쳐 4깡) ──────────────────────────────
function testFourKan(): void {
  const st = craft({
    hands: { p0: "1111m2222m345p678p", p1: "3333s4444s345p67p", p2: "555m666m777m888m9m", p3: "111p222p999p111s2s" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  const kanOnce = (p: PlayerId): boolean => {
    if (s.kind !== "awaiting") return false;
    const pr = s.prompts.find((x) => x.player === p);
    const k = pr?.options.find((o) => o.type === "ankan");
    if (k === undefined) return false;
    s = flow.submit(p, k as never);
    return true;
  };
  const step = (p: PlayerId): void => {
    if (s.kind !== "awaiting") return;
    const pr = s.prompts.find((x) => x.player === p);
    const d = pr?.options.find((o) => o.type === "discard");
    if (d !== undefined) s = flow.submit(p, d as never);
    for (let i = 0; i < 6; i++) {
      if (s.kind !== "awaiting") break;
      const q = s.prompts.find((x) => x.options.some((o) => o.type === "pass"));
      if (q === undefined) break;
      try { s = flow.submit(q.player, { type: "pass", payload: {} }); } catch { break; }
    }
  };
  let kans = 0;
  for (let round = 0; round < 4 && kans < 4; round++) {
    for (const p of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
      if (game.engine.state.round.phase !== "turn.act" && game.engine.state.round.phase !== "reaction") break;
      while ((p === "p0" || p === "p1") && kanOnce(p)) kans++;
      step(p);
    }
  }
  const stt = game.engine.state;
  check("사깡산료: 서로 다른 두 사람이 4깡을 채우면 도중유국",
    stt.round.kanCount < 4 || stt.round.phase === "round.over" || stt.round.phase === "setup",
    `kanCount=${stt.round.kanCount} callers=${JSON.stringify(stt.round.kanCallers)} phase=${stt.round.phase}`);
}

for (const [n, fn] of [["fourWind", testFourWind], ["fourRiichi", testFourRiichi],
  ["tripleRon", testTripleRon], ["fourKan", testFourKan]] as [string, () => void][]) {
  try { fn(); } catch (e) { check(`${n} — 예외`, false, String(e)); }
}
console.log("\n===== abort =====");
let bad = 0;
for (const r of results) { if (!r.ok) bad++; console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.note === "" ? "" : ` — ${r.note}`}`); }
console.log(`${results.length - bad}/${results.length} 통과`);
