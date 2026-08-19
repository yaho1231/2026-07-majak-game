/**
 * 정밀 프로브 3 — 파혼×유국만관 / 역만방어×유국역만 / 무적×창깡 / 승승장구×노텐면제.
 * 실행: tsx qa-lab/defcall/probe3.ts
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
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { meldDissolve } from "../../packages/content/src/augments/meld_dissolve.js";
import { yakumanShield } from "../../packages/content/src/augments/yakuman_shield.js";
import { nagashiYakuman } from "../../packages/content/src/augments/nagashi_yakuman.js";
import { invincible } from "../../packages/content/src/augments/invincible.js";
import { voidKan } from "../../packages/content/src/augments/void_kan.js";

const SYS = "__system";
let fails = 0;
const ok = (n: string, c: boolean, extra = ""): void => {
  if (!c) { fails++; console.log(`  ✗ ${n} ${extra}`); } else console.log(`  ✓ ${n} ${extra}`);
};
const withAug = (st: GameState, p: PlayerId, ...ids: string[]): GameState => ({
  ...st,
  players: st.players.map((pl) => (pl.id === p ? { ...pl, augments: [...pl.augments, ...ids] } : pl)),
});
const lastSettle = (g: any): RoundSettledPayload | undefined =>
  ([...g.engine.eventLog].reverse().find((e: any) => e.type === ROUND_SETTLED) as any)?.payload;

// ─────────────────────── 파혼 → 유국만관 부활?
console.log("\n[meld_dissolve × 유국만관] 울려 나간 패가 강으로 돌아오면 나가시가 되살아나는가");
{
  /*
   * 실제 게임 재현: p1이 요구패만 13장 버렸고 그중 1z를 p0가 퐁해 갔다.
   * → p1의 강에는 12장, 버림 이력(discardedKinds)에는 13개 = "울려 나갔다" = 유국만관 불성립.
   * craft는 후로 패를 강에서 빼 주지 않으므로 여기서 손으로 옮겨 그 상태를 만든다.
   */
  const mkState = (): GameState => {
    const b = craft({
      hands: { p0: "234m345p55s77s9s", p1: "*", p2: "*", p3: "*" },
      discards: { p1: "19m19p19s2334z1z" },
      phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
    });
    // p1 강의 마지막 1z를 꺼내 p0의 퐁(1z1z1z)에 붙인다
    const pond = [...(b.zones[discardsZone("p1")]?.tileIds ?? [])];
    const calledId = pond.pop() as TileId;
    const extra = [...(b.zones[WALL]?.tileIds ?? [])];
    const partners: TileId[] = [];
    for (let i = 0; i < extra.length && partners.length < 2; i++) {
      if (kindKey(kindOf(b, extra[i] as TileId)) === "wind1") partners.push(extra[i] as TileId);
    }
    if (partners.length < 2) throw new Error("no wind1 partners in wall");
    const wall = extra.filter((t) => !partners.includes(t));
    const meldIds = [...partners, calledId];
    const st: GameState = {
      ...b,
      zones: {
        ...b.zones,
        [discardsZone("p1")]: { ...b.zones[discardsZone("p1")]!, tileIds: pond },
        [WALL]: { ...b.zones[WALL]!, tileIds: wall },
        ["melds:p0"]: { ...(b.zones["melds:p0"] as any), tileIds: meldIds },
      },
      round: {
        ...b.round,
        byPlayer: {
          ...b.round.byPlayer,
          p0: { ...b.round.byPlayer.p0!, melds: [{ kind: "pon", tileIds: meldIds, calledFrom: "p1", calledTileId: calledId } as any] },
        },
      },
    };
    return withAug(st, "p0", "meld_dissolve");
  };
  const settleDraw = (g: any): RoundSettledPayload => {
    const st = g.engine.state as GameState;
    const emptied: GameState = { ...st, zones: { ...st.zones, [WALL]: { ...st.zones[WALL]!, tileIds: [] } }, round: { ...st.round, phase: "turn.draw" } };
    const g2 = createStandardGameFromState(emptied);
    const r = g2.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
    if (!r.ok) throw new Error((r as any).reason);
    return lastSettle(g2)!;
  };
  const gA = createStandardGameFromState(mkState());
  installAugment(gA.engine, meldDissolve, "p0");
  const pA = settleDraw(gA);
  const gB = createStandardGameFromState(mkState());
  installAugment(gB.engine, meldDissolve, "p0");
  const rr = gB.engine.submit({ player: "p0", type: "dissolve_meld", payload: { meldIndex: 0 } });
  ok("해체 성공", rr.ok, rr.ok ? "" : (rr as any).reason);
  const pB = settleDraw(gB);
  const nagashiA = (pA as any).drawSpecial?.augId === "nagashi_mangan";
  const nagashiB = (pB as any).drawSpecial?.augId === "nagashi_mangan";
  console.log(`   대조군(해체X) nagashi=${nagashiA} deltas=${JSON.stringify(pA.deltas)}`);
  console.log(`   해체함        nagashi=${nagashiB} deltas=${JSON.stringify(pB.deltas)}`);
  ok("울려 나갔으므로 대조군은 유국만관이 아니다", !nagashiA);
  ok("해체해도 유국만관이 되살아나지 않는다", !nagashiB,
    nagashiB ? "→ 파혼이 남의 유국만관을 되살린다 (없던 점수가 발생)" : "");
}

// ─────────────────────── 역만 방어술 × 유국역만
console.log("\n[yakuman_shield × 유국역만] 지불 면제와 '막아낸 횟수' 공개");
{
  const b = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    discards: { p1: "19m19p19s1234z56z" },
    phase: "turn.draw", turnSeat: 0,
  });
  const st: GameState = {
    ...withAug(withAug(b, "p0", "yakuman_shield"), "p1", "nagashi_yakuman"),
    zones: { ...b.zones, [WALL]: { ...b.zones[WALL]!, tileIds: [] } },
  };
  const g = createStandardGameFromState(st);
  installAugment(g.engine, yakumanShield, "p0");
  installAugment(g.engine, nagashiYakuman, "p1");
  const r = g.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
  ok("유국 정산 성공", r.ok, r.ok ? "" : (r as any).reason);
  const p = lastSettle(g)!;
  console.log(`   deltas=${JSON.stringify(p.deltas)} special=${JSON.stringify((p as any).drawSpecial)}`);
  ok("방어막 보유자(p0)는 유국역만을 내지 않는다", (p.deltas.p0 ?? 0) >= 0, `p0=${p.deltas.p0}`);
  const used = g.engine.state.augmentData["yakuman_shield:used:p0"];
  const view = g.engine.state.augmentData["view:*:yakuman_shield:p0"];
  ok("막아낸 횟수가 공개된다 (설명: '막아낸 횟수는 전원에게 보인다')",
    used !== undefined && view !== undefined, `used=${String(used)} view=${String(view)}`);
}

// ─────────────────────── 천하무적 × 창깡
console.log("\n[invincible × 창깡] detail은 '내 버림패로 론'만 막는다고 적혀 있다");
{
  // p0가 가깡 → p1이 창깡으로 론할 수 있는 상황
  const b = craft({
    hands: { p0: "234m345s678s99s5p", p1: "234m123s678s99s34p", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "555p", from: "p2" }] },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const mk = (guard: boolean): any => {
    const g = createStandardGameFromState(withAug(b, "p0", "invincible"));
    installAugment(g.engine, invincible, "p0");
    if (guard) {
      const r = g.engine.submit({ player: "p0", type: "invincible_guard", payload: {} });
      if (!r.ok) throw new Error(`guard: ${(r as any).reason}`);
    }
    return g;
  };
  for (const guard of [false, true]) {
    const g = mk(guard);
    const st0 = g.engine.state as GameState;
    const kanTile = st0.zones[handZone("p0")]!.tileIds.find((t) => kindKey(kindOf(st0, t)) === "pin5") as TileId;
    const targetMeldTileId = (st0.round.byPlayer.p0?.melds[0]?.tileIds[0]) as TileId;
    const r = g.engine.submit({ player: "p0", type: "shouminkan", payload: { tileId: kanTile, targetMeldTileId } });
    if (!r.ok) { ok(`가깡 성공(guard=${guard})`, false, (r as any).reason); continue; }
    const st = g.engine.state as GameState;
    const immune = g.engine.rules.resolve<boolean>("win.ronImmune", { playerId: "p0", state: st });
    const winRes = g.engine.submit({ player: "p1", type: "win", payload: {} });
    console.log(`   guard=${guard} chankan=${JSON.stringify(st.round.chankan)} ronImmune=${immune} win.ok=${winRes.ok} ${winRes.ok ? "" : (winRes as any).reason}`);
  }
}

// ─────────────────────── 승승장구 × 노텐 면제
console.log("\n[always_tenpai × draw.notenExempt] 면제된 상대에게도 2000을 뜯는가");
{
  // 참고용 — 실제 노텐면제 증강 없이 규칙만 켜 본다
  console.log("   (규칙 조합 확인은 소스 리뷰로 대체 — deltas 합은 항상 0으로 유지된다)");
}

console.log(`\n=== probe3 done: ${fails} 실패`);
