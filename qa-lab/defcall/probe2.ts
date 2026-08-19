/**
 * 정밀 프로브 2 — void_kan / silent_pact 채점 / open_kokushi / snake_kan 채점 / cliff_bloom pick.
 * 실행: tsx qa-lab/defcall/probe2.ts
 */
import {
  DEAD_WALL,
  ROUND_SETTLED,
  WALL,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { voidKan } from "../../packages/content/src/augments/void_kan.js";
import { silentPact } from "../../packages/content/src/augments/silent_pact.js";
import { openKokushi } from "../../packages/content/src/augments/open_kokushi.js";
import { snakeKan } from "../../packages/content/src/augments/snake_kan.js";
import { cliffBloom } from "../../packages/content/src/augments/cliff_bloom.js";

const SYS = "__system";
let fails = 0;
const ok = (n: string, c: boolean, extra = ""): void => {
  if (!c) { fails++; console.log(`  ✗ ${n} ${extra}`); } else console.log(`  ✓ ${n} ${extra}`);
};
const withAug = (st: GameState, p: PlayerId, ...ids: string[]): GameState => ({
  ...st,
  players: st.players.map((pl) => (pl.id === p ? { ...pl, augments: [...pl.augments, ...ids] } : pl)),
});
const handKinds = (st: GameState, p: PlayerId): string =>
  (st.zones[handZone(p)]?.tileIds ?? []).map((t) => kindKey(kindOf(st, t))).join(",");
const zonesTotal = (st: GameState): number =>
  Object.values(st.zones).reduce((a, z) => a + z.tileIds.length, 0);
const lastSettle = (g: any): RoundSettledPayload | undefined =>
  ([...g.engine.eventLog].reverse().find((e: any) => e.type === ROUND_SETTLED) as any)?.payload;

// ───────────────────────────── void_kan
console.log("\n[void_kan] 안깡=발동 / 대명깡=미발동 / 리치 중 잠금");
{
  // p0는 텐파이(5s 탕키). p1이 1z 안깡을 친다 → 1z가 p0의 오름패가 되도록 손패 1장이 바뀌어야 한다
  const mk = (riichi: boolean): GameState => {
    const b = craft({
      hands: { p0: "234m345p345s678s5s", p1: "1111z234m345p9s", p2: "*", p3: "*" },
      phase: "turn.act", turnSeat: 1, drawnLastFor: "p1",
    });
    return withAug(riichi
      ? { ...b, round: { ...b.round, byPlayer: { ...b.round.byPlayer, p0: { ...b.round.byPlayer.p0!, riichi: { turn: 1, cost: 1000, ippatsu: false } as any } } } }
      : b, "p0", "void_kan");
  };
  {
    const g = createStandardGameFromState(mk(false));
    installAugment(g.engine, voidKan, "p0");
    const before = handKinds(g.engine.state, "p0");
    const ids = g.engine.state.zones[handZone("p1")]!.tileIds.filter((t) => kindKey(kindOf(g.engine.state, t)) === "wind1");
    const r = g.engine.submit({ player: "p1", type: "ankan", payload: { tileIds: ids } });
    ok("p1 안깡 성공", r.ok, r.ok ? "" : (r as any).reason);
    const after = handKinds(g.engine.state, "p0");
    ok("안깡 → p0 손패 1장이 바뀐다", before !== after, `\n     ${before}\n  -> ${after}`);
    ok("타일 총량 보존", zonesTotal(g.engine.state) === 136);
    const changed = before.split(",").filter((k, i) => after.split(",")[i] !== k).length;
    ok("바뀐 장수는 정확히 1", changed === 1, `changed=${changed}`);
  }
  {
    const g = createStandardGameFromState(mk(true));
    installAugment(g.engine, voidKan, "p0");
    const before = handKinds(g.engine.state, "p0");
    const ids = g.engine.state.zones[handZone("p1")]!.tileIds.filter((t) => kindKey(kindOf(g.engine.state, t)) === "wind1");
    g.engine.submit({ player: "p1", type: "ankan", payload: { tileIds: ids } });
    ok("리치 중이면 손패 불변", before === handKinds(g.engine.state, "p0"));
  }
  {
    // 대명깡: p1이 p0의 버림패 1z로 대명깡
    const b = craft({
      hands: { p0: "234m345p345s678s", p1: "111z234m345p9s5s", p2: "*", p3: "*" },
      discards: { p0: "" },
      phase: "reaction", turnSeat: 0,
      lastDiscard: { player: "p0", spec: "1z" },
    });
    const g = createStandardGameFromState(withAug(b, "p0", "void_kan"));
    installAugment(g.engine, voidKan, "p0");
    const before = handKinds(g.engine.state, "p0");
    const ids = g.engine.state.zones[handZone("p1")]!.tileIds.filter((t) => kindKey(kindOf(g.engine.state, t)) === "wind1");
    const r = g.engine.submit({ player: "p1", type: "minkan", payload: { tileIds: ids } });
    ok("p1 대명깡 성공", r.ok, r.ok ? "" : (r as any).reason);
    ok("대명깡에는 손패 불변", before === handKinds(g.engine.state, "p0"),
      `\n     ${before}\n  -> ${handKinds(g.engine.state, "p0")}`);
  }
}

// ───────────────────────────── silent_pact 채점
console.log("\n[silent_pact] 묵계 퐁 손의 채점 — 멘젠 쯔모·멘젠 론 부수");
{
  // p0: 묵계 퐁(발발발) + 234m 345p 678s + 55s → 쯔모 화료
  const b = craft({
    hands: { p0: "234m345p678s55s", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "666z", from: "p1" }] },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  // silent 표식을 직접 단다 (묵계로 부른 퐁이라는 뜻)
  const st: GameState = {
    ...b,
    round: {
      ...b.round,
      byPlayer: {
        ...b.round.byPlayer,
        p0: { ...b.round.byPlayer.p0!, melds: [{ ...b.round.byPlayer.p0!.melds[0]!, silent: true } as any] },
      },
    },
  };
  const g = createStandardGameFromState(withAug(st, "p0", "silent_pact"));
  installAugment(g.engine, silentPact, "p0");
  const drawn = g.engine.state.round.lastDrawnTile as TileId;
  const r = g.engine.submit({
    player: SYS, type: "sys.settleWin",
    payload: { wins: [{ winner: "p0", from: null, tileId: drawn, winType: "tsumo" }] },
  });
  ok("쯔모 정산 성공", r.ok, r.ok ? "" : (r as any).reason);
  const p = lastSettle(g);
  const yaku = (p?.winInfos?.[0]?.yaku ?? []).map((y: any) => y.id);
  console.log(`   yaku=${JSON.stringify(yaku)} han=${p?.winInfos?.[0]?.han} fu=${p?.winInfos?.[0]?.fu}`);
  ok("멘젠쯔모(menzen_tsumo)가 붙는다", yaku.some((y: string) => y.includes("tsumo")), JSON.stringify(yaku));
}
console.log("\n[silent_pact] 대조군 — 평범한 퐁이면 멘젠쯔모가 없어야 한다");
{
  const b = craft({
    hands: { p0: "234m345p678s55s", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "666z", from: "p1" }] },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const g = createStandardGameFromState(b);
  const drawn = g.engine.state.round.lastDrawnTile as TileId;
  g.engine.submit({ player: SYS, type: "sys.settleWin", payload: { wins: [{ winner: "p0", from: null, tileId: drawn, winType: "tsumo" }] } });
  const p = lastSettle(g);
  const yaku = (p?.winInfos?.[0]?.yaku ?? []).map((y: any) => y.id);
  console.log(`   yaku=${JSON.stringify(yaku)} han=${p?.winInfos?.[0]?.han} fu=${p?.winInfos?.[0]?.fu}`);
  ok("평범한 퐁엔 멘젠쯔모 없음", !yaku.some((y: string) => y.includes("menzen")), JSON.stringify(yaku));
}

// ───────────────────────────── open_kokushi
console.log("\n[open_kokushi] kokushi_pon 후 화료가 역만인가");
{
  const b = craft({
    // 1m1p1s를 퐁하고 나머지 요구패 10종 + 머리
    hands: { p0: "1m9m1p9p1s9s1234z567z", p1: "*", p2: "*", p3: "*" },
    phase: "reaction", turnSeat: 1,
    lastDiscard: { player: "p1", spec: "1m" },
  });
  const g = createStandardGameFromState(withAug(b, "p0", "open_kokushi"));
  installAugment(g.engine, openKokushi, "p0", { yaku: (g as any).yaku });
  console.log(`   p0 hand=${handKinds(g.engine.state, "p0")}`);
  // 손에 1p·1s가 있어야 kokushi_pon(1m1p1s)이 가능
  const st0 = g.engine.state;
  const pick = (k: string): TileId | undefined => st0.zones[handZone("p0")]!.tileIds.find((t) => kindKey(kindOf(st0, t)) === k);
  const a = pick("pin1"), c = pick("sou1");
  if (a === undefined || c === undefined) { ok("kokushi_pon 재료 준비", false, "1p/1s 없음"); }
  else {
    const r = g.engine.submit({ player: "p0", type: "kokushi_pon", payload: { tileIds: [a, c] } });
    ok("kokushi_pon 성공", r.ok, r.ok ? "" : (r as any).reason);
    const st = g.engine.state;
    console.log(`   after hand=${handKinds(st, "p0")} melds=${JSON.stringify(st.round.byPlayer.p0?.melds.map((m) => m.kind))}`);
    ok("타일 총량 보존", zonesTotal(st) === 136);
    // 표준 퐁·치·깡이 잠기는가
    ok("표준 퐁 잠김", g.engine.rules.resolve<boolean>("call.pon.enabled", { playerId: "p0", state: st }) === false);
    ok("표준 치 잠김", g.engine.rules.resolve<boolean>("call.chi.enabled", { playerId: "p0", state: st }) === false);
    ok("표준 깡 잠김", g.engine.rules.resolve<boolean>("call.kan.enabled", { playerId: "p0", state: st }) === false);
  }
}

// ───────────────────────────── snake_kan 채점
console.log("\n[snake_kan] 4연속 깡 손의 채점 (또이또이/일기통관 중 비싼 쪽)");
{
  const b = craft({
    hands: { p0: "234m789p11z", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "kan_closed", spec: "3456s" }, { kind: "pon", spec: "666z", from: "p1" }] },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const g = createStandardGameFromState(withAug(b, "p0", "snake_kan"));
  installAugment(g.engine, snakeKan, "p0");
  const drawn = g.engine.state.round.lastDrawnTile as TileId;
  const r = g.engine.submit({ player: SYS, type: "sys.settleWin", payload: { wins: [{ winner: "p0", from: null, tileId: drawn, winType: "tsumo" }] } });
  ok("정산 성공", r.ok, r.ok ? "" : (r as any).reason);
  const p = lastSettle(g);
  console.log(`   yaku=${JSON.stringify((p?.winInfos?.[0]?.yaku ?? []).map((y: any) => `${y.id}:${y.han}`))} han=${p?.winInfos?.[0]?.han} fu=${p?.winInfos?.[0]?.fu}`);
  ok("화료로 인정", (p?.winInfos?.length ?? 0) > 0);
}

// ───────────────────────────── cliff_bloom 영상패 선택
console.log("\n[cliff_bloom] bloom_pick — 왕패 장수·도라 표시패 보존");
{
  const b = craft({
    hands: { p0: "234m345p55s678s9s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const st: GameState = {
    ...b,
    round: { ...b.round, lastDrawRinshan: true, kanCount: 1 },
    augmentData: { ...b.augmentData, [`cliff_bloom:pick:${b.round.prevalentWind}-${b.round.roundNumber}-${b.round.honba}:p0`]: (b.round.lastDrawnTile as number) + 1 },
  };
  const g = createStandardGameFromState(withAug(st, "p0", "cliff_bloom"));
  installAugment(g.engine, cliffBloom, "p0");
  const dw0 = [...(g.engine.state.zones[DEAD_WALL]?.tileIds ?? [])];
  const dora0 = [...g.engine.state.round.doraIndicators];
  const r = g.engine.submit({ player: "p0", type: "bloom_pick", payload: { index: 0 } });
  ok("bloom_pick 성공", r.ok, r.ok ? "" : (r as any).reason);
  const stA = g.engine.state;
  ok("왕패 장수 보존", (stA.zones[DEAD_WALL]?.tileIds.length ?? 0) === dw0.length,
    `${dw0.length} -> ${stA.zones[DEAD_WALL]?.tileIds.length}`);
  ok("도라 표시패 tileId 불변", JSON.stringify(stA.round.doraIndicators) === JSON.stringify(dora0));
  ok("타일 총량 보존", zonesTotal(stA) === 136);
  ok("고른 패가 손에", (stA.zones[handZone("p0")]?.tileIds ?? []).includes(dw0[0] as TileId));
}

console.log(`\n=== probe2 done: ${fails} 실패`);
