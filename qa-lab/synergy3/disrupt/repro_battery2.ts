/** 방해·수비·좌석 축 — 배터리 2 (강제 리치 · 누명 · 창깡 · 정산 이전 · 무장해제 배너 동기화) */
import {
  craft,
  setup,
  submit,
  startFlow2,
  lastSettled,
  table,
  turnOptions,
  view,
} from "./lib.js";
import type { Game, GameState, PlayerId } from "./lib.js";

function patch(game: Game, round: Record<string, unknown>): void {
  (game.engine as unknown as { currentState: GameState }).currentState = {
    ...game.engine.state,
    round: { ...game.engine.state.round, ...round },
  };
}
const hand = (g: Game, p: PlayerId): number[] => [
  ...(g.engine.state.zones[`hand:${p}`]?.tileIds ?? []),
];
const sum = (d: Record<string, number>): number =>
  Object.values(d).reduce((a, b) => a + b, 0);

// ═══════════════ 9. 등 떠밀기(push_riichi) × 승부수(last_stand) ═══════════════
{
  const scene = (): GameState =>
    craft({
      hands: {
        p0: "123456789m11p234p",
        p1: "123m456m789m11p23p9s", // 9s 를 버리면 텐파이
        p2: "*",
        p3: "*",
      },
      discards: { p0: "9p", p1: "9p", p2: "9p", p3: "9p" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });

  const rows: Record<string, unknown>[] = [];
  for (const withLast of [false, true]) {
    const g = setup(scene(), {
      p0: ["push_riichi"],
      ...(withLast ? { p1: ["last_stand"] } : {}),
    });
    submit(g, "p0", "push_brand", { target: "p1" });
    const h1 = hand(g, "p1");
    const nine = h1[h1.length - 1]!;
    patch(g, { turnSeat: 1, lastDrawnTile: nine });
    submit(g, "p1", "discard", { tileId: nine });
    const forced = g.engine.state.round.byPlayer["p1"]?.riichi != null;
    const brand = g.engine.state.augmentData["push_riichi:brand:p0#round"];
    let cancel = "n/a";
    if (withLast) {
      patch(g, { phase: "turn.act", turnSeat: 1 });
      try {
        submit(g, "p1", "cancel_riichi", {});
        cancel = "성공";
      } catch (e) {
        cancel = String(e).slice(0, 50);
      }
    }
    patch(g, { turnSeat: 0, phase: "turn.act" });
    rows.push({
      조합: withLast ? "낙인 + 승부수" : "낙인만",
      "강제 리치": forced,
      "리치봉 공탁": g.engine.state.round.riichiPot,
      "낙인 잔여": String(brand),
      "승부수 취소": cancel,
      "취소 후 리치": g.engine.state.round.byPlayer["p1"]?.riichi != null,
      "p1 점수": g.engine.state.players.find((x) => x.id === "p1")?.score,
      "재리치 봉쇄": g.engine.rules.resolve("riichi.blocked", {
        playerId: "p1",
        state: g.engine.state,
      } as never),
      "p0 낙인 버튼": turnOptions(g, "p0").filter((o) => o.type === "push_brand").length,
    });
  }
  table("9. push_riichi × last_stand — 밀어 넣은 리치를 그 자리에서 물릴 수 있나", rows);
}

// ═══════════════ 10. 누명(frame_up) × 불가침 조약 / 천하무적 ═══════════════
{
  const scene = (): GameState =>
    craft({
      hands: { p0: "123456789m11p234p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "9p", p1: "9p", p2: "9p", p3: "9p" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  const rows: Record<string, unknown>[] = [];
  for (const [label, aug] of [
    ["없음", { p0: ["frame_up"] }],
    ["누명자 p0 이 천하무적", { p0: ["frame_up", "invincible"] }],
    ["피해자 p1 이 불가침 조약", { p0: ["frame_up"], p1: ["no_ron_pact"] }],
  ] as [string, Partial<Record<PlayerId, string[]>>][]) {
    const g = setup(scene(), aug);
    if (aug["p0"]?.includes("invincible")) submit(g, "p0", "invincible_guard", {});
    const h0 = hand(g, "p0");
    const tile = h0[0]!;
    submit(g, "p0", "frame_discard", { tileId: tile, target: "p1" });
    const st = g.engine.state;
    rows.push({
      조합: label,
      "심긴 패 주인 바닥": ["p0", "p1"].map(
        (p) => `${p}:${st.zones[`discards:${p}`]?.tileIds.length}`,
      ).join(" "),
      "lastDiscard.player(책임)": st.round.lastDiscard?.player,
      "후리텐 이력 p1": (st.round.byPlayer["p1"]?.discardedKinds ?? []).join(","),
      "win.ronImmune(책임자)": g.engine.rules.resolve("win.ronImmune", {
        playerId: st.round.lastDiscard?.player,
        state: st,
      } as never),
      "win.ronImmune(p1)": g.engine.rules.resolve("win.ronImmune", {
        playerId: "p1",
        state: st,
      } as never),
      "p1 조약 배너": JSON.stringify(
        Object.fromEntries(
          Object.entries((view(g, "p2").augmentView ?? {}) as Record<string, unknown>).filter(
            ([k]) => k.includes("no_ron_pact"),
          ),
        ),
      ),
    });
  }
  table("10. frame_up × 론 면역 — 심은 패의 «쏜 사람»은 누구인가", rows);
}

// ═══════════════ 11. 스파이(spy) × 덤터기·역만 방어술 ═══════════════
{
  // p1 이 8000 론 화료, p0 이 그 오름패 종류를 찍어 둔 상태
  const scene = (): GameState =>
    craft({
      hands: {
        p0: "*",
        p1: "123m456m789m11p23p",
        p2: "*",
        p3: "*",
      },
      discards: { p3: "9s" },
      phase: "reaction",
      turnSeat: 3,
      lastDiscard: { player: "p3", spec: "1p" },
    });
  const run = (label: string, aug: Partial<Record<PlayerId, string[]>>, mark: boolean) => {
    const g = setup(scene(), aug);
    if (mark) {
      (g.engine as unknown as { currentState: GameState }).currentState = {
        ...g.engine.state,
        augmentData: { ...g.engine.state.augmentData, "spy:mark:p0": "pin1" },
      };
    }
    const { flow } = startFlow2(g);
    const s = flow.submit("p1", { type: "win", payload: {} });
    if (s.kind !== "roundOver") return { 조합: label, 결과: s.kind };
    const p = lastSettled(g) as { deltas: Record<string, number>; winInfos?: { points: number }[] };
    return {
      조합: label,
      화료점: p.winInfos?.[0]?.points,
      "p0(스파이)": p.deltas["p0"],
      "p1(화료자)": p.deltas["p1"],
      p2: p.deltas["p2"],
      "p3(쏜 사람)": p.deltas["p3"],
      총합: sum(p.deltas),
    };
  };
  table("11. spy — 찍은 패로 남이 화료하면 점수가 통째로 오나", [
    run("없음", {}, false),
    run("A=스파이 지정만", { p0: ["spy"] }, true),
    run("B=기생충(p2→p1)", { p2: ["parasite"] }, false),
    run("A+B(스파이 p0 · 기생충 p2→p1)", { p0: ["spy"], p2: ["parasite"] }, true),
  ]);
}

// ═══════════════ 12. 무장해제 × 불가침 조약 — 배너가 실제와 어긋나는가 ═══════════════
{
  const scene = (): GameState =>
    craft({
      hands: { p0: "123456789m11p234p", p1: "123456789m11p234p", p2: "*", p3: "*" },
      discards: { p0: "9p", p1: "9p", p2: "9p", p3: "9p" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
  const rows: Record<string, unknown>[] = [];
  for (const disarmIt of [false, true]) {
    const g = setup(scene(), { p0: ["disarm"], p1: ["no_ron_pact"] });
    // 조약 배너를 한 번 세운다 (p1 이 버려 TILE_DISCARDED 가 돌게)
    const h = hand(g, "p1");
    patch(g, { turnSeat: 1, lastDrawnTile: h[h.length - 1]! });
    submit(g, "p1", "discard", { tileId: h[0]! });
    const banBefore = JSON.stringify(
      Object.fromEntries(
        Object.entries((view(g, "p2").augmentView ?? {}) as Record<string, unknown>).filter(
          ([k]) => k.includes("no_ron_pact"),
        ),
      ),
    );
    patch(g, { phase: "turn.act", turnSeat: 0 });
    if (disarmIt) submit(g, "p0", "disarm_lock", { target: "p1", augmentId: "no_ron_pact" });
    // 한 번 더 흐른다 (배너 동기화 지점)
    const h0 = hand(g, "p0");
    patch(g, { turnSeat: 0, lastDrawnTile: h0[h0.length - 1]! });
    submit(g, "p0", "discard", { tileId: h0[0]! });
    const banAfter = JSON.stringify(
      Object.fromEntries(
        Object.entries((view(g, "p2").augmentView ?? {}) as Record<string, unknown>).filter(
          ([k]) => k.includes("no_ron_pact"),
        ),
      ),
    );
    rows.push({
      조합: disarmIt ? "무장해제 함" : "안 함",
      "배너(무장해제 직전)": banBefore.slice(0, 90),
      "배너(그 뒤)": banAfter.slice(0, 90),
      "실제 win.ronImmune(p1)": g.engine.rules.resolve("win.ronImmune", {
        playerId: "p1",
        state: g.engine.state,
      } as never),
    });
  }
  table("12. disarm × no_ron_pact — 공개 배너가 실제 면역과 어긋나는가", rows);
}
