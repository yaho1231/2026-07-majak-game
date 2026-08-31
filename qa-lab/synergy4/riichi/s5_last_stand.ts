/**
 * synergy4 / riichi — S5. 승부수(last_stand)로 리치를 무를 때 **딸린 것들이 함께 풀리는가**.
 *
 * riichi_seal 카드 문구: "승부수로 리치를 풀면 봉인도 풀린다."
 * riichi_upgrade  : "내가 그 리치를 지고 있는 동안" 하가 봉인.
 * soul_strike     : 리치가 사라지면 판수 보너스도 사라진다(소스 주석).
 * counter         : 취소하면 대납금·struck 되돌림(소스 주석).
 *
 * 진행: p0 리치 → 한 바퀴 → p0 자기 순에 cancel_riichi → 규칙값 재측정.
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, optionsFor, FlowController,
} from "./lib.js";
import type { ActionOption, GameState, PlayerId } from "@majak/core";

const P0_HAND = "123m456m789m222p1s9s";
const P1_HAND = "234m567m234p55z3s4s";

function scene(augs: string[]): GameState {
  let s = craft({
    hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  s = stackWall(s, ["2s", "1z", "2z", "9m"]);
  return withAugments(s, { p0: augs });
}

function blocked(game: ReturnType<typeof mkGame>, who: PlayerId): boolean {
  return game.engine.rules.resolve<boolean>("riichi.blocked", { playerId: who, state: game.engine.state });
}
function snap(game: ReturnType<typeof mkGame>): string {
  const st = game.engine.state;
  return `blocked p1/p2/p3=${blocked(game, "p1")}/${blocked(game, "p2")}/${blocked(game, "p3")}` +
    ` | p0리치=${st.round.byPlayer["p0"]?.riichi != null}` +
    ` | pot=${st.round.riichiPot} | p0점수=${st.players.find((p) => p.id === "p0")?.score}`;
}

function probe(label: string, augs: string[], declare = "riichi"): void {
  const game = mkGame(scene(augs));
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  const kindOf = (id: number): string => {
    const k = game.engine.state.tiles[id]!.kind;
    return `${k.suit}${k.rank}`;
  };
  console.log(`\n### ${label}`);
  const r = optionsFor(status, "p0").find(
    (o) => o.type === declare && kindOf((o.payload as { tileId: number }).tileId) === "sou9",
  );
  if (r === undefined) { console.log(`  !! ${declare} 없음`); return; }
  status = flow.submit("p0", r);
  console.log(`  리치 직후: ${snap(game)}`);
  // 한 바퀴 돌려 p0 순으로
  for (let i = 0; i < 12; i++) {
    const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const pr = s.prompts?.[0];
    if (pr === undefined) break;
    if (pr.player === "p0") break;
    const dd = pr.options.filter((o) => o.type === "discard");
    const pass = pr.options.find((o) => o.type === "pass");
    const opt = dd.length > 0 ? dd[dd.length - 1] : pass;
    if (opt === undefined) break;
    status = flow.submit(pr.player, opt);
  }
  const types = [...new Set(optionsFor(status, "p0").map((o) => o.type))];
  console.log(`  p0 순 옵션: ${types.join(",")}`);
  const c = optionsFor(status, "p0").find((o) => o.type === "cancel_riichi");
  if (c === undefined) { console.log("  !! cancel_riichi 없음"); return; }
  status = flow.submit("p0", c);
  console.log(`  취소 직후: ${snap(game)}`);
}

probe("0 last_stand 단독", ["last_stand"]);
probe("A last_stand + riichi_seal", ["last_stand", "riichi_seal"]);
probe("B last_stand + riichi_upgrade", ["last_stand", "riichi_upgrade"]);
probe("C last_stand + seal + upgrade", ["last_stand", "riichi_seal", "riichi_upgrade"]);
probe("D last_stand + no_retreat(공탁0)", ["last_stand", "no_retreat"], "no_retreat_riichi");
probe("E last_stand + stealth(공탁0)", ["last_stand", "stealth_riichi"], "stealth_riichi");
probe("F last_stand + soul_strike", ["last_stand", "soul_strike"], "soul_strike");
probe("G last_stand + siege(노텐 리치)+seal", ["last_stand", "siege_riichi", "riichi_seal"]);
