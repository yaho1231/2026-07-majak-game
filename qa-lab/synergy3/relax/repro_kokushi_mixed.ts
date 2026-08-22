/**
 * open_kokushi(우는 국사무쌍) × mixed_triplet(동수의 결속) — 둘 다 `call`/`shape` 축.
 *
 * 설명:
 *  - 동수의 결속: "커쯔의 무늬 제한이 사라진다 … 퐁·깡에 모두 반영된다" → 1만1통1삭을 **퐁**할 수 있다.
 *  - 우는 국사: "한 번 부르면 평범한 치·퐁·깡이 전부 막힌다. 반대로 평범한 치·퐁·깡을
 *    이미 한 뒤에는 이 퐁을 부를 수 없다."
 *
 * 함정: open_kokushi 의 '평범한 후로' 판정(hasNonKokushiMeld)은 **모양**으로 한다 —
 *   "서로 다른 요구패 3장"이면 국사 묶음으로 본다. 동수의 결속으로 부른 1만1통1삭 퐁은
 *   kind 가 "pon" 인데 모양은 국사 묶음이라 이 검사를 그대로 통과한다.
 *   그런데 국사 덮개(kokushiMeldKinds)는 kind === "kokushi_pon" 인 후로만 센다.
 *
 * 기대(먼저 적음):
 *   그래서 [혼색 퐁 1만1통1삭] + [kokushi_pon 9만9통9삭] 을 함께 가진 손은
 *   - 국사 분해에 1·9만·통·삭 3종이 빠져 영영 완성되지 않고
 *   - kokushiOnly 가 표준형·치또이까지 막아
 *   **화료도 텐파이도 불가능한 벽돌 국**이 된다. (설명 어디에도 그런 말이 없다)
 *
 * 대조군: 없음 / open_kokushi 만 / mixed_triplet 만 / 둘 다
 */
import {
  isTenpai,
  meldCountOf,
  scoringOptionsOf,
  winHandKindsOf,
  winningKinds,
  handIdsOf,
  kindKey,
} from "@majak/core";
import type { AugmentDef, GameState, Meld, PlayerId } from "@majak/core";
import { craft, start, table } from "./lib.js";
import { openKokushi } from "../../../packages/content/src/augments/open_kokushi.js";
import { mixedTriplet } from "../../../packages/content/src/augments/mixed_triplet.js";

/** 후로 2개(혼색 퐁 + 국사 퐁) + 손패 7장 */
function scene(kinds: { first: Meld["kind"]; second: Meld["kind"] }): GameState {
  return craft({
    hands: { p0: "1234z567z", p1: "*", p2: "*", p3: "*" }, // 동남서북백발중 = 7장
    melds: {
      p0: [
        { kind: kinds.first, spec: "1m1p1s", from: "p1" as PlayerId },
        { kind: kinds.second, spec: "9m9p9s", from: "p2" as PlayerId },
      ],
    },
    phase: "turn.act",
    turnSeat: 0,
  });
}

function probe(label: string, s: GameState, defs: AugmentDef[]): void {
  const g = start(s, defs);
  const st = g.engine.state;
  const opts = scoringOptionsOf(st, g.engine.rules, "p0" as PlayerId);
  const hand = winHandKindsOf(st, g.engine.rules, "p0" as PlayerId);
  const mc = meldCountOf(st, "p0" as PlayerId);
  const waits = winningKinds(hand, mc, undefined, opts);
  table(label, [
    { label: "melds", value: (st.round.byPlayer["p0"]?.melds ?? []).map((m) => m.kind) },
    { label: "손패", value: handIdsOf(st, "p0" as PlayerId).length + "장" },
    { label: "kokushiOnly", value: opts.kokushiOnly ?? false },
    { label: "kokushiMeldKinds", value: (opts.kokushiMeldKinds ?? []).map(kindKey) },
    { label: "텐파이?", value: isTenpai(hand, mc, undefined, opts) },
    { label: "대기(오름패)", value: waits.map(kindKey) },
  ]);
}

console.log("\n##### A. 혼색 퐁(kind=pon) + 국사 퐁(kind=kokushi_pon)");
const A = scene({ first: "pon" as Meld["kind"], second: "kokushi_pon" as Meld["kind"] });
probe("① 없음", A, []);
probe("② open_kokushi 만", A, [openKokushi]);
probe("③ mixed_triplet 만", A, [mixedTriplet]);
probe("④ 둘 다", A, [openKokushi, mixedTriplet]);

console.log("\n##### B. 대조 — 둘 다 kokushi_pon 이면 정상 국사 텐파이여야 한다");
const B = scene({
  first: "kokushi_pon" as Meld["kind"],
  second: "kokushi_pon" as Meld["kind"],
});
probe("⑤ open_kokushi 만", B, [openKokushi]);
probe("⑥ 둘 다", B, [openKokushi, mixedTriplet]);
