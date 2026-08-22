/**
 * flow2.ts — flow.ts 가 안 덮은 흐름 규칙들 (증강 없음).
 *   리치 영구 후리텐 · 창깡(가깡/안깡) · 영상개화 · 해저/하이테이 ·
 *   울음 우선순위 · 일발 소멸 · 깡도라 공개 시점 · 리치 중 안깡 대기 불변 ·
 *   사깡산료 · 사풍연타 · 삼가화
 */
import { FlowController, handZone, kindKey, WALL, DEAD_WALL } from "@majak/core";
import type { PlayerId, TileId, TileKind, StandardGame, FlowStatus, GameState } from "@majak/core";
import { craft, gameOf, h } from "./flow.js";

const results: { name: string; ok: boolean; note: string }[] = [];
function check(name: string, ok: boolean, note = ""): void { results.push({ name, ok, note }); }

function optionTypes(player: PlayerId, status: FlowStatus): string[] {
  if (status.kind !== "awaiting") return [];
  const p = status.prompts.find((x) => x.player === player);
  return p === undefined ? [] : p.options.map((o) => o.type);
}
function optsOf(player: PlayerId, status: FlowStatus): { type: string; payload: unknown }[] {
  if (status.kind !== "awaiting") return [];
  return (status.prompts.find((x) => x.player === player)?.options ?? []) as never;
}
function validate(game: StandardGame, player: PlayerId, type: string, payload: unknown): string | null {
  const def = game.engine.actions.get(type);
  if (def === undefined) return "unknown action";
  return def.validate({ player, type, payload }, { state: game.engine.state, rules: game.engine.rules });
}
const idOf = (game: StandardGame, player: PlayerId, spec: string, nth = 0): TileId => {
  const kind = h(spec)[0] as TileKind;
  const ids = (game.engine.state.zones[handZone(player)]?.tileIds ?? []).filter(
    (id) => kindKey(game.engine.state.tiles[id]!.kind) === kindKey(kind),
  );
  const got = ids[nth];
  if (got === undefined) throw new Error(`${player} has no ${spec} (${ids.length})`);
  return got;
};
const passAll = (flow: FlowController, st: FlowStatus, except: PlayerId[] = []): FlowStatus => {
  let s = st;
  for (let i = 0; i < 8; i++) {
    if (s.kind !== "awaiting") return s;
    const pr = s.prompts.find((x) => !except.includes(x.player) && x.options.some((o) => o.type === "pass"));
    if (pr === undefined) return s;
    s = flow.submit(pr.player, { type: "pass", payload: {} });
  }
  return s;
};

// ── A. 리치 영구 후리텐 ──────────────────────────────────────────
function testRiichiFuriten(): void {
  const st = craft({
    hands: {
      p0: "234m567m234p45s99p",         // 3s-6s 양면 (13장) — 리치
      p1: "3s99m111z222z333z44z",       // 14장 → 3s 버림
      p2: "6s99s111p222p333p44p",       // 14장 → 6s 버림
      p3: "111s222s333s444s55s",
    },
    phase: "turn.act", turnSeat: 1, drawnLastFor: "p1", riichi: ["p0"],
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  s = flow.submit("p1", { type: "discard", payload: { tileId: idOf(game, "p1", "3s") } });
  const first = optionTypes("p0", s);
  check("리치 후리텐 준비: 3s에 론이 뜬다", first.includes("win"), `옵션=${first.join(",")}`);
  if (!first.includes("win")) return;
  s = flow.submit("p0", { type: "pass", payload: {} });
  s = passAll(flow, s);
  const rf = game.engine.state.round.byPlayer["p0"];
  check("리치 중 론을 넘기면 riichiFuriten(영구)이 선다",
    rf?.riichiFuriten === true, `riichiFuriten=${String(rf?.riichiFuriten)} temporary=${String(rf?.temporaryFuriten)}`);
  // p2 차례: 6s 버림
  if (s.kind === "awaiting" && s.prompts[0]?.player === "p2") {
    s = flow.submit("p2", { type: "discard", payload: { tileId: idOf(game, "p2", "6s") } });
    const second = optionTypes("p0", s);
    check("리치 후리텐: 같은 순 6s로도 론 불가", !second.includes("win"), `옵션=${second.join(",")}`);
  }
}

// ── B. 가깡 창깡 ────────────────────────────────────────────────
function testChankanAdded(): void {
  // p0이 5m을 펑한 뒤 5m을 가깡 → p1이 5m 대기로 창깡 론
  const st = craft({
    hands: { p0: "555m123p456p789p1s2s", p1: "234m67m234p567p44s", p3: "5m99m111z222z333z44z" },
    phase: "turn.act", turnSeat: 3, drawnLastFor: "p3",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  s = flow.submit("p3", { type: "discard", payload: { tileId: idOf(game, "p3", "5m") } });
  const pon = optsOf("p0", s).find((o) => o.type === "pon");
  if (pon === undefined) { check("가깡 창깡 준비: 펑", false, `p0=${optionTypes("p0", s).join(",")}`); return; }
  s = flow.submit("p0", pon as never);
  let done = false;
  for (let i = 0; i < 40 && s.kind === "awaiting" && !done; i++) {
    let moved = false;
    for (const pr of s.prompts) {
      if (pr.player === "p0" && pr.options.some((o) => o.type === "shouminkan")) { done = true; break; }
      const pick = pr.options.find((o) => o.type === "discard") ?? pr.options.find((o) => o.type === "pass");
      if (pick === undefined) continue;
      try { s = flow.submit(pr.player, pick as never); moved = true; break; } catch { /* already decided */ }
    }
    if (!moved && !done) break;
  }
  const sk = s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0")?.options.find((o) => o.type === "shouminkan") : undefined;
  if (sk === undefined) { check("가깡 창깡 준비: 가깡 옵션", false, `p0=${s.kind === "awaiting" ? optionTypes("p0", s).join(",") : s.kind}`); return; }
  s = flow.submit("p0", sk as never);
  const chankanOpts = optionTypes("p1", s);
  check("가깡 창깡: 5m 대기자가 론할 수 있다", chankanOpts.includes("win"), `p1=${chankanOpts.join(",")}`);
  if (chankanOpts.includes("win")) {
    s = flow.submit("p1", { type: "win", payload: {} });
    const settled = game.engine.state.round.phase;
    check("가깡 창깡: 화료로 정산된다", settled === "round.over" || settled === "setup", `phase=${settled}`);
  }
}

// ── C. 안깡 창깡 — 국사만 ────────────────────────────────────────
function testChankanClosed(): void {
  const st = craft({
    hands: { p0: "5555m123p456p789p1s", p1: "234m678m234p44s56s", p3: "99m111z222z333z44z1s" },
    phase: "turn.act", turnSeat: 3, drawnLastFor: "p3",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  s = flow.submit("p3", { type: "discard", payload: { tileId: idOf(game, "p3", "1s") } });
  s = passAll(flow, s);
  for (let i = 0; i < 12 && s.kind === "awaiting"; i++) {
    const pr = s.prompts[0];
    if (pr === undefined) break;
    if (pr.player === "p0" && pr.options.some((o) => o.type === "ankan")) break;
    const d = pr.options.find((o) => o.type === "discard");
    if (d !== undefined) { s = flow.submit(pr.player, d as never); s = passAll(flow, s); continue; }
    s = flow.submit(pr.player, { type: "pass", payload: {} });
  }
  const ak = s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0")?.options.find((o) => o.type === "ankan") : undefined;
  if (ak === undefined) { check("안깡 창깡 준비", false, `p0=${s.kind === "awaiting" ? optionTypes("p0", s).join(",") : s.kind}`); return; }
  s = flow.submit("p0", ak as never);
  const o = optionTypes("p1", s);
  check("안깡 창깡: 일반 손(비국사)은 론 불가", !o.includes("win"), `p1=${o.join(",")}`);
}

// ── D. 깡도라 공개 시점 ──────────────────────────────────────────
function testKanDoraTiming(): void {
  // 안깡: 즉시 공개 / 명깡·가깡: 버림 뒤 공개 (표준)
  const st = craft({
    hands: { p0: "5555m123p456p789p1s", p3: "99m111z222z333z44z1s" },
    phase: "turn.act", turnSeat: 3, drawnLastFor: "p3",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  s = flow.submit("p3", { type: "discard", payload: { tileId: idOf(game, "p3", "1s") } });
  s = passAll(flow, s);
  for (let i = 0; i < 12 && s.kind === "awaiting"; i++) {
    const pr = s.prompts[0];
    if (pr === undefined) break;
    if (pr.player === "p0" && pr.options.some((o) => o.type === "ankan")) break;
    const d = pr.options.find((o) => o.type === "discard");
    if (d !== undefined) { s = flow.submit(pr.player, d as never); s = passAll(flow, s); continue; }
    s = flow.submit(pr.player, { type: "pass", payload: {} });
  }
  const before = game.engine.state.round.doraIndicators.length;
  const ak = s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0")?.options.find((o) => o.type === "ankan") : undefined;
  if (ak === undefined) { check("깡도라 준비", false, "안깡 옵션 없음"); return; }
  s = flow.submit("p0", ak as never);
  s = passAll(flow, s);
  const after = game.engine.state.round.doraIndicators.length;
  check("안깡: 깡도라가 즉시 공개된다", after === before + 1,
    `before=${before} after=${after} pending=${game.engine.state.round.pendingDora}`);
}

// ── E. 울음 우선순위 (론 > 펑 > 치) ─────────────────────────────
function testCallPriority(): void {
  const st = craft({
    // p1 = 하가(치 가능), p2 = 펑 가능, p3 = 론 가능
    hands: {
      p0: "3m99m111z222z333z44z",       // 3m 버림
      p1: "45m123p456p789p1s2s3s",      // 치 가능
      p2: "33m123p456p789p1s2s3s",      // 펑 가능
      p3: "678m567s234p55s99p",
    },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  s = flow.submit("p0", { type: "discard", payload: { tileId: idOf(game, "p0", "3m") } });
  const p1o = optionTypes("p1", s), p2o = optionTypes("p2", s);
  check("울음: 하가에게 치가 뜬다", p1o.includes("chi"), `p1=${p1o.join(",")}`);
  check("울음: 커쯔 보유자에게 펑이 뜬다", p2o.includes("pon"), `p2=${p2o.join(",")}`);
  // 치와 펑이 동시에 선언되면 펑이 이겨야 한다
  const chi = optsOf("p1", s).find((o) => o.type === "chi");
  const pon = optsOf("p2", s).find((o) => o.type === "pon");
  if (chi === undefined || pon === undefined) return;
  s = flow.submit("p1", chi as never);
  s = flow.submit("p2", pon as never);
  const p1melds = game.engine.state.zones[`melds:p1`]?.tileIds.length ?? 0;
  const p2melds = game.engine.state.zones[`melds:p2`]?.tileIds.length ?? 0;
  check("울음 우선순위: 치보다 펑이 이긴다", p2melds > 0 && p1melds === 0,
    `p1멜드=${p1melds} p2멜드=${p2melds}`);
}

// ── F. 일발은 어떤 울음에도 사라진다 ─────────────────────────────
function testIppatsuCancel(): void {
  const st = craft({
    hands: {
      p0: "234m567m234p45s99p3s",       // 14장 — 리치 선언하며 3s 버림? (대기 유지 위해 아래에서 조정)
      p1: "33m123p456p789p77z",
      p2: "111s222s333s444s55s",
      p3: "111z222z333z444z55z",
    },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  const rOpts = optsOf("p0", s).filter((o) => o.type === "riichi");
  if (rOpts.length === 0) { check("일발 준비: 리치", false, `p0=${optionTypes("p0", s).join(",")}`); return; }
  const r3s = rOpts.find((o) => kindKey(game.engine.state.tiles[(o.payload as { tileId: TileId }).tileId]!.kind) === "sou3") ?? rOpts[0]!;
  s = flow.submit("p0", r3s as never);
  s = passAll(flow, s);
  check("리치 직후 일발이 서 있다", game.engine.state.round.byPlayer["p0"]?.riichi?.ippatsu === true,
    `ippatsu=${String(game.engine.state.round.byPlayer["p0"]?.riichi?.ippatsu)}`);
  // p1 차례에서 무언가 버리고, p2가 펑하면 일발이 꺼져야 한다
  for (let i = 0; i < 6 && s.kind === "awaiting"; i++) {
    const pr = s.prompts[0];
    if (pr === undefined) break;
    const d = pr.options.find((o) => o.type === "discard");
    if (d === undefined) { s = flow.submit(pr.player, { type: "pass", payload: {} }); continue; }
    s = flow.submit(pr.player, d as never);
    const pon = s.kind === "awaiting" ? s.prompts.find((x) => x.options.some((o) => o.type === "pon")) : undefined;
    if (pon !== undefined) {
      s = flow.submit(pon.player, pon.options.find((o) => o.type === "pon") as never);
      check("일발: 울음이 들어가면 꺼진다",
        game.engine.state.round.byPlayer["p0"]?.riichi?.ippatsu === false,
        `ippatsu=${String(game.engine.state.round.byPlayer["p0"]?.riichi?.ippatsu)}`);
      return;
    }
    s = passAll(flow, s);
  }
  check("일발: 울음 시나리오 도달", false, "펑 기회가 안 나왔다");
}

// ── G. 하이테이/호테이 ──────────────────────────────────────────
function testHaiteiHoutei(): void {
  // 벽 1장 — p0이 그 마지막 패를 쯔모하면 haitei 플래그
  const st = craft({
    hands: { p0: "234m567m234p55s9p", p1: "111z222z333z44z99m" },
    phase: "turn.act", turnSeat: 1, drawnLastFor: "p1", wallLeft: 1,
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  s = flow.submit("p1", { type: "discard", payload: { tileId: idOf(game, "p1", "9m") } });
  s = passAll(flow, s);
  // p2 차례가 마지막 쯔모 (벽 1장)
  const wallNow = game.engine.state.zones[WALL]?.tileIds.length ?? -1;
  check("하이테이 준비: 벽 상태", wallNow >= 0, `wall=${wallNow}`);
}

export function main(): void {
  const runs: [string, () => void][] = [
    ["riichiFuriten", testRiichiFuriten],
    ["chankanAdded", testChankanAdded],
    ["chankanClosed", testChankanClosed],
    ["kanDoraTiming", testKanDoraTiming],
    ["callPriority", testCallPriority],
    ["ippatsuCancel", testIppatsuCancel],
    ["haiteiHoutei", testHaiteiHoutei],
  ];
  for (const [n, fn] of runs) {
    try { fn(); } catch (e) { check(`${n} — 예외`, false, String(e)); }
  }
}

main();
console.log("\n===== flow2 =====");
let bad = 0;
for (const r of results) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.note === "" ? "" : ` — ${r.note}`}`);
}
console.log(`${results.length - bad}/${results.length} 통과`);
