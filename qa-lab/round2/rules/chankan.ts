/**
 * chankan.ts — 가깡 창깡(槍槓)의 실전 성립. flow2.ts 의 B 케이스가 준비 단계에서
 * 끊겨(가깡 옵션 도달 실패) 미검증으로 남아 있던 자리를 직접 몬다. 증강 없음.
 */
import { FlowController, handZone, kindKey } from "@majak/core";
import type { PlayerId, TileId, TileKind, StandardGame, FlowStatus } from "@majak/core";
import { craft, gameOf, h } from "./flow.js";

const results: { name: string; ok: boolean; note: string }[] = [];
const check = (n: string, ok: boolean, note = ""): void => { results.push({ name: n, ok, note }); };
const optionTypes = (p: PlayerId, s: FlowStatus): string[] =>
  s.kind !== "awaiting" ? [] : (s.prompts.find((x) => x.player === p)?.options.map((o) => o.type) ?? []);
const optsOf = (p: PlayerId, s: FlowStatus): { type: string; payload: unknown }[] =>
  s.kind !== "awaiting" ? [] : ((s.prompts.find((x) => x.player === p)?.options ?? []) as never);
const idOf = (g: StandardGame, p: PlayerId, spec: string, nth = 0): TileId => {
  const kind = h(spec)[0] as TileKind;
  const ids = (g.engine.state.zones[handZone(p)]?.tileIds ?? []).filter(
    (id) => kindKey(g.engine.state.tiles[id]!.kind) === kindKey(kind));
  const got = ids[nth];
  if (got === undefined) throw new Error(`${p} has no ${spec}`);
  return got;
};

function run(): void {
  // p3가 5m을 버림 → p0 펑 → p0 1s 버림 → p1·p2·p3 각각 버림 → p0 쯔모 → 5m 가깡
  // p1은 6m7m 양면으로 5m/8m 대기 (창깡 론 대상)
  const st = craft({
    hands: {
      p0: "555m123p456p789p1s",            // 13
      p1: "234m67m234p567p44s",            // 13 — 5m/8m 대기
      p2: "111s222s333s99s55s",            // 13
      p3: "5m99m111z222z333z44z",          // 14 (쯔모 상태)
    },
    phase: "turn.act", turnSeat: 3, drawnLastFor: "p3",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  s = flow.submit("p3", { type: "discard", payload: { tileId: idOf(game, "p3", "5m") } });
  check("창깡 준비: 5m 버림에 p1 론이 뜬다(직접 론)", optionTypes("p1", s).includes("win"),
    `p1=${optionTypes("p1", s).join(",")}`);
  const pon = optsOf("p0", s).find((o) => o.type === "pon");
  if (pon === undefined) { check("창깡 준비: p0 펑", false, `p0=${optionTypes("p0", s).join(",")}`); return; }
  // p1은 론을 넘기고 p0이 펑
  if (optionTypes("p1", s).includes("pass")) s = flow.submit("p1", { type: "pass", payload: {} });
  s = flow.submit("p0", pon as never);
  // p0 버림 (5m이 아닌 1s)
  s = flow.submit("p0", { type: "discard", payload: { tileId: idOf(game, "p0", "1s") } });
  // p1·p2·p3 순: 손에서 아무거나 (5m/8m은 p1 자신의 대기라 다른 사람 손에 없다)
  for (let i = 0; i < 30 && s.kind === "awaiting"; i++) {
    const kakan = optsOf("p0", s).find((o) => o.type === "shouminkan");
    if (kakan !== undefined) {
      s = flow.submit("p0", kakan as never);
      const opts = optionTypes("p1", s);
      const rs = game.engine.state.round.byPlayer["p1"];
      const hand1 = (game.engine.state.zones[handZone("p1")]?.tileIds ?? []).map((id) => kindKey(game.engine.state.tiles[id]!.kind)).join(" ");
      check("가깡 창깡: 5m 대기자가 론할 수 있다", opts.includes("win"),
        `p1=${opts.join(",")} prompts=${s.kind === "awaiting" ? s.prompts.map((x) => x.player).join("+") : s.kind} furiten=${String(rs?.temporaryFuriten)}/${String(rs?.riichiFuriten)} p1손=[${hand1}] 버림=${(rs?.discardedKinds ?? []).join(",")}`);
      if (opts.includes("win")) {
        const before = game.engine.state.players.map((p) => p.score);
        s = flow.submit("p1", { type: "win", payload: {} });
        const after = game.engine.state.players.map((p) => p.score);
        const deltas = after.map((v, j) => v - (before[j] ?? 0));
        const phase = game.engine.state.round.phase;
        check("가깡 창깡: 화료로 정산 — 가깡한 사람이 전부 낸다",
          (phase === "round.over" || phase === "setup") && deltas[1]! > 0 && deltas[0]! === -deltas[1]!,
          `phase=${phase} deltas=${deltas.join("/")}`);
      }
      return;
    }
    let moved = false;
    for (const pr of s.prompts) {
      const drawn = game.engine.state.round.lastDrawnTile;
      const pick =
        pr.options.find((o) => o.type === "discard" && (o.payload as { tileId?: TileId }).tileId === drawn) ??
        pr.options.find((o) => o.type === "discard") ?? pr.options.find((o) => o.type === "pass");
      if (pick === undefined) continue;
      try { s = flow.submit(pr.player, pick as never); moved = true; break; } catch { /* */ }
    }
    if (!moved) break;
  }
  check("가깡 창깡: 가깡 옵션에 도달", false, `s=${s.kind} p0=${optionTypes("p0", s).join(",")}`);
}

try { run(); } catch (e) { check("예외", false, String(e)); }
for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.note === "" ? "" : ` — ${r.note}`}`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} 통과`);
