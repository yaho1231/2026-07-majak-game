/**
 * ① 핏빛 계약 — **쯔모 화료의 본장 수령분까지 1.5배**가 된다.
 *    (detail: "회수하는 리치봉과 본장 수령분은 그대로 더해진다")
 *    구현은 `info.winType === "ron"`일 때만 본장을 떼어 낸다.
 * ② 일확천금 — 인터셉터에 `outcome !== "win"` 가드가 없어 **유국 텐파이료에도 배수**가 걸린다.
 *    (blood_contract·let_it_ride는 둘 다 화료만 가드한다)
 */
import { jackpot } from "../../packages/content/src/augments/jackpot.js";
import { bloodContract } from "../../packages/content/src/augments/blood_contract.js";
import { roundKey } from "../../packages/content/src/util.js";
import { craft } from "../../packages/content/test/helpers.js";
import { realWinPayload, scene, settle, sum, win } from "./settleRig.js";
import type { RoundSettledPayload } from "@majak/core";

const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" } });
const rkAt = (honba: number): string => roundKey({ ...base, round: { ...base.round, honba } });
const rk = rkAt(0);

// ① 쯔모 3본장 — 손 8000 + 본장 900 (각 300)
{
  const HONBA = 3, HAND = 8000, HONBA_GAIN = 900;
  const g = scene({
    augments: { p0: [bloodContract] },
    data: { [`blood_contract:yaku:${rkAt(HONBA)}:p0`]: "tanyao" },
    honba: HONBA,
  });
  const payload = realWinPayload(g, {
    deltas: { p0: HAND + HONBA_GAIN, p1: -(HAND / 3 + 300), p2: -(HAND / 3 + 300), p3: -(HAND / 3 + 300) },
    winInfos: [win({
      winner: "p0", from: null, winType: "tsumo", points: HAND, honbaBonus: HONBA_GAIN,
      yaku: [{ id: "tanyao", name: "탕야오", han: 1 }],
    } as never)],
  });
  const out = settle(g, payload);
  console.log(`① blood_contract 쯔모 ${HONBA}본장: 기대 p0 = ${HAND * 1.5 + HONBA_GAIN}, 실제 = ${out.deltas["p0"]} (본장 900이 1350이 됐다: 차 ${(out.deltas["p0"] ?? 0) - (HAND * 1.5 + HONBA_GAIN)})`);
  // 같은 값을 론으로 하면 본장이 제대로 빠진다 (대조군)
  const g2 = scene({ augments: { p0: [bloodContract] }, data: { [`blood_contract:yaku:${rkAt(HONBA)}:p0`]: "tanyao" }, honba: HONBA });
  const out2 = settle(g2, realWinPayload(g2, {
    deltas: { p0: HAND + HONBA_GAIN, p1: 0, p2: -(HAND + HONBA_GAIN), p3: 0 },
    winInfos: [win({ winner: "p0", from: "p2", winType: "ron", points: HAND, honbaBonus: HONBA_GAIN, yaku: [{ id: "tanyao", name: "탕야오", han: 1 }] } as never)],
  }));
  console.log(`   대조군(론 ${HONBA}본장): 기대 ${HAND * 1.5 + HONBA_GAIN}, 실제 ${out2.deltas["p0"]}`);
}

// ② 유국 텐파이료에 일확천금 배수
for (const mult of [3, 0.5]) {
  const g = scene({ augments: { p0: [jackpot] }, data: { [`jackpot:mult:${rk}:p0`]: mult } });
  const drawPayload = {
    outcome: "draw",
    deltas: { p0: 3000, p1: -1000, p2: -1000, p3: -1000 },
    dealerSeat: g.engine.state.round.dealerSeat,
    honba: 1,
    riichiPot: 0,
    roundNumber: g.engine.state.round.roundNumber,
    prevalentWind: g.engine.state.round.prevalentWind,
    tenpaiPlayers: ["p0"],
  } as unknown as RoundSettledPayload;
  const out = settle(g, drawPayload);
  console.log(
    `② 유국(p0만 텐파이, 노텐벌부 3000) · jackpot ${mult}배 → p0=${out.deltas["p0"]} ` +
      `p1=${out.deltas["p1"]} p2=${out.deltas["p2"]} p3=${out.deltas["p3"]} | 합계변화 ${sum(out.deltas) - sum(drawPayload.deltas)}`,
  );
}
