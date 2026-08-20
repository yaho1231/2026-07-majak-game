/**
 * 의심 6 재검증 — always_tenpai가 `draw.notenExempt` 보유자에게도 2000을 뜯는가.
 *
 * ① 현재 카탈로그에 `draw.notenExempt`를 켜는 증강이 있는가 (도달 가능성)
 * ② 규칙을 강제로 켜면 실제로 뜯는가 (잠재 결함 여부)
 */
import { WALL, RuleLayer, createStandardGameFromState, installAugment, ROUND_SETTLED } from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { alwaysTenpai } from "../../packages/content/src/augments/always_tenpai.js";
import { contentAugments } from "../../packages/content/src/index.js";

const SYS = "__system";
const withAug = (st: GameState, p: PlayerId, ...ids: string[]): GameState => ({
  ...st,
  players: st.players.map((pl) => (pl.id === p ? { ...pl, augments: [...pl.augments, ...ids] } : pl)),
});
const lastSettle = (g: { engine: { eventLog: { type: string; payload: unknown }[] } }): RoundSettledPayload =>
  [...g.engine.eventLog].reverse().find((e) => e.type === ROUND_SETTLED)!.payload as RoundSettledPayload;

// ① 도달 가능성 — 소스 전체에서 draw.notenExempt를 켜는 증강 수
console.log(`① 카탈로그 증강 수 = ${contentAugments.length}`);
console.log(`   'draw.notenExempt'를 켜는 증강 = grep 결과 0건 (packages 전체에서 core의 정의·소비 3줄뿐)`);

// ② 규칙을 강제로 켜서 잠재 결함을 본다 — p1에게만 노텐 면제를 붙인다
function run(exempt: boolean): void {
  const b = craft({ hands: { p0: "1235789m1p1s12z", p1: "1235789p1m1s34z6z", p2: "1235789s2m2p56z7z", p3: "19m19p19s1234567z" }, phase: "turn.draw", turnSeat: 0 });
  const st: GameState = {
    ...withAug(b, "p0", "always_tenpai"),
    zones: { ...b.zones, [WALL]: { ...b.zones[WALL]!, tileIds: [] } },
  };
  const g = createStandardGameFromState(st);
  installAugment(g.engine, alwaysTenpai, "p0");
  if (exempt) {
    g.engine.rules.addModifier("draw.notenExempt", {
      source: "qa:exempt:p1",
      layer: RuleLayer.Prism,
      apply: (cur, c) => ((c as { playerId?: string }).playerId === "p1" ? true : cur),
    });
  }
  const r = g.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
  const p = lastSettle(g as never);
  console.log(`   exempt(p1)=${String(exempt)} ok=${r.ok} tenpai=${JSON.stringify(p.tenpaiPlayers)} deltas=${JSON.stringify(p.deltas)} augPoints=${JSON.stringify(p.augPoints)}`);
}
console.log("② 규칙 강제 주입");
run(false);
run(true);
