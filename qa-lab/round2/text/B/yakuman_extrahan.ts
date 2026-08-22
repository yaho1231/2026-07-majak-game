import { calculateScore } from "@majak/core";
// 역만 손(자, 쯔모)에 +2판을 얹으면 점수가 늘어나는가?
const base = calculateScore({ han: 13, fu: 30, yakumanCount: 1, isDealer: false, winType: "tsumo" }).total;
const boosted = calculateScore({ han: 15, fu: 30, yakumanCount: 1, isDealer: false, winType: "tsumo" }).total;
console.log("역만 base=", base, "  +2판=", boosted, "  차이=", boosted - base);
const nb = calculateScore({ han: 3, fu: 30, yakumanCount: 0, isDealer: false, winType: "tsumo" }).total;
const nbo = calculateScore({ han: 5, fu: 30, yakumanCount: 0, isDealer: false, winType: "tsumo" }).total;
console.log("비역만 base=", nb, " +2판=", nbo, " 차이=", nbo - nb);
