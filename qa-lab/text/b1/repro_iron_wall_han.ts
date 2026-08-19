/**
 * 철벽(iron_wall) — "실제로 후리텐 상태에서 론으로 잡아낸 화료에서는 +3판을 얻는다"가
 * 정말 붙는가? 정산 시점의 isFuriten이 화료패가 손에 들어간 뒤로 계산되면 0판이 된다.
 */
import { FlowController, createStandardGameFromState, installAugment, kindKey, standardAugments } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";

const ironWall = standardAugments.find((a: any) => a.id === "iron_wall")!;
const MAN3 = kindKey({ suit: "man", rank: 3 });

function give(state: GameState, player: PlayerId, id: string): GameState {
  return { ...state, players: state.players.map((p) => (p.id === player ? { ...p, augments: [...p.augments, id] } : p)) };
}

function run(label: string, furiten: boolean, iron: boolean): void {
  let s = craft({
    hands: {
      p0: "3m123p456p789p11s7z7z",
      p1: "123m456m789m123p3m",     // 3m 탄키 · 일기통관
      p2: "159m159p159s1234z",
      p3: "147m147p147s1234z",
    },
    ...(furiten ? { discards: { p0: "", p1: "3m", p2: "", p3: "" } as any } : {}),
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  if (iron) s = give(s, "p1", "iron_wall");
  const game = createStandardGameFromState(s);
  if (iron) installAugment(game.engine, ironWall as any, "p1", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  flow.begin();
  const hand = game.engine.state.zones["hand:p0"]!.tileIds;
  const m3 = hand.find((t) => kindKey(game.engine.state.tiles[t]!.kind) === MAN3)!;
  let st: any = flow.submit("p0", { type: "discard", payload: { tileId: m3 } });
  const p1prompt = st.prompts?.find((p: any) => p.player === "p1");
  const canWin = p1prompt?.options.some((o: any) => o.type === "win") ?? false;
  console.log(`${label}: p1 론 가능=${canWin}`);
  if (!canWin) return;
  // 나머지 좌석은 패스
  for (const pr of st.prompts ?? []) {
    if (pr.player === "p1") continue;
    st = flow.submit(pr.player, pr.options.find((o: any) => o.type === "pass"));
  }
  st = flow.submit("p1", { type: "win", payload: {} });
  const settled = [...game.engine.eventLog].reverse().find((e) => e.type === "RoundSettled") as any;
  const info = settled.payload.winInfos?.[0];
  console.log(
    `   deltas=${JSON.stringify(settled.payload.deltas)}  han=${info?.han} fu=${info?.fu} points=${info?.points}` +
      `  yaku=${JSON.stringify(info?.yaku?.map((y: any) => y.id))}\n   augPoints=${JSON.stringify(settled.payload.augPoints ?? [])}`,
  );
}

run("A 후리텐X · 철벽X (평범한 론 — 보너스 없어야 정상)", false, false);
run("B 후리텐O · 철벽X (론 자체가 막혀야 정상)", true, false);
run("C 후리텐O · 철벽O (+3판이 붙어야 한다)", true, true);
run("D 후리텐X · 철벽O (아무것도 안 붙어야 정상)", false, true);
