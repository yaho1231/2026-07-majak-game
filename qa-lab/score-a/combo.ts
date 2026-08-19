/** 배수·상한·하한 증강 동시 보유 — 100점 격자·부호·총합 검산 */
import { jackpot } from "../../packages/content/src/augments/jackpot.js";
import { bigHand } from "../../packages/content/src/augments/big_hand.js";
import { letItRide } from "../../packages/content/src/augments/let_it_ride.js";
import { bloodContract } from "../../packages/content/src/augments/blood_contract.js";
import { aotenjouCeiling } from "../../packages/content/src/augments/aotenjou_ceiling.js";
import { spy } from "../../packages/content/src/augments/spy.js";
import { devilsAdvance } from "../../packages/content/src/augments/devils_advance.js";
import { roundKey } from "../../packages/content/src/util.js";
import { craft } from "../../packages/content/test/helpers.js";
import { realWinPayload, scene, settle, sum, win } from "./settleRig.js";
import { calculateScore } from "@majak/core";

const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" } });
const rk = roundKey(base);

const HAN = 4, FU = 40;
const std = calculateScore({ han: HAN, fu: FU, yakumanCount: 0, isDealer: false, winType: "ron" }).total;
console.log(`표준 ${HAN}판 ${FU}부 자 론 = ${std}`);

for (const mult of [0.5, 1, 2, 3]) {
  for (const streak of [0, 3]) {
    const g = scene({
      augments: { p0: [jackpot, letItRide, bloodContract, aotenjouCeiling, bigHand] },
      data: {
        [`jackpot:mult:${rk}:p0`]: mult,
        [`let_it_ride:streak:p0`]: streak,
        [`blood_contract:yaku:${rk}:p0`]: "tanyao",
        [`big_hand:round:p0`]: rk,
      },
    });
    const payload = realWinPayload(g, {
      deltas: { p0: std, p1: 0, p2: -std, p3: 0 },
      winInfos: [win({
        winner: "p0", from: "p2", winType: "ron", points: std, han: HAN, fu: FU, limit: "mangan",
        yaku: [{ id: "tanyao", name: "탕야오", han: 1 }],
      } as never)],
    });
    const out = settle(g, payload);
    const grid = Object.values(out.deltas).every((v) => v % 100 === 0);
    console.log(
      `jackpot=${mult} streak=${streak} → p0=${out.deltas["p0"]} p2=${out.deltas["p2"]} ` +
        `합계변화=${sum(out.deltas) - sum(payload.deltas)} 격자=${grid ? "ok" : "위반"} ` +
        `notes=${JSON.stringify(out.augPoints)}`,
    );
  }
}

// 더블론 + 스파이: 두 화료자 모두 지정 패로 화료
{
  const g = scene({ augments: { p0: [spy] }, data: { "spy:mark:p0": "pin5" } });
  const st = g.engine.state;
  const pin5 = Object.values(st.tiles).find((t) => t.kind.suit === "pin" && t.kind.rank === 5)!.id;
  const payload = realWinPayload(g, {
    deltas: { p0: 0, p1: 8000, p2: -12900, p3: 4900 },
    winInfos: [
      win({ winner: "p1", from: "p2", winType: "ron", points: 8000, winningTileId: pin5 } as never),
      win({ winner: "p3", from: "p2", winType: "ron", points: 4900, winningTileId: pin5 } as never),
    ],
  });
  const out = settle(g, payload);
  console.log(`더블론+spy → ${JSON.stringify(out.deltas)} 합계변화=${sum(out.deltas) - sum(payload.deltas)} notes=${JSON.stringify(out.augPoints)}`);
}

// 가불 인생 폭발 — 만관 이상 화료 시 상대 셋 -3000, 총합 -9000 (뱅크로 소멸)
{
  const g = scene({ augments: { p0: [devilsAdvance] } });
  const payload = realWinPayload(g, {
    deltas: { p0: 8000, p1: 0, p2: -8000, p3: 0 },
    winInfos: [win({ winner: "p0", from: "p2", winType: "ron", points: 8000, limit: "mangan" } as never)],
  });
  const out = settle(g, payload);
  console.log(`devils_advance 폭발 → ${JSON.stringify(out.deltas)} 합계변화=${sum(out.deltas) - sum(payload.deltas)} notes=${JSON.stringify(out.augPoints)}`);
}
