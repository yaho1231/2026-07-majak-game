/**
 * 화료 제약 해제 4종의 겹침 — 역 없는 손 / 후리텐 손으로 론.
 *
 * 대상: iron_wall(철벽·후리텐 해제 +3판) · yakuless_win(무형화료·무역 해제 +2판)
 *       late_bloomer(만개 시 둘 다 해제 +3판) · avenger(원수 한정 둘 다 해제 +2판)
 *
 * 기대(먼저 적음):
 *  1) 역 0개 손 론 — 없음: 불가 / 각각: 가능 / 둘 다: 가능
 *  2) 판수: yakuless_win "+2판", late_bloomer "+3판" → 둘 다면 +5판이어야 한다
 *  3) 후리텐 + 역 0개 동시 — iron_wall(+3) × yakuless_win(+2) → +5판
 *  4) avenger 는 score.extraHan(진짜 판수 · 상대가 더 낸다), 나머지는 뱅크 발행
 */
import { craft, start, winReport, table, stdAug } from "./lib.js";
import type { GameState } from "@majak/core";
const ironWall = stdAug("iron_wall");
const yakulessWin = stdAug("yakuless_win");
import { lateBloomer } from "../../../packages/content/src/augments/late_bloomer.js";
import { avenger } from "../../../packages/content/src/augments/avenger.js";

/** p1 이 1p 를 버린 리액션 국면. furiten=true 면 p0 가 이미 1p 를 버려 후리텐. */
function scene(opts: { furiten?: boolean; bloom?: boolean } = {}): GameState {
  const base = craft({
    hands: { p0: "123m456p789s234s1p", p1: "*", p2: "*", p3: "*" },
    discards: opts.furiten === true ? { p0: "1p" } : {},
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "1p" },
  });
  if (opts.bloom !== true) return base;
  return { ...base, round: { ...base.round, prevalentWind: 2, roundNumber: 4 } };
}

/** avenger 용 — p1 을 원수로 지목해 둔다 */
function withNemesis(s: GameState): GameState {
  return {
    ...s,
    augmentData: { ...s.augmentData, "avenger:nemesis:p0": "p1" },
  };
}

function show(label: string, s: GameState, defs: Parameters<typeof start>[1]): void {
  const g = start(s, defs);
  const r = winReport(g, "p0");
  table(label, [
    { label: "화료 가능?", value: r.err === null ? "OK" : `거부: ${r.err}` },
    { label: "han / fu", value: `${r.han} / ${r.fu}` },
    { label: "yaku", value: r.yaku },
    { label: "손 점수", value: r.points },
    { label: "delta p0 / p1", value: `${r.deltas["p0"]} / ${r.deltas["p1"]}` },
    { label: "augPoints", value: r.augPoints },
  ]);
}

console.log("\n########## ① 역 0개 손 · 후리텐 아님 (남4국=만개 구간)");
show("없음", scene({ bloom: true }), []);
show("yakuless_win 만 (+2판)", scene({ bloom: true }), [yakulessWin]);
show("late_bloomer 만 (+3판)", scene({ bloom: true }), [lateBloomer]);
show("둘 다 (+5판이어야)", scene({ bloom: true }), [yakulessWin, lateBloomer]);

console.log("\n########## ② 역 0개 + 후리텐");
show("없음", scene({ bloom: true, furiten: true }), []);
show("iron_wall 만 (+3판)", scene({ bloom: true, furiten: true }), [ironWall]);
show("yakuless_win 만 (+2판)", scene({ bloom: true, furiten: true }), [yakulessWin]);
show("iron_wall + yakuless_win (+5판이어야)", scene({ bloom: true, furiten: true }), [
  ironWall,
  yakulessWin,
]);
show("late_bloomer 단독 (후리텐+무역 동시 해제 +3판)", scene({ bloom: true, furiten: true }), [
  lateBloomer,
]);
show("late_bloomer + iron_wall (+6판이어야)", scene({ bloom: true, furiten: true }), [
  lateBloomer,
  ironWall,
]);

console.log("\n########## ③ avenger(원수 p1) — score.extraHan 계열");
show("avenger 만 (+2판)", withNemesis(scene({ furiten: true })), [avenger]);
show("avenger + iron_wall (+2 +3)", withNemesis(scene({ furiten: true })), [
  avenger,
  ironWall,
]);
show("avenger + yakuless_win (+2 +2)", withNemesis(scene()), [avenger, yakulessWin]);
