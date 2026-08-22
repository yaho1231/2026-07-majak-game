/**
 * E군: 오야/본장 판정 — 만년 오야 × 찬탈자 × 본장 사냥꾼.
 *
 * 장면: 오야는 p1(dealerSeat=1). p0가 화료한다. 현재 본장 3.
 *
 * 기대:
 *  E1 증강 없음, p0(자) 화료 → 오야가 p2로 넘어가고 본장 0.
 *  E2 eternal_dealer(p0): p0가 오야 자리를 가져오고 연장 → dealerSeat=0, 본장 4,
 *     점수는 오야 배율. 연장 횟수 1 소모.
 *  E3 pseudo_dealer(p0)가 이미 오야를 빼앗은 상태(dealerSeat=0)에서 화료:
 *     dealerSeat=0 유지, 본장 4. eternal_dealer 연장 횟수는 **소모되지 않아야** 한다.
 *  E4 E2+E3 동시: 이중으로 본장이 오르거나 연장이 두 번 잡히면 안 된다.
 *  E5 honba_hunter를 얹으면 각 경우의 본장 수령분이 3×1500=4500이어야 한다.
 */
import { run, table } from "./lib.js";
import { ron } from "./scenes.js";
import { K } from "./keys.js";
import type { GameState } from "@majak/core";

const SMALL = { hand: "123m123p123s678s9s", wait: "9s" };
const scene = ron(SMALL.hand, SMALL.wait, "p2");

interface Cfg {
  label: string;
  augs: Record<string, string[]>;
  dealerSeat: number;
  keeps?: number;
}

const cfgs: Cfg[] = [
  { label: "없음 (오야=p1)", augs: {}, dealerSeat: 1 },
  { label: "eternal_dealer(p0)", augs: { p0: ["eternal_dealer"] }, dealerSeat: 1 },
  {
    label: "eternal_dealer(p0) 연장 3회 소진",
    augs: { p0: ["eternal_dealer"] },
    dealerSeat: 1,
    keeps: 3,
  },
  { label: "찬탈 후 (오야=p0)", augs: {}, dealerSeat: 0 },
  {
    label: "찬탈 후 + eternal_dealer(p0)",
    augs: { p0: ["eternal_dealer"] },
    dealerSeat: 0,
  },
  { label: "honba_hunter(p0)", augs: { p0: ["honba_hunter"] }, dealerSeat: 1 },
  {
    label: "eternal_dealer + honba_hunter",
    augs: { p0: ["eternal_dealer", "honba_hunter"] },
    dealerSeat: 1,
  },
  {
    label: "찬탈 후 + ed + hh",
    augs: { p0: ["eternal_dealer", "honba_hunter"] },
    dealerSeat: 0,
  },
];

console.log(
  "| 조합 | p0 | p1 | p2 | p3 | 합 | 다음오야 | 다음본장 | 연장 | keeps사용 | han |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const c of cfgs) {
  const data =
    c.keeps === undefined
      ? undefined
      : (_s: GameState) => ({ [K.eternalKeeps("p0")]: c.keeps as number });
  const r = run({
    craft: scene,
    augs: c.augs,
    winner: "p0",
    round: { honba: 3, dealerSeat: c.dealerSeat },
    ...(data ? { data } : {}),
  });
  const keepsAfter =
    (r.flow as unknown as { engine: { state: GameState } }).engine.state
      .augmentData[K.eternalKeeps("p0")] ?? 0;
  const info = r.settled.winInfos?.[0];
  console.log(
    `| ${c.label} | ${r.deltas["p0"]} | ${r.deltas["p1"]} | ${r.deltas["p2"]} | ${r.deltas["p3"]} | ${r.total} | seat${r.settled.dealerSeat} | ${r.settled.honba} | ${r.settled.dealerContinues} | ${String(keepsAfter)} | ${info?.han}/${info?.fu}부 pts=${info?.points} honba=${info?.honbaBonus ?? 0} |`,
  );
}
