/**
 * 공성계(siege_riichi)로 **노텐 리치**를 걸고 그 리치에 다른 카드를 얹는다.
 *
 * ① × riichi_seal — 텐파이도 아닌 손 1,000점으로 셋 전부의 리치를 그 국 내내 봉인한다.
 * ② × peek_riichi_waits(상대) — 빈 대기를 "간파"하고 국당 1회를 소모하는가.
 * ③ × counter(상대) — 노텐 리치를 추격하면 뱅크 보너스가 얼마인가.
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, optionsFor,
  FlowController,
} from "./lib.js";
import type { ActionOption, GameState, PlayerId } from "@majak/core";

/** p0 노텐(1샹텐), p1 텐파이 */
function scene(p0augs: string[], p1augs: string[]): GameState {
  let s = craft({
    hands: {
      p0: "19m19p19s1234567z", // 국사 1샹텐 — 텐파이 아님
      p1: "234m567m234p55z3s4s",
      p2: "*",
      p3: "*",
    },
    discards: { p0: "888m", p1: "999m" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  s = stackWall(s, ["8p", "8s", "7p"]);
  return withAugments(s, { p0: p0augs, p1: p1augs });
}

function report(p0augs: string[], p1augs: string[]): void {
  const st = scene(p0augs, p1augs);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  const label = `p0=[${p0augs.join("+") || "없음"}] p1=[${p1augs.join("+") || "없음"}]`;
  const riichiOpts = optionsFor(status, "p0").filter((o) => o.type === "riichi");
  if (riichiOpts.length === 0) {
    console.log(`${label}\n  p0 리치 후보 없음 (노텐)`);
    return;
  }
  status = flow.submit("p0", riichiOpts[0] as ActionOption);
  const sealed = game.engine.rules.resolve<boolean>("riichi.blocked", {
    playerId: "p1",
    state: game.engine.state,
  });
  // p1 차례까지
  for (let i = 0; i < 6; i++) {
    const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const pr = s.prompts?.[0];
    if (pr === undefined) break;
    if (pr.player === "p1" && pr.options.some((o) => o.type === "discard")) break;
    const pass = pr.options.find((o) => o.type === "pass");
    if (pass !== undefined) {
      status = flow.submit(pr.player, pass);
      continue;
    }
    const dd = pr.options.filter((o) => o.type === "discard");
    if (dd.length === 0) break;
    status = flow.submit(pr.player, dd[dd.length - 1] as ActionOption);
  }
  const p1opts = optionsFor(status, "p1");
  const canRiichi = p1opts.some((o) => o.type === "riichi");
  const peek = p1opts.find(
    (o) => o.type === "peek_waits" && (o.payload as { target: string }).target === "p0",
  );
  let peekResult = "-";
  if (peek !== undefined) {
    status = flow.submit("p1", peek);
    const st2 = game.engine.state;
    const k = Object.keys(st2.augmentData).find((x) => x.startsWith("view:p1:waits:"));
    const used = Object.keys(st2.augmentData).find((x) => x.includes("peek_riichi_waits:used"));
    peekResult = `대기=${JSON.stringify(k === undefined ? null : st2.augmentData[k])} 소모=${used === undefined ? "?" : String(st2.augmentData[used])}`;
  }
  console.log(
    `${label}\n  p0 노텐리치 성립=true / p1 riichi.blocked=${sealed} / p1 리치버튼=${canRiichi} / 간파=${peekResult}`,
  );
}

console.log("=== 노텐 리치 (공성계) 위에 얹는 것들 ===");
report(["siege_riichi"], []);
report(["siege_riichi", "riichi_seal"], []);
report(["siege_riichi"], ["peek_riichi_waits"]);
report(["siege_riichi", "riichi_seal"], ["peek_riichi_waits"]);
report([], ["peek_riichi_waits"]); // 대조군 — p0는 노텐이라 표준 리치 불가
