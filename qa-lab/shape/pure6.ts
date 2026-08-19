import { winningKinds } from "@majak/core";
import { h } from "../../packages/content/test/helpers.js";
const w = (s: string, o: object): string => winningKinds(h(s), 0, undefined, o as never).map((k) => `${k.rank}${k.suit[0]}`).join(",");
console.log("89m 블록 대기 (wrapRuns):", w("89m123p456p789p11s", { wrapRuns: true }));
console.log("89m 블록 대기 (표준)   :", w("89m123p456p789p11s", {}));
console.log("royal_kokushi 12종 대기:", w("19m19p199s113456z", { kokushiDupes: 1 }));
console.log("royal_kokushi 13종 대기:", w("19m19p19s1234567z", { kokushiDupes: 1 }));
console.log("표준 국사 13종 대기    :", w("19m19p19s1234567z", {}));
