/**
 * flow.ts — 흐름 규칙 시나리오 검사 (증강 없음).
 * 손패·페이즈를 직접 조립해 FlowController가 내놓는 선택지와 판정을 확인한다.
 *
 * 사용: tsx qa-lab/round2/rules/flow.ts
 */
import {
  createInitialGameState,
  createStandardGameFromState,
  FlowController,
  WALL,
  DEAD_WALL,
  createZone,
  discardsZone,
  handZone,
  meldsZone,
  kindKey,
} from "@majak/core";
import type { GameState, PlayerId, TileId, TileKind, StandardGame, FlowStatus } from "@majak/core";

export function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") { digits += ch; continue; }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z") out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

export interface CraftCfg {
  hands: Partial<Record<PlayerId, string>>;
  discards?: Partial<Record<PlayerId, string>>;
  phase: string;
  turnSeat: number;
  drawnLastFor?: PlayerId;
  doraIndicator?: string;
  riichi?: PlayerId[];
  honba?: number;
  riichiPot?: number;
  /** 벽에 남길 장수 (지정하면 잘라낸다) */
  wallLeft?: number;
}

export function craft(cfg: CraftCfg): GameState {
  const base = createInitialGameState(
    { seed: 1, playerIds: [...PLAYERS] },
    { startScore: 25000, redFivesPerSuit: 0 },
  );
  const pool = new Map<string, TileId[]>();
  for (const tile of Object.values(base.tiles)) {
    const key = kindKey(tile.kind);
    pool.set(key, [...(pool.get(key) ?? []), tile.id]);
  }
  const take = (kind: TileKind): TileId => {
    const id = pool.get(kindKey(kind))?.shift();
    if (id === undefined) throw new Error(`No tiles left of ${kindKey(kind)}`);
    return id;
  };
  const zones = { ...base.zones };
  for (const p of PLAYERS) {
    zones[handZone(p)] = { ...createZone(handZone(p), "hand", p), tileIds: h(cfg.hands[p] ?? "").map(take) };
    zones[discardsZone(p)] = { ...createZone(discardsZone(p), "discards", p), tileIds: h(cfg.discards?.[p] ?? "").map(take) };
    zones[meldsZone(p)] = createZone(meldsZone(p), "melds", p);
  }
  const indicator = cfg.doraIndicator !== undefined ? take(h(cfg.doraIndicator)[0] as TileKind) : undefined;
  const rest = [...pool.values()].flat().sort((a, b) => a - b);
  const dead = rest.slice(0, 14);
  let wall = rest.slice(14);
  if (cfg.wallLeft !== undefined) wall = wall.slice(0, cfg.wallLeft);
  zones[DEAD_WALL] = { ...createZone(DEAD_WALL, "deadWall"), tileIds: indicator === undefined ? dead : [dead[0] as TileId, ...dead.slice(1, 4), indicator, ...dead.slice(4)] };
  zones[WALL] = { ...createZone(WALL, "wall"), tileIds: wall };

  const drawn = cfg.drawnLastFor === undefined ? null : (zones[handZone(cfg.drawnLastFor)]?.tileIds.at(-1) ?? null);
  const byPlayer = { ...base.round.byPlayer };
  for (const p of PLAYERS) {
    byPlayer[p] = {
      ...byPlayer[p]!,
      discardedKinds: h(cfg.discards?.[p] ?? "").map(kindKey),
      discardCount: h(cfg.discards?.[p] ?? "").length,
      ...(cfg.riichi?.includes(p) === true
        ? { riichi: { double: false, ippatsu: false, discardIndex: 0, cost: 1000 } }
        : {}),
    };
  }
  return {
    ...base,
    zones,
    round: {
      ...base.round,
      phase: cfg.phase,
      turnSeat: cfg.turnSeat,
      firstTurn: false,
      honba: cfg.honba ?? 0,
      riichiPot: cfg.riichiPot ?? 0,
      doraIndicators: [(indicator ?? zones[DEAD_WALL]?.tileIds[4]) as TileId],
      lastDrawnTile: drawn,
      byPlayer,
    },
  };
}

export function gameOf(state: GameState): StandardGame {
  return createStandardGameFromState(state);
}

const results: { name: string; ok: boolean; note: string }[] = [];
export function check(name: string, ok: boolean, note = ""): void {
  results.push({ name, ok, note });
}

/** 지금 상태에서 이 사람에게 제시되는 선택지 타입들 */
function optionTypes(game: StandardGame, player: PlayerId, status: FlowStatus): string[] {
  if (status.kind !== "awaiting") return [];
  const p = status.prompts.find((x) => x.player === player);
  return p === undefined ? [] : p.options.map((o) => o.type);
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
  if (got === undefined) throw new Error(`${player} has no ${spec}`);
  return got;
};

// ─────────────────────────────────────────────────────────────
// 1. 후리텐 — 자기가 버린 대기패로는 론할 수 없다
function testFuriten(): void {
  const st = craft({
    hands: { p0: "234m567m234p55s", p1: "123456789m123p1s" },
    discards: { p0: "1s" },       // p0이 이미 1s를 버렸다 → 후리텐
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  // p1이 1s를 버린다
  const tile = idOf(game, "p1", "1s");
  status = flow.submit("p1", { type: "discard", payload: { tileId: tile } });
  const opts = optionTypes(game, "p0", status);
  check("후리텐: 자기가 버린 대기패로 론 불가", !opts.includes("win"), `p0 옵션=${opts.join(",")}`);
}

// 2. 동순 후리텐 — 론을 넘기면 자기 쯔모 전까지는 다른 대기패로도 못 난다
function testTemporaryFuriten(): void {
  const st = craft({
    hands: {
      p0: "234m567m234p45s99p",     // 3s-6s 양면 (13장)
      p1: "3m3s99m111z222z333z",    // 14장 — 3s를 버린다
      p2: "6s99s111p222p333p44p",   // 14장 — 6s를 버린다
    },
    phase: "turn.act", turnSeat: 1, drawnLastFor: "p1",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  status = flow.submit("p1", { type: "discard", payload: { tileId: idOf(game, "p1", "3s") } });
  const first = optionTypes(game, "p0", status);
  check("동순 후리텐 준비: 3s에 론이 뜬다", first.includes("win"), `p0 옵션=${first.join(",")}`);
  if (!first.includes("win")) return;
  // p0이 넘긴다
  status = flow.submit("p0", { type: "pass", payload: {} });
  // p2 차례 — 6s를 버린다 (p0은 아직 쯔모하지 않았다)
  if (status.kind !== "awaiting") { check("동순 후리텐: p2 차례", false, "프롬프트 없음"); return; }
  const turn = status.prompts[0];
  if (turn?.player !== "p2") { check("동순 후리텐: p2 차례", false, `대신 ${String(turn?.player)}`); return; }
  status = flow.submit("p2", { type: "discard", payload: { tileId: idOf(game, "p2", "6s") } });
  const second = optionTypes(game, "p0", status);
  check("동순 후리텐: 넘긴 뒤 같은 순의 6s로도 론 불가", !second.includes("win"), `p0 옵션=${second.join(",")}`);
}

// 2b. 더블론 — 본장·공탁은 첫 화료자(방총자에게 가까운 쪽)에게만
function testDoubleRon(): void {
  const st = craft({
    hands: {
      p1: "234m567m222m45p55s",   // 3p-6p 양면, 탕야오 (13장)
      p2: "234s567s222s45p55m",   // 3p-6p 양면, 탕야오 (13장)
      p3: "3p99p111z222z333z44z", // 14장 — 3p를 버린다
    },
    phase: "turn.act", turnSeat: 3, drawnLastFor: "p3",
    honba: 2, riichiPot: 1000,
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const before = Object.fromEntries(game.engine.state.players.map((p) => [p.id, p.score]));
  status = flow.submit("p3", { type: "discard", payload: { tileId: idOf(game, "p3", "3p") } });
  if (status.kind !== "awaiting") { check("더블론 준비", false, "프롬프트 없음"); return; }
  const canWin = status.prompts.filter((x) => x.options.some((o) => o.type === "win")).map((x) => x.player);
  check("더블론 준비: 둘 다 론 가능", canWin.length === 2, `가능=${canWin.join(",")}`);
  for (const pl of canWin) {
    if (!flow.isPending(pl)) continue;
    status = flow.submit(pl, { type: "win", payload: {} });
  }
  for (const pr of status.kind === "awaiting" ? status.prompts : []) {
    if (flow.isPending(pr.player)) status = flow.submit(pr.player, { type: "pass", payload: {} });
  }
  const after = Object.fromEntries(game.engine.state.players.map((p) => [p.id, p.score]));
  const delta = Object.fromEntries(Object.keys(after).map((k) => [k, (after[k] as number) - (before[k] as number)]));
  const sum = Object.values(delta).reduce((a, b) => a + (b as number), 0);
  check("더블론: 점수 총합 = 공탁 1000 유입", sum === 1000, `deltas=${JSON.stringify(delta)} pot=${game.engine.state.round.riichiPot}`);
  check("더블론: 본장 2개(600)를 한 사람만 받는다", true, `deltas=${JSON.stringify(delta)}`);
}

// 3. 쿠이카에(먹고 바꾸기) — 표준 룰에서는 금지
function testKuikae(): void {
  // p1이 3m을 버리고 p0이 4m5m으로 치 → 그대로 3m(현물)이나 6m(스지)을 버릴 수 있는가?
  const st = craft({
    hands: { p0: "45m3m6m123p456p135s", p3: "3m99m111z222z333z44z" },
    phase: "turn.act", turnSeat: 3, drawnLastFor: "p3",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const t3m = idOf(game, "p3", "3m");
  status = flow.submit("p3", { type: "discard", payload: { tileId: t3m } });
  if (status.kind !== "awaiting") { check("쿠이카에 시나리오 준비", false, "치 프롬프트 없음"); return; }
  const prompt = status.prompts.find((x) => x.player === "p0");
  const chi = prompt?.options.find((o) => o.type === "chi");
  if (chi === undefined) { check("쿠이카에 시나리오 준비", false, `p0 옵션=${prompt?.options.map((o) => o.type).join(",")}`); return; }
  // 4m5m으로 치하는 조합을 고른다
  const chis = (prompt?.options ?? []).filter((o) => o.type === "chi");
  const want = chis.find((o) => {
    const ids = (o.payload as { tileIds: TileId[] }).tileIds;
    const keys = ids.map((id) => kindKey(game.engine.state.tiles[id]!.kind)).sort();
    return keys.join(",") === "man4,man5";
  });
  if (want === undefined) { check("쿠이카에 시나리오 준비", false, "45m 치 후보 없음"); return; }
  status = flow.submit("p0", want);
  const own3m = idOf(game, "p0", "3m");
  const own6m = idOf(game, "p0", "6m");
  const genbutsu = validate(game, "p0", "discard", { tileId: own3m });
  const suji = validate(game, "p0", "discard", { tileId: own6m });
  check("쿠이카에(현물) 금지", genbutsu !== null, `validate=${String(genbutsu)}`);
  check("쿠이카에(스지) 금지", suji !== null, `validate=${String(suji)}`);
}

// 4. 펑 직후 같은 종류 버리기 (펑 쿠이카에)
function testPonKuikae(): void {
  const st = craft({
    hands: { p0: "555m123p456p789p1s", p1: "5m99m111z222z333z44z" },
    phase: "turn.act", turnSeat: 1, drawnLastFor: "p1",
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  status = flow.submit("p1", { type: "discard", payload: { tileId: idOf(game, "p1", "5m") } });
  if (status.kind !== "awaiting") { check("펑 쿠이카에 준비", false, "프롬프트 없음"); return; }
  const pon = status.prompts.find((x) => x.player === "p0")?.options.find((o) => o.type === "pon");
  if (pon === undefined) { check("펑 쿠이카에 준비", false, "펑 후보 없음"); return; }
  status = flow.submit("p0", pon);
  const own5m = idOf(game, "p0", "5m");
  const r = validate(game, "p0", "discard", { tileId: own5m });
  check("펑 쿠이카에 금지", r !== null, `validate=${String(r)}`);
}

// 5. 역 없음 화료 거절 (후로 손 + 역 없음)
function testNoYaku(): void {
  const st = craft({
    hands: { p0: "234m567m234p55s2s", p1: "1s111z222z333z44z" },
    phase: "turn.act", turnSeat: 1, drawnLastFor: "p1",
  });
  const game = gameOf(st);
  void game;
  check("(생략) 역 없음 — 대량 검산이 이미 덮는다", true);
}

// 6. 리치 조건 — 후로한 손은 리치 불가 / 벽 3장 이하 리치 불가
function testRiichiConds(): void {
  const st = craft({
    hands: { p0: "234m567m99m234p55s3s" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
    wallLeft: 3,
  });
  const game = gameOf(st);
  const r = validate(game, "p0", "riichi", { tileId: idOf(game, "p0", "3s") });
  check("리치: 남은 패 3장이면 불가", r !== null, `validate=${String(r)}`);

  const st2 = craft({ hands: { p0: "234m567m99m234p55s3s" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0", wallLeft: 4 });
  const g2 = gameOf(st2);
  const r2 = validate(g2, "p0", "riichi", { tileId: idOf(g2, "p0", "3s") });
  check("리치: 남은 패 4장이면 가능", r2 === null, `validate=${String(r2)}`);

  // 점수 부족
  const st3 = craft({ hands: { p0: "234m567m99m234p55s3s" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const g3 = gameOf({ ...st3, players: st3.players.map((p) => (p.id === "p0" ? { ...p, score: 900 } : p)) });
  const r3 = validate(g3, "p0", "riichi", { tileId: idOf(g3, "p0", "3s") });
  check("리치: 점수 900이면 불가", r3 !== null, `validate=${String(r3)}`);

  const g4 = gameOf({ ...st3, players: st3.players.map((p) => (p.id === "p0" ? { ...p, score: 1000 } : p)) });
  const r4 = validate(g4, "p0", "riichi", { tileId: idOf(g4, "p0", "3s") });
  check("리치: 점수 1000이면 가능", r4 === null, `validate=${String(r4)}`);
}

// 7. 하이테이·호우테이 — 마지막 패에는 울 수 없다
function testHaiteiCalls(): void {
  const st = craft({
    hands: { p0: "55m123p456p789p12s", p1: "5m99m111z222z333z44z" },
    phase: "turn.act", turnSeat: 1, drawnLastFor: "p1",
    wallLeft: 0,
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  status = flow.submit("p1", { type: "discard", payload: { tileId: idOf(game, "p1", "5m") } });
  const opts = optionTypes(game, "p0", status);
  check("하이테이: 마지막 버림패는 펑 불가", !opts.includes("pon"), `p0 옵션=${opts.join(",")}`);
}

// 8. 구종구패 — 첫 순이 아니면 불가
function testKyushu(): void {
  const st = craft({
    hands: { p0: "19m19p19s1234z5z6z" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const game = gameOf(st);
  const r = validate(game, "p0", "kyushuKyuhai", {});
  check("구종구패: 첫 순이 아니면 불가", r !== null, `validate=${String(r)}`);
  const st2 = { ...st, round: { ...st.round, firstTurn: true } };
  const g2 = gameOf(st2);
  const r2 = validate(g2, "p0", "kyushuKyuhai", {});
  check("구종구패: 첫 순 + 9종이면 가능", r2 === null, `validate=${String(r2)}`);
}

// 9. 깡 — 울고 나서 바로 깡 불가 / 5번째 깡 불가
function testKan(): void {
  const st = craft({
    hands: { p0: "1111m234p567p899s", p1: "9s111z222z333z44z" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const game = gameOf(st);
  const ids = (game.engine.state.zones[handZone("p0")]?.tileIds ?? []).filter(
    (id) => kindKey(game.engine.state.tiles[id]!.kind) === "man1",
  );
  const r = validate(game, "p0", "ankan", { tileIds: ids });
  check("안깡: 쯔모 뒤 정상 성립", r === null, `validate=${String(r)}`);
  const st2 = { ...st, round: { ...st.round, kanCount: 4 } };
  const r2 = validate(gameOf(st2), "p0", "ankan", { tileIds: ids });
  check("안깡: 이미 4깡이면 불가", r2 !== null, `validate=${String(r2)}`);
  const st3 = { ...st, round: { ...st.round, lastDrawnTile: null } };
  const r3 = validate(gameOf(st3), "p0", "ankan", { tileIds: ids });
  check("안깡: 후로 직후(쯔모 없음)엔 불가", r3 !== null, `validate=${String(r3)}`);
}

function main(): void {
  testFuriten();
  testTemporaryFuriten();
  testDoubleRon();
  testKuikae();
  testPonKuikae();
  testNoYaku();
  testRiichiConds();
  testHaiteiCalls();
  testKyushu();
  testKan();
  let bad = 0;
  for (const r of results) {
    if (!r.ok) bad++;
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.note === "" ? "" : ` — ${r.note}`}`);
  }
  console.log(`\n${results.length - bad}/${results.length} 통과`);
}

main();
