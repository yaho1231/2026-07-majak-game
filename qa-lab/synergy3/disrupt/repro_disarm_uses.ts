/**
 * 무장해제(disarm) × 횟수/쿨다운 — 잠긴 증강의 **잔량은 소모되나**, 그리고
 * 화면의 잔량 pill·쿨다운 칩은 어떻게 되나.
 *
 * 대조군: (없음) / (선언만) / (무장해제만: 선언 전에 잠금) / (선언 뒤 무장해제)
 *
 * 기대: disarm detail 은 "국이 끝나면 증강도 돌아온다"만 약속한다 —
 *       ① 선언 전에 잠기면 버튼이 사라지고 잔량은 그대로여야 한다.
 *       ② 선언 뒤 잠기면 효과만 죽는다(잔량 회복 약속은 없다).
 *       ③ 어느 쪽이든 **화면에 뜨는 잔량/쿨다운 표시가 실제와 일치**해야 한다.
 */
import { craft, setup, submit, table, turnOptions, view } from "./lib.js";
import type { Game, GameState, PlayerId } from "./lib.js";

function scene(): GameState {
  return craft({
    hands: { p0: "123456789m12p33p", p1: "123456789m12p33p", p2: "*", p3: "*" },
    discards: { p0: "1s", p1: "1s", p2: "1s", p3: "1s" },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
}

function seat(game: Game, s: number): void {
  (game.engine as unknown as { currentState: GameState }).currentState = {
    ...game.engine.state,
    round: { ...game.engine.state.round, turnSeat: s },
  };
}

function chans(game: Game, viewer: PlayerId, needle: string): string {
  const av = (view(game, viewer).augmentView ?? {}) as Record<string, unknown>;
  const hits = Object.entries(av).filter(([k]) => k.includes(needle));
  return hits.length === 0 ? "(없음)" : JSON.stringify(Object.fromEntries(hits));
}

interface C {
  id: string;
  action: string;
  payload?: unknown;
  /** 내부 잔량/쿨다운 키 */
  keys: string[];
}

const cases: C[] = [
  { id: "invincible", action: "invincible_guard", keys: ["invincible:cd:p1"] },
  { id: "xray_hand", action: "xray_reveal", keys: ["xray_hand:uses:p1"] },
  { id: "hidden_river", action: "declare_fog", keys: ["hidden_river:uses:p1"] },
  { id: "call_seal", action: "call_seal_use", keys: ["call_seal:uses:p1"] },
  { id: "brief_fog", action: "declare_brief_fog", keys: ["brief_fog:uses:p1"] },
  { id: "pseudo_dealer", action: "claim_dealer", keys: ["pseudo_dealer:cd:p1"] },
];

const rows: Record<string, unknown>[] = [];
for (const c of cases) {
  const mk = (): Game => setup(scene(), { p0: ["disarm"], p1: [c.id] });

  // (없음)
  const base = mk();
  seat(base, 1);
  const optBase = turnOptions(base, "p1").filter((o) => o.type === c.action).length;

  // (A) 선언만
  const a = mk();
  seat(a, 1);
  submit(a, "p1", c.action, c.payload ?? {});
  const keyA = c.keys.map((k) => `${k}=${String(a.engine.state.augmentData[k])}`).join(" ");

  // (B) 선언 전에 무장해제
  const b = mk();
  seat(b, 0);
  submit(b, "p0", "disarm_lock", { target: "p1", augmentId: c.id });
  seat(b, 1);
  const optB = turnOptions(b, "p1").filter((o) => o.type === c.action).length;
  const keyB = c.keys.map((k) => `${k}=${String(b.engine.state.augmentData[k])}`).join(" ");

  // (A+B) 선언 뒤 무장해제
  const ab = mk();
  seat(ab, 1);
  submit(ab, "p1", c.action, c.payload ?? {});
  seat(ab, 0);
  submit(ab, "p0", "disarm_lock", { target: "p1", augmentId: c.id });
  const keyAB = c.keys
    .map((k) => `${k}=${String(ab.engine.state.augmentData[k])}`)
    .join(" ");

  rows.push({
    증강: c.id,
    "버튼(없음)": optBase,
    "버튼(무장해제 후)": optB,
    "잔량키(A 선언만)": keyA,
    "잔량키(B 선언전 잠금)": keyB,
    "잔량키(A+B)": keyAB,
    "본인 pill(A+B)": chans(ab, "p1", "uses:").slice(0, 70),
    "본인 pill(A)": chans(a, "p1", "uses:").slice(0, 70),
  });
}
table("disarm × 잔량/쿨다운", rows);

// ── 무장해제 상호 (p0 ↔ p1 이 서로의 disarm 을 잠근다)
console.log("\n### 무장해제 상호 잠금");
{
  const g = setup(scene(), { p0: ["disarm"], p1: ["disarm"] });
  seat(g, 1);
  submit(g, "p1", "disarm_lock", { target: "p0", augmentId: "disarm" });
  seat(g, 0);
  console.log(
    "p1이 p0의 disarm을 잠근 뒤 p0의 disarm 버튼 수:",
    turnOptions(g, "p0").filter((o) => o.type === "disarm_lock").length,
  );
  console.log("disarmed 목록:", g.engine.state.augmentData["engine:disarmed#round"]);
  console.log(
    "p1 uses:",
    g.engine.state.augmentData["disarm:uses:p1"],
    "p0 uses:",
    g.engine.state.augmentData["disarm:uses:p0"],
  );
}
