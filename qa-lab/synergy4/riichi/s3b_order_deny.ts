/**
 * synergy4 / riichi — S3b. 리치 봉쇄(riichi_seal / riichi_upgrade / last_stand)와
 * 상대 리치 이용(counter / soul_hunt / peek_riichi_waits / push_riichi)의 순서 의존.
 *
 * 봉인은 «그 국의 첫 리치를 내가 선언할 때» 선다. 그래서 두 가지 순서가 있다:
 *   (가) 내가 먼저 리치 → 봉인 → 상대는 영영 리치 못 함 → 이용 계열은 전제가 사라진다
 *   (나) 낙인/강제 리치가 먼저 → 첫 리치가 상대 것 → 봉인 자체가 서지 않는다
 *
 * 재는 것: 각 순서에서 (1) p1에게 riichi 버튼이 남는가 (2) push_brand가 먹히는가
 *          (3) riichi.blocked 규칙값
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, optionsFor, FlowController,
} from "./lib.js";
import type { ActionOption, GameState, PlayerId } from "@majak/core";

const P0_HAND = "123m456m789m222p1s9s";
const P1_HAND = "234m567m234p55z3s4s";

function scene(p0augs: string[]): GameState {
  let s = craft({
    hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  s = stackWall(s, ["2s", "1z", "2z", "9m", "1s"]); // p1이 2s를 뽑으면 텐파이 → 리치 가능
  return withAugments(s, { p0: p0augs });
}

function blocked(game: ReturnType<typeof mkGame>, who: PlayerId): boolean {
  return game.engine.rules.resolve<boolean>("riichi.blocked", {
    playerId: who, state: game.engine.state,
  });
}

function probe(label: string, p0augs: string[], order: "riichi-first" | "brand-first"): void {
  const game = mkGame(scene(p0augs));
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  const kindOf = (id: number): string => {
    const k = game.engine.state.tiles[id]!.kind;
    return `${k.suit}${k.rank}`;
  };
  const log: string[] = [];
  const brand = (): void => {
    const b = optionsFor(status, "p0").find(
      (o) => o.type === "push_brand" && (o.payload as { target?: string }).target === "p1",
    );
    log.push(b === undefined ? "낙인 버튼 없음" : "낙인 → p1");
    if (b !== undefined) status = flow.submit("p0", b);
  };
  const riichi = (): void => {
    const r = optionsFor(status, "p0").find(
      (o) => o.type === "riichi" && kindOf((o.payload as { tileId: number }).tileId) === "sou9",
    );
    log.push(r === undefined ? "p0 리치 버튼 없음" : "p0 리치(9s)");
    if (r !== undefined) status = flow.submit("p0", r);
  };
  if (order === "brand-first") { brand(); riichi(); } else { riichi(); brand(); }
  if ((status as { kind: string }).kind === "awaiting") {
    // p0가 리치를 못 걸었으면 그냥 버린다
    const d = optionsFor(status, "p0").filter((o) => o.type === "discard");
    if (d.length > 0) status = flow.submit("p0", d[d.length - 1] as ActionOption);
  }
  log.push(`riichi.blocked: p1=${blocked(game, "p1")} p2=${blocked(game, "p2")} p3=${blocked(game, "p3")}`);
  // p1 차례까지 진행해서 리치 버튼이 있는지 본다
  for (let i = 0; i < 12; i++) {
    const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const pr = s.prompts?.[0];
    if (pr === undefined) break;
    if (pr.player === "p1" && pr.options.some((o) => o.type === "discard")) {
      const types = [...new Set(pr.options.map((o) => o.type))];
      log.push(`p1 순 옵션: ${types.join(",")} / riichi 가능=${types.includes("riichi")}`);
      const dd = pr.options.filter((o) => o.type === "discard");
      status = flow.submit("p1", dd[dd.length - 1] as ActionOption);
      log.push(`p1 리치 상태 = ${game.engine.state.round.byPlayer["p1"]?.riichi != null}`);
      break;
    }
    const dd = pr.options.filter((o) => o.type === "discard");
    const pass = pr.options.find((o) => o.type === "pass");
    const pickOpt = dd.length > 0 ? dd[dd.length - 1] : pass;
    if (pickOpt === undefined) break;
    status = flow.submit(pr.player, pickOpt);
  }
  console.log(`\n### ${label} [${order}]`);
  for (const l of log) console.log(`  ${l}`);
}

probe("0 없음", [], "riichi-first");
probe("seal 단독", ["riichi_seal"], "riichi-first");
probe("upgrade 단독", ["riichi_upgrade"], "riichi-first");
probe("push 단독", ["push_riichi"], "riichi-first");
probe("push 단독", ["push_riichi"], "brand-first");
probe("push + seal", ["push_riichi", "riichi_seal"], "riichi-first");
probe("push + seal", ["push_riichi", "riichi_seal"], "brand-first");
probe("push + upgrade", ["push_riichi", "riichi_upgrade"], "riichi-first");
probe("push + upgrade", ["push_riichi", "riichi_upgrade"], "brand-first");
probe("counter + seal", ["counter", "riichi_seal"], "riichi-first");
probe("soul_hunt + seal", ["soul_hunt", "riichi_seal"], "riichi-first");
probe("peek + seal", ["peek_riichi_waits", "riichi_seal"], "riichi-first");
probe("seal + upgrade (antiIds)", ["riichi_seal", "riichi_upgrade"], "riichi-first");
probe("siege + seal (노텐 리치로 봉인)", ["siege_riichi", "riichi_seal"], "riichi-first");
