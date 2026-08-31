/**
 * synergy4 / riichi — S1. 리치 판수·뒷도라·일발이 겹칠 때의 스택.
 *
 * 장면: p0 텐파이(1s 단기, 222p 3장) → 리치 계열 선언 → p1이 곧바로 1s를 버려 p0 론.
 *       뒷도라 표시패 1p = 222p 뒷도라 3장. 선언 직후 론이므로 **일발**이 붙는다.
 *
 * 재는 축:
 *   A no_retreat      리치·일발 각 2판 · 뒷도라 장당 2판
 *   B late_double     7순까지 더블(2판) + 그 더블에 +1판
 *   C riichi_upgrade  언제나 더블(+ 자연 더블이면 트리플 4판) · 하가 리치 봉인
 *   S stealth_riichi  보이지 않는 리치 (리치 1판·일발·뒷도라, 공탁 0)
 *   D open_riichi_reveal  리치를 3판 취급(리치자에게서 론 / 쯔모)
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, withRiichi,
  optionsFor, settledOf, winRow, table, FlowController, drive,
} from "./lib.js";
import type { GameState, ActionOption, PlayerId } from "@majak/core";

const P0_HAND = "123m456m789m222p1s9s";
const P1_HAND = "234m567m234p55z2s3s";

function scene(p0augs: string[], p1riichi: boolean): GameState {
  let s = craft({
    hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  s = stackWall(s, ["1s"]);
  s = withAugments(s, { p0: p0augs });
  return p1riichi ? withRiichi(s, "p1") : s;
}

export function run(
  p0augs: string[],
  riichiAction: string | null,
  opts: { p1riichi?: boolean } = {},
): ReturnType<typeof winRow> {
  const st = scene(p0augs, opts.p1riichi ?? false);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const is9s = (o: ActionOption): boolean => {
    const id = (o.payload as { tileId?: number }).tileId;
    if (id === undefined) return false;
    const k = game.engine.state.tiles[id]!.kind;
    return k.suit === "sou" && k.rank === 9;
  };
  const opt = optionsFor(status, "p0").find(
    (o) => o.type === (riichiAction ?? "discard") && is9s(o),
  );
  if (opt === undefined) {
    throw new Error(
      `p0가 ${riichiAction ?? "discard"} 불가; 있는 것: ${[...new Set(optionsFor(status, "p0").map((o) => o.type))].join(",")}`,
    );
  }
  status = flow.submit("p0", opt);
  for (let i = 0; i < 10; i++) {
    const s = status as { kind: string; prompts?: { player: string; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const pr = s.prompts?.find((x) => x.options.some((o) => o.type === "pass"));
    if (pr === undefined) break;
    status = flow.submit(pr.player as PlayerId, pr.options.find((o) => o.type === "pass") as ActionOption);
  }
  const d = optionsFor(status, "p1").find((o) => {
    const id = (o.payload as { tileId?: number }).tileId;
    if (id === undefined || o.type !== "discard") return false;
    const k = game.engine.state.tiles[id]!.kind;
    return k.suit === "sou" && k.rank === 1;
  });
  if (d === undefined) throw new Error("p1이 1s를 못 버린다");
  status = flow.submit("p1", d);
  drive(game, flow, status, { winFor: ["p0"] });
  const settled = settledOf(game);
  if (settled === null) throw new Error("no settle");
  return winRow(settled, "p0");
}

function main(): void {
  const rows: Record<string, ReturnType<typeof winRow>> = {};
  const t = (k: string, a: string[], act: string | null, o = {}): void => {
    try { rows[k] = run(a, act, o); } catch (e) { console.log(`!! ${k}: ${(e as Error).message}`); }
  };

  // --- 기준선 (p1 비리치, 그냥 론)
  t("0 없음(표준 리치)", [], "riichi");
  t("A no_retreat", ["no_retreat"], "no_retreat_riichi");
  t("B late_double", ["late_double"], "riichi");
  t("C riichi_upgrade", ["riichi_upgrade"], "riichi");
  t("S stealth_riichi", ["stealth_riichi"], "stealth_riichi");
  t("A+B", ["no_retreat", "late_double"], "no_retreat_riichi");
  t("A+C", ["no_retreat", "riichi_upgrade"], "no_retreat_riichi");
  t("B+C", ["late_double", "riichi_upgrade"], "riichi");
  t("A+B+C", ["no_retreat", "late_double", "riichi_upgrade"], "no_retreat_riichi");
  // 스텔스 + 값 카드 (conflicts 아닌 것만: A, B)
  t("A+S (stealth로 선언)", ["no_retreat", "stealth_riichi"], "stealth_riichi");
  t("A+S (no_retreat로 선언)", ["no_retreat", "stealth_riichi"], "no_retreat_riichi");
  t("B+S", ["late_double", "stealth_riichi"], "stealth_riichi");
  t("A+B+S", ["no_retreat", "late_double", "stealth_riichi"], "stealth_riichi");

  // --- 오픈 리치의 «3판 취급» 경로 = 리치자에게서 론 (역만이 아님)
  t("0' 표준리치(p1리치)", [], "riichi", { p1riichi: true });
  t("D open_riichi(p1리치)", ["open_riichi_reveal"], "open_riichi", { p1riichi: true });
  t("D+B(p1리치)", ["open_riichi_reveal", "late_double"], "open_riichi", { p1riichi: true });
  t("D+C(p1리치)", ["open_riichi_reveal", "riichi_upgrade"], "open_riichi", { p1riichi: true });
  t("D+A(p1리치)", ["open_riichi_reveal", "no_retreat"], "no_retreat_riichi", { p1riichi: true });
  t("D+A(open으로 선언,p1리치)", ["open_riichi_reveal", "no_retreat"], "open_riichi", { p1riichi: true });
  t("D+B+C(p1리치)", ["open_riichi_reveal", "late_double", "riichi_upgrade"], "open_riichi", { p1riichi: true });

  // --- soul_hunt: 내가 이미 리치일 때 겹쳐 붙지 않아야 한다
  t("H soul_hunt 다마텐(p1리치)", ["soul_hunt"], null, { p1riichi: true });
  t("H+내리치(p1리치)", ["soul_hunt"], "riichi", { p1riichi: true });
  t("H+S 스텔스(p1리치)", ["soul_hunt", "stealth_riichi"], "stealth_riichi", { p1riichi: true });
  t("H+A(p1리치)", ["soul_hunt", "no_retreat"], "no_retreat_riichi", { p1riichi: true });
  t("H 다마텐+A(p1리치)", ["soul_hunt", "no_retreat"], null, { p1riichi: true });
  t("H 다마텐+B(p1리치)", ["soul_hunt", "late_double"], null, { p1riichi: true });
  t("0d 다마텐(증강없음)", [], null);
  t("0d 다마텐(증강없음,p1리치)", [], null, { p1riichi: true });
  t("I hidden_blade 다마텐", ["hidden_blade"], null);
  t("I+A 다마텐", ["hidden_blade", "no_retreat"], null);
  t("I+B 다마텐", ["hidden_blade", "late_double"], null);
  t("I+리치", ["hidden_blade"], "riichi");
  t("I+S 스텔스", ["hidden_blade", "stealth_riichi"], "stealth_riichi");

  console.log(table(rows));
}

if (process.argv[1]?.endsWith("s1_value_stack.ts")) main();
