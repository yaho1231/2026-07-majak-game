/**
 * 화료 제약 해제 3종 — 철벽(iron_wall) · 무형화료(yakuless_win) · 대기만성(late_bloomer).
 * (앞의 둘은 packages/core/src/augment/standardAugments.ts 에 있다 — content 카탈로그에 없다.)
 *
 * 세 증강이 여는 것:
 *   철벽      : win.furiten.enabled=false      + 실제 후리텐 론이면 +3판(뱅크)
 *   무형화료  : win.requiresYaku=false         + 실제 역 0개면 +2판(뱅크)
 *   대기만성  : 만개 구간에 위 **둘 다**       + 만개 화료면 +3판(뱅크)
 *
 * 기대(미리 적음):
 *  R1. 대기만성(만개) × 철벽 — 후리텐 해제가 완전히 겹친다. 복수자(avenger)는 바로 이
 *      이유로 대기만성과 conflicts로 묶여 있는데, 철벽에는 그 선언이 없다.
 *      겹치면 같은 한 번의 후리텐 론에 +3(철벽) +3(대기만성)이 **둘 다** 지급될 것이다.
 *  R2. 대기만성 × 무형화료 — 역 해제가 겹친다. 역 0개 화료에 +3 +2 둘 다.
 *  R3. 세 개의 "+N판 뱅크 보너스"가 서로를 못 보고 **각자 원래 판수 기준으로** 환산되면,
 *      합계가 "한 번에 +N판 올린 값"과 어긋난다(덧셈 순서 문제).
 *      기준: 역 0개(0판) 30부 자론 기준선과 비교한다.
 */
import { settle } from "./lib.js";
import { standardAugments } from "@majak/core";
import type { AugmentDef } from "@majak/core";
const byId = (id: string): AugmentDef => {
  const d = standardAugments.find((a) => a.id === id);
  if (d === undefined) throw new Error(`no augment ${id}`);
  return d;
};
const ironWall = byId("iron_wall");
const yakulessWin = byId("yakuless_win");
import { lateBloomer } from "../../../packages/content/src/augments/late_bloomer.js";
import { polarEnds } from "../../../packages/content/src/augments/polar_ends.js";

const show = (n: string, s: ReturnType<typeof settle>) => {
  const i = s.info as Record<string, unknown> | undefined;
  console.log(
    `  ${n.padEnd(26)} deltas=${JSON.stringify(s.deltas)} sum=${s.sum}\n  ${"".padEnd(26)} han=${i?.["han"]} points=${i?.["points"]} yakuless=${i?.["yakuless"]} aug=${JSON.stringify(s.augPoints)}`,
  );
};

// 역이 하나도 없는 론 손 (탕야오도 아니게 노두를 섞는다): 123m 456m 789m 123p 99p
const NOYAKU = "123m456m789m123p9p"; // 13장 — 화료패 9p는 p1의 버림패에서 온다
const BLOOM = { prevalentWind: 2, roundNumber: 4 };
// 후리텐 — 화료패(9p)를 이미 버렸다
const FURITEN = { discards: "9p" };

console.log("### R0. 기준선 — 역 없는 론(9p), 후리텐");
show("증강 없음", settle({ hand: NOYAKU, winType: "ron", from: "p1", winTile: "9p", ...FURITEN, augs: {} }));

console.log("\n### R1/R2/R3. 해제 3종 (남4국 = 만개)");
for (const [n, a] of [
  ["철벽", [ironWall]],
  ["무형화료", [yakulessWin]],
  ["대기만성", [lateBloomer]],
  ["철벽+무형화료", [ironWall, yakulessWin]],
  ["대기만성+철벽", [lateBloomer, ironWall]],
  ["대기만성+무형화료", [lateBloomer, yakulessWin]],
  ["셋 다", [lateBloomer, ironWall, yakulessWin]],
] as const) {
  show(n, settle({ hand: NOYAKU, winType: "ron", from: "p1", winTile: "9p", ...FURITEN, ...BLOOM, augs: { p0: a as never } }));
}

console.log("\n### R4. 만개 전(동1국) — 대기만성은 아무것도 안 해야 한다");
for (const [n, a] of [
  ["대기만성", [lateBloomer]],
  ["대기만성+철벽+무형", [lateBloomer, ironWall, yakulessWin]],
] as const) {
  show(n, settle({ hand: NOYAKU, winType: "ron", from: "p1", winTile: "9p", ...FURITEN, augs: { p0: a as never } }));
}

console.log("\n### R5. 역만 손 + 해제 3종 — 역만에는 +판이 붙지 않아야 한다");
const YAK = "199m199p199s111z1s"; // 13장, 화료패 1s는 p1 버림
for (const [n, a] of [
  ["양극", [polarEnds]],
  ["양극+셋다", [polarEnds, lateBloomer, ironWall, yakulessWin]],
] as const) {
  show(n, settle({ hand: YAK, winType: "ron", from: "p1", winTile: "1s", discards: "1s", ...BLOOM, augs: { p0: a as never } }));
}


// ── R6. 진짜 '역 0개' 손으로 무형화료를 발동시킨다 ──
console.log("\n### R6. 역이 하나도 없는 론 (234m 567p 345s 888s 44z, 화료패 2m)");
const REAL_NOYAKU = "34m567p345s888s44z";
for (const [n, a] of [
  ["없음", []],
  ["무형화료", [yakulessWin]],
  ["대기만성", [lateBloomer]],
  ["무형화료+대기만성", [yakulessWin, lateBloomer]],
  ["무형+철벽+대기만성", [yakulessWin, ironWall, lateBloomer]],
] as const) {
  try {
    show(n, settle({ hand: REAL_NOYAKU, winType: "ron", from: "p1", winTile: "2m", discards: "2m", ...BLOOM, augs: { p0: a as never } }));
  } catch (e) {
    console.log(`  ${n.padEnd(26)} 화료 거부: ${(e as Error).message}`);
  }
}
