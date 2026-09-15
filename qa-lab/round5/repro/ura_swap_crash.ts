/**
 * 운영 크래시 재현 — 이면투시(ura_peek) 바꿔치기(ura_swap) 뒤
 * 「Turn player pN has no legal actions」로 판이 죽는다.
 *
 *   2026-09-15T13:28:37Z room X25Z4Q (반장전·사람 4명) p2
 *   2026-09-06T08:52:57Z room FERBGU (체험) p0
 *
 * 리플레이(JSONL)를 `reconstructGame`으로 마지막 확정 이벤트(seq 616: p2 TileDrawn 105)
 * 까지 되살린 뒤, 운영에서 p2가 눌렀던 것과 같은 `ura_swap`을 FlowController에 넣어
 * 같은 예외가 나는지 본다. 어느 손패를 골랐는지는 파일에 없으므로(예외로 이벤트가
 * 기록되기 전에 죽었다) **쯔모패 / 쯔모패 아닌 패** 두 갈래를 다 넣어 본다.
 *
 * 실행 (워크트리 루트, workspace 링크를 먼저 만든 뒤):
 *   ~/majak/node_modules/.bin/tsx qa-lab/round5/repro/ura_swap_crash.ts [리플레이 경로]
 *
 * 리플레이 원본은 운영 서버 `.majak/replays/` 아래의 X25Z4Q_2026-09-15T13-12-38-961Z.jsonl
 * 이다(사람 닉네임이 들어 있어 저장소에는 넣지 않는다).
 */

import { readFileSync } from "node:fs";
import {
  FlowController,
  handIdsOf,
  kindKey,
  kindOf,
  uraIndicatorIds,
} from "@majak/core";
import type { ActionOption, GameState, PlayerId, TileId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { reconstructGame } from "@majak/server/src/ReplayReader.js";

const DEFAULT_PATH =
  "/private/tmp/claude-501/-Users-skul-majak--claude-worktrees-mahjong-qa-plan-85aa99/" +
  "bf2b76d4-1657-4eb4-b156-cdd71ab006e3/scratchpad/prod/X25Z4Q_2026-09-15T13-12-38-961Z.jsonl";
const path = process.argv[2] ?? DEFAULT_PATH;
const UPTO_SEQ = Number(process.argv[3] ?? 616);
const ACTOR: PlayerId = (process.argv[4] as PlayerId | undefined) ?? "p2";

const lines = readFileSync(path, "utf-8")
  .split(/\r?\n/)
  .filter((l) => l.trim().length > 0)
  .filter((l, i) => {
    if (i === 0) return true;
    const seq = (JSON.parse(l) as { seq: number }).seq;
    return seq <= UPTO_SEQ;
  });

function describe(state: GameState, who: PlayerId): void {
  const hand = handIdsOf(state, who);
  const rs = state.round.byPlayer[who];
  const player = state.players.find((p) => p.id === who);
  console.log(`phase=${state.round.phase} turnSeat=${state.round.turnSeat} lastEventSeq=${state.lastEventSeq}`);
  console.log(`${who} augments=${JSON.stringify(player?.augments)} riichi=${JSON.stringify(rs?.riichi)}`);
  console.log(
    `${who} hand(${hand.length})=` +
      hand.map((id) => `${id}:${kindKey(kindOf(state, id))}`).join(" "),
  );
  console.log(
    `lastDrawnTile=${state.round.lastDrawnTile} (${
      state.round.lastDrawnTile === null ? "-" : kindKey(kindOf(state, state.round.lastDrawnTile))
    }) inHand=${state.round.lastDrawnTile !== null && hand.includes(state.round.lastDrawnTile)}`,
  );
  const ura = uraIndicatorIds(state);
  console.log(`uraIndicators=${ura.map((id) => `${id}:${kindKey(kindOf(state, id))}`).join(" ")}`);
  for (const [k, v] of Object.entries(state.augmentData)) {
    if (k.includes("ura_peek") || k.includes(":ura")) console.log(`  augmentData ${k} = ${JSON.stringify(v)}`);
  }
}

function attempt(label: string, pick: (opts: ActionOption[], state: GameState) => ActionOption | undefined): void {
  console.log(`\n=== ${label} ===`);
  const { game } = reconstructGame(lines, { extraAugments: contentAugments });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") {
    console.log(`begin() → ${status.kind} (프롬프트 없음)`);
    return;
  }
  const prompt = status.prompts.find((p) => p.player === ACTOR);
  if (prompt === undefined) {
    console.log(`프롬프트에 ${ACTOR} 없음: ${status.prompts.map((p) => p.player).join(",")}`);
    return;
  }
  const types = new Map<string, number>();
  for (const o of prompt.options) types.set(o.type, (types.get(o.type) ?? 0) + 1);
  console.log(`${ACTOR} 옵션: ${[...types].map(([t, n]) => `${t}×${n}`).join(" ")} auto=${prompt.auto ?? false}`);
  const option = pick(prompt.options, game.engine.state);
  if (option === undefined) {
    console.log("고를 옵션이 없다");
    return;
  }
  console.log(`submit ${JSON.stringify(option)}`);
  try {
    const after = flow.submit(ACTOR, option);
    console.log(`→ ok: ${after.kind}` + (after.kind === "awaiting" ? ` prompts=${after.prompts.map((p) => `${p.player}[${p.options.length}]`).join(",")}` : ""));
  } catch (err) {
    console.log(`→ 예외: ${(err as Error).message}`);
    const s = game.engine.state;
    const hand = handIdsOf(s, ACTOR);
    console.log(
      `   사후 lastDrawnTile=${s.round.lastDrawnTile} inHand=${s.round.lastDrawnTile !== null && hand.includes(s.round.lastDrawnTile)}` +
        ` ura=${uraIndicatorIds(s).map((id) => `${id}:${kindKey(kindOf(s, id))}`).join(" ")}`,
    );
    // 운영의 submitGuarded 폴백과 같은 두 번째 submit — 여기서 또 던지면 판이 죽는다
    const fallback = [...prompt.options].reverse().find((o) => o.type === "discard");
    if (fallback !== undefined) {
      try {
        flow.submit(ACTOR, fallback);
        console.log("   폴백 discard → ok");
      } catch (err2) {
        console.log(`   폴백 discard → 예외: ${(err2 as Error).message}  ← 운영에서 판이 죽은 경로`);
      }
    }
  }
}

console.log(`리플레이: ${path} (seq ≤ ${UPTO_SEQ}, ${lines.length - 1} events)`);
{
  const { game } = reconstructGame(lines, { extraAugments: contentAugments });
  describe(game.engine.state, ACTOR);
}

attempt("ura_swap(쯔모패)", (opts, state) =>
  opts.find(
    (o) =>
      o.type === "ura_swap" &&
      (o.payload as { handTileId: TileId }).handTileId === state.round.lastDrawnTile,
  ),
);
attempt("ura_swap(쯔모패가 아닌 손패)", (opts, state) =>
  opts.find(
    (o) =>
      o.type === "ura_swap" &&
      (o.payload as { handTileId: TileId }).handTileId !== state.round.lastDrawnTile,
  ),
);
