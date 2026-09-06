/**
 * ① 카르마 — description "점수를 잃을 때마다 … 게이지로 쌓이고"가 실제로는
 *    **국 정산(ROUND_SETTLED) 손실에만** 쌓인다. 남의 카르마에 뜯긴 손실은 0원 적립.
 * ② 큰손 — "본장 수령분과 회수하는 리치봉이 전부 총액에 들어간다" 실측.
 * ③ 판돈 굴리기 — "본장·공탁은 배수 대상이 아니다" 실측 (대조군).
 *
 * 실행: ~/majak/node_modules/.bin/tsx qa-lab/text/b5/repro_karma_and_bighand.ts
 */
import type { GameState, PlayerId } from "@majak/core";
import { craft, lastSettled, start } from "../../score-b/scene.js";

const say = (s: string): void => {
  console.log(s);
};
const withRound = (s: GameState, r: Partial<GameState["round"]>): GameState => ({
  ...s,
  round: { ...s.round, ...r },
});
const withData = (s: GameState, d: Record<string, unknown>): GameState => ({
  ...s,
  augmentData: { ...s.augmentData, ...d },
});

// ── ① 카르마: 남의 카르마에 뜯긴 손실은 게이지에 쌓이는가 ────────────────────
say("===== ① 카르마 게이지 적립원");
{
  const base = withData(
    craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { "karma:gauge:p0": 12000 }, // p0 게이지 충전
  );
  const { game, flow } = start(base, { p0: ["karma"], p1: ["karma"] } as never);
  const before = game.engine.state.players.map((p) => `${p.id}:${p.score}`).join(" ");
  say(`  소각 전 점수  ${before}`);
  say(`  소각 전 p1 게이지 = ${game.engine.state.augmentData["karma:gauge:p1"] ?? 0}`);
  const r = flow.submit("p0", { type: "karma_burn", payload: {} });
  say(`  karma_burn = ${r.kind}`);
  const st = game.engine.state;
  say(`  소각 후 점수  ${st.players.map((p) => `${p.id}:${p.score}`).join(" ")}`);
  say(
    `  ★ p1은 4000점을 잃었는데 p1 게이지 = ${st.augmentData["karma:gauge:p1"] ?? 0}` +
      "  (description: \"점수를 잃을 때마다 … 쌓이고\")",
  );
}

// ── ①-b 리치 공탁 1000점(가장 흔한 손실)도 게이지에 안 쌓인다 ───────────────
say("\n===== ①-b 카르마 — 리치 공탁 1000점");
{
  const base = craft({
    hands: { p0: "123m123p123s678s99s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const { game, flow } = start(base, { p0: ["karma"] } as never);
  const hand = game.engine.state.zones["hand:p0"]?.tileIds ?? [];
  const r = flow.submit("p0", {
    type: "riichi",
    payload: { tileId: hand[hand.length - 1]! },
  });
  const st = game.engine.state;
  say(`  riichi=${r.kind} p0 점수=${st.players.find((p) => p.id === "p0")!.score} 공탁=${st.round.riichiPot}`);
  say(`  ★ 1000점을 잃었는데 p0 게이지 = ${st.augmentData["karma:gauge:p0"] ?? 0}`);
}

// ── ②③ 정산 실측 ──────────────────────────────────────────────────────────
/** p0 단기 9s 대기, p1이 9s 방총 — 손 자체가 작은 손이 되도록 */
const ronScene = (): GameState =>
  craft({
    hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
    discards: { p1: "9s" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "9s" },
  });

function settle(
  tag: string,
  s: GameState,
  give: Record<string, string[]>,
  who: PlayerId = "p0",
): void {
  const { flow } = start(s, give as never);
  const st = flow.submit(who, { type: "win", payload: {} });
  if (st.kind !== "roundOver") {
    say(`  ${tag}: 화료 실패 ${st.kind}`);
    return;
  }
  const p = lastSettled(flow);
  const w = p.winInfos?.[0];
  say(
    `  ${tag}: 손=${w?.points} 본장=${w?.honbaBonus ?? 0} 회수공탁=${w?.riichiPotGain ?? 0} ` +
      `→ deltas=${JSON.stringify(p.deltas)} aug=${JSON.stringify(p.augPoints ?? [])}`,
  );
}

say("\n===== ② 큰손 — 하한 8000이 '총액' 기준인가");
{
  // 선언 표식은 roundKey(장-국-본장)와 정확히 같아야 산다
  const declared = (s: GameState): GameState =>
    withData(s, {
      "big_hand:round:p0": `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`,
    });
  settle("공탁 0 · 본장 0    ", declared(ronScene()), { p0: ["big_hand"] });
  settle(
    "공탁 2000 · 본장 0 ",
    declared(withRound(ronScene(), { riichiPot: 2000 })),
    { p0: ["big_hand"] },
  );
  settle(
    "공탁 0 · 본장 3    ",
    declared(withRound(ronScene(), { honba: 3 })),
    { p0: ["big_hand"] },
  );
}

say("\n===== ③ 판돈 굴리기 — 배수가 손의 화료점에만 걸리는가 (연승 3 = 4배)");
{
  const s = withData(withRound(ronScene(), { riichiPot: 3000, honba: 3 }), {
    "let_it_ride:streak:p0": 3,
  });
  settle("4배 · 공탁3000 · 본장3", s, { p0: ["let_it_ride"] });
  settle("대조군(증강 없음)     ", withRound(ronScene(), { riichiPot: 3000, honba: 3 }), {
    p0: [],
  });
}

say("\n===== ④ 큰손 × 기생충 — '내가 받는 총액이 최소 만관' 이 지켜지는가");
{
  const declared = (s: GameState): GameState =>
    withData(s, {
      "big_hand:round:p0": `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`,
      // p1이 이번 국에 p0에게 기생
      [`parasite:target:p1:${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`]: "p0",
    });
  settle("큰손만          ", declared(ronScene()), { p0: ["big_hand"] });
  settle("큰손 + 상대 기생충", declared(ronScene()), { p0: ["big_hand"], p1: ["parasite"] });
}
