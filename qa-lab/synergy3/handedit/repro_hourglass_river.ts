/**
 * 뒤집힌 모래시계(hourglass) × 날치기(pond_snatch) / 정적의 손(silent_swap)
 *
 * 기대(먼저 적는다):
 *   hourglass: "남은 **영상패(최대 4장)** 를 나 혼자 연속으로 쯔모한다."
 *   → 연장 중 보유자의 쯔모는 **최대 4번**이어야 한다.
 *   날치기·정적의 손은 detail 에 "그 순의 쯔모패는 **패산 맨 밑으로** 가고"라고 적혀 있다
 *   (= 바닥의 패 1장이 패산으로 옮겨져 패산이 1장 늘어난다).
 *   연장은 "패산이 마르면 끝"으로 구현돼 있으므로, 연장 중에 이 둘을 쓰면
 *   솔로 쯔모가 4번을 넘어간다 → 두 카드의 문구가 어긋난다.
 *   대조군: (모래시계만) vs (모래시계 + 날치기) 의 **연장 중 보유자 쯔모 횟수**.
 */
import {
  FlowController,
  WALL,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState } from "@majak/core";
import { hourglass } from "../../../packages/content/src/augments/hourglass.js";
import { pondSnatch } from "../../../packages/content/src/augments/pond_snatch.js";
import { silentSwap } from "../../../packages/content/src/augments/silent_swap.js";
import { craft, withAugments, wallLen, deadLen, check, section, done } from "./lib.js";

function trimWall(s: GameState, n: number): GameState {
  const ids = s.zones[WALL]?.tileIds ?? [];
  const p3 = s.zones["discards:p3"];
  return {
    ...s,
    zones: {
      ...s.zones,
      [WALL]: { ...(s.zones[WALL] as never), tileIds: ids.slice(0, n) },
      "discards:p3": { ...(p3 as never), tileIds: [...(p3?.tileIds ?? []), ...ids.slice(n)] },
    },
  };
}

function scene(augs: string[]): GameState {
  const base = craft({
    hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
    // 상대 바닥에 주울 패를 넉넉히 깔아 둔다
    discards: { p0: "1z", p1: "2z3z4z5z6z7z", p2: "1m2m3m4m5m6m", p3: "1p2p3p4p5p6p" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return trimWall(withAugments(base, { p0: augs }), 1);
}

const DEFS = { hourglass, pond_snatch: pondSnatch, silent_swap: silentSwap } as const;

function run(label: string, augs: (keyof typeof DEFS)[], useRiver: string | null): void {
  const game = createStandardGameFromState(scene(augs));
  for (const a of augs) {
    installAugment(game.engine, DEFS[a], "p0", { yaku: game.yaku, catalog: game.augments });
  }
  // 보유자의 쯔모를 센다
  let draws = 0;
  let extending = false;
  const flow = new FlowController(game.engine);
  let st = flow.begin();
  let steps = 0;
  let lastSeen: number | null = null;
  const log: string[] = [];
  while (st.kind === "awaiting" && steps < 300) {
    steps++;
    const prompt = st.prompts[0];
    if (prompt === undefined) break;
    const s = game.engine.state;
    if (game.engine.state.augmentData[`hourglass:opened:1-1-0:p0#round`] === true) {
      extending = true;
    }
    const opts = prompt.options;
    // 연장 중이면 강에서 가져오는 액션을 우선 사용
    if (extending && useRiver !== null) {
      const hit = opts.find((o) => o.type === useRiver);
      if (hit !== undefined) {
        log.push(`${prompt.player}:${useRiver}`);
        st = flow.submit(prompt.player, hit as never);
        continue;
      }
    }
    if (extending && prompt.player === "p0" && s.round.phase === "turn.act" && s.round.lastDrawnTile !== lastSeen) {
      draws++;
      lastSeen = s.round.lastDrawnTile;
    }
    const drawn = s.round.lastDrawnTile;
    const tsumogiri = opts.find(
      (o) => o.type === "discard" && (o.payload as { tileId?: number })?.tileId === drawn,
    );
    const pick = tsumogiri ?? opts.find((o) => o.type === "discard") ?? opts.find((o) => o.type === "pass") ?? opts[0];
    if (pick === undefined) break;
    if (pick.type !== "pass") log.push(`${prompt.player}:${pick.type}`);
    st = flow.submit(prompt.player, pick as never);
  }
  const after = game.engine.state;
  console.log(`\n  · ${label}`);
  console.log(`    결과=${st.kind === "roundOver" ? st.outcome : st.kind} · 연장 중 p0 쯔모 = ${draws}회`);
  console.log(`    WALL=${wallLen(after)} DEAD=${deadLen(after)}`);
  console.log(`    로그 = ${log.join(" ")}`);
  return;
}

section("모래시계 연장 길이 — 강에서 패를 가져오면 늘어나는가");
run("A: 모래시계만", ["hourglass"], null);
run("A+B: 모래시계 + 날치기(연장 중 사용)", ["hourglass", "pond_snatch"], "pond_snatch");
run("A+C: 모래시계 + 정적의 손(연장 중 사용)", ["hourglass", "silent_swap"], "silent_take");

check("위 세 칸의 '연장 중 p0 쯔모' 횟수를 대조 (설명은 최대 4장)", true, "판정은 보고서에서");
done();
