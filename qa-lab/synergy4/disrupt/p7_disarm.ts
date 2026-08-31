/**
 * P7 — 무장해제(disarm)를 둘이 들었을 때 국 경계 정리.
 *
 * disarm 은 국이 끝날 때 ROUND_SETTLED 리액션에서
 *   DISARMED_SOURCES_KEY = 현재목록 filter(내가 잠근 것 제외)
 * 로 **목록을 통째로 다시 쓴다**. 보유자가 둘이면 리액션이 둘 다 돌면서
 * 각자 «자기 것만 뺀 전체 목록»을 쓴다 — 뒤에 도는 쪽이 앞의 삭제를 되살릴 수 있다.
 *
 * 예측: 정상이라면 국이 끝난 뒤 DISARMED_SOURCES_KEY 는 **빈 배열**이어야 한다.
 */
import { craft, setup, startFlow2 } from "../../synergy3/disrupt/lib.js";
import { DISARMED_SOURCES_KEY, augmentInstanceId, ROUND_SCOPED_MARK } from "@majak/core";
import type { GameState } from "@majak/core";

const HAND = "123m123p123s678s9s";
const lockedKey = (h: string) => `disarm:locked:${h}${ROUND_SCOPED_MARK}`;

function build(holders: string[], locks: [string, string, string][]) {
  let state: GameState = craft({
    hands: { p0: HAND, p1: "*", p2: "*", p3: "*" },
    discards: { p1: "" } as never,
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "9s" },
  } as never);
  const srcs = locks.map(([, t, a]) => augmentInstanceId(t as never, a));
  const data: Record<string, unknown> = { [DISARMED_SOURCES_KEY]: srcs };
  for (const [h] of locks) {
    const mine = locks.filter((l) => l[0] === h).map(([, t, a]) => augmentInstanceId(t as never, a));
    data[lockedKey(h)] = mine;
  }
  state = { ...state, augmentData: { ...state.augmentData, ...data } };
  const augs: Record<string, string[]> = { p0: ["disarm"], p1: [], p2: [], p3: [] };
  for (const h of holders) augs[h] = [...(augs[h] ?? []), "disarm"];
  augs["p0"] = [...new Set(augs["p0"] ?? [])];
  // 잠긴 대상이 실제로 그 증강을 들고 있어야 그림이 맞는다
  for (const [, t, a] of locks) augs[t] = [...new Set([...(augs[t] ?? []), a])];
  return setup(state, augs);
}

function runCase(label: string, holders: string[], locks: [string, string, string][]) {
  const g = build(holders, locks);
  console.log(`\n## ${label}`);
  console.log(`  국 시작 시 DISARMED = ${JSON.stringify(g.engine.state.augmentData[DISARMED_SOURCES_KEY])}`);
  const { flow } = startFlow2(g);
  let st: any = flow.submit("p0", { type: "win", payload: {} } as never);
  let guard = 0;
  while (st.kind === "awaiting" && guard++ < 8) {
    const q = st.prompt ?? st.prompts?.[0];
    st = flow.submit(q.player, (q.options.find((o: any) => o.type === "pass") ?? q.options[0]) as never);
  }
  console.log(`  정산 후 kind=${st.kind}`);
  console.log(`  정산 후 DISARMED = ${JSON.stringify(g.engine.state.augmentData[DISARMED_SOURCES_KEY])}`);
}

// (a) 보유자 한 명 — 정상 동작 기준선
runCase("disarm 1명(p0)이 p1의 counter 를 잠갔다", ["p0"], [["p0", "p1", "counter"]]);
// (b) 보유자 두 명이 서로 다른 대상을 잠갔다
runCase("disarm 2명(p0·p2)이 각각 p1.counter / p3.parasite 를 잠갔다",
  ["p0", "p2"], [["p0", "p1", "counter"], ["p2", "p3", "parasite"]]);
// (c) 보유자 세 명
runCase("disarm 3명(p0·p2·p3)",
  ["p0", "p2", "p3"], [["p0", "p1", "counter"], ["p2", "p1", "spy"], ["p3", "p1", "karma"]]);

// (d) 실제 매치에서 국 경계를 넘는지 — 국 시작마다 DISARMED 목록을 찍는다
import { runMatch, PERSONAS } from "../../harness.js";
console.log("\n## (d) 실제 동풍전: disarm 을 p0·p2 가 함께 든다 — 국 시작 시점 잔재");
const seen: string[] = [];
await runMatch({
  seed: 4242,
  mode: "tonpuu",
  preset: { p0: ["disarm", "counter"], p1: ["parasite", "spy"], p2: ["disarm", "karma"], p3: ["scapegoat", "bottom_yaku"] } as never,
  personas: { p0: PERSONAS["masher"]!, p1: PERSONAS["masher"]!, p2: PERSONAS["masher"]!, p3: PERSONAS["chaos"]! },
  onRound: (st, phase) => {
    const v = st.augmentData[DISARMED_SOURCES_KEY];
    seen.push(`${phase} ${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}: ${JSON.stringify(v ?? null)}`);
  },
  timeoutMs: 90_000,
});
for (const s of seen) console.log("   " + s);
