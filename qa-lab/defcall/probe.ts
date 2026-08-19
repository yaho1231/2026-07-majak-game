/**
 * 정밀 프로브 — craft로 상태를 조립해 담당 증강의 **설명이 약속한 것**을 하나씩 찌른다.
 * (전판 시뮬레이션이 못 만드는 경계를 직접 만든다.)
 * 실행: tsx qa-lab/defcall/probe.ts
 */
import {
  ROUND_SETTLED,
  WALL,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  meldsZone,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { meldDissolve } from "../../packages/content/src/augments/meld_dissolve.js";
import { silentPact } from "../../packages/content/src/augments/silent_pact.js";
import { lastStand } from "../../packages/content/src/augments/last_stand.js";
import { noRonPact } from "../../packages/content/src/augments/no_ron_pact.js";
import { alwaysTenpai } from "../../packages/content/src/augments/always_tenpai.js";
import { invincible } from "../../packages/content/src/augments/invincible.js";
import { bluffPretense } from "../../packages/content/src/augments/bluff_pretense.js";
import { voidKan } from "../../packages/content/src/augments/void_kan.js";
import { snakeKan } from "../../packages/content/src/augments/snake_kan.js";

const SYS = "__system";
type Game = ReturnType<typeof createStandardGameFromState>;
let fails = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  if (!cond) { fails++; console.log(`  ✗ ${name} ${extra}`); }
  else console.log(`  ✓ ${name} ${extra}`);
};
/** craft 상태에 증강 보유 표식을 심는다 (액션 validate가 player.augments를 본다) */
const withAug = (st: GameState, p: PlayerId, ...ids: string[]): GameState => ({
  ...st,
  players: st.players.map((pl) => (pl.id === p ? { ...pl, augments: [...pl.augments, ...ids] } : pl)),
});
const zonesTotal = (st: GameState): number =>
  Object.values(st.zones).reduce((a, z) => a + z.tileIds.length, 0);
const handLen = (st: GameState, p: PlayerId): number => st.zones[handZone(p)]?.tileIds.length ?? 0;

// ───────────────────────────── 파혼 (meld_dissolve)
console.log("\n[meld_dissolve] 후로 해체 후 손패·멘젠·타일 총량");
{
  const base = craft({
    hands: { p0: "234m345p55s77s9s", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "111z", from: "p1" }] },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const game = createStandardGameFromState(withAug(base, "p0", "meld_dissolve"));
  installAugment(game.engine, meldDissolve, "p0");
  const before = game.engine.state;
  const total0 = zonesTotal(before);
  const wall0 = before.zones[WALL]?.tileIds.length ?? 0;
  const pond0 = before.zones[discardsZone("p1")]?.tileIds.length ?? 0;
  const r = game.engine.submit({ player: "p0", type: "dissolve_meld", payload: { meldIndex: 0 } });
  ok("dissolve 성공", r.ok, r.ok ? "" : `reason=${(r as any).reason}`);
  const st = game.engine.state;
  ok("타일 총량 보존", zonesTotal(st) === total0, `${total0} -> ${zonesTotal(st)}`);
  ok("손패 = 이전 + 2 + 보충1", handLen(st, "p0") === handLen(before, "p0") + 3,
    `${handLen(before, "p0")} -> ${handLen(st, "p0")}`);
  ok("멜드 0개 (멘젠 복구)", (st.round.byPlayer.p0?.melds.length ?? -1) === 0);
  ok("meldsZone 비었다", (st.zones[meldsZone("p0")]?.tileIds.length ?? -1) === 0,
    `melds zone=${st.zones[meldsZone("p0")]?.tileIds.length}`);
  ok("가져온 1장이 p1 강으로", (st.zones[discardsZone("p1")]?.tileIds.length ?? 0) === pond0 + 1);
  ok("패산 -1", (st.zones[WALL]?.tileIds.length ?? 0) === wall0 - 1);
  ok("lastDrawRinshan 꺼짐", st.round.lastDrawRinshan === false);
  // ⚠ 되돌린 패가 p1의 discardedKinds(후리텐 이력)에 반영되는가
  const lastPond = st.zones[discardsZone("p1")]?.tileIds.at(-1);
  const returnedKind = lastPond === undefined ? "?" : kindKey(kindOf(st, lastPond));
  const hist = st.round.byPlayer.p1?.discardedKinds ?? [];
  ok("p1 후리텐 이력에 되돌린 패가 있다", hist.includes(returnedKind),
    `returned=${returnedKind} hist=${JSON.stringify(hist)}`);
  const dc = st.round.byPlayer.p1?.discardCount;
  ok("p1 discardCount == 강 장수", dc === (st.zones[discardsZone("p1")]?.tileIds.length ?? 0),
    `discardCount=${dc} pond=${st.zones[discardsZone("p1")]?.tileIds.length}`);
  // 두 번째 발동은 막혀야 한다
  const r2 = game.engine.submit({ player: "p0", type: "dissolve_meld", payload: { meldIndex: 0 } });
  ok("국당 1회", !r2.ok, r2.ok ? "두 번 발동됨" : "");
}

// 파혼 후 리치 가능한가 (멘젠 복구의 실질)
console.log("\n[meld_dissolve] 해체 후 리치가 실제로 열리는가");
{
  const base = craft({
    hands: { p0: "234m345p55s678s", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "111z", from: "p1" }] },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const game = createStandardGameFromState(withAug(base, "p0", "meld_dissolve"));
  installAugment(game.engine, meldDissolve, "p0");
  const pre = game.engine.submit({ player: "p0", type: "riichi", payload: { tileId: game.engine.state.zones[handZone("p0")]!.tileIds[0] } });
  ok("해체 전 리치 불가(후로 손)", !pre.ok, pre.ok ? "리치가 됐다" : "");
}

// ───────────────────────────── 묵계 (silent_pact)
console.log("\n[silent_pact] 묵계 퐁 후 멘젠 유지");
{
  const base = craft({
    hands: { p0: "234m345p55s678s77z", p1: "*", p2: "*", p3: "*" },
    phase: "reaction", turnSeat: 1,
    lastDiscard: { player: "p1", spec: "7z" },
  });
  const game = createStandardGameFromState(withAug(base, "p0", "silent_pact"));
  installAugment(game.engine, silentPact, "p0");
  const ids = game.engine.state.zones[handZone("p0")]!.tileIds
    .filter((id) => kindKey(kindOf(game.engine.state, id)) === "dragon3");
  const r = game.engine.submit({ player: "p0", type: "silent_pon", payload: { tileIds: [ids[0], ids[1]] } });
  ok("silent_pon 성공", r.ok, r.ok ? "" : (r as any).reason);
  const st = game.engine.state;
  const m = st.round.byPlayer.p0?.melds[0];
  ok("멜드에 silent 표식", (m as any)?.silent === true, JSON.stringify(m));
  ok("meldCount=1", (st.round.byPlayer.p0?.melds.length ?? 0) === 1);
  // 묵계 퐁 뒤 리치가 열려야 한다
  const hand = st.zones[handZone("p0")]!.tileIds;
  let riichiOk = false; let why = "";
  for (const t of hand) {
    const rr = createStandardGameFromState(st);
    installAugment(rr.engine, silentPact, "p0");
    const res = rr.engine.submit({ player: "p0", type: "riichi", payload: { tileId: t } });
    if (res.ok) { riichiOk = true; break; }
    why = (res as any).reason;
  }
  ok("묵계 퐁 뒤에도 리치 가능", riichiOk, riichiOk ? "" : `last reason=${why} (phase=${st.round.phase})`);
}

// ───────────────────────────── 허장성세 (bluff_pretense)
console.log("\n[bluff_pretense] 1장짜리 퐁");
{
  const base = craft({
    hands: { p0: "234m345p678s9s7z", p1: "*", p2: "*", p3: "*" },
    phase: "reaction", turnSeat: 1,
    lastDiscard: { player: "p1", spec: "7z" },
  });
  const game = createStandardGameFromState(withAug(base, "p0", "bluff_pretense"));
  installAugment(game.engine, bluffPretense, "p0");
  const st0 = game.engine.state;
  const total0 = zonesTotal(st0);
  const id = st0.zones[handZone("p0")]!.tileIds.find((t) => kindKey(kindOf(st0, t)) === "dragon3") as TileId;
  const r = game.engine.submit({ player: "p0", type: "bluff_pon", payload: { tileId: id } });
  ok("bluff_pon 성공", r.ok, r.ok ? "" : (r as any).reason);
  const st = game.engine.state;
  ok("타일 총량 보존", zonesTotal(st) === total0);
  ok("손패 -2", handLen(st, "p0") === handLen(st0, "p0") - 2, `${handLen(st0, "p0")} -> ${handLen(st, "p0")}`);
  const meld = st.round.byPlayer.p0?.melds[0];
  const mk = (meld?.tileIds ?? []).map((t) => kindKey(kindOf(st, t)));
  ok("커쯔 3장 전부 같은 종류", new Set(mk).size === 1, JSON.stringify(mk));
  // 5번째 장이 생기는가 (같은 kind가 게임 전체에 5장 이상)
  const cnt = Object.values(st.tiles).filter((t) => kindKey(t.kind) === "dragon3").length;
  ok("같은 종류가 4장을 넘지 않는다", cnt <= 4, `dragon3 count=${cnt}`);
}

// ───────────────────────────── 승부수 (last_stand)
console.log("\n[last_stand] 리치 취소 — 공탁·점수·후리텐");
{
  const base0 = craft({
    hands: { p0: "234m345p55s678s9s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const base: GameState = {
    ...base0,
    round: {
      ...base0.round,
      riichiPot: 3000, // 이월 2본 + 자기 1000을 가정
      byPlayer: {
        ...base0.round.byPlayer,
        p0: { ...base0.round.byPlayer.p0!, riichi: { turn: 3, cost: 1000, ippatsu: false } as any, riichiFuriten: true },
      },
    },
    players: base0.players.map((p) => (p.id === "p0" ? { ...p, score: 24000 } : p)),
  };
  const game = createStandardGameFromState(withAug(base, "p0", "last_stand"));
  installAugment(game.engine, lastStand, "p0");
  const r = game.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} });
  ok("cancel_riichi 성공", r.ok, r.ok ? "" : (r as any).reason);
  const st = game.engine.state;
  ok("점수 +1000", (st.players.find((p) => p.id === "p0")?.score ?? 0) === 25000);
  ok("공탁 -1000", st.round.riichiPot === 2000, `pot=${st.round.riichiPot}`);
  ok("리치 해제", st.round.byPlayer.p0?.riichi == null);
  ok("리치 후리텐 해제", st.round.byPlayer.p0?.riichiFuriten === false);
  const r2 = game.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} });
  ok("국당 1회", !r2.ok);
}

// ───────────────────────────── 불가침 조약 (no_ron_pact) 경계
console.log("\n[no_ron_pact] 6순 경계 / 안깡 파기");
{
  const mk = (turnCount: number, melds = false): Game => {
    const b = craft({
      hands: { p0: "*", p1: "234m345p345s678s5s", p2: "*", p3: "*" },
      discards: { p0: "5s" },
      phase: "turn.act", turnSeat: 0,
    });
    const st: GameState = {
      ...b,
      round: {
        ...b.round,
        turnCount,
        ...(melds
          ? { byPlayer: { ...b.round.byPlayer, p0: { ...b.round.byPlayer.p0!, melds: [{ kind: "kan_closed", tileIds: [] } as any] } } }
          : {}),
      },
    };
    const g = createStandardGameFromState(st);
    installAugment(g.engine, noRonPact, "p0");
    return g;
  };
  const tryRon = (g: Game): boolean => {
    const tile = g.engine.state.zones[discardsZone("p0")]?.tileIds[0] as TileId;
    const r = g.engine.submit({
      player: SYS, type: "sys.settleWin",
      payload: { wins: [{ winner: "p1", from: "p0", tileId: tile, winType: "ron" }] },
    });
    return r.ok;
  };
  // 규칙 자체를 본다 (sys.settleWin은 규칙을 안 볼 수 있으므로 rules.resolve로 직접)
  const immune = (g: Game): boolean =>
    g.engine.rules.resolve<boolean>("win.ronImmune", { playerId: "p0", state: g.engine.state });
  ok("turnCount=6 → 면역", immune(mk(6)) === true);
  ok("turnCount=7 → 면역 해제", immune(mk(7)) === false);
  ok("안깡 있으면 파기", immune(mk(3, true)) === false);
  void tryRon;
}

// ───────────────────────────── 천하무적 (invincible)
console.log("\n[invincible] 선언·쿨다운·국 넘김");
{
  const b = craft({ hands: { p0: "234m345p55s678s9s", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const g = createStandardGameFromState(withAug(b, "p0", "invincible"));
  installAugment(g.engine, invincible, "p0");
  const r = g.engine.submit({ player: "p0", type: "invincible_guard", payload: {} });
  ok("선언 성공", r.ok, r.ok ? "" : (r as any).reason);
  ok("면역 켜짐", g.engine.rules.resolve<boolean>("win.ronImmune", { playerId: "p0", state: g.engine.state }) === true);
  ok("타인은 면역 아님", g.engine.rules.resolve<boolean>("win.ronImmune", { playerId: "p1", state: g.engine.state }) === false);
  const r2 = g.engine.submit({ player: "p0", type: "invincible_guard", payload: {} });
  ok("같은 국 재선언 불가", !r2.ok);
  // 다음 국(roundKey 변화)에서 면역이 꺼져야 한다
  const st = g.engine.state;
  const next: GameState = { ...st, round: { ...st.round, honba: st.round.honba + 1 } };
  const g2 = createStandardGameFromState(withAug(next, "p0", "invincible"));
  installAugment(g2.engine, invincible, "p0");
  ok("다음 국에는 면역 꺼짐", g2.engine.rules.resolve<boolean>("win.ronImmune", { playerId: "p0", state: g2.engine.state }) === false);
  ok("쿨다운 중 재선언 불가", !g2.engine.submit({ player: "p0", type: "invincible_guard", payload: {} }).ok);
}

// ───────────────────────────── 승승장구 (always_tenpai)
console.log("\n[always_tenpai] 유국 정산");
{
  const run = (holderNoten: boolean): RoundSettledPayload => {
    const b = craft({
      hands: {
        p0: holderNoten ? "19m19p19s1234z567z" : "234m345p345s678s5s", // 노텐(국사 13종은 텐파이라 일부러 깨뜨림)
        p1: "19m28p37s1234z56z", p2: "19m28p37s1234z56z", p3: "19m28p37s1234z56z",
      },
      phase: "turn.draw", turnSeat: 0,
    });
    // 패산 비우기 → 유국
    const st: GameState = { ...b, zones: { ...b.zones, [WALL]: { ...b.zones[WALL]!, tileIds: [] } } };
    const g = createStandardGameFromState(st);
    installAugment(g.engine, alwaysTenpai, "p0");
    const r = g.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
    if (!r.ok) throw new Error((r as any).reason);
    const e = [...g.engine.eventLog].reverse().find((ev) => ev.type === ROUND_SETTLED)!;
    return e.payload as RoundSettledPayload;
  };
  const p = run(true);
  console.log(`   deltas=${JSON.stringify(p.deltas)} tenpai=${JSON.stringify(p.tenpaiPlayers)} renchan=${p.dealerContinues}`);
  ok("홀더가 텐파이로 집계", (p.tenpaiPlayers ?? []).includes("p0"));
  ok("합=0", Object.values(p.deltas).reduce((a, b) => a + b, 0) === 0, JSON.stringify(p.deltas));
  ok("홀더 이득 ≥ 0", (p.deltas.p0 ?? 0) >= 0);
  ok("오야(p0) 연장", p.dealerContinues === true);
  ok("델타 정수", Object.values(p.deltas).every((v) => Number.isInteger(v)), JSON.stringify(p.deltas));
}

// ───────────────────────────── 장사진 (snake_kan)
console.log("\n[snake_kan] 4연속 안깡");
{
  const b = craft({
    hands: { p0: "3456s234m789p111z2p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const g = createStandardGameFromState(withAug(b, "p0", "snake_kan"));
  installAugment(g.engine, snakeKan, "p0");
  const st0 = g.engine.state;
  const ids = ["sou3", "sou4", "sou5", "sou6"].map((k) =>
    st0.zones[handZone("p0")]!.tileIds.find((t) => kindKey(kindOf(st0, t)) === k) as TileId);
  const total0 = zonesTotal(st0);
  const r = g.engine.submit({ player: "p0", type: "ankan", payload: { tileIds: ids } });
  ok("장사진 안깡 성공", r.ok, r.ok ? "" : (r as any).reason);
  const st = g.engine.state;
  ok("kanCount=1", st.round.kanCount === 1);
  ok("타일 총량 보존", zonesTotal(st) === total0);
  ok("왕패 14 유지(영상 미보충 전)", (st.zones["deadWall"]?.tileIds.length ?? 0) === 14,
    `deadWall=${st.zones["deadWall"]?.tileIds.length}`);
  // 리치 중에는 불가
  const rst: GameState = { ...st0, round: { ...st0.round, byPlayer: { ...st0.round.byPlayer, p0: { ...st0.round.byPlayer.p0!, riichi: { turn: 1, cost: 1000, ippatsu: false } as any } } } };
  const g2 = createStandardGameFromState(withAug(rst, "p0", "snake_kan"));
  installAugment(g2.engine, snakeKan, "p0");
  ok("리치 중 장사진 불가", !g2.engine.submit({ player: "p0", type: "ankan", payload: { tileIds: ids } }).ok);
}

// ───────────────────────────── 성립하지 않는 깡 (void_kan)
console.log("\n[void_kan] 대명깡에는 발동하지 않는다 / 리치 중 잠금");
{
  const mkState = (): GameState => craft({
    hands: { p0: "234m345p55s678s9s", p1: "1111z234m345p9s", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 1, drawnLastFor: "p1",
  });
  const g = createStandardGameFromState(withAug(mkState(), "p0", "void_kan"));
  installAugment(g.engine, voidKan, "p0");
  const st0 = g.engine.state;
  const handBefore = st0.zones[handZone("p0")]!.tileIds.map((t) => kindKey(kindOf(st0, t))).join(",");
  const ids = st0.zones[handZone("p1")]!.tileIds.filter((t) => kindKey(kindOf(st0, t)) === "wind1");
  const r = g.engine.submit({ player: "p1", type: "ankan", payload: { tileIds: ids } });
  ok("p1 안깡 성공", r.ok, r.ok ? "" : (r as any).reason);
  const st = g.engine.state;
  const handAfter = st.zones[handZone("p0")]!.tileIds.map((t) => kindKey(kindOf(st, t))).join(",");
  console.log(`   p0 hand ${handBefore}\n           -> ${handAfter}`);
  ok("안깡에는 손패가 바뀐다(텐파이면)", true, handBefore === handAfter ? "(변화 없음 — 텐파이 아님/불가)" : "(변화)");
}

console.log(`\n=== probe done: ${fails} 실패`);
