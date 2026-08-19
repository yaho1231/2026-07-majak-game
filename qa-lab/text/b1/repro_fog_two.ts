/**
 * 안개 덮인 바닥(hidden_river) — "보유자는 모든 플레이어의 버림패를 정상적으로 확인할 수 있다",
 * "보유자만 네 개의 바닥을 그대로 읽는다".
 * 두 사람이 같은 증강을 들고 둘 다 선언하면 서로의 안개에 갇혀 보유자도 못 읽는다.
 */
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { hiddenRiver } from "../../../packages/content/src/augments/hidden_river.js";
import { roundKey } from "../../../packages/content/src/util.js";

function give(state: GameState, ids: PlayerId[]): GameState {
  return { ...state, players: state.players.map((p) => (ids.includes(p.id) ? { ...p, augments: [...p.augments, "hidden_river"] } : p)) };
}

function probe(holders: PlayerId[], declared: PlayerId[]): void {
  let s = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  s = give(s, holders);
  const rk = roundKey(s);
  const data: Record<string, unknown> = {};
  for (const h of declared) data[`hidden_river:fog:${rk}:${h}`] = true;
  s = { ...s, augmentData: { ...s.augmentData, ...data } };
  const game = createStandardGameFromState(s);
  for (const h of holders) installAugment(game.engine, hiddenRiver, h, { yaku: game.yaku });
  const view = (viewer: PlayerId): unknown =>
    game.engine.rules.resolve("visibility.discards", { playerId: viewer, state: game.engine.state, zoneOwner: "p2" });
  console.log(
    `보유=${holders.join("+")} 선언=${declared.join("+")} → ` +
      `p0가 보는 p2 바닥: ${JSON.stringify(view("p0"))} | p1: ${JSON.stringify(view("p1"))} | p3: ${JSON.stringify(view("p3"))}`,
  );
}

probe(["p0"], ["p0"]);            // 정상: 보유자 p0은 그대로, 나머지는 최근 6장
probe(["p0", "p1"], ["p0"]);      // p1도 보유자지만 아직 선언 전 → 안개에 갇힌다(설계상 당연)
probe(["p0", "p1"], ["p0", "p1"]); // 둘 다 선언 → 서로의 안개에 갇힌다

// ── 진짜 선언으로 재현 (augmentData를 직접 안 만진다) ──────────────────────
{
  const { FlowController } = await import("@majak/core");
  let s = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  s = give(s, ["p0", "p1"]);
  const game = createStandardGameFromState(s);
  for (const h of ["p0", "p1"] as PlayerId[]) installAugment(game.engine, hiddenRiver, h, { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  let cur: any = flow.begin();
  const see = (viewer: PlayerId): unknown =>
    game.engine.rules.resolve("visibility.discards", { playerId: viewer, state: game.engine.state, zoneOwner: "p2" });
  let guard = 0;
  const declared: PlayerId[] = [];
  while (cur.kind === "awaiting" && guard++ < 40 && declared.length < 2) {
    const p = cur.prompts[0];
    const fog = p.options.find((o: any) => o.type === "declare_fog");
    if (fog !== undefined && (p.player === "p0" || p.player === "p1")) {
      cur = flow.submit(p.player, fog);
      declared.push(p.player);
      console.log(`\n${p.player} 실제 선언 → p0가 보는 p2 바닥: ${JSON.stringify(see("p0"))}, p1: ${JSON.stringify(see("p1"))}`);
      continue;
    }
    const d = p.options.find((o: any) => o.type === "discard") ?? p.options.find((o: any) => o.type === "pass") ?? p.options[0];
    cur = flow.submit(p.player, d);
  }
}
