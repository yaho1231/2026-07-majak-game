/** 방해·수비·좌석 축 — 배터리 3 (창깡 · 6순 창 · 눈먼 총알 재배선 × 방어 · 무장해제 × 패시브 정산) */
import {
  craft,
  setup,
  submit,
  startFlow2,
  lastSettled,
  table,
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

// ══════ 13. 성립하지 않는 깡(void_kan) × 불가침 조약 / 천하무적 ══════
// p1 이 안깡을 선언한다. p0 은 void_kan 으로 창깡을 노린다.
// 조약(no_ron_pact)은 "안깡도 파기 사유"라고 못 박는다 — 그 깡을 창깡당할 수 있어야 한다.
{
  const scene = (): GameState =>
    craft({
      hands: {
        p0: "123m456m789m11p2p", // 13장 텐파이 (3p 대기 아님 — void_kan 이 만들어 준다)
        p1: "1111s234m567m99p", // 1s 안깡 재료
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
  const rows: Record<string, unknown>[] = [];
  for (const [label, aug] of [
    ["없음", { p0: ["void_kan"] }],
    ["p1 이 불가침 조약", { p0: ["void_kan"], p1: ["no_ron_pact"] }],
    ["p1 이 천하무적(선언)", { p0: ["void_kan"], p1: ["invincible"] }],
  ] as [string, Partial<Record<PlayerId, string[]>>][]) {
    const g = setup(scene(), aug);
    if (aug["p1"]?.includes("invincible")) {
      patch(g, { turnSeat: 1 });
      submit(g, "p1", "invincible_guard", {});
    }
    const before = g.engine.rules.resolve("win.ronImmune", {
      playerId: "p1",
      state: g.engine.state,
    } as never);
    rows.push({
      조합: label,
      "안깡 전 p1 면역": before,
      "closedKanRobbable(p0)": g.engine.rules.resolve("win.closedKanRobbable", {
        playerId: "p0",
        state: g.engine.state,
      } as never),
      "p1 멘쯔 수": g.engine.state.round.byPlayer["p1"]?.melds.length,
    });
  }
  table("13. void_kan × 론 면역 — 안깡 선언 시점의 면역 상태", rows);
}

// ══════ 15. 시간 정지(time_stop) × 함구령·박무의 «6순» 창 ══════
// turnCount 는 **오야가 뽑을 때만** +1 한다. 오야가 time_stop 으로 한 순에 두 번 뽑으면
// 같은 한 바퀴에 turnCount 가 2 오른다 → 남의 6순 봉인이 그만큼 짧아진다.
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
  for (const useStop of [false, true]) {
    // p1 이 함구령을 걸고, 오야(p0, dealerSeat=0)가 time_stop 을 쓴다
    const g = setup(scene(), { p1: ["call_seal"], p0: ["time_stop"] });
    submit(g, "p1", "call_seal_use", {});
    const declared = g.engine.state.round.turnCount;
    // 한 바퀴를 돌린다 (p2 → p3 → p0(오야 쯔모) → …)
    const { flow, status } = startFlow2(g);
    let st = status;
    let guard = 0;
    let used = false;
    while (st.kind === "awaiting" && guard++ < 60) {
      const pr = (st.prompts as {
        player: PlayerId;
        options: { type: string; payload: unknown }[];
      }[])[0];
      if (pr === undefined) break;
      let opt = pr.options.find((o) => o.type === "discard");
      if (useStop && !used && pr.player === "p0") {
        const ts = pr.options.find((o) => o.type === "time_stop_use");
        if (ts !== undefined) {
          used = true;
          opt = ts;
        }
      }
      opt ??= pr.options.find((o) => o.type === "pass") ?? pr.options[0];
      if (opt === undefined) break;
      st = flow.submit(pr.player, { type: opt.type, payload: opt.payload } as never);
      if (g.engine.state.round.turnCount - declared >= 6) break;
    }
    rows.push({
      조합: useStop ? "오야가 time_stop 사용" : "없음",
      "제출 수": guard,
      "선언 turnCount": declared,
      "지금 turnCount": g.engine.state.round.turnCount,
      "봉인 아직 유효": g.engine.rules.resolve("call.blocked", {
        playerId: "p2",
        state: g.engine.state,
      } as never),
      "p0 버림 수": g.engine.state.round.byPlayer["p0"]?.discardCount,
    });
  }
  table("15. time_stop(오야) × call_seal 6순 창 — 같은 제출 수에서 창이 얼마나 남나", rows);
}

// ══════ 19. 눈먼 총알 재배선 × 역만 방어술 — 엉뚱하게 맞은 방어막은 전액 환급되나 ══════
{
  const scene = (seed: number): GameState =>
    craft({
      hands: { p0: "111m222m333m444p5s", p1: "*", p2: "*", p3: "*" },
      discards: { p3: "9p" },
      phase: "reaction",
      turnSeat: 3,
      lastDiscard: { player: "p3", spec: "5s" },
      seed,
    });
  const rows: Record<string, unknown>[] = [];
  for (let seed = 1; seed <= 30 && rows.length < 3; seed++) {
    // 우선 방어막 없이 누가 맞는지 본다
    const probe = setup(scene(seed), { p2: ["blind_ron"] });
    const f0 = startFlow2(probe);
    const s0 = f0.flow.submit("p0", { type: "win", payload: {} });
    if (s0.kind !== "roundOver") continue;
    const d0 = (lastSettled(probe) as { deltas: Record<string, number> }).deltas;
    const victim = (["p0", "p1", "p2", "p3"] as PlayerId[]).find(
      (p) => p !== "p3" && (d0[p] ?? 0) < 0,
    );
    if (victim === undefined) continue; // 쏜 사람이 그대로 문 판 — 다음 시드
    const g = setup(scene(seed), { p2: ["blind_ron"], [victim]: ["yakuman_shield"] });
    const f = startFlow2(g);
    const s = f.flow.submit("p0", { type: "win", payload: {} });
    if (s.kind !== "roundOver") continue;
    const d = (lastSettled(g) as { deltas: Record<string, number> }).deltas;
    rows.push({
      seed,
      "총알이 맞힌 사람": victim,
      "재배선만 — 그 사람 증감": d0[victim],
      "그 사람이 방어막 보유 시": d[victim],
      "화료자 p0": d["p0"],
      총합: sum(d),
      판정: d[victim] === 0 ? "전액 환급 ✅" : `잔여 손실 ${d[victim]} ❌`,
    });
  }
  table("19. blind_ron 재배선 × yakuman_shield (론 경로)", rows);
}

// ══════ 21·23. 무장해제 × 패시브 정산 증강 (역만 방어술 · 승승장구) ══════
{
  const scene = (): GameState =>
    craft({
      hands: { p0: "111m222m333m444p5s", p1: "123456789m11p234p", p2: "*", p3: "*" },
      discards: { p3: "9p" },
      phase: "reaction",
      turnSeat: 3,
      lastDiscard: { player: "p3", spec: "5s" },
    });
  const run = (label: string, disarmIt: boolean) => {
    const g = setup(scene(), { p1: ["disarm"], p3: ["yakuman_shield"] });
    if (disarmIt) {
      patch(g, { phase: "turn.act", turnSeat: 1 });
      submit(g, "p1", "disarm_lock", { target: "p3", augmentId: "yakuman_shield" });
      patch(g, { phase: "reaction", turnSeat: 3 });
    }
    const { flow } = startFlow2(g);
    const s = flow.submit("p0", { type: "win", payload: {} });
    if (s.kind !== "roundOver") return { 조합: label, 결과: s.kind };
    const d = (lastSettled(g) as { deltas: Record<string, number> }).deltas;
    return {
      조합: label,
      p0: d["p0"],
      "p3(방어막)": d["p3"],
      총합: sum(d),
      "p3 방어 카운터": String(g.engine.state.augmentData["yakuman_shield:used:p3"]),
    };
  };
  table("21. disarm × yakuman_shield — 방어가 실제로 꺼지나", [
    run("무장해제 없음", false),
    run("역만 방어술을 무장해제", true),
  ]);
}

// ══════ 24. 자리 바꿈 × 천하무적(선언 상태) — 면역은 사람을 따르나 ══════
{
  const scene = (): GameState =>
    craft({
      hands: { p0: "123456789m11p234p", p1: "123456789m11p234p", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
  const rows: Record<string, unknown>[] = [];
  for (const swap of [false, true]) {
    const g = setup(scene(), { p0: ["invincible"], p1: ["seat_swap"] });
    patch(g, { turnSeat: 0, firstTurn: true });
    submit(g, "p0", "invincible_guard", {});
    const h1 = hand(g, "p1");
    patch(g, { turnSeat: 1, firstTurn: true, lastDrawnTile: h1[h1.length - 1]! });
    if (swap) submit(g, "p1", "seat_swap", { target: "p0" });
    rows.push({
      조합: swap ? "p1이 p0과 자리 바꿈" : "안 바꿈",
      "ronImmune(p0)": g.engine.rules.resolve("win.ronImmune", {
        playerId: "p0",
        state: g.engine.state,
      } as never),
      "ronImmune(p1)": g.engine.rules.resolve("win.ronImmune", {
        playerId: "p1",
        state: g.engine.state,
      } as never),
      "p0 자리": g.engine.state.players.find((x) => x.id === "p0")?.seat,
      "p1 자리": g.engine.state.players.find((x) => x.id === "p1")?.seat,
      배너: JSON.stringify(
        Object.fromEntries(
          Object.entries((view(g, "p2").augmentView ?? {}) as Record<string, unknown>).filter(
            ([k]) => k.includes("invincible"),
          ),
        ),
      ),
    });
  }
  table("24. seat_swap × invincible — 면역이 사람을 따르나 자리를 따르나", rows);
}
