/**
 * 잔상(dora_afterimage) · 카르마(karma) 의 **국을 넘는 상태**를 매치 단위로 검사한다.
 * 실행: tsx qa-lab/score-b/t_afterimage.ts [from] [to]
 *
 * 검사:
 *  R1 recalled 종류 == 직전 국의 도라 종류 (doraKindFor(표시패))
 *  R2 쿨다운 — 발동 국 순번 간격 >= 2
 *  R3 첫 국에는 발동 불가
 *  R4 karma 게이지 == 정산 손실 누적(마지막 소각 이후), 100점 배수
 *  R5 karma 게이지 공개 채널 == 실제 게이지
 */
import { doraKindFor, kindKey } from "@majak/core";
import type { GameState, PlayerId, TileKind } from "@majak/core";
import { PERSONAS, runMatch } from "./run.js";

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 12);
const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
const rk = (s: GameState): string => `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;
const asKinds = (v: unknown): TileKind[] =>
  Array.isArray(v) ? (v.filter((k) => typeof k === "object" && k !== null && "suit" in k) as TileKind[]) : [];

let problems = 0;
const bad = (s: string): void => { problems++; console.log(`  !! ${s}`); };

for (let seed = from; seed <= to; seed++) {
  // 전원이 잔상 + 카르마 (두 상태 증강을 같이 굴린다)
  const preset = Object.fromEntries(
    SEATS.map((s) => [s, ["dora_afterimage", "karma", "mirror_dora"]]),
  ) as Record<PlayerId, string[]>;
  let prevDoraKinds: string[] | null = null;   // 직전 국의 도라 종류
  let roundIdx = 0;
  const lastUse: Record<string, number> = {};
  const gaugeExpect: Record<string, number> = { p0: 0, p1: 0, p2: 0, p3: 0 };
  let firstRoundKey = "";
  let curKey = "";

  const r = await runMatch({
    seed,
    mode: "hanchan",
    preset,
    personas: { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.chaos!, p3: PERSONAS.caller! },
    onRound: (st, phase) => {
      if (phase !== "start") return;
      roundIdx++;
      curKey = rk(st);
      if (roundIdx === 1) firstRoundKey = rk(st);
    },
    onSettle: (st, p) => {
      const key = `${st.round.prevalentWind}`; void key;
      // 이 국의 roundKey는 정산 리듀서가 이미 다음 국으로 바꿔 놨다 — augmentData 키로 역추적한다
      for (const seat of SEATS) {
        // R1/R2/R3 — 이번 국에 발동했는가
        const hitKey = `dora_afterimage:recalled:${curKey}:${seat}`;
        const hit = st.augmentData[hitKey] === undefined ? undefined : hitKey;
        const usedSeq = st.augmentData[`dora_afterimage:usedSeq:${seat}`];
        if (typeof usedSeq === "number" && lastUse[seat] !== usedSeq) {
          const prev = lastUse[seat];
          if (prev !== undefined && usedSeq - prev < 2) {
            bad(`seed=${seed} ${seat} 잔상 쿨다운 위반: seq ${prev} -> ${usedSeq}`);
          }
          lastUse[seat] = usedSeq;
          if (hit !== undefined) {
            const got = asKinds(st.augmentData[hit]).map(kindKey).sort();
            if (prevDoraKinds !== null && JSON.stringify(got) !== JSON.stringify(prevDoraKinds)) {
              bad(`seed=${seed} ${seat} 되살린 도라가 직전 국과 다르다: got=${got} prev=${prevDoraKinds}`);
            }
            if (prevDoraKinds === null) {
              bad(`seed=${seed} ${seat} 첫 국(직전 도라 없음)인데 발동됨: ${got}`);
            }
          }
        }
        // R4/R5 — karma 게이지
        const loss = Math.max(0, -(p.deltas[seat] ?? 0));
        gaugeExpect[seat] = Math.floor((gaugeExpect[seat]! + loss) / 100) * 100;
        const g = st.augmentData[`karma:gauge:${seat}`];
        const gv = st.augmentData[`view:*:karma:${seat}`];
        if (typeof g === "number" && g !== gaugeExpect[seat]) {
          // 소각으로 0이 됐으면 기대값도 0으로 맞춘다
          if (g === 0) gaugeExpect[seat] = 0;
          else bad(`seed=${seed} ${seat} karma 게이지 ${g} != 기대 ${gaugeExpect[seat]}`);
        }
        if (typeof g === "number" && g % 100 !== 0) bad(`seed=${seed} ${seat} karma 게이지가 100 배수가 아니다: ${g}`);
        if (typeof g === "number" && g !== gv) bad(`seed=${seed} ${seat} karma 공개채널 ${String(gv)} != 게이지 ${g}`);
      }
      // 이 국의 도라 종류를 기록 (다음 국의 기대값)
      prevDoraKinds = st.round.doraIndicators
        .map((t) => kindKey(doraKindFor(st.tiles[t]!.kind)))
        .sort();
    },
  });
  const v = r.violations.filter((x) => x.kind !== "SCORE_DRIFT_ATTRIBUTED");
  console.log(
    `seed=${seed} rounds=${r.rounds} settles=${r.settles} crash=${r.crash?.split("\n")[0] ?? "-"} ` +
    `effErr=${r.effectErrors.length} viol=${v.length} firstRound=${firstRoundKey}`,
  );
  for (const x of v.slice(0, 6)) console.log(`   [${x.kind}] ${x.round} ${x.seat ?? "-"} ${x.detail}`);
  if (r.effectErrors.length > 0) console.log("   eff:", r.effectErrors.slice(0, 3));
}
console.log(`\n문제 ${problems}건`);
