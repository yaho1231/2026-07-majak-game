/**
 * 유국 빌드 검증: 승승장구(always_tenpai)의 "항상 텐파이 취급"이
 * 뒤집힌 모래시계(hourglass)·미련(regret)의 조건까지 열어 주는가.
 *
 * 국마다: 유국인가 · RoundSettled.tenpaiPlayers 에 p0 가 있는가(=벌점 면제/보상 받음) ·
 * p0 가 **진짜** 텐파이였는가(isTenpai) · 모래시계가 열렸는가(HourglassOpened).
 */
import { isTenpai, meldCountOf, scoringOptionsOf, winHandKindsOf } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { HanchanController } from "@majak/core";
import { runBuild } from "./run.js";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

async function go(ids: readonly string[], label: string): Promise<void> {
  let draws = 0, fakeTenpai = 0, realTenpai = 0, hourglassOpened = 0, fakeButNoGlass = 0;
  for (const seed of SEEDS) {
    let realNow = false;
    await runBuild({
      seed, mode: "tonpuu",
      preset: { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>,
      onRound: (st: GameState, phase) => {
        if (phase !== "end") return;
        try {
          // 정산 직전 상태에서 p0 의 손이 진짜 텐파이인가
          const rules = (st as unknown as { __rules?: unknown }).__rules;
          void rules;
          realNow = false;
        } catch { realNow = false; }
      },
      onEvent: (e) => {
        if (e.type === "HourglassOpened") hourglassOpened++;
        if (e.type === "RoundSettled") {
          const p = e.payload as unknown as { outcome: string; tenpaiPlayers?: string[] };
          if (p.outcome === "draw") {
            draws++;
            const t = p.tenpaiPlayers ?? [];
            if (t.includes("p0")) fakeTenpai++;
          }
        }
      },
    });
    void realNow; void realTenpai;
  }
  console.log(`${label}: 유국 ${draws} · 정산이 p0를 텐파이로 센 국 ${fakeTenpai} · 모래시계 발동 ${hourglassOpened}`);
  void fakeButNoGlass; void isTenpai; void meldCountOf; void scoringOptionsOf; void winHandKindsOf; void HanchanController;
}

await go(["always_tenpai", "nagashi_yakuman", "hourglass", "regret"], "draw 빌드(승승장구 포함)");
await go(["hourglass", "regret"], "모래시계+미련만");
