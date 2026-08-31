/**
 * open_kokushi(우는 국사무쌍) 커밋 뒤, 다른 «펑» 카드들의 버튼이 어떻게 되는가.
 *
 * open_kokushi는 kokushi_pon을 한 번 하면 call.pon/chi/kan.enabled 를 전부 false로
 * 눌러 «국사 외길»을 강제한다. silent_pact·bluff_pretense의 validate는 그 규칙을
 * 존중하지만, **후보 노출(holderReactionOptions)은 그 규칙을 보지 않는다** —
 * 그러면 눌러도 반려되는 버튼이 남는다(찬탈자가 명시적으로 없앤 그 문제).
 */
import { craft, mkGame, withAugments, optionsFor, FlowController } from "./lib.js";
import type { GameState } from "@majak/core";

function run(label: string, augs: string[], committed: boolean): void {
  let s: GameState = craft({
    hands: { p0: "5z5z6z6z7z9m9p2m3m4m5m6m7m", p1: "*", p2: "*", p3: "*" },
    melds: committed ? { p0: [{ kind: "kokushi_pon" as never, spec: "1m1p1s", from: "p1" }] } : {},
    discards: { p0: "4z", p1: "4z", p2: "4z", p3: "4z" },
    phase: "reaction",
    turnSeat: 3,
    lastDiscard: { player: "p3", spec: "5z" },
  });
  s = withAugments(s, { p0: augs });
  const game = mkGame(s);
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  const opts = optionsFor(status, "p0").filter(
    (o) => o.type === "pon" || o.type === "silent_pon" || o.type === "bluff_pon" || o.type === "kokushi_pon",
  );
  // 실제로 눌러 보고 반려되는지 확인
  const results = opts.map((o) => {
    try { flow.submit("p0", o); return `${o.type}=OK`; }
    catch (e) { return `${o.type}=거부(${e instanceof Error ? e.message.slice(0, 40) : ""})`; }
  });
  console.log(`${label.padEnd(40)} | 버튼: ${opts.map((o) => o.type).join(",") || "(없음)"} | 제출: ${results.join(" ") || "-"}`);
}

run("K only / 커밋 전", ["open_kokushi"], false);
run("K only / 커밋 후", ["open_kokushi"], true);
run("K+silent_pact / 커밋 후", ["open_kokushi", "silent_pact"], true);
run("K+bluff_pretense / 커밋 후", ["open_kokushi", "bluff_pretense"], true);
run("silent_pact 단독 / (참고)", ["silent_pact"], false);
