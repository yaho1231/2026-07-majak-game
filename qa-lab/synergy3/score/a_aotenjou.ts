/**
 * A군: 뚫린 천장(aotenjou_ceiling) × 판수 계열 / 배수 계열.
 *
 * 기대(먼저 적는다):
 *  A1 aotenjou 단독, 8판 청일색 오야 론(표준 24,000):
 *     상한없는 base = 2000 + (8-5)*1000 = 5000 → 오야 론 = 5000*6 = 30,000.
 *  A2 haitei_lord(+3판) 단독: 표준 11판 오야 론 = 삼배만 36,000 → 뱅크 +12,000.
 *  A3 A+B: 설명("상한이 없다 · 판이 오르는 만큼")대로면 11판이 상한 없이 계산돼야 한다
 *     → base 2000+6*1000=8000 → 48,000. 단순 가산이면 42,000.
 *  A4 역만 손에 +3판: haitei는 "역만 미적용"이라 0. aotenjou는 26판으로 계산.
 *  A5 bottom_yaku(진짜 판 +3)는 info.han에 들어가므로 aotenjou가 그대로 센다.
 */
import { run, table, winInfoLine } from "./lib.js";
import { ron, tsumo } from "./scenes.js";
import { K } from "./keys.js";

const CHIN = { hand: "111234567m2234m", wait: "2m" }; // 8판 40부
const scene = ron(CHIN.hand, CHIN.wait);

const mk = (augs: Record<string, string[]>, data?: Parameters<typeof run>[0]["data"]) =>
  run({ craft: scene, augs, winner: "p0", ...(data ? { data } : {}) });

const haitei = (s: Parameters<NonNullable<Parameters<typeof run>[0]["data"]>>[0]) => ({
  [K.haiteiFired(s, "p0")]: true,
});

table("A1-A3 · 뚫린 천장 × 해저의 지배자(+3판) — 8판 청일색 오야 론", [
  { label: "없음", r: mk({}) },
  { label: "A=aotenjou", r: mk({ p0: ["aotenjou_ceiling"] }) },
  { label: "B=haitei(+3판)", r: mk({ p0: ["haitei_lord"] }, haitei) },
  { label: "A+B", r: mk({ p0: ["aotenjou_ceiling", "haitei_lord"] }, haitei) },
]);
console.log(winInfoLine(mk({ p0: ["aotenjou_ceiling", "haitei_lord"] }, haitei)));

// A4 — 역만 (스안커단기 쯔모)
const yk = tsumo("111m333m555m777m9m9m");
const mky = (augs: Record<string, string[]>, data?: Parameters<typeof run>[0]["data"]) =>
  run({ craft: yk, augs, winner: "p0", ...(data ? { data } : {}) });
table("A4 · 역만(스안커단기 쯔모, 오야 96,000) × 판수/천장", [
  { label: "없음", r: mky({}) },
  { label: "A=aotenjou", r: mky({ p0: ["aotenjou_ceiling"] }) },
  { label: "B=haitei(+3판)", r: mky({ p0: ["haitei_lord"] }, haitei) },
  { label: "A+B", r: mky({ p0: ["aotenjou_ceiling", "haitei_lord"] }, haitei) },
]);

// A5 — 진짜 판을 더하는 계열(bottom_yaku): 버림패에 한 무늬 1~9 + 같은 패 3장
const bottomScene = {
  ...ron(CHIN.hand, CHIN.wait),
  discards: { p0: "123456789p333s", p1: "" },
} as Parameters<typeof run>[0]["craft"];
const mkb = (augs: Record<string, string[]>) =>
  run({ craft: bottomScene, augs, winner: "p0" });
table("A5 · 뚫린 천장 × 바닥의 족보(실판 +3)", [
  { label: "없음", r: mkb({}) },
  { label: "A=aotenjou", r: mkb({ p0: ["aotenjou_ceiling"] }) },
  { label: "B=bottom_yaku", r: mkb({ p0: ["bottom_yaku"] }) },
  { label: "A+B", r: mkb({ p0: ["aotenjou_ceiling", "bottom_yaku"] }) },
]);
console.log("A5 A+B:", winInfoLine(mkb({ p0: ["aotenjou_ceiling", "bottom_yaku"] })));
