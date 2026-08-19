/**
 * 스테이지·모드별 제시 가능 풀 크기 vs cellFor 가 좌석 칸을 쓰기 위해 요구하는 최소치.
 * 풀이 모자라면 cellFor 가 null 을 돌려주고, draw() 는 heldByOthers 를 걸지 않는
 * rollUniform 으로 떨어진다 → 같은 증강이 두 사람에게 제시될 수 있다.
 */
import { ALL_AUGMENTS } from "./lib.js";
import type { DraftStage } from "@majak/core";

const stages: DraftStage[] = ["gameStart", "eastThird", "eastFourth", "southEntry", "southThird"];
const CHOICES = 3;
const CELL = Math.max(CHOICES * 8, 24);
const DRAW = CHOICES * 2;
const NEED = 4 * CELL + DRAW;

for (const mode of ["hanchan", "tonpuu"] as const) {
  for (const stage of stages) {
    const pool = ALL_AUGMENTS.filter(
      (d) =>
        (d.draftStages === undefined || d.draftStages.includes(stage)) &&
        (d.modes === undefined || d.modes.includes(mode)),
    );
    const ok = pool.length >= NEED;
    console.log(
      `${mode.padEnd(8)} ${stage.padEnd(11)} pool=${String(pool.length).padStart(3)} need=${NEED}  ${ok ? "cell OK" : "*** FALLBACK → 전역 균등 추첨 (중복 방지 없음)"}`,
    );
  }
}
console.log(`\n전체 카탈로그 ${ALL_AUGMENTS.length}`);
console.log(
  "draftStages 제한 있는 증강:",
  ALL_AUGMENTS.filter((d) => d.draftStages !== undefined).map((d) => `${d.id}[${d.draftStages!.join(",")}]`).join(" "),
);
