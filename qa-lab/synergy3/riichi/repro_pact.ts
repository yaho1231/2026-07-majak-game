/**
 * 불가침 조약(no_ron_pact)을 **남이 깬다**.
 *
 * ① × push_riichi — 조약은 "리치를 걸면" 깨진다. 그 리치를 상대가 강제한다.
 * ② × meld_dissolve — 후로로 깬 조약이 파혼(멘젠 복귀)으로 돌아오는가.
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, optionsFor,
  FlowController,
} from "./lib.js";
import type { ActionOption, GameState, PlayerId } from "@majak/core";

const P1_HAND = "234m567m234p55z3s4s"; // 2s/5s 대기 텐파이 (멘젠)

function immune(game: ReturnType<typeof mkGame>, p: PlayerId): boolean {
  return game.engine.rules.resolve<boolean>("win.ronImmune", {
    playerId: p,
    state: game.engine.state,
  });
}
function pactLabel(game: ReturnType<typeof mkGame>, p: PlayerId): string {
  const st = game.engine.state;
  const key = Object.keys(st.augmentData).find(
    (k) => k.includes("no_ron_pact") && k.includes(p) && !k.includes("active"),
  );
  return key === undefined ? "(없음)" : String(st.augmentData[key]);
}

function scene(p0augs: string[], p1augs: string[]): GameState {
  let s = craft({
    hands: { p0: "123m456m789m222p1s9s", p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  s = stackWall(s, ["9m", "1z", "2z"]);
  return withAugments(s, { p0: p0augs, p1: p1augs });
}

function run(brand: boolean): void {
  const st = scene(brand ? ["push_riichi"] : [], ["no_ron_pact"]);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  console.log(
    `\n[${brand ? "낙인 있음" : "대조군(낙인 없음)"}] 시작: p1 론면역=${immune(game, "p1")} 배너="${pactLabel(game, "p1")}"`,
  );
  if (brand) {
    const b = optionsFor(status, "p0").find(
      (o) => o.type === "push_brand" && (o.payload as { target: string }).target === "p1",
    );
    if (b === undefined) throw new Error("낙인 없음");
    status = flow.submit("p0", b);
  }
  const d0 = optionsFor(status, "p0").find((o) => {
    const k = game.engine.state.tiles[(o.payload as { tileId: number }).tileId]!.kind;
    return o.type === "discard" && k.suit === "sou" && k.rank === 9;
  });
  status = flow.submit("p0", d0 as ActionOption);
  // p1의 차례까지 진행 — p1은 쯔모기리(마지막 후보)
  for (let i = 0; i < 6; i++) {
    const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const pr = s.prompts?.[0];
    if (pr === undefined) break;
    if (pr.player === "p1") {
      const dd = pr.options.filter((o) => o.type === "discard");
      status = flow.submit("p1", dd[dd.length - 1] as ActionOption);
      break;
    }
    const pass = pr.options.find((o) => o.type === "pass");
    if (pass === undefined) break;
    status = flow.submit(pr.player, pass);
  }
  const rs = game.engine.state.round.byPlayer["p1"];
  console.log(
    `  p1 타패 후: 리치=${rs?.riichi != null} 론면역=${immune(game, "p1")} 배너="${pactLabel(game, "p1")}"`,
  );
}

run(false);
run(true);
