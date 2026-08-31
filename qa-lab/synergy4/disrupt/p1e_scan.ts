/**
 * P1e — counter(+3판) × push_riichi(+2판) 의 «판수 합성» 정합성 스캔.
 *
 * 규약(util.ts addWinPointBonus 의 hanSoFar 주석): "+N판" 계열이 겹치면
 * 합이 정확히 +(N+M)판이어야 한다. counter 는 자체 인터셉터에서
 * winPointsWithExtraHan 을 hanSoFar 없이 부르고 augPoints 에 han 도 남기지 않아
 * push_riichi 의 hanSoFar 도 0이 된다 → 두 보너스가 각자 원본 han 을 밑값으로 쓴다.
 *
 * 여기서 «정답»은 calculateScore 로 직접 계산한 (han+5) − han 이다.
 */
import { calculateScore } from "@majak/core";
import { run, K4 } from "./lib.js";
import { ron } from "./scenes_local.js";
import type { GameState } from "@majak/core";

const cData = () => ({
  [K4.counterPrev("p0")]: "p1",
  [K4.counterStruck("p0")]: true,
  [K4.counterSpent("p0")]: true,
});
const pData = (s: GameState) => ({ [K4.pushForced(s, "p0")]: "p1" });

const HANDS: [string, string, string][] = [
  ["탕야오핑후 2판", "234m234p23456s77s", "7s"],
  ["삼색 2판40부", "123m123p123s678s9s", "9s"],
  ["청일색 8판", "111234567m2234m", "2m"],
];

for (const uncapped of [false, true]) {
for (const dealer of [1, 0] as const) {
  for (const [name, hand, wait] of HANDS) {
   try {
    const CEIL = uncapped ? ["aotenjou_ceiling"] : [];
    const scene = ron(hand, wait, "p1");
    const R = { dealerSeat: dealer };
    const mk = (augs: Record<string, string[]>, data?: (s: GameState) => Record<string, unknown>) =>
      run({ craft: scene, augs: Object.fromEntries(Object.entries(augs).map(([k,v])=>[k,[...v, ...(k==="p0"?CEIL:[])]])), winner: "p0", round: R, ...(data ? { data } : {}) });
    const base = mk({});
    const info = (base.settled.winInfos ?? [])[0]!;
    // counter 의 «강탈» 성분을 제거하기 위해, 강탈만 도는 판(론을 p2에게서)과 대조한다
    const stealOnly = run({ craft: ron(hand, wait, "p2"), augs: { p0: ["counter", ...CEIL] }, winner: "p0", round: R, data: cData });
    const steal = (stealOnly.settled.augPoints ?? []).find((n) => n.augId === "counter")?.points ?? 0;
    const both = mk({ p0: ["counter", "push_riichi"] }, (s) => ({ ...cData(), ...pData(s) }));
    const cNote = (both.settled.augPoints ?? []).find((n) => n.augId === "counter")?.points ?? 0;
    const pNote = (both.settled.augPoints ?? []).find((n) => n.augId === "push_riichi")?.points ?? 0;
    const actual = (cNote - steal) + pNote;
    const isDealer = dealer === 0;
    const at = (h: number) => calculateScore({ han: info.han + h, fu: info.fu, yakumanCount: info.yakumanCount, isDealer, winType: "ron", uncapped }).total;
    const want = at(5) - at(0);
    console.log(
      `${uncapped ? "천장 " : "표준 "}${isDealer ? "오야" : " 자 "} ${name.padEnd(14)} han=${info.han} fu=${info.fu} pts=${info.points}` +
      ` | +3판=${cNote - steal} +2판=${pNote} 합=${actual} | 정답(+5판)=${want} | ${actual === want ? "OK" : `어긋남 ${actual - want}`}`,
    );
   } catch (e) { console.log(`  (건너뜀 ${name}: ${(e as Error).message.slice(0,40)})`); }
  }
}
}
