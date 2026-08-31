/**
 * 06 — 뒤섞인 아홉 개의 연꽃: 대기 27종 중 실제로 화료가 되는 것은 몇인가.
 * (구련 = 무늬 무관 1112345678999 + 아무 수패 1장. 27종 전부가 오름패여야 한다.)
 */
import { contentAugments } from "@majak/content";
import { kindKey } from "@majak/core";
import { measure } from "./lib.js";

const A = (id: string) => contentAugments.find((d) => d.id === id)!;
const base = "1m1p1s2m3p4s5m6p7s8m9p9s9m"; // 13장 뼈대 (무늬 섞임)
const ok: string[] = [];
const bad: string[] = [];
for (const suit of ["m", "p", "s"]) {
  for (let r = 1; r <= 9; r++) {
    const spec = `${base}${r}${suit}`;
    const m = measure({ hand: spec, winTile: `${r}${suit}`, winType: "tsumo" }, [A("mixed_nine_gates")]);
    (m.shapeOk && m.yakumanCount > 0 ? ok : bad).push(`${r}${suit}${m.shapeOk ? `(han=${m.han} ym=${m.yakumanCount})` : "(화료형아님)"}`);
  }
}
console.log(`역만 성립 ${ok.length}/27: ${ok.join(" ")}`);
console.log(`실패     ${bad.length}/27: ${bad.join(" ")}`);
