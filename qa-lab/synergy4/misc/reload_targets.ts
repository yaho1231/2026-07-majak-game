/**
 * «어느 축에도 안 잡히는» 재장전(reload)이 내 축의 횟수형 카드들을 실제로 되살리는가.
 *
 * reload는 «`<id>:uses:` 또는 `<id>:used:` 카운터»만 본다(spentKeyOf). 그런데 잔량
 * pill(publishUsesLeft)을 내는 카드는 그보다 많다 — 그중 카운터 이름이 다른 것은
 * 「잔량이 보이고, 재장전의 드래프트 게이트(restorableType)는 통과시키는데,
 *  정작 후보에는 절대 뜨지 않는」 사각지대가 된다.
 *
 * 각 카드의 «소진» 상태를 직접 만들어 두고 reload_use 후보 목록을 본다.
 */
import { craft, mkGame, withAugments, optionsFor, FlowController, withData } from "./lib.js";
import type { GameState } from "@majak/core";

const CASES: { id: string; data: Record<string, unknown>; note: string }[] = [
  { id: "die_hard", data: { "die_hard:uses:p0": 1 }, note: "uses 규약" },
  { id: "karma", data: { "karma:uses:p0": 1 }, note: "uses 규약" },
  { id: "seat_swap", data: { "seat_swap:uses:p0": 1 }, note: "uses 규약" },
  { id: "pond_snatch", data: { "pond_snatch:used:p0": 1 }, note: "used 규약" },
  { id: "eternal_dealer", data: { "eternal_dealer:keeps:p0": 1 }, note: "keeps — 규약 밖" },
  { id: "pseudo_dealer", data: { "pseudo_dealer:cd:p0": 2 }, note: "쿨다운형(대상 아님이 정상)" },
];

for (const c of CASES) {
  let s: GameState = craft({
    hands: { p0: "123m456m789m22p33p", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "6z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = withAugments(s, { p0: ["reload", c.id] });
  s = withData(s, c.data);
  const game = mkGame(s);
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  const opts = optionsFor(status, "p0").filter((o) => o.type === "reload_use");
  const targets = opts.map((o) => (o.payload as { augmentId: string }).augmentId);
  const pill = game.engine.state.augmentData[`view:p0:uses:${c.id}`];
  console.log(
    `${c.id.padEnd(16)} (${c.note.padEnd(20)}) | 잔량pill=${pill === undefined ? "없음" : "있음"} | reload 후보: ${targets.join(",") || "(없음)"}`,
  );
}
