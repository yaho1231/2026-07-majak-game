/**
 * H1 — "+N판"(뱅크 환산) 겹침 · 상한 해제 · 하한 보장 · 지불 재배선의 교차.
 *
 * # 예측
 * 8판 30부 자 론 24,000(=배만 16,000이 아니라 픽스처가 준 값). 실제로는 winInfo.han/fu로
 * 다시 계산되므로 아래 각 실험이 자기 밑값을 출력한다.
 *
 * (A) +N판 합산: blame_shift(론 +2) · counter(직격 +3) · counter(+3판 직격)(멘젠 론 +2) 가
 *     같은 정산에 겹치면 hanSoFar 규약대로 **+7판 한 번**과 같아야 한다.
 * (B) 상한 해제(aotenjou_ceiling)와 겹치면 위 합이 uncapped 곡선 위에서 계산되고,
 *     aotenjou의 Transfer 몫과 **이중 계산되지 않아야** 한다:
 *       총 수령 = uncapped(han+ΣN) 이어야 한다.
 * (C) 하한(big_hand)은 위가 다 끝난 뒤 부족분만 채운다 — 이미 넘으면 0.
 * (D) blame_shift(Reassert) × devils_advance(Transfer): 가불 상환 3,000×3은
 *     "내 화료의 지불"이 아니다. blame_shift의 Reassert가 그것까지 재분배하면
 *     쏜 사람이 상환금을 면제받고 나머지 둘이 대신 문다 → 결함.
 */
import {
  blank, settle, show, sum, win, winPayload, withAugs, roundScopedKey, roundKey,
} from "./lib.js";
import type { GameState, PlayerId, RoundSettledPayload } from "./lib.js";
import { blameShift } from "../../../packages/content/src/augments/blame_shift.js";
import { counter as counterAug } from "../../../packages/content/src/augments/counter.js";
import { aotenjouCeiling } from "../../../packages/content/src/augments/aotenjou_ceiling.js";
import { bigHand } from "../../../packages/content/src/augments/big_hand.js";
import { devilsAdvance } from "../../../packages/content/src/augments/devils_advance.js";
import { scapegoat } from "../../../packages/content/src/augments/scapegoat.js";
import { eternalDealer } from "../../../packages/content/src/augments/eternal_dealer.js";
import { calculateScore } from "@majak/core";

const H: PlayerId = "p0";
const merge = (...fs: ((s: GameState) => Record<string, unknown>)[]) => (s: GameState) =>
  Object.assign({}, ...fs.map((f) => f(s)));
const none = () => ({});

/** p0(자) 8판30부 론 p1 — 표준 16,000(배만) */
function RON(g: ReturnType<typeof withAugs>, han = 8, fu = 30): RoundSettledPayload {
  const pts = calculateScore({ han, fu, yakumanCount: 0, isDealer: false, winType: "ron" }).total;
  return winPayload(g, { p0: pts, p1: -pts, p2: 0, p3: 0 }, [
    win({ winner: "p0", winType: "ron", from: "p1", points: pts, han, fu, limit: han >= 5 ? "mangan" : null } as never),
  ]);
}
function TSUMO(g: ReturnType<typeof withAugs>, han = 8, fu = 30): RoundSettledPayload {
  const s = calculateScore({ han, fu, yakumanCount: 0, isDealer: false, winType: "tsumo" });
  const total = s.total;
  const dealerPay = Math.round(total / 4) * 2;
  const each = Math.round((total - dealerPay) / 2);
  return winPayload(g, { p0: total, p1: -dealerPay, p2: -each, p3: -each }, [
    win({ winner: "p0", winType: "tsumo", from: null, points: total, han, fu, limit: han >= 5 ? "mangan" : null } as never),
  ]);
}

const seedBig = (s: GameState) => ({ [`big_hand:round:${H}`]: roundKey(s) });
const seedScape = (t: PlayerId) => (s: GameState) => ({ [roundScopedKey("scapegoat", "target", s, H)]: t });
const seedDevilsGranted = () => ({ [`devils_advance:granted:${H}`]: true });
const seedCounter = () => ({ [`counter:struck:${H}`]: true, [`counter:prev:${H}`]: "p1" });

function R(label: string, spec: { player: PlayerId; def: unknown }[], extra = none, mk = RON, han = 8): RoundSettledPayload {
  const g = withAugs(blank(25000, 1), spec as never, extra);
  const out = settle(g, mk(g, han));
  show(label, out);
  return out;
}

console.log("=== (A) '+N판' 뱅크 환산 겹침 — 8판30부 자 론 (표준 16,000) ===");
console.log(`   참고: 표준 8판=${calculateScore({han:8,fu:30,yakumanCount:0,isDealer:false,winType:"ron"}).total}` +
  ` 10판=${calculateScore({han:10,fu:30,yakumanCount:0,isDealer:false,winType:"ron"}).total}` +
  ` 12판=${calculateScore({han:12,fu:30,yakumanCount:0,isDealer:false,winType:"ron"}).total}` +
  ` 13판=${calculateScore({han:13,fu:30,yakumanCount:0,isDealer:false,winType:"ron"}).total}`);
const a0 = R("기준 (증강 없음)", [{ player: H, def: bigHand }], none);
const aB = R("blame_shift (+2판)", [{ player: H, def: blameShift }]);
const aH = R("counter(+3판 직격) 단독", [{ player: H, def: counterAug }], seedCounter);
const aBH = R("blame_shift + counter(+3판 직격)", [{ player: H, def: blameShift }, { player: H, def: counterAug }], seedCounter);
console.log(`  → +4판 한 번의 값 = ${calculateScore({han:12,fu:30,yakumanCount:0,isDealer:false,winType:"ron"}).total - 16000}`);

console.log("\n=== (B) 상한 해제(aotenjou) × '+N판' ===");
const b0 = R("aotenjou 단독", [{ player: H, def: aotenjouCeiling }]);
const bB = R("aotenjou + blame_shift", [{ player: H, def: aotenjouCeiling }, { player: H, def: blameShift }]);
const bBH = R("aotenjou + blame + counter(+3판 직격)", [
  { player: H, def: aotenjouCeiling }, { player: H, def: blameShift }, { player: H, def: counterAug }], seedCounter);
const unc = (h: number) => calculateScore({ han: h, fu: 30, yakumanCount: 0, isDealer: false, winType: "ron", uncapped: true }).total;
console.log(`  uncapped 8판=${unc(8)} 10판=${unc(10)} 12판=${unc(12)}`);
console.log(`  기대: aotenjou단독=${unc(8)}  +blame=${unc(10)}  +blame+blade=${unc(12)}`);
console.log(`  실측: ${b0.deltas[H]} / ${bB.deltas[H]} / ${bBH.deltas[H]}`);

console.log("\n=== (C) 하한(big_hand) 겹침 — 작은 손(1판30부 론=1,000) ===");
R("big_hand 단독 (1판)", [{ player: H, def: bigHand }], seedBig, RON, 1);
R("big_hand + blame_shift (1판)", [{ player: H, def: bigHand }, { player: H, def: blameShift }], seedBig, RON, 1);
R("big_hand + aotenjou (1판)", [{ player: H, def: bigHand }, { player: H, def: aotenjouCeiling }], seedBig, RON, 1);
R("big_hand + aotenjou + blame (1판)", [
  { player: H, def: bigHand }, { player: H, def: aotenjouCeiling }, { player: H, def: blameShift }], seedBig, RON, 1);
console.log("  기대: 어느 조합이든 p0 수령 = max(8000, 각 카드의 합) · 이중 발행 없음");

console.log("\n=== (C2) 하한(big_hand) × 만년 오야(오야 취급) ===");
R("big_hand 단독 (자, 1판)", [{ player: H, def: bigHand }], seedBig, RON, 1);
R("big_hand + eternal_dealer (오야 취급, 1판)", [
  { player: H, def: bigHand }, { player: H, def: eternalDealer }], seedBig, RON, 1);
console.log("  기대: 오야 취급이면 하한이 12,000");

console.log("\n=== (D) blame_shift(론 3분할) × devils_advance(상환 3,000×3) ===");
console.log("  기대: 상환 3,000은 셋이 각각 그대로 문다. blame의 재분할 대상이 아니다.");
R("devils_advance 단독 (론 만관)", [{ player: H, def: devilsAdvance }], seedDevilsGranted);
R("blame_shift 단독 (론 만관)", [{ player: H, def: blameShift }]);
R("blame + devils (론 만관)", [{ player: H, def: blameShift }, { player: H, def: devilsAdvance }], merge(seedDevilsGranted));

console.log("\n=== (D2) scapegoat(쯔모 몰아주기) × devils_advance ===");
R("scapegoat 단독 (쯔모 만관, 지목 p1)", [{ player: H, def: scapegoat }], seedScape("p1"), TSUMO);
R("scapegoat + devils (쯔모 만관, 지목 p1)", [
  { player: H, def: scapegoat }, { player: H, def: devilsAdvance }], merge(seedScape("p1"), seedDevilsGranted), TSUMO);
console.log("  기대: 상환 9,000이 p1 한 명에게 몰린다(카드 문구대로) · 총합은 -9,000 + 판수 발행");

void sum; void a0; void aB; void aH; void aBH;
