/**
 * 뚫린 천장 × 만년 오야(오야 취급) 쯔모 —
 * **표준 지불은 셋이 똑같이 내는데, 상한 해제분만 "친 2배" 비율로 걷는다.**
 *
 * - sysSettleWin: scoresAsDealer(= win.treatAsDealer)면 세 사람 모두 `score.payments.others`를
 *   똑같이 낸다 (standardActions.ts:996-1004).
 * - util.addWinPointTransfer: 보유자가 **진짜 오야가 아니면** 진짜 오야에게 weight 2를 준다
 *   (util.ts:747-757) — 오야 취급 여부를 보지 않는다.
 * → 같은 화료 안에서 기본분과 초과분의 분담 비율이 서로 다르다.
 *   detail은 "쯔모면 나머지 셋이 **평소 비율대로** 나눠 낸다"고 약속한다.
 */
import { aotenjouCeiling } from "../../packages/content/src/augments/aotenjou_ceiling.js";
import { eternalDealer } from "../../packages/content/src/augments/eternal_dealer.js";
import { calculateScore } from "@majak/core";
import { realWinPayload, scene, settle, sum, win } from "./settleRig.js";

// craft 기본 오야 = seat0 = p0. 보유자는 자(p2)지만 만년 오야로 **오야 취급**된다.
const HAN = 8, FU = 30;
const std = calculateScore({ han: HAN, fu: FU, yakumanCount: 0, isDealer: true, winType: "tsumo" });
const each = std.payments.others ?? 0; // 오야 취급이면 셋 다 이 금액을 낸다

const g = scene({ augments: { p2: [aotenjouCeiling, eternalDealer] } });
const payload = realWinPayload(g, {
  deltas: { p0: -each, p1: -each, p2: each * 3, p3: -each },
  winInfos: [win({ winner: "p2", from: null, winType: "tsumo", points: std.total, han: HAN, fu: FU, limit: "baiman" } as never)],
});
const out = settle(g, payload);
console.log(`표준 ${HAN}판 ${FU}부 오야취급 쯔모: 총 ${std.total} — 셋이 각 ${each} (똑같이)`);
console.log(`정산 후 델타: ${JSON.stringify(out.deltas)}  합계변화=${sum(out.deltas) - sum(payload.deltas)}`);
const paid = { p0: -(out.deltas["p0"] ?? 0), p1: -(out.deltas["p1"] ?? 0), p3: -(out.deltas["p3"] ?? 0) };
console.log(`실제 지불: p0(진짜 오야)=${paid.p0}  p1=${paid.p1}  p3=${paid.p3}`);
console.log(paid.p0 === paid.p1 ? "→ 균등 (기대대로)" : `→ ★ 진짜 오야 p0만 ${paid.p0 - paid.p1}점 더 낸다 (초과분만 2배 비율)`);
