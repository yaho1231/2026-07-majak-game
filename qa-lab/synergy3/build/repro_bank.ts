/**
 * 뱅크 빌드 검증: jackpot(배수) × big_hand(최소 만관 보장) × honba_hunter(본장 1500)
 * 가 한 정산에서 어떤 순서로 겹치는가.
 *
 * 약속: 큰손 = "그 국에 화료했을 때 내가 받는 **총액**이 최소 만관(오야 12,000 · 자 8,000)".
 * 일확천금 = "그 국에 얻는 점수(공탁 회수분 제외)에 배수".
 * → 룰렛이 0.5여도 큰손을 선언했으면 p0 수령 총액은 8,000(오야 12,000) 이상이어야 한다.
 */
import { runBuild } from "./run.js";
import type { PlayerId } from "@majak/core";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const IDS = ["jackpot", "big_hand", "devils_advance", "honba_hunter"];

let rows = 0;
for (const seed of SEEDS) {
  let dealer = -1;
  await runBuild({
    seed, mode: "tonpuu",
    preset: { p0: IDS, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>,
    onEvent: (e) => {
      if (e.type === "RoundStarted") dealer = Number((e.payload as never as { dealerSeat?: number }).dealerSeat ?? -1);
      if (e.type !== "RoundSettled") return;
      const p = e.payload as unknown as {
        outcome: string; deltas: Record<string, number>; honba: number;
        augPoints?: { augId: string; player: string; points: number }[];
        winInfos?: { winner: string; points: number; han: number; honbaBonus?: number; riichiPotGain?: number }[];
      };
      if (p.outcome !== "win") return;
      const mine = (p.winInfos ?? []).filter((w) => w.winner === "p0");
      if (mine.length === 0) return;
      const notes = (p.augPoints ?? []).filter((n) => n.player === "p0");
      const usedBig = notes.some((n) => n.augId === "big_hand");
      const usedJack = notes.some((n) => n.augId === "jackpot");
      rows++;
      console.log(
        `seed${seed} 오야석=${dealer} p0델타=${p.deltas["p0"]} 본장=${p.honba} ` +
        `기본점=${mine.map((w) => w.points).join("/")} 판=${mine.map((w) => w.han).join("/")} ` +
        `본장가산=${mine.map((w) => w.honbaBonus ?? 0).join("/")} 공탁=${mine.map((w) => w.riichiPotGain ?? 0).join("/")} ` +
        `| big_hand=${usedBig} jackpot=${usedJack} notes=${notes.map((n) => `${n.augId}:${n.points}`).join(",")}`,
      );
    },
  });
}
console.log(`p0 화료 정산 ${rows}건`);
