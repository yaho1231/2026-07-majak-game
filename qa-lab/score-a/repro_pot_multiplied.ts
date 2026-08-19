/**
 * 확정 재현: 일확천금(jackpot) · 핏빛 계약(blood_contract)이
 * **회수한 공탁(리치봉)까지 배수에 태운다.**
 *
 * 두 증강 모두 `const pot = winInfos[0].winner === holder ? p.riichiPot : 0;` 으로
 * 공탁을 떼어 내려 하는데, 화료 정산 payload의 `riichiPot`은 **다음 국으로 넘길 값 = 항상 0**이다
 * (standardActions.ts:1113 `riichiPot: 0`). 회수액은 `winInfos[i].riichiPotGain`에 있다.
 * → pot이 언제나 0이라 공탁까지 곱해지고, 늘어난 몫을 뱅크가 새로 발행한다.
 */
import { jackpot } from "../../packages/content/src/augments/jackpot.js";
import { bloodContract } from "../../packages/content/src/augments/blood_contract.js";
import { roundKey } from "../../packages/content/src/util.js";
import { craft } from "../../packages/content/test/helpers.js";
import { realWinPayload, scene, settle, sum, win } from "./settleRig.js";

const rk = roundKey(craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" } }));

const POT = 3000; // 리치봉 3개
const POINTS = 8000; // 손의 값 (론, p2가 쐈다)

for (const mult of [2, 3]) {
  const g = scene({
    augments: { p0: [jackpot] },
    data: { [`jackpot:mult:${rk}:p0`]: mult },
  });
  const payload = realWinPayload(g, {
    deltas: { p0: POINTS + POT, p1: 0, p2: -POINTS, p3: 0 },
    winInfos: [win({ winner: "p0", from: "p2", winType: "ron", points: POINTS, riichiPotGain: POT } as never)],
  });
  const out = settle(g, payload);
  const expected = POINTS * mult + POT; // 공탁은 배수 제외
  console.log(
    `jackpot ${mult}배 · 손 ${POINTS} · 공탁 ${POT}\n` +
      `  기대 p0 = ${expected}   실제 p0 = ${out.deltas["p0"]}   차이 = ${(out.deltas["p0"] ?? 0) - expected}\n` +
      `  뱅크 발행 = ${sum(out.deltas) - sum(payload.deltas)} (기대 ${POINTS * (mult - 1)})`,
  );
}

// 0.5배 — 공탁까지 반으로 깎이고, 그 몫을 방총자에게 되돌려 준다
{
  const g = scene({ augments: { p0: [jackpot] }, data: { [`jackpot:mult:${rk}:p0`]: 0.5 } });
  const payload = realWinPayload(g, {
    deltas: { p0: POINTS + POT, p1: 0, p2: -POINTS, p3: 0 },
    winInfos: [win({ winner: "p0", from: "p2", winType: "ron", points: POINTS, riichiPotGain: POT } as never)],
  });
  const out = settle(g, payload);
  console.log(
    `jackpot 0.5배 · 손 ${POINTS} · 공탁 ${POT}\n` +
      `  기대 p0 = ${POINTS / 2 + POT} (공탁 3000은 그대로)  실제 p0 = ${out.deltas["p0"]}\n` +
      `  방총자 p2: 기대 ${-POINTS / 2}  실제 ${out.deltas["p2"]}  ← 공탁까지 깎아 그 몫을 방총자에게 돌려줬다`,
  );
}

// 핏빛 계약 1.5배
{
  const g = scene({
    augments: { p0: [bloodContract] },
    data: { [`blood_contract:yaku:${rk}:p0`]: "tanyao" },
  });
  const payload = realWinPayload(g, {
    deltas: { p0: POINTS + POT, p1: 0, p2: -POINTS, p3: 0 },
    winInfos: [
      win({
        winner: "p0", from: "p2", winType: "ron", points: POINTS, riichiPotGain: POT,
        yaku: [{ id: "tanyao", name: "탕야오", han: 1 }],
      } as never),
    ],
  });
  const out = settle(g, payload);
  const expected = POINTS * 1.5 + POT;
  console.log(
    `blood_contract 1.5배 · 손 ${POINTS} · 공탁 ${POT}\n` +
      `  기대 p0 = ${expected}   실제 p0 = ${out.deltas["p0"]}   차이 = ${(out.deltas["p0"] ?? 0) - expected}`,
  );
}
