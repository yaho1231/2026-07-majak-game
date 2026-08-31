/**
 * 멘젠(menzen) 축 — «울고도 멘젠» 카드와 멘젠 보상 카드가 겹칠 때.
 *   silent_pact  : 국 1회, 멘젠이 유지되는 펑
 *   hidden_blade : 리치 안 건 «멘젠» 론에 +2판 + 뒷도라
 *   no_ron_pact  : 첫 6순 론 면역 — 단 «멘쯔가 하나라도» 생기면 파기
 *   meld_dissolve: 후로 하나 해체
 *
 * 장면: p1이 白(5z)을 버린다 → p0가 펑(표준 또는 묵계) → p0 버림 → p2가 7p를 버려 p0 론.
 * 예측:
 *   표준 펑            : 후로 손 · 역패 1판 · 리치 불가 · hidden_blade 무효
 *   묵계 펑            : 멘젠 유지 · 리치 가능 · hidden_blade +2판 + 뒷도라
 *   묵계 + 불가침 조약 : 묵계 펑도 «멘쯔»라 조약 파기 (카드 설명대로)
 */
import {
  craft, mkGame, withAugments, optionsFor, has, pick, settledOf, winRow,
  FlowController, setIndicators, tileOf,
} from "./lib.js";
import type { ActionOption, GameState, PlayerId } from "@majak/core";

const P0 = "5z5z234m567m234p5p6p"; // 13장 — 白 펑 후 4p/7p 대기
const P1 = "5z" + "1199m1199p22z3z4z"; // 14장 (5z를 버린다)
const P2 = "7p" + "1188m1188s22z3z"; // 13장 (7p를 버린다)

interface Res { readonly [k: string]: unknown }

function run(label: string, augs: string[], mode: "std" | "silent" | "none", dissolveAfter = false): void {
  let s: GameState = craft({
    hands: { p0: P0, p1: P1, p2: P2, p3: "*" },
    discards: { p0: "6z", p1: "6z", p2: "6z", p3: "6z" },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  s = setIndicators(s, "1z", "4p"); // 뒷도라 표시 4p → 우라는 5p (p0에 1장)
  s = withAugments(s, { p0: augs });
  const game = mkGame(s);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const sub = (p: PlayerId, o: ActionOption): void => { status = flow.submit(p, o); };

  // p1이 5z를 버린다
  const z = tileOf(game.engine.state, "p1", "5z");
  sub("p1", pick(status, "p1", "discard", (pl) => (pl["tileId"] as number) === z));

  const notes: string[] = [];
  if (mode !== "none") {
    const type = mode === "silent" ? "silent_pon" : "pon";
    if (!has(status, "p0", type)) { console.log(`${label}: ${type} 후보 없음`); return; }
    sub("p0", pick(status, "p0", type));
  } else {
    // 울지 않는다
    for (const pr of (status as { prompts?: { player: PlayerId; options: ActionOption[] }[] }).prompts ?? []) {
      const pass = pr.options.find((o) => o.type === "pass");
      if (pass !== undefined) sub(pr.player, pass);
    }
  }

  if (dissolveAfter) {
    if (has(status, "p0", "dissolve_meld")) {
      sub("p0", pick(status, "p0", "dissolve_meld"));
      notes.push("파혼 실행");
    } else notes.push("파혼 후보 없음");
  }

  // 펑 직후 p0 차례 — 리치 가능한가 (멘젠 여부의 실측 신호)
  const riichiOk = has(status, "p0", "riichi");
  notes.push(`리치가능=${riichiOk}`);
  for (let i = 0; i < 20; i++) {
    const st = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (st.kind !== "awaiting") break;
    const p0p = st.prompts?.find((p) => p.player === "p0");
    const win = p0p?.options.find((o) => o.type === "win");
    if (win !== undefined) { sub("p0", win); break; }
    const p2p = st.prompts?.find((p) => p.player === "p2");
    if (p2p !== undefined) {
      const sevenP = p2p.options.find(
        (o) => o.type === "discard" &&
          game.engine.state.tiles[(o.payload as { tileId: number }).tileId]!.kind.suit === "pin" &&
          game.engine.state.tiles[(o.payload as { tileId: number }).tileId]!.kind.rank === 7,
      );
      if (sevenP !== undefined) { sub("p2", sevenP); continue; }
    }
    const pr = st.prompts?.[0];
    if (pr === undefined) break;
    const o = pr.options.find((x) => x.type === "pass")
      ?? pr.options.filter((x) => x.type === "discard").at(-1)
      ?? pr.options[0];
    if (o === undefined) break;
    sub(pr.player, o);
  }
  const settled = settledOf(game);
  const r = settled === null ? null : winRow(settled, "p0");
  console.log(
    `${label.padEnd(30)} | ${notes.join(" ")} | ` +
    (r === null ? "화료 없음" :
      `han=${r.han} fu=${r.fu} ura=${r.uraHan} 역=${r.yaku.join(",")} pts=${r.points}`),
  );
}

run("펑 없음 (참고)", [], "none");
run("표준 펑", [], "std");
run("S 묵계 펑", ["silent_pact"], "silent");
run("HB hidden_blade + 표준 펑", ["hidden_blade"], "std");
run("HB + S 묵계 펑", ["hidden_blade", "silent_pact"], "silent");
run("S + 파혼(묵계 펑 해체)", ["silent_pact", "meld_dissolve"], "silent", true);
run("표준 펑 + 파혼", ["meld_dissolve"], "std", true);
run("HB + 파혼(표준 펑 해체)", ["hidden_blade", "meld_dissolve"], "std", true);
