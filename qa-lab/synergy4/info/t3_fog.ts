/**
 * T3 — 안개(정보를 가리는 카드) × 정보를 여는 카드.
 *
 * 예측:
 *  A) 안개 덮인 바닥 단독: 선언자는 네 바닥을 전부, 나머지는 최근 6장만.
 *  B) 박무 단독: 선언자는 전부, 나머지는 0장(장수만) + 마지막 1장 실물 공개 채널.
 *  C) 두 안개가 겹치면(다른 좌석) 두 선언자 모두 전부 본다 — fogScope로 고쳤다니 통과 예상.
 *  D) 같은 안개 둘(hidden_river×2, brief_fog×2)도 마찬가지.
 *  E) 안개 × 상대 손패를 여는 카드(투시)는 서로 간섭하지 않는다.
 *  F) 안개가 켜진 채 지뢰 탐지(danger_sense)·천리안(tenpai_scan)이 여전히 옳은 답을 주는가.
 */
import {
  SEATS,
  base,
  build,
  discardsZone,
  head,
  line,
  ok,
  strayTiles,
  view,
  zoneKinds,
  poke,
  act,
} from "./lib.js";
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";
import type { GameState, PlayerId } from "./lib.js";

const DISC = "123456789m12p";
const st = base({
  hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
  discards: { p0: DISC, p1: DISC, p2: DISC, p3: DISC },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});

const hrKey = (s: GameState, h: PlayerId): string => roundScopedKey("hidden_river", "fog", s, h);
const bfKey = (s: GameState, h: PlayerId): string => roundScopedKey("brief_fog", "turn", s, h);

function report(label: string, spec: Record<string, readonly string[]>, extra: Record<string, unknown>): void {
  head(label);
  const g = build(st, spec, extra);
  poke(g);
  for (const s of SEATS) {
    const v = view(g, s);
    const counts = SEATS.map((o) => `${o}:${(v.zones[discardsZone(o)]?.tileIds ?? []).length}/${(v.zones[discardsZone(o)]?.hiddenCount ?? 0)}`);
    line(`  ${s} 바닥(보임/가려짐) = ${counts.join(" ")}  stray=${strayTiles(v).length}`);
  }
}

report("A) hidden_river(p0) 선언", { p0: ["hidden_river"] }, { [hrKey(st, "p0")]: true });
report("B) brief_fog(p1) 선언", { p1: ["brief_fog"] }, { [bfKey(st, "p1")]: 0 });
report(
  "C) hidden_river(p0) + brief_fog(p1) 둘 다 선언",
  { p0: ["hidden_river"], p1: ["brief_fog"] },
  { [hrKey(st, "p0")]: true, [bfKey(st, "p1")]: 0 },
);
report(
  "D1) hidden_river ×2 (p0·p1)",
  { p0: ["hidden_river"], p1: ["hidden_river"] },
  { [hrKey(st, "p0")]: true, [hrKey(st, "p1")]: true },
);
report(
  "D2) brief_fog ×2 (p0·p1)",
  { p0: ["brief_fog"], p1: ["brief_fog"] },
  { [bfKey(st, "p0")]: 0, [bfKey(st, "p1")]: 0 },
);
report(
  "D3) 안개 선언자가 아닌 사람이 안개 카드를 들고만 있을 때(미선언)",
  { p0: ["hidden_river"], p1: ["brief_fog"] },
  { [bfKey(st, "p1")]: 0 },
);

head("E) brief_fog(p1) 선언 + xray_hand(p0) 발동 — 손패 열람은 안개와 무관한가");
{
  const g = build(st, { p0: ["xray_hand"], p1: ["brief_fog"] }, { [bfKey(st, "p1")]: 0 });
  line(`  xray_reveal → ${act(g, "p0", "xray_reveal") ?? "ok"}`);
  for (const s of SEATS) {
    const v = view(g, s);
    const hands = SEATS.map((o) => `${o}:${(v.zones[`hand:${o}`]?.tileIds ?? []).length}`);
    const disc = SEATS.map((o) => `${o}:${(v.zones[discardsZone(o)]?.tileIds ?? []).length}`);
    line(`  ${s} 손패보임 = ${hands.join(" ")} | 바닥보임 = ${disc.join(" ")}`);
  }
}

head("F) brief_fog(p0 자신) 선언 + danger_sense(p0) — 안개 속에서도 위험 판정이 나오는가");
{
  const g = build(st, { p0: ["brief_fog", "danger_sense"] }, { [bfKey(st, "p0")]: 0 });
  line(`  danger_sense_use → ${act(g, "p0", "danger_sense_use") ?? "ok"}`);
  const v = view(g, "p0");
  line(`  p0 augmentView = ${JSON.stringify(Object.entries(v.augmentView).filter(([k]) => k.includes("danger")))}`);
  const v1 = view(g, "p1");
  line(`  p1 augmentView(danger) = ${JSON.stringify(Object.entries(v1.augmentView).filter(([k]) => k.includes("danger")))}`);
  ok(Object.keys(v1.augmentView).filter((k) => k.includes("danger")).length === 0, "지뢰 탐지 결과가 남에게 새지 않는다");
}
