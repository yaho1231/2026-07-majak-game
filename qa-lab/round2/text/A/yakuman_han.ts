import { calculateScore } from "@majak/core";
const a = calculateScore({ han: 0, fu: 0, yakumanCount: 1, isDealer: false, winType: "ron" });
const b = calculateScore({ han: 3, fu: 0, yakumanCount: 1, isDealer: false, winType: "ron" });
console.log("역만 그대로:", a.total, " / +3판 얹었을 때:", b.total, " → 보너스", Math.max(0, b.total - a.total));
const c = calculateScore({ han: 2, fu: 0, yakumanCount: 1, isDealer: true, winType: "tsumo" });
const d = calculateScore({ han: 0, fu: 0, yakumanCount: 1, isDealer: true, winType: "tsumo" });
console.log("오야 역만 +2판 보너스:", Math.max(0, c.total - d.total));
