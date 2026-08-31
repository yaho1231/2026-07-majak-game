/** 21 — 탕야오 축: 탕야오 해방 × 짝수의 세계 / 양극 / 윤회 */
import { contentAugments } from "@majak/content";
import { measure, line } from "./lib.js";
const A = (id: string) => contentAugments.find((d) => d.id === id)!;
console.log("=== 21 탕야오 해방 ===");
const withTerm = "119m234m567m234p55p";   // 전부 수패, 1·9 포함
const noTerm   = "234m234m567m234p55p";   // 1·9 없음
const honors   = "119m234m567m234p55z";   // 자패 섞임
for (const [name, hand] of [["1·9 포함", withTerm], ["1·9 없음", noTerm], ["자패 섞임", honors]] as [string,string][]) {
  console.log(`\n  [${name}] ${hand}`);
  line("없음", measure({ hand, winType: "tsumo" }, []));
  line("탕야오해방", measure({ hand, winType: "tsumo" }, [A("tanyao_break")]));
  line("탕해방+양극", measure({ hand, winType: "tsumo" }, [A("tanyao_break"), A("polar_ends")]));
  line("탕해방+윤회", measure({ hand, winType: "tsumo" }, [A("tanyao_break"), A("broken_wall")]));
}
console.log("\n  ※ 짝수의 세계를 쓰면 1·9가 사라져 «해방된 탕야오 2판»이 «보통 탕야오 1판»으로 내려간다");
console.log("     (발동 전) ", JSON.stringify(measure({ hand: withTerm, winType: "tsumo" }, [A("tanyao_break"), A("even_world")]).yaku));
const evened = "224m234m567m234p55p"; // 1→2, 9→8 로 바뀐 뒤의 손(모의)
console.log("     (발동 후 모의) ", JSON.stringify(measure({ hand: evened, winType: "tsumo" }, [A("tanyao_break"), A("even_world")]).yaku));
