/**
 * 뒤집힌 모래시계(hourglass) description/detail:
 *   "…가 패산으로 넘어오고 **그것을 나 혼자 연속으로 쯔모한다**"
 *   "왕패에서 4장이 패산으로 넘어와 **그 4장을 혼자 연속으로 쯔모한다**"
 *
 * 연장 중 턴 회수 인터셉터는 **보유자가 버린 뒤에만** 턴을 되가져온다
 * (hourglass.ts:170 `if (state.round.lastDiscard?.player !== holder) return event`).
 * 상대가 연장 중 보유자의 버림을 울면 그 상대가 버리고, 그 뒤 턴은 표준 순서대로
 * 흘러 **넘어온 패를 남이 쯔모한다**. 그 지점을 계측한다.
 *
 * 검출: 연장 플래그(`hourglass:opened:...`)가 켜진 뒤 turnSeat이 보유자 자리가 아닌
 * 상태(= 남의 순)가 관측되면 SOLO_BROKEN.
 */
import { PERSONAS, runMatch } from "../../harness.js";
import type { GameState } from "@majak/core";

const N = Number(process.argv[2] ?? 40);
const START = Number(process.argv[3] ?? 1);

let opened = 0;
let broken = 0;
const samples: string[] = [];

for (let seed = START; seed < START + N; seed++) {
  const seenOpen = new Set<string>();
  await runMatch({
    seed,
    mode: "tonpuu",
    preset: { p0: ["hourglass"], p1: [], p2: [], p3: [] },
    personas: {
      p0: PERSONAS["stall"] ?? PERSONAS["folder"]!,
      p1: PERSONAS["caller"]!,
      p2: PERSONAS["caller"]!,
      p3: PERSONAS["caller"]!,
    },
    onState: (st: GameState) => {
      const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
      const key = `hourglass:opened:${rk}:p0`;
      if (st.augmentData[key] !== true) return;
      const tag = `${seed}:${key}`;
      if (!seenOpen.has(tag)) {
        seenOpen.add(tag);
        opened++;
      }
      const seat = st.players.find((p) => p.id === "p0")?.seat;
      const wall = st.zones["wall"]?.tileIds.length ?? 0;
      if (wall > 0 && st.round.turnSeat !== seat) {
        broken++;
        if (samples.length < 5) {
          samples.push(
            `seed=${seed} 연장 중 turnSeat=${st.round.turnSeat}(보유자 자리=${seat}) 패산잔량=${wall} ` +
              `p0멜드=${st.round.byPlayer["p0"]?.melds.length} 타가멜드=${st.players
                .filter((p) => p.id !== "p0")
                .map((p) => st.round.byPlayer[p.id]?.melds.length)
                .join("/")}`,
          );
        }
      }
    },
  });
}

console.log(`매치 ${N}회 (동풍전, p0=모래시계·베타오리 / 타가 전원 caller)`);
console.log(`  연장 발동 관측: ${opened}건`);
console.log(`  연장 중 '남의 순' 관측(SOLO_BROKEN): ${broken}건`);
for (const s of samples) console.log("   ", s);
