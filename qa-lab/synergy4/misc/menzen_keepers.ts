/**
 * «멘젠을 지키거나 되돌리는» 카드가 «후로 판정»에 걸리는가.
 *   pond_snatch  : 후로가 아니라 주워 오는 것 — 멘쯔가 생기지 않는다
 *   silent_pact  : 멘쯔는 생기지만 멘젠 판정만 유지
 *   meld_dissolve: 멘쯔를 지운다 (조약은 되살아나면 안 된다 — 이미 감사됨)
 * 관측: no_ron_pact 의 공개 채널(active) + openMeldCountOf
 */
import { craft, mkGame, withAugments, optionsFor, FlowController, pick, withData } from "./lib.js";
import type { GameState, PlayerId, ActionOption } from "@majak/core";
import { openMeldCountOf, meldCountOf } from "@majak/core";

const key = (p: PlayerId): string => `view:*:no_ron_pact:active:${p}#round`;

function state(melds: boolean): GameState {
  let s = craft({
    hands: { p0: "123m456m789m99p2s", p1: "*", p2: "*", p3: "*" },
    melds: melds ? { p0: [{ kind: "pon", spec: "111z", from: "p1" }] } : {},
    discards: { p0: "", p1: "5s6s7s", p2: "3p4p5p", p3: "1z2z3z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAugments(s, { p0: ["no_ron_pact", "pond_snatch", "meld_dissolve"] });
}

function show(g: ReturnType<typeof mkGame>, tag: string): void {
  const s = g.engine.state;
  const raw = Object.entries(s.augmentData).find(([k]) => k.includes("no_ron_pact:active"));
  console.log(
    `  ${tag}: 후로=${meldCountOf(s, "p0")} 노출후로=${openMeldCountOf(s, "p0")} | 조약active=${String(raw?.[1])}`,
  );
}

// ① 날치기 — 조약이 살아 있어야 한다
{
  const g = mkGame(state(false));
  const flow = new FlowController(g.engine);
  let status = flow.begin();
  console.log("① pond_snatch (후로 아님)");
  const opt = optionsFor(status, "p0").find((o) => o.type === "pond_snatch");
  if (opt === undefined) console.log("  후보 없음:", [...new Set(optionsFor(status, "p0").map((o) => o.type))].join(","));
  else {
    status = flow.submit("p0", opt);
    const d = optionsFor(status, "p0").filter((o) => o.type === "discard");
    if (d.length > 0) status = flow.submit("p0", d[0] as ActionOption);
    show(g, "날치기 후");
  }
}

// ② 파혼으로 멘쯔를 지운 뒤 — 조약은 돌아오지 않아야 한다
{
  const g = mkGame(state(true));
  const flow = new FlowController(g.engine);
  let status = flow.begin();
  console.log("② meld_dissolve (멘쯔 해체)");
  show(g, "해체 전");
  const opt = optionsFor(status, "p0").find((o) => o.type === "dissolve_meld");
  if (opt === undefined) console.log("  후보 없음:", [...new Set(optionsFor(status, "p0").map((o) => o.type))].join(","));
  else {
    status = flow.submit("p0", opt);
    const d = optionsFor(status, "p0").filter((o) => o.type === "discard");
    if (d.length > 0) status = flow.submit("p0", d[0] as ActionOption);
    show(g, "해체 후");
    console.log("  p0 리치 후보:", optionsFor(status, "p0").some((o) => o.type === "riichi"));
  }
}
