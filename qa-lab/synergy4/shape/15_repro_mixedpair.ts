/**
 * 15 — 확정 결함 재현: 혼색 머리(mixedPairs)의 «대표가 아닌 쪽»으로 화료하면
 *      대기에는 잡히는데 화료가 되지 않는다.
 *
 * 원인: packages/core/src/mahjong/scoring/WinContext.ts buildVariants
 *       `if (decomp.pair !== null && kindKey(decomp.pair) === winKey)`
 *   혼색 머리는 두 kind로 이뤄지는데 Decomposition.pair에는 **한쪽만** 담긴다
 *   (decompose.ts 의 혼색 머리 분기가 `pair: a` 로 대표 하나만 싣는다).
 *   그래서 다른 쪽 무늬가 화료패면 tanki 변형이 만들어지지 않아 변형 0개 → evaluateWin null.
 *
 * mixedPairs를 켜는 카드는 지금 «뒤섞인 아홉 개의 연꽃» 하나뿐이다(보유하면 상시 자동).
 */
import { decompose, isWinningShape, kindKey, winningKinds } from "@majak/core";
import { contentAugments } from "@majak/content";
import { h } from "../../../packages/content/test/helpers.js";
import { measure } from "./lib.js";

const A = (id: string) => contentAugments.find((d) => d.id === id)!;
const OPT = { mixedRuns: true, mixedTriplets: true, mixedPairs: true } as any;

const SKELETONS = [
  "1m1p1s2m3p4s5m6p7s8m9p9s9m",
  "1m1m1p2p3p4m5p6m7p8p9p9s9s",
  "1s1s1p2s3s4s5s6s7s8s9s9m9m",
];
for (const sk of SKELETONS) {
  console.log(`\n[뼈대 13장] ${sk}`);
  const waits = winningKinds(h(sk), 0, undefined, OPT).map(kindKey);
  const dead: string[] = [];
  for (const suit of ["m", "p", "s"]) for (let r = 1; r <= 9; r++) {
    const key = `${{ m: "man", p: "pin", s: "sou" }[suit]}${r}`;
    if (!waits.includes(key)) continue;
    const m = measure({ hand: `${sk}${r}${suit}`, winTile: `${r}${suit}`, winType: "tsumo" }, [A("mixed_nine_gates")]);
    if (!m.shapeOk) dead.push(`${r}${suit}`);
  }
  console.log(`  대기 ${waits.length}종 / 화료 불가 ${dead.length}종: ${dead.join(" ")}`);
  if (dead.length > 0) {
    const spec = `${sk}${dead[0]}`;
    const ds = decompose(h(spec), 0, OPT);
    console.log(`  예) ${spec} — isWinningShape=${isWinningShape(h(spec), 0, OPT)}, 분해 ${ds.length}개`);
    for (const d of ds.slice(0, 3)) {
      console.log(`     머리=${d.pair ? kindKey(d.pair) : "-"} 몸통=${d.sets.map((s) => s.tiles.map((t) => `${t.rank}${t.suit[0]}`).join("")).join(" ")}`);
    }
    console.log(`     → 화료패 ${dead[0]} 는 머리의 «다른 쪽»이라 어떤 변형에도 안 들어간다`);
  }
}

console.log("\n[기존 회귀 테스트(mixed_nine_gates.test.ts)의 뼈대로 확인]");
{
  const sk = "11m1p2s3m4p5s6m7p8s9m9p9s"; // 13장
  const waits = winningKinds(h(sk), 0, undefined, OPT).map(kindKey);
  const dead: string[] = [];
  for (const suit of ["m", "p", "s"]) for (let r = 1; r <= 9; r++) {
    const key = `${{ m: "man", p: "pin", s: "sou" }[suit]}${r}`;
    if (!waits.includes(key)) continue;
    const m = measure({ hand: `${sk}${r}${suit}`, winTile: `${r}${suit}`, winType: "tsumo" }, [A("mixed_nine_gates")]);
    if (!m.shapeOk) dead.push(`${r}${suit}`);
  }
  console.log(`  대기 ${waits.length}종 / 화료 불가 ${dead.length}종: ${dead.join(" ")}`);
  console.log(`  (기존 테스트는 5p 로만 재고 있다 — 5p 는 «대표» 쪽이라 통과한다)`);
}
