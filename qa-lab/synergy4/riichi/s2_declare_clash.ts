/**
 * synergy4 / riichi — S2. 리치 «선언 버튼»이 여러 장일 때.
 *
 * 리치를 선언하는 액션을 가진 증강: no_retreat(no_retreat_riichi) ·
 * open_riichi_reveal(open_riichi) · all_or_nothing(all_in_riichi) ·
 * soul_strike(soul_strike) · stealth_riichi(stealth_riichi).
 * 리치는 국당 한 번뿐이므로 여러 장을 들면 그 국에 하나만 쓸 수 있다.
 *
 * 재는 것:
 *  (1) 같은 순에 몇 개가 동시에 제시되는가
 *  (2) 하나를 쓰면 나머지의 «남은 횟수»가 줄어드는가(= 조용히 소모되는가)
 *  (3) 하나를 쓴 뒤 나머지 버튼이 화면에서 사라지는가
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments,
  optionsFor, FlowController,
} from "./lib.js";
import type { GameState, ActionOption } from "@majak/core";

const P0_HAND = "123m456m789m222p1s9s";
const P1_HAND = "234m567m234p55z2s3s";

const DECLARERS = ["no_retreat", "open_riichi_reveal", "all_or_nothing", "soul_strike", "stealth_riichi"];
const ACTIONS = ["riichi", "no_retreat_riichi", "open_riichi", "all_in_riichi", "soul_strike", "stealth_riichi"];

function scene(p0augs: string[]): GameState {
  let s = craft({
    hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  s = stackWall(s, ["1s"]);
  return withAugments(s, { p0: p0augs });
}

/** 증강 데이터(남은 횟수 등) 스냅샷 */
function augData(st: GameState): Record<string, unknown> {
  const d = (st as unknown as { augmentData?: Record<string, unknown> }).augmentData ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (DECLARERS.some((id) => k.includes(id))) out[k] = v;
  }
  return out;
}

function declareTypes(status: unknown): string[] {
  return [...new Set(optionsFor(status, "p0").map((o) => o.type))].filter((t) => ACTIONS.includes(t));
}

function probe(augs: string[], useAction: string | null): void {
  const game = mkGame(scene(augs));
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const before = declareTypes(status);
  const dataBefore = augData(game.engine.state);
  console.log(`\n### [${augs.join(" + ") || "없음"}]`);
  console.log(`  제시된 선언 버튼: ${before.join(", ")}`);
  if (useAction === null) return;
  const is9s = (o: ActionOption): boolean => {
    const id = (o.payload as { tileId?: number }).tileId;
    if (id === undefined) return false;
    const k = game.engine.state.tiles[id]!.kind;
    return k.suit === "sou" && k.rank === 9;
  };
  const opt = optionsFor(status, "p0").find((o) => o.type === useAction && is9s(o));
  if (opt === undefined) { console.log(`  !! ${useAction} 없음`); return; }
  status = flow.submit("p0", opt);
  const dataAfter = augData(game.engine.state);
  const changed: string[] = [];
  for (const k of new Set([...Object.keys(dataBefore), ...Object.keys(dataAfter)])) {
    const a = JSON.stringify(dataBefore[k]), b = JSON.stringify(dataAfter[k]);
    if (a !== b) changed.push(`${k}: ${a ?? "-"} -> ${b ?? "-"}`);
  }
  console.log(`  «${useAction}» 사용 후 데이터 변화:`);
  for (const c of changed) console.log(`    ${c}`);
  // 내 다음 순까지 진행해 남은 버튼을 본다
  for (let i = 0; i < 12; i++) {
    const s = status as { kind: string; prompts?: { player: string; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const mine = s.prompts?.find((x) => x.player === "p0");
    if (mine !== undefined && mine.options.some((o) => o.type === "discard" || ACTIONS.includes(o.type))) {
      console.log(`  다음 내 순의 선언 버튼: ${[...new Set(mine.options.map((o) => o.type))].filter((t) => ACTIONS.includes(t)).join(", ") || "(없음)"}`);
      break;
    }
    const pr = s.prompts?.[0];
    if (pr === undefined) break;
    const pass = pr.options.find((o) => o.type === "pass");
    const disc = pr.options.filter((o) => o.type === "discard");
    const pick = pass ?? disc[disc.length - 1];
    if (pick === undefined) break;
    status = flow.submit(pr.player as never, pick);
  }
}

for (const id of DECLARERS) probe([id], null);
probe(["no_retreat", "open_riichi_reveal"], null);
probe(["no_retreat", "open_riichi_reveal", "all_or_nothing", "soul_strike"], null);
probe(["no_retreat", "stealth_riichi"], null);
// 하나 쓰면 나머지가 소모되는가
probe(["no_retreat", "open_riichi_reveal", "all_or_nothing", "soul_strike"], "no_retreat_riichi");
probe(["no_retreat", "open_riichi_reveal", "all_or_nothing", "soul_strike"], "soul_strike");
probe(["no_retreat", "open_riichi_reveal", "all_or_nothing", "soul_strike"], "riichi");
probe(["no_retreat", "stealth_riichi"], "stealth_riichi");
