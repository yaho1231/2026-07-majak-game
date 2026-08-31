/**
 * synergy4 / riichi — S10. 리치 봉인(riichi_seal)이 «전용 리치 선언» 경로에서도 서는가.
 * 봉인은 "그 국의 첫 리치를 내가 선언할 때" 선다 — 표준 riichi 말고 다른 버튼으로
 * 선언해도 같아야 한다(카드에 예외가 없다).
 */
import { craft, mkGame, setIndicators, stackWall, withAugments, optionsFor, FlowController } from "./lib.js";
import type { GameState, PlayerId } from "@majak/core";

const P0_HAND = "123m456m789m222p1s9s";
function scene(augs: string[]): GameState {
  let s = craft({ hands: { p0: P0_HAND, p1: "234m567m234p55z3s4s", p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  s = setIndicators(s, "3z", "1p");
  s = stackWall(s, ["2s", "1z", "2z", "9m"]);
  return withAugments(s, { p0: augs });
}
function probe(label: string, augs: string[], action: string): void {
  const game = mkGame(scene(augs));
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  const o = optionsFor(status, "p0").find((x) => {
    const id = (x.payload as { tileId?: number }).tileId;
    if (id === undefined || x.type !== action) return false;
    const k = game.engine.state.tiles[id]!.kind;
    return k.suit === "sou" && k.rank === 9;
  });
  if (o === undefined) { console.log(`${label.padEnd(40)} !! ${action} 없음`); return; }
  status = flow.submit("p0", o);
  const b = (w: PlayerId): boolean => game.engine.rules.resolve<boolean>("riichi.blocked", { playerId: w, state: game.engine.state });
  const banner = Object.entries(game.engine.state.augmentData).filter(([k]) => k.includes("riichi_seal")).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
  console.log(`${label.padEnd(40)} blocked p1/p2/p3=${b("p1")}/${b("p2")}/${b("p3")}  ${banner || "(배너 없음)"}`);
}
probe("seal + 표준 riichi", ["riichi_seal"], "riichi");
probe("seal + no_retreat", ["riichi_seal", "no_retreat"], "no_retreat_riichi");
probe("seal + open_riichi", ["riichi_seal", "open_riichi_reveal"], "open_riichi");
probe("seal + all_in_riichi", ["riichi_seal", "all_or_nothing"], "all_in_riichi");
probe("seal + soul_strike", ["riichi_seal", "soul_strike"], "soul_strike");
probe("seal + siege(노텐 아님)", ["riichi_seal", "siege_riichi"], "riichi");
