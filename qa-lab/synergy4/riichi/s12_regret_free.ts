/**
 * synergy4 / riichi — S12. 미련(regret) × 자유 선언(free_riichi_discard) — synergy3 의심 2.
 *
 * regret은 «멘젠 텐파이면 그 손패 13장을 다음 국 배패로 보존»한다.
 * 판정은 winHandKindsOf(= 규칙 hand.winTileIds)로 하는데, 자유 선언은 그 규칙을
 * **리치 선언 시점의 스냅샷**으로 덮는다. 반면 보존하는 패는 handIdsOf(물리 손패)다.
 * → 스냅샷은 텐파이인데 넘어가는 13장은 노텐일 수 있다.
 *
 * 여기서는 리치 후 자유 선언으로 오름패를 전부 버려 물리 손을 노텐으로 만든 뒤,
 * 두 판정을 같은 상태에서 나란히 잰다.
 */
import { craft, mkGame, setIndicators, withAugments, optionsFor, FlowController, settledOf } from "./lib.js";
import { winHandKindsOf, handIdsOf, kindOf, meldCountOf, winningKinds, scoringOptionsOf } from "@majak/core";
import type { GameState, ActionOption, PlayerId } from "@majak/core";

const P0_HAND = "123m456m789m222p1s9s";

function waits(game: ReturnType<typeof mkGame>, kinds: readonly ReturnType<typeof kindOf>[]): string[] {
  const st = game.engine.state;
  return winningKinds(kinds as never, meldCountOf(st, "p0"), undefined, scoringOptionsOf(st, game.engine.rules, "p0"))
    .map((k) => `${k.suit}${k.rank}`);
}

let s = craft({ hands: { p0: P0_HAND, p1: "*", p2: "*", p3: "*" },
  discards: { p0: "123z", p1: "567z" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
s = setIndicators(s, "3z", "1p");
s = withAugments(s, { p0: ["free_riichi_discard", "regret"] }) as GameState;
const game = mkGame(s);
const flow = new FlowController(game.engine);
let status: unknown = flow.begin();

const r = optionsFor(status, "p0").find((o) => {
  const id = (o.payload as { tileId?: number }).tileId;
  if (id === undefined || o.type !== "riichi") return false;
  const k = game.engine.state.tiles[id]!.kind;
  return k.suit === "sou" && k.rank === 9;
});
if (r === undefined) throw new Error("리치 불가");
status = flow.submit("p0", r as ActionOption);
console.log("리치 선언 완료 (1s 단기)");

function report(tag: string): void {
  const st = game.engine.state;
  const snap = winHandKindsOf(st, game.engine.rules, "p0");
  const phys = handIdsOf(st, "p0").map((id) => kindOf(st, id));
  console.log(`\n[${tag}]`);
  console.log(`  스냅샷 손(hand.winTileIds): ${snap.map((k) => `${k.suit}${k.rank}`).join(" ")}`);
  console.log(`    → 대기 ${JSON.stringify(waits(game, snap))} (텐파이=${waits(game, snap).length > 0})`);
  console.log(`  물리 손(handIdsOf)      : ${phys.map((k) => `${k.suit}${k.rank}`).join(" ")}`);
  console.log(`    → 대기 ${JSON.stringify(waits(game, phys.slice(0, 13)))} (텐파이=${waits(game, phys.slice(0, 13)).length > 0})`);
}
report("리치 직후");

// 자유 선언으로 오름패(1s)와 몸통을 버려 물리 손을 무너뜨린다
for (let round = 0; round < 6; round++) {
  for (let i = 0; i < 12; i++) {
    const st = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (st.kind !== "awaiting") break;
    const pr = st.prompts?.[0];
    if (pr === undefined) break;
    if (pr.player === "p0") break;
    const dd = pr.options.filter((o) => o.type === "discard");
    const pass = pr.options.find((o) => o.type === "pass");
    const o = dd.length > 0 ? dd[dd.length - 1] : pass;
    if (o === undefined) break;
    status = flow.submit(pr.player, o);
  }
  const opts = optionsFor(status, "p0");
  const free = opts.filter((o) => o.type === "free_discard");
  if (free.length === 0) {
    console.log(`\n(free_discard 없음: ${[...new Set(opts.map((o) => o.type))].join(",")})`);
    const dd = opts.filter((o) => o.type === "discard");
    if (dd.length === 0) break;
    status = flow.submit("p0", dd[dd.length - 1] as ActionOption);
    continue;
  }
  // 손패에서 «몸통» 쪽 패를 골라 버린다 (1m부터)
  const st2 = game.engine.state;
  free.sort((a, b) => {
    const ka = st2.tiles[(a.payload as { tileId: number }).tileId]!.kind;
    const kb = st2.tiles[(b.payload as { tileId: number }).tileId]!.kind;
    return `${ka.suit}${ka.rank}`.localeCompare(`${kb.suit}${kb.rank}`);
  });
  status = flow.submit("p0", free[0] as ActionOption);
}
report("자유 선언으로 손을 무너뜨린 뒤");

// --- 유국까지 몰고 가서 regret이 실제로 무엇을 보존하는지 본다
for (let i = 0; i < 400; i++) {
  const st = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
  if (st.kind !== "awaiting") break;
  const pr = st.prompts?.[0];
  if (pr === undefined) break;
  const free = pr.options.filter((o) => o.type === "free_discard");
  const dd = pr.options.filter((o) => o.type === "discard");
  const pass = pr.options.find((o) => o.type === "pass");
  const o = free.length > 0 ? free[free.length - 1] : (dd.length > 0 ? dd[dd.length - 1] : pass);
  if (o === undefined) break;
  status = flow.submit(pr.player, o as ActionOption);
}
{
  const st = game.engine.state;
  const settled = settledOf(game);
  console.log(`\n[유국까지 진행] 상태=${(status as {kind:string}).kind} 벽=${st.zones["wall"]?.tileIds.length}`);
  console.log(`  ROUND_SETTLED: ${settled === null ? "(없음)" : JSON.stringify(settled).slice(0, 500)}`);
  console.log(`  regret 데이터: ${Object.entries(st.augmentData).filter(([k]) => k.includes("regret")).map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 300)}`).join("\n              ") || "(없음)"}`);
}
