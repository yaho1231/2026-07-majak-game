/**
 * 만년 오야 (eternal_dealer) — **더블론에 진짜 오야가 끼면 연장 횟수가 소모되지 않는다.**
 *
 * ① sysSettleWin(standardActions.ts:858-895)은 화료자를 순서대로 훑으며
 *      - 진짜 오야면 dealerWon = true
 *      - 자인데 round.keepDealer가 켜져 있으면 dealerWon = true; keepDealerSeat = 그 자리
 *    로 처리하고, 마지막에 `dealerSeat: keepDealerSeat ?? state.round.dealerSeat` 를 쓴다.
 *    → 만년 오야 보유자(자)가 배열 앞에 있으면 keepDealerSeat가 먼저 박히고, 뒤이어
 *      진짜 오야가 화료해도 그 값은 덮이지 않는다 → **다음 국 오야는 보유자 자리**.
 *
 * ② 그런데 eternal_dealer의 Observe 인터셉터는
 *      `if (infos.some(w => 오야 자리 화료자)) return event;`
 *    로 빠져나간다 → extendedBy 표식이 없다 → keeps 카운터가 오르지 않는다.
 *
 * 결과: 오야 자리를 실제로 가져왔는데 "게임 내 3회" 한도를 소모하지 않는다 → 한도 우회.
 */
import { eternalDealer } from "../../packages/content/src/augments/eternal_dealer.js";
import { scene, settle, win } from "./settleRig.js";
import type { RoundSettledPayload } from "@majak/core";

// craft 기본: p0=seat0(오야), p1=1, p2=2, p3=3. 보유자는 자(p2).
const HOLDER = "p2", HOLDER_SEAT = 2, DEALER_SEAT = 0;

function run(withDealerCoWinner: boolean): void {
  const g = scene({ augments: { p2: [eternalDealer] } });
  const st = g.engine.state;

  // ① 엔진이 보는 값: 보유자에게 round.keepDealer가 켜져 있다
  const keep = g.engine.rules.resolve<boolean>("round.keepDealer", { playerId: HOLDER, state: st });

  // sysSettleWin의 좌석 결정 로직을 그대로 재현 (standardActions.ts:858-895, 1096-1100)
  const wins = withDealerCoWinner
    ? [{ winner: HOLDER, seat: HOLDER_SEAT }, { winner: "p0", seat: DEALER_SEAT }]
    : [{ winner: HOLDER, seat: HOLDER_SEAT }];
  let dealerWon = false;
  let keepDealerSeat: number | null = null;
  for (const w of wins) {
    if (w.seat === DEALER_SEAT) dealerWon = true;
    else if (g.engine.rules.resolve<boolean>("round.keepDealer", { playerId: w.winner, state: st })) {
      dealerWon = true;
      keepDealerSeat = w.seat;
    }
  }
  const nextDealerSeat = dealerWon ? (keepDealerSeat ?? DEALER_SEAT) : DEALER_SEAT;

  // ② 그 payload를 정산 인터셉터에 흘린다
  const payload = {
    outcome: "win",
    deltas: { p0: withDealerCoWinner ? 4000 : -8000, p1: 0, p2: 8000, p3: 0 },
    dealerSeat: nextDealerSeat,
    honba: st.round.honba + 1,
    riichiPot: 0,
    roundNumber: st.round.roundNumber,
    prevalentWind: st.round.prevalentWind,
    dealerContinues: dealerWon,
    winInfos: wins.map((w) => win({ winner: w.winner as never, from: "p1", winType: "ron", points: 8000 })),
  } as unknown as RoundSettledPayload;
  const out = settle(g, payload) as RoundSettledPayload & { extendedBy?: string[] };

  console.log(
    `${withDealerCoWinner ? "더블론(보유자 + 진짜 오야)" : "단독 화료(보유자만)"}\n` +
      `  keepDealer(보유자)=${keep}  다음 국 오야 자리=${nextDealerSeat} (보유자 자리=${HOLDER_SEAT})\n` +
      `  연장 소모 표식 extendedBy=${JSON.stringify(out.extendedBy ?? [])}  ` +
      `→ ${(out.extendedBy ?? []).includes(HOLDER) ? "횟수 소모" : "★ 횟수 미소모"}`,
  );
}

run(false);
run(true);
