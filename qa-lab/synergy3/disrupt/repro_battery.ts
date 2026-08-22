/**
 * 방해·수비·좌석 축 — 조합 배터리.
 * 각 절이 하나의 질문이고, 가능한 곳은 대조군 4칸으로 잰다.
 */
import {
  WALL,
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

function seat(game: Game, s: number, firstTurn?: boolean): void {
  (game.engine as unknown as { currentState: GameState }).currentState = {
    ...game.engine.state,
    round: {
      ...game.engine.state.round,
      turnSeat: s,
      ...(firstTurn === undefined ? {} : { firstTurn }),
    },
  };
}
const sum = (d: Record<string, number>): number =>
  Object.values(d).reduce((a, b) => a + b, 0);

// ═══════════════════════════════════════════════════════════════
// 1. 소프트락 — 한 사람에게 방해 4종을 겹쳐 걸면 선택지가 0이 되나
// ═══════════════════════════════════════════════════════════════
{
  const base = (): GameState =>
    craft({
      hands: {
        p0: "123456789m123p1p",
        p1: "234567m234567p1s", // 전부 수패 = 봉인 재료가 많다
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });

  const rows: Record<string, unknown>[] = [];
  const variants: [string, Partial<Record<PlayerId, string[]>>][] = [
    ["없음", {}],
    ["봉인술사만(p0)", { p0: ["discard_lock"] }],
    ["봉인+격+함구(p0)", { p0: ["discard_lock", "rank_gate", "call_seal"] }],
    [
      "봉인+격+함구(p0) + 등떠밀기(p2)",
      { p0: ["discard_lock", "rank_gate", "call_seal"], p2: ["push_riichi"] },
    ],
  ];
  for (const [label, aug] of variants) {
    const g = setup(base(), aug);
    seat(g, 0, true);
    if (aug["p0"]?.includes("discard_lock")) submit(g, "p0", "seal_hands", {});
    if (aug["p0"]?.includes("rank_gate"))
      submit(g, "p0", "rank_gate_mark", { target: "p1" });
    if (aug["p0"]?.includes("call_seal")) submit(g, "p0", "call_seal_use", {});
    if (aug["p2"]?.includes("push_riichi")) {
      seat(g, 2);
      submit(g, "p2", "push_brand", { target: "p1" });
    }
    seat(g, 1);
    const { flow, status } = startFlow2(g);
    const prompts = status.kind === "awaiting" ? (status.prompts as { player: string; options: unknown[]; locked?: unknown[] }[]) : [];
    const mine = prompts.find((p) => p.player === "p1");
    rows.push({
      조합: label,
      "p1 선택지 수": mine?.options.length ?? `(프롬프트 없음: ${status.kind})`,
      "p1 잠긴 패": (mine?.locked ?? []).length,
      "win.minHan(p1)": g.engine.rules.resolve("win.minHan", {
        playerId: "p1",
        state: g.engine.state,
      } as never),
      "call.blocked(p1)": g.engine.rules.resolve("call.blocked", {
        playerId: "p1",
        state: g.engine.state,
      } as never),
    });
    void flow;
  }
  table("1. 방해 겹쳐 걸기 — 소프트락(선택지 0)이 나는가", rows);
}

// ═══════════════════════════════════════════════════════════════
// 2. 자리 바꿈 × 좌석에 묶인 것들
// ═══════════════════════════════════════════════════════════════
{
  const base = (): GameState =>
    craft({
      hands: { p0: "123456789m123p1p", p1: "123456789m123p1p", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });

  const rows: Record<string, unknown>[] = [];
  // p2 가 격(rank_gate)으로 p1 을 지목 → p1 이 p0 과 자리를 바꾼다
  for (const swap of [false, true]) {
    const g = setup(base(), { p1: ["seat_swap"], p2: ["rank_gate"], p3: ["pseudo_dealer"] });
    seat(g, 2, true);
    submit(g, "p2", "rank_gate_mark", { target: "p1" });
    seat(g, 3, true);
    submit(g, "p3", "claim_dealer", {});
    const dealerBefore = g.engine.state.round.dealerSeat;
    seat(g, 1, true);
    if (swap) submit(g, "p1", "seat_swap", { target: "p3" });
    rows.push({
      조합: swap ? "자리 바꿈 함 (p1↔p3)" : "안 바꿈",
      "격이 걸린 사람(minHan=5)": ["p0", "p1", "p2", "p3"].filter(
        (p) =>
          g.engine.rules.resolve("win.minHan", {
            playerId: p,
            state: g.engine.state,
          } as never) === 5,
      ).join(",") || "(없음)",
      "찬탈 전 오야 자리": dealerBefore,
      "지금 오야 자리": g.engine.state.round.dealerSeat,
      "지금 오야인 사람": g.engine.state.players.find(
        (p) => p.seat === g.engine.state.round.dealerSeat,
      )?.id,
      "p3 자리": g.engine.state.players.find((p) => p.id === "p3")?.seat,
    });
  }
  table("2. seat_swap × rank_gate · pseudo_dealer — 효과는 사람을 따르나 자리를 따르나", rows);
}

// ═══════════════════════════════════════════════════════════════
// 3. 기생충 상호 (p0↔p1) · 스파이 × 기생충 — 총합 보존과 순서
// ═══════════════════════════════════════════════════════════════
{
  const winScene = (): GameState =>
    craft({
      hands: { p0: "123m456m789m11p23p", p1: "*", p2: "*", p3: "*" },
      discards: { p1: "1p" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "1p" },
    });

  const run = (label: string, aug: Partial<Record<PlayerId, string[]>>, marks: [PlayerId, string, unknown][]) => {
    const g = setup(winScene(), aug);
    // 지정은 정산 전에 직접 심는다 (턴 순서 재현 부담을 줄인다)
    const st = g.engine.state;
    let data = { ...st.augmentData };
    for (const [holder, kind, val] of marks) {
      if (kind === "parasite") {
        data[`parasite:target:${holder}:${roundKeyOf(st)}#round`] = val;
      }
    }
    (g.engine as unknown as { currentState: GameState }).currentState = {
      ...st,
      augmentData: data,
    };
    const { flow } = startFlow2(g);
    const s = flow.submit("p0", { type: "win", payload: {} });
    if (s.kind !== "roundOver") return { 조합: label, 결과: s.kind };
    const p = lastSettled(g) as { deltas: Record<string, number> };
    return {
      조합: label,
      p0: p.deltas["p0"],
      p1: p.deltas["p1"],
      p2: p.deltas["p2"],
      p3: p.deltas["p3"],
      총합: sum(p.deltas),
    };
  };

  table("3. 기생충 상호 기생 (총합 보존 · 무한 이전 여부)", [
    run("없음", {}, []),
    run("p1이 p0에 기생", { p1: ["parasite"] }, [["p1", "parasite", "p0"]]),
    run("p0이 p1에 기생", { p0: ["parasite"] }, [["p0", "parasite", "p1"]]),
    run(
      "서로 기생 (p0↔p1)",
      { p0: ["parasite"], p1: ["parasite"] },
      [
        ["p0", "parasite", "p1"],
        ["p1", "parasite", "p0"],
      ],
    ),
  ]);
}

function roundKeyOf(state: GameState): string {
  const r = state.round;
  return `${r.prevalentWind}-${r.roundNumber}-${r.honba}`;
}

// ═══════════════════════════════════════════════════════════════
// 4. 승승장구 두 명 — 노텐 상대가 두 번 뜯기나
// ═══════════════════════════════════════════════════════════════
{
  const scene = (): GameState => {
    const base = craft({
      hands: { p0: "147m258p369s1245z", p1: "147m258p369s1245z", p2: "*", p3: "*" },
      discards: { p0: "34m", p1: "5m", p2: "6m", p3: "6p" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const wall = [...(base.zones[WALL]?.tileIds ?? [])];
    return {
      ...base,
      zones: { ...base.zones, [WALL]: { ...base.zones[WALL]!, tileIds: wall.slice(0, 8) } },
    };
  };
  const run = (label: string, aug: Partial<Record<PlayerId, string[]>>) => {
    const g = setup(scene(), aug);
    const { flow, status } = startFlow2(g);
    let st = status;
    let guard = 0;
    while (st.kind === "awaiting" && guard++ < 200) {
      const pr = (st.prompts as { player: PlayerId; options: { type: string; payload: unknown }[] }[])[0];
      if (pr === undefined) break;
      const opt =
        pr.options.find((o) => o.type === "discard") ??
        pr.options.find((o) => o.type === "pass") ??
        pr.options[0];
      if (opt === undefined) break;
      st = flow.submit(pr.player, { type: opt.type, payload: opt.payload } as never);
    }
    if (st.kind !== "roundOver") return { 조합: label, 결과: st.kind };
    const p = lastSettled(g) as { deltas: Record<string, number>; tenpaiPlayers?: string[] };
    return {
      조합: label,
      텐파이: (p.tenpaiPlayers ?? []).join(",") || "(없음)",
      p0: p.deltas["p0"],
      p1: p.deltas["p1"],
      p2: p.deltas["p2"],
      p3: p.deltas["p3"],
      총합: sum(p.deltas),
    };
  };
  table("4. 승승장구 × 승승장구 (p0·p1 둘 다 노텐 보유자)", [
    run("없음", {}),
    run("p0만", { p0: ["always_tenpai"] }),
    run("p1만", { p1: ["always_tenpai"] }),
    run("둘 다", { p0: ["always_tenpai"], p1: ["always_tenpai"] }),
  ]);
}

// ═══════════════════════════════════════════════════════════════
// 5. 지뢰 탐지 × 내 론 면역 (천하무적 / 불가침 조약) — 오탐이 나는가
// ═══════════════════════════════════════════════════════════════
{
  const scene = (): GameState =>
    craft({
      hands: {
        p0: "123456789m11p234p", // 넉넉한 손
        p1: "123m123p123s99s45s", // 3s/6s 대기
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  const run = (label: string, aug: Partial<Record<PlayerId, string[]>>, declare?: string) => {
    const g = setup(scene(), { ...aug, p0: [...(aug["p0"] ?? []), "danger_sense"] });
    seat(g, 0);
    if (declare) submit(g, "p0", declare, {});
    submit(g, "p0", "danger_sense_use", {});
    const av = (view(g, "p0").augmentView ?? {}) as Record<string, unknown>;
    return {
      조합: label,
      "danger_sense 결과": JSON.stringify(av["danger_sense"] ?? "(없음)"),
      "win.ronImmune(p0)": g.engine.rules.resolve("win.ronImmune", {
        playerId: "p0",
        state: g.engine.state,
      } as never),
    };
  };
  table("5. danger_sense × 내 론 면역", [
    run("없음", {}),
    run("천하무적 선언", { p0: ["invincible"] }, "invincible_guard"),
    run("불가침 조약(패시브)", { p0: ["no_ron_pact"] }),
  ]);
}

// ═══════════════════════════════════════════════════════════════
// 6. 천리안(tenpai_scan) × 공성계(노텐 리치) — 허풍이 들키는가 / 관전 뷰
// ═══════════════════════════════════════════════════════════════
{
  const scene = (): GameState =>
    craft({
      hands: {
        p0: "123456789m11p234p",
        p1: "147m258p369s1245z", // 노텐
        p2: "123m123p123s99s45s", // 텐파이
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  const g = setup(scene(), { p0: ["tenpai_scan"], p1: ["siege_riichi"] });
  seat(g, 0);
  submit(g, "p0", "tenpai_scan_use", {});
  const rows = (["p0", "p1", "p2", "p3"] as PlayerId[]).map((v) => {
    const av = (view(g, v).augmentView ?? {}) as Record<string, unknown>;
    const hits = Object.entries(av).filter(([k]) => k.includes("tenpai_scan"));
    return { 뷰어: v, "tenpai_scan 채널": JSON.stringify(Object.fromEntries(hits)) };
  });
  table("6. tenpai_scan 결과가 누구에게 보이나 (비밀 약속)", rows);
}

// ═══════════════════════════════════════════════════════════════
// 7. 가려진 도라(dora_conceal) × 투시(xray_hand) — 도라는 여전히 가려지나
// ═══════════════════════════════════════════════════════════════
{
  const scene = (): GameState =>
    craft({
      hands: { p0: "123456789m11p234p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  const rows: Record<string, unknown>[] = [];
  for (const [label, aug, declare] of [
    ["없음", {}, false],
    ["A=가려진 도라(p1)", { p1: ["dora_conceal"] }, false],
    ["B=투시(p0)", { p0: ["xray_hand"] }, true],
    ["A+B", { p1: ["dora_conceal"], p0: ["xray_hand"] }, true],
  ] as [string, Partial<Record<PlayerId, string[]>>, boolean][]) {
    const g = setup(scene(), aug);
    seat(g, 0);
    if (declare) submit(g, "p0", "xray_reveal", {});
    const v0 = view(g, "p0");
    rows.push({
      조합: label,
      "p0이 보는 도라 표시패": (v0.round.doraIndicators ?? []).length,
      "p0이 보는 p1 손패 장수": v0.zones["hand:p1"]?.tileIds.length ?? 0,
      "p1이 보는 도라 표시패": (view(g, "p1").round.doraIndicators ?? []).length,
      "p2가 보는 도라 표시패": (view(g, "p2").round.doraIndicators ?? []).length,
    });
  }
  table("7. dora_conceal × xray_hand", rows);
}

// ═══════════════════════════════════════════════════════════════
// 8. 등 떠밀기 × 승부수 — 강제 리치를 물리면 낙인/재리치는?
// ═══════════════════════════════════════════════════════════════
{
  const scene = (): GameState =>
    craft({
      hands: {
        p0: "123456789m11p234p",
        p1: "123m123p123s99s45s", // 텐파이 (버리면 계속 텐파이)
        p2: "*",
        p3: "*",
      },
      discards: { p0: "9p", p1: "9p", p2: "9p", p3: "9p" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  const g = setup(scene(), { p0: ["push_riichi"], p1: ["last_stand"] });
  seat(g, 0);
  submit(g, "p0", "push_brand", { target: "p1" });
  // p1 의 순을 만들어 평범하게 버린다 → 강제 리치가 얹혀야 한다
  const st = g.engine.state;
  const p1hand = [...(st.zones["hand:p1"]?.tileIds ?? [])];
  (g.engine as unknown as { currentState: GameState }).currentState = {
    ...st,
    round: { ...st.round, turnSeat: 1, lastDrawnTile: p1hand[p1hand.length - 1]! },
  };
  submit(g, "p1", "discard", { tileId: p1hand[0]! });
  const afterPush = g.engine.state.round.byPlayer["p1"]?.riichi != null;
  const brandAfter = g.engine.state.augmentData[`push_riichi:brand:p0#round`];
  // 승부수로 취소
  seat(g, 1);
  let cancelOk = "n/a";
  try {
    submit(g, "p1", "cancel_riichi", {});
    cancelOk = "성공";
  } catch (e) {
    cancelOk = String(e).slice(0, 60);
  }
  console.log("\n### 8. push_riichi × last_stand");
  console.table([
    {
      "강제 리치 걸림": afterPush,
      "낙인 잔여": String(brandAfter),
      "승부수 취소": cancelOk,
      "취소 후 리치": g.engine.state.round.byPlayer["p1"]?.riichi != null,
      "이 국 재리치 봉쇄": g.engine.rules.resolve("riichi.blocked", {
        playerId: "p1",
        state: g.engine.state,
      } as never),
      "p0 낙인 재사용 버튼": turnOptions(
        (() => {
          seat(g, 0);
          return g;
        })(),
        "p0",
      ).filter((o) => o.type === "push_brand").length,
    },
  ]);
}
