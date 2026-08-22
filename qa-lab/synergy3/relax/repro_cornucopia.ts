/**
 * cornucopia(수상한 주사위) — 지급의 **의미** 검증.
 *
 * 기대(먼저 적음):
 *  ① 보유자가 avenger 를 이미 들고 있으면 late_bloomer(=avenger 의 conflicts)는 절대 안 나온다
 *  ② 지급된 2개끼리도 상호 배제가 아니어야 한다
 *  ③ 테이블의 누구든 이미 가진 증강은 안 나온다
 *  ④ 스테이지 제한이 있는 증강(late_bloomer=gameStart 전용, reload=후반 전용)은
 *     지금 스테이지에 제시 가능한 것만 나온다 — 스테이지 표식이 없으면 통째로 빠진다
 */
import { augmentGrantKey, augmentStageKey, createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState } from "@majak/core";
import { craft, withAugs, table } from "./lib.js";
import { cornucopia } from "../../../packages/content/src/augments/cornucopia.js";
import { contentAugments } from "../../../packages/content/src/index.js";

function grantsFor(seed: number, holderAugs: string[], stage: string | null): string[] {
  let s: GameState = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    seed,
  });
  s = withAugs(s, "p0", [...holderAugs, "cornucopia"]);
  s = withAugs(s, "p1", ["let_it_ride"]);
  if (stage !== null) {
    s = { ...s, augmentData: { ...s.augmentData, [augmentStageKey("p0", "cornucopia")]: stage } };
  }
  const g = createStandardGameFromState(s, undefined, contentAugments);
  installAugment(g.engine, cornucopia, "p0", { yaku: g.yaku, catalog: g.augments });
  const granted = g.engine.state.augmentData[augmentGrantKey("p0", "cornucopia")];
  return Array.isArray(granted) ? (granted as string[]) : [];
}

const cat = new Map(contentAugments.map((d) => [d.id, d]));
function conflictPair(a: string, b: string): boolean {
  return (
    (cat.get(a)?.conflicts ?? []).includes(b) || (cat.get(b)?.conflicts ?? []).includes(a)
  );
}

for (const stage of [null, "gameStart", "southThird"]) {
  const bad: string[] = [];
  const seen = new Map<string, number>();
  let empties = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const g = grantsFor(seed, ["avenger"], stage);
    if (g.length === 0) empties++;
    for (const id of g) seen.set(id, (seen.get(id) ?? 0) + 1);
    if (g.includes("late_bloomer") || g.includes("late_bloomer_east")) {
      bad.push(`seed${seed}: avenger 보유인데 ${g.join("+")}`);
    }
    if (g.includes("let_it_ride")) bad.push(`seed${seed}: 남(p1)이 가진 것을 중복 지급`);
    if (g.includes("cornucopia")) bad.push(`seed${seed}: 자기 자신 지급`);
    if (g.length === 2 && conflictPair(g[0]!, g[1]!)) {
      bad.push(`seed${seed}: 지급된 둘이 상호 배제 ${g.join("+")}`);
    }
  }
  table(`stage=${stage ?? "(표식 없음)"} · 120시드`, [
    { label: "위반", value: bad.length === 0 ? "없음" : bad.slice(0, 5) },
    { label: "지급 0개", value: empties },
    { label: "서로 다른 지급 종류 수", value: seen.size },
    {
      label: "late_bloomer 등장",
      value: (seen.get("late_bloomer") ?? 0) + (seen.get("late_bloomer_east") ?? 0),
    },
    { label: "reload 등장", value: seen.get("reload") ?? 0 },
  ]);
}
