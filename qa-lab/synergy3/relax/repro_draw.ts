/**
 * 유국 정산의 겹침 — always_tenpai(승승장구) × nagashi_yakuman(유국역만)
 *                    × hourglass(모래시계) × regret(미련)
 *
 * 기대(먼저 적음):
 *  - 없음: 전원 노텐 → 델타 0 · 오야 연장 없음
 *  - always_tenpai 만: 홀더만 텐파이 → +3000, 나머지 -1000씩. 추가로 노텐 3인 ×2000
 *    = 홀더 +9000 / 각 -3000. 오야(=홀더)면 연장.
 *  - nagashi 만: 홀더 노텐이므로 노텐 벌점(-1000×?)… 텐파이 0명이면 벌점 없음.
 *    유국역만(오야) = 각 16000 → 홀더 +48000.
 *  - 둘 다: 두 정산이 **더해져야** 한다 → 홀더 +9000 +48000 = +57000,
 *    각 상대 -3000 -16000 = -19000. 합계 0.
 *  - hourglass: 홀더가 (진짜) 텐파이가 아니면 발동하지 않는다.
 *    always_tenpai 를 함께 들어도 '항상 텐파이'는 hourglass 조건을 만족시키지 않을 것.
 */
import { WALL, isTenpai, meldCountOf, scoringOptionsOf, winHandKindsOf } from "@majak/core";
import type { GameState } from "@majak/core";
import { craft, start, settleDraw, emptyWall, table } from "./lib.js";
import { alwaysTenpai } from "../../../packages/content/src/augments/always_tenpai.js";
import { nagashiYakuman } from "../../../packages/content/src/augments/nagashi_yakuman.js";
import { hourglass } from "../../../packages/content/src/augments/hourglass.js";
import { regret } from "../../../packages/content/src/augments/regret.js";

/** p0 의 버림 이력을 요구패로만 채운다(유국역만 성립) */
function scene(opts: { nagashi?: boolean; p0Tenpai?: boolean } = {}): GameState {
  const base = craft({
    hands: {
      // 텐파이 손 / 확실한 노텐 손을 골라 넣는다
      p0: opts.p0Tenpai === true ? "234m345p456s678s2s" : "147m147p147s1234z",
      p1: "147m147p147s1234z",
      p2: "147m147p147s1234z",
      p3: "147m147p147s1234z",
    },
    discards: opts.nagashi === true ? { p0: "99m99p9s" } : { p0: "356m" },
    phase: "turn.draw",
    turnSeat: 0,
  });
  return emptyWall(base);
}

function run(
  label: string,
  s: GameState,
  defs: Parameters<typeof start>[1],
): void {
  const g = start(s, defs);
  const before = {
    tenpai: isTenpai(
      winHandKindsOf(g.engine.state, g.engine.rules, "p0"),
      meldCountOf(g.engine.state, "p0"),
      undefined,
      scoringOptionsOf(g.engine.state, g.engine.rules, "p0"),
    ),
    wall: g.engine.state.zones[WALL]?.tileIds.length,
  };
  const p = settleDraw(g);
  if (p === null) {
    table(label, [
      { label: "p0 실제 텐파이?", value: before.tenpai },
      { label: "정산", value: "ROUND_SETTLED 없음 — 모래시계가 유국을 대체" },
      {
        label: "마지막 이벤트",
        value: g.engine.eventLog.slice(-3).map((e) => e.type),
      },
      { label: "패산 장수", value: g.engine.state.zones[WALL]?.tileIds.length },
      { label: "phase/turnSeat", value: `${g.engine.state.round.phase}/${g.engine.state.round.turnSeat}` },
    ]);
    return;
  }
  table(label, [
    { label: "p0 실제 텐파이?", value: before.tenpai },
    { label: "outcome", value: p.outcome },
    { label: "tenpaiPlayers", value: p.tenpaiPlayers },
    { label: "deltas", value: p.deltas },
    { label: "합계", value: Object.values(p.deltas).reduce((a, b) => a + b, 0) },
    { label: "dealerContinues", value: p.dealerContinues },
    { label: "honba", value: p.honba },
    { label: "drawSpecial", value: p.drawSpecial },
    { label: "augPoints", value: p.augPoints },
  ]);
}

console.log("\n########## ① 전원 노텐 · p0 버림 전부 요구패");
run("① 없음", scene({ nagashi: true }), []);
run("② always_tenpai 만", scene({ nagashi: true }), [alwaysTenpai]);
run("③ nagashi_yakuman 만", scene({ nagashi: true }), [nagashiYakuman]);
run("④ 둘 다 (더해져야)", scene({ nagashi: true }), [alwaysTenpai, nagashiYakuman]);

console.log("\n########## ② 유국역만 불성립(잡패 버림) · 전원 노텐");
run("⑤ 둘 다 · nagashi 불성립", scene({ nagashi: false }), [alwaysTenpai, nagashiYakuman]);

console.log("\n########## ③ hourglass — '항상 텐파이'가 연장 조건을 만족시키나");
run("⑥ hourglass 만 (p0 노텐)", scene({ nagashi: true }), [hourglass]);
run("⑦ hourglass + always_tenpai (p0 노텐)", scene({ nagashi: true }), [
  hourglass,
  alwaysTenpai,
]);
run("⑧ hourglass 만 (p0 진짜 텐파이)", scene({ nagashi: true, p0Tenpai: true }), [
  hourglass,
]);

console.log("\n########## ④ regret — '항상 텐파이'로 손이 보존되나");
run("⑨ regret + always_tenpai (p0 노텐)", scene({ nagashi: true }), [
  regret,
  alwaysTenpai,
]);

console.log("\n########## ⑤ hourglass 연장 뒤의 2번째 유국 — 승승장구·유국역만이 그때 붙나");
{
  const g = start(scene({ nagashi: true, p0Tenpai: true }), [
    hourglass,
    alwaysTenpai,
    nagashiYakuman,
  ]);
  const first = settleDraw(g);
  console.log("  1차 유국 정산:", first === null ? "대체됨(연장)" : JSON.stringify(first.deltas));
  // 연장이 끝난 상태(패산 다시 비움)를 그대로 이어 두 번째 유국을 낸다
  const g2 = start(emptyWall(g.engine.state), [hourglass, alwaysTenpai, nagashiYakuman]);
  const second = settleDraw(g2);
  table("⑩ 연장 후 2차 유국", [
    { label: "outcome", value: second?.outcome },
    { label: "tenpaiPlayers", value: second?.tenpaiPlayers },
    { label: "deltas", value: second?.deltas },
    { label: "합계", value: Object.values(second?.deltas ?? {}).reduce((a, b) => a + b, 0) },
    { label: "drawSpecial", value: second?.drawSpecial },
    { label: "augPoints", value: second?.augPoints },
  ]);
}
