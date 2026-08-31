/**
 * P2 — 유국 축: 유국역만(nagashi_yakuman) × 승승장구(always_tenpai) × 역만 방어술.
 *
 * 판: p0 노텐(요구패·자패만 버림), p1 텐파이, p2·p3 노텐. p0가 7z를 버려 황패유국.
 *
 * 예측(설명 근거):
 *  - 표준: 텐파이 1명(p1) → p1 +3000, 나머지 셋 각 -1000.
 *  - A=nagashi 단독: p0 노텐 벌점은 그대로 내고, 그 위에 쯔모 역만(자: 오야16000+자8000×2=32,000)을 받는다.
 *  - B=always_tenpai 단독: p0도 텐파이 취급 → 텐파이 2명 벌점 분배 + 노텐 상대(p2,p3) 각 2,000 추가.
 *  - A+B: 둘 다 DrawPatch 단계다. 설명대로면 «역만 32,000»과 «노텐당 2,000»이 **둘 다** 서야 한다.
 *  - p1이 역만 방어술: p1은 유국역만 지불에서 면제되고, 그래도 p0 수령은 32,000 그대로여야 한다.
 */
import { runDraw, dtable } from "./drawlib.js";

const HANDS = {
  p0: "125m369p147s1z2z5z6z7z", // 14장 · 완전 노텐
  p1: "123m456m789m123p1p",     // 텐파이
  p2: "258m369p147s1122z",      // 노텐
  p3: "258m369p147s3344z",      // 노텐
};
const D = { p0: "1m9m1p9p1s9s3z4z5z6z" }; // 전부 요구패·자패 → 유국역만 성립

const mk = (augs: Record<string, string[]>, dealerSeat = 1) =>
  runDraw({ hands: HANDS, discards: D, augs, lastDiscard: "7z", dealerSeat });

dtable("P2 · 유국역만 × 승승장구 (p0가 둘 다 · p0은 자)", [
  { label: "없음", r: mk({}) },
  { label: "A=nagashi", r: mk({ p0: ["nagashi_yakuman"] }) },
  { label: "B=always_tenpai", r: mk({ p0: ["always_tenpai"] }) },
  { label: "A+B", r: mk({ p0: ["nagashi_yakuman", "always_tenpai"] }) },
]);

dtable("P2b · p1이 역만 방어술 — 면제분은 뱅크가 내고 p0 수령은 그대로여야 한다", [
  { label: "A", r: mk({ p0: ["nagashi_yakuman"] }) },
  { label: "A + p1방어막", r: mk({ p0: ["nagashi_yakuman"], p1: ["yakuman_shield"] }) },
  { label: "A+B + p1방어막", r: mk({ p0: ["nagashi_yakuman", "always_tenpai"], p1: ["yakuman_shield"] }) },
  { label: "A+B + 전원방어막", r: mk({ p0: ["nagashi_yakuman", "always_tenpai"], p1: ["yakuman_shield"], p2: ["yakuman_shield"], p3: ["yakuman_shield"] }) },
]);

dtable("P2c · 승승장구를 둘이 든다 (p0·p2) — 서로를 노텐으로 세지 않아야 한다", [
  { label: "p0만", r: mk({ p0: ["always_tenpai"] }) },
  { label: "p2만", r: mk({ p2: ["always_tenpai"] }) },
  { label: "둘 다", r: mk({ p0: ["always_tenpai"], p2: ["always_tenpai"] }) },
]);
