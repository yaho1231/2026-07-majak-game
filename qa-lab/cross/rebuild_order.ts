/**
 * 리플레이/이어하기 재설치 순서 vs 원본 드래프트 설치 순서.
 *
 * DraftController 주석(rebuildAugments)은 "설치 순서(seq)에 기대는 동률 훅의 결과가
 * 뒤집히므로 원본과 같은 모양으로 맞춘다"고 못 박는다. 그 전제는
 * **player.augments 의 인덱스 = 드래프트 스테이지**인데, 수상한 주사위(cornucopia)가
 * 한 스테이지에 3장을 밀어 넣으면 그 대응이 깨진다.
 */
import { Prng, createStandardGame, createStandardGameFromState, DraftController, hanchanConfigForMode, rebuildAugments } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { SEATS } from "./lib.js";

interface Reg { source: string }
const sources = (engine: unknown): string[] =>
  ((engine as { effects: { effects: Reg[] } }).effects.effects)
    .map((e) => e.source)
    .filter((s) => s.includes(":"));

const N = Number(process.argv[2] ?? 400);
let mismatches = 0;
let withCornucopia = 0;
const examples: string[] = [];

for (let i = 0; i < N; i++) {
  for (const mode of ["hanchan", "tonpuu"] as const) {
    const seed = 700_000 + i;
    const mk = (): ReturnType<typeof createStandardGame> =>
      createStandardGame({
        seed, playerIds: [...SEATS], mode, startScore: 25000, redFivesPerSuit: 1,
        extraAugments: contentAugments,
      } as never);
    const game = mk();
    const pickRng = new Prng(seed * 13 + (mode === "tonpuu" ? 1 : 0));
    const draft = new DraftController(game.engine, game.augments, { yaku: game.yaku, catalog: game.augments });
    for (const stage of hanchanConfigForMode(mode).draftSchedules!) {
      const shown = new Map<PlayerId, string[]>();
      for (const seat of SEATS) {
        const { choices, rerolls } = draft.rollWithRerolls(stage, seat);
        shown.set(seat, [...choices, ...rerolls].map((d) => d.id));
      }
      for (const seat of SEATS) {
        const pool = shown.get(seat)!;
        if (pool.length === 0) continue;
        draft.pick(stage, seat, pool[pickRng.int(pool.length)]!);
      }
    }
    // 설치 순서 (증강 instanceId = "pX:augId" 형태)
    const live = sources(game.engine).filter((s) => /^aug:p\d:/.test(s));
    const liveOrder = [...new Set(live)];

    // 같은 최종 상태에서 재설치
    const rebuilt = createStandardGameFromState(game.engine.state, undefined, contentAugments);
    rebuildAugments(rebuilt.engine, rebuilt.augments, { yaku: rebuilt.yaku, catalog: rebuilt.augments });
    const rebuiltOrder = [...new Set(sources(rebuilt.engine).filter((s) => /^aug:p\d:/.test(s)))];

    const hasCorn = game.engine.state.players.some((p) => p.augments.includes("cornucopia"));
    if (hasCorn) withCornucopia++;
    if (JSON.stringify(liveOrder) !== JSON.stringify(rebuiltOrder)) {
      mismatches++;
      if (examples.length < 3) {
        examples.push(
          `${mode} seed=${seed} cornucopia=${hasCorn}\n   원본:   ${liveOrder.join(" ")}\n   재설치: ${rebuiltOrder.join(" ")}`,
        );
      }
    }
  }
}
console.log(`${N} seeds × 2 모드 = ${N * 2} 게임`);
console.log(`cornucopia 등장 ${withCornucopia}, 설치 순서 불일치 ${mismatches}`);
for (const e of examples) console.log("\n" + e);
