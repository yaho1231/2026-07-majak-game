/**
 * 최소 재현 — 책임전가(blame_shift) 더블론 두 갈래.
 *
 *  B-1) 보유자가 **두 번째 화료자**일 때, 첫 화료자의 **본장 가산분**까지 자기 지불분으로
 *       착각해 함께 흩는다. (`owed`가 다른 화료자의 points만 빼고 honbaBonus는 안 뺀다)
 *  B-2) **두 명이 blame_shift**를 들고 더블론하면, 나중에 도는 인터셉터가 **이미 재배선된**
 *       deltas[discarder]를 읽어 자기 몫을 과소평가한다 → 방총자가 더 내고 무관한 사람이 덜 낸다.
 *
 * 실행: tsx qa-lab/score-b/repro_blameshift.ts
 */
import type { GameState, PlayerId } from "@majak/core";
import { craft, lastSettled, start } from "./scene.js";

const say = (s: string): void => { console.log(s); };

/** p0·p2 가 9s 단기, p1이 9s 방총 (더블론), 3본장 */
function scene(): GameState {
  const s = craft({
    hands: { p0: "123m123p123s678s9s", p2: "456m456p456s678p9s", p1: "*", p3: "*" },
    discards: { p1: "9s" },
    phase: "reaction", turnSeat: 1, lastDiscard: { player: "p1", spec: "9s" },
  });
  return { ...s, round: { ...s.round, honba: 3 } };
}

function run(label: string, give: Record<string, string[]>): void {
  const { flow } = start(scene(), give as never);
  let st = flow.submit("p0", { type: "win", payload: {} });
  if (st.kind === "awaiting") st = flow.submit("p2", { type: "win", payload: {} });
  const p = lastSettled(flow);
  const w = p.winInfos ?? [];
  say(`${label}`);
  say(`   화료: ${w.map((x) => `${x.winner} points=${x.points} honba=${x.honbaBonus ?? 0}`).join(" | ")}`);
  say(`   deltas=${JSON.stringify(p.deltas)}  (p1=방총자, p3=무관)`);
}

run("[기준] 증강 없음 — p1이 전액 16,600 부담", {});
run("[B-1] p0(두 번째 화료자)만 blame_shift — p0 몫 7,700 을 2분할해야 한다", { p0: ["blame_shift"] });
say("   ↳ 기대: p3 = -3,900 (7,700÷2, 100점 내림/반올림), 실제 p3 = -4,300");
say("     차액 400 = 첫 화료자 p2의 본장 900을 함께 흩은 몫(900÷2=450→반올림 여파)");
run("[대조] p2(첫 화료자)만 blame_shift — 본장이 자기 것이라 정확", { p2: ["blame_shift"] });
run("[B-2] p0·p2 둘 다 blame_shift — 두 번 흩어야 한다", { p0: ["blame_shift"], p2: ["blame_shift"] });
say("   ↳ 기대: p3 = -(4,500 + 3,900) = -8,400 안팎, 실제 p3 = -6,600");
say("     두 번째 인터셉터가 owed 를 7,700 이 아니라 4,100 으로 계산했다");

// B-1 확대판 — 첫 화료자가 본장 사냥꾼이면 새는 액수가 커진다 (5본장 × 1500 = 7,500)
function scene5(): GameState {
  const s = craft({
    hands: { p0: "123m123p123s678s9s", p2: "456m456p456s678p9s", p1: "*", p3: "*" },
    discards: { p1: "9s" },
    phase: "reaction", turnSeat: 1, lastDiscard: { player: "p1", spec: "9s" },
  });
  return { ...s, round: { ...s.round, honba: 5 } };
}
function run5(label: string, give: Record<string, string[]>): void {
  const { flow } = start(scene5(), give as never);
  let st = flow.submit("p0", { type: "win", payload: {} });
  if (st.kind === "awaiting") st = flow.submit("p2", { type: "win", payload: {} });
  const p = lastSettled(flow);
  say(`${label}`);
  say(`   화료: ${(p.winInfos ?? []).map((x) => `${x.winner} points=${x.points} honba=${x.honbaBonus ?? 0}`).join(" | ")}`);
  say(`   deltas=${JSON.stringify(p.deltas)}`);
}
run5("[B-1 확대] p2=honba_hunter(첫 화료·5본장=7,500) · p0=blame_shift(둘째)", {
  p2: ["honba_hunter"], p0: ["blame_shift"],
});
say("   ↳ p0 몫은 7,700 뿐인데, p2의 본장 7,500까지 합쳐 15,200 을 2분할한다");
