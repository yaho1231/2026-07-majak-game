/**
 * 숨은 칼날(hidden_blade, "리치를 선언하지 않은 **멘젠** 론에 +2판 + 뒷도라") ×
 * 묵계(silent_pact, "이 증강으로 부른 퐁 1회만 멘젠이 유지된다").
 *
 * 기대: 묵계 퐁은 코어가 멘젠으로 세므로(openMeldCountOf가 silent를 뺀다)
 *       **눈에 보이는 커쯔가 깔린 손에도** 숨은 칼날의 +2판과 뒷도라가 붙는다.
 *       카드 두 장 중 어느 쪽도 이 조합을 말하지 않는다.
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, optionsFor,
  settledOf, winRow, table, FlowController, drive,
} from "./lib.js";
import type { ActionOption, GameState, PlayerId, Meld } from "@majak/core";

function scene(augs: string[], meld: "none" | "pon" | "silent"): GameState {
  let s = craft({
    hands: {
      p0: meld === "none" ? "123m456m789m222p1s" : "123m456m222p1s",
      p1: "1s234567m123p44z",
      p2: "*",
      p3: "*",
    },
    ...(meld === "none"
      ? {}
      : { melds: { p0: [{ kind: "pon" as Meld["kind"], spec: "555z", from: "p1" as PlayerId }] } }),
    discards: { p0: "123z", p1: "467z" },
    phase: "turn.act",
    turnSeat: 1,
  });
  s = setIndicators(s, "3z", "1p");
  if (meld === "silent") {
    const rs = s.round.byPlayer["p0"]!;
    s = {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: { ...rs, melds: rs.melds.map((m) => ({ ...m, silent: true })) },
        },
      },
    };
  }
  s = stackWall(s, ["1z"]);
  return withAugments(s, { p0: augs });
}

function run(augs: string[], meld: "none" | "pon" | "silent"): ReturnType<typeof winRow> {
  const st = scene(augs, meld);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  // p1이 1s를 버린다
  for (let i = 0; i < 6; i++) {
    const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const pr = s.prompts?.find((x) => x.player === "p1" && x.options.some((o) => o.type === "discard"));
    if (pr !== undefined) {
      const d = pr.options.find((o) => {
        const k = game.engine.state.tiles[(o.payload as { tileId: number }).tileId]!.kind;
        return o.type === "discard" && k.suit === "sou" && k.rank === 1;
      });
      if (d === undefined) throw new Error("p1이 1s를 못 버린다");
      status = flow.submit("p1", d);
      break;
    }
    const p = s.prompts?.[0];
    if (p === undefined) break;
    const pass = p.options.find((o) => o.type === "pass");
    if (pass === undefined) break;
    status = flow.submit(p.player, pass);
  }
  drive(game, flow, status, { winFor: ["p0"] });
  const settled = settledOf(game);
  return settled === null ? null : winRow(settled, "p0");
}

const rows: Record<string, ReturnType<typeof winRow>> = {};
rows["멘젠 · 증강 없음"] = run([], "none");
rows["멘젠 · hidden_blade"] = run(["hidden_blade"], "none");
rows["일반 퐁 · 증강 없음"] = run([], "pon");
rows["일반 퐁 · hidden_blade"] = run(["hidden_blade"], "pon");
rows["묵계 퐁 · 증강 없음"] = run(["silent_pact"], "silent");
rows["묵계 퐁 · hidden_blade"] = run(["silent_pact", "hidden_blade"], "silent");
console.log(table(rows));
