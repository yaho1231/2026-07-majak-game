/**
 * 재검증 5: 드래프트 좌석 칸(cellFor)의 여유가 얼마이고, 카탈로그가 줄면
 * 정말 **경고 없이** 중복 방지가 꺼지는가.
 *
 * cellFor: pool.length < seats*cellSize + draw 이면 null → draw()가
 * `rollUniform(prng, total, exclude, bias)` 로 떨어진다. 그 exclude(excludeFor)에는
 * **heldByOthers 가 없다** — 남이 이미 가진 것을 걸러 내지 못한다.
 *
 * 카탈로그를 K종 빼 가며 드래프트만 시뮬해 OFFER_OVERLAP/DUP_GAME 발생률을 잰다.
 *
 * 실행: tsx qa-lab/verify-disrupt/r5_pool_cliff.ts [게임수]
 */
import { Prng, createStandardGame, DraftController, hanchanConfigForMode } from "@majak/core";
import type { AugmentDef, DraftStage, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";

const N = Number(process.argv[2] ?? 120);
const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
const CHOICES = 3;
const CELL = Math.max(CHOICES * 8, 24);
const DRAW = CHOICES * 2;
const NEED = SEATS.length * CELL + DRAW;

/** 엔진이 실제로 쓰는 카탈로그(코어 표준증강 포함) 기준 풀 크기 */
function realPool(cut: number, stage: DraftStage, mode: "hanchan" | "tonpuu"): number {
  const cat = contentAugments.slice(0, contentAugments.length - cut);
  const game = createStandardGame({
    seed: 1, playerIds: [...SEATS], mode, startScore: 25000,
    redFivesPerSuit: 1, extraAugments: cat,
  } as never);
  return poolAt(game.augments.all() as AugmentDef[], stage, mode);
}

function poolAt(cat: AugmentDef[], stage: DraftStage, mode: "hanchan" | "tonpuu"): number {
  return cat.filter(
    (d) =>
      (d.draftStages === undefined || d.draftStages.includes(stage)) &&
      (d.modes === undefined || d.modes.includes(mode)),
  ).length;
}

/** K종을 뒤에서 잘라 낸 카탈로그로 드래프트만 돌린다. */
function trial(cut: number): { overlap: number; dup: number; games: number; pool: number } {
  const cat = contentAugments.slice(0, contentAugments.length - cut);
  let overlap = 0;
  let dup = 0;
  let games = 0;
  for (let i = 0; i < N; i++) {
    const mode = i % 2 === 0 ? "hanchan" : "tonpuu";
    const seed = 500_000 + i;
    const game = createStandardGame({
      seed, playerIds: [...SEATS], mode, startScore: 25000,
      redFivesPerSuit: 1, extraAugments: cat,
    } as never);
    const pickRng = new Prng(seed * 7 + 1);
    const stages = hanchanConfigForMode(mode).draftSchedules as DraftStage[];
    const draft = new DraftController(game.engine, game.augments, {
      yaku: game.yaku, catalog: game.augments,
    });
    games++;
    let gameOverlap = false;
    let gameDup = false;
    for (const stage of stages) {
      const shown = new Map<PlayerId, string[]>();
      const picks: [PlayerId, string][] = [];
      for (const seat of SEATS) {
        const choices = draft.roll(stage, seat);
        shown.set(seat, choices.map((d) => d.id));
        if (choices.length > 0) {
          picks.push([seat, choices[pickRng.int(choices.length)]!.id]);
        }
      }
      // 같은 스테이지에 두 좌석에게 같은 카드가 섰는가
      for (let a = 0; a < SEATS.length; a++) {
        for (let b = a + 1; b < SEATS.length; b++) {
          const A = shown.get(SEATS[a]!) ?? [];
          const B = shown.get(SEATS[b]!) ?? [];
          if (A.some((x) => B.includes(x))) gameOverlap = true;
        }
      }
      for (const [seat, id] of picks) draft.pick(stage, seat, id);
    }
    const seen = new Map<string, PlayerId>();
    for (const p of game.engine.state.players) {
      for (const id of p.augments) {
        const prev = seen.get(id);
        if (prev !== undefined && prev !== p.id) gameDup = true;
        seen.set(id, p.id as PlayerId);
      }
    }
    if (gameOverlap) overlap++;
    if (gameDup) dup++;
  }
  return { overlap, dup, games, pool: realPool(cut, "gameStart", "hanchan") };
}

console.log(`좌석 칸 요구치 need=${NEED} (좌석 4 × 칸 ${CELL} + 보충 ${DRAW})`);
console.log(`content 카탈로그 ${contentAugments.length}종 + 코어 표준증강`);
for (const stage of ["gameStart", "eastThird", "southThird"] as DraftStage[]) {
  for (const mode of ["hanchan", "tonpuu"] as const) {
    const p = realPool(0, stage, mode);
    console.log(`  ${mode.padEnd(8)} ${stage.padEnd(11)} pool=${p} 여유=${p - NEED}`);
  }
}
console.log("");
console.log("K종 제거 → 드래프트 시뮬 (게임당 전 스테이지)");
for (const cut of [0, 10, 12, 13, 14, 16, 20]) {
  const r = trial(cut);
  const fallback = r.pool < NEED;
  console.log(
    `  -${String(cut).padStart(2)}종  pool(gameStart,hanchan)=${r.pool}  ` +
    `${fallback ? "칸 미사용(전역 균등)" : "칸 사용        "}  ` +
    `오퍼 겹침 ${r.overlap}/${r.games}  게임 내 중복보유 ${r.dup}/${r.games}`,
  );
}
