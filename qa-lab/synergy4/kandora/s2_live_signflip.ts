/**
 * S2 — 실판: 가불 인생(첫 국 뱅크 +10,000) × 반전(부호 뒤집기)이 **드래프트 픽 순서**로 갈린다.
 *
 * sign_flip은 ROUND_STARTED 리액션으로 «이번 국» 무장 표식을 쓰고(util.armOnNextRound),
 * devils_advance는 같은 ROUND_STARTED 리액션에서 scoreChanged(+10,000)을 낸다.
 * sign_flip의 SCORE_CHANGED 인터셉터는 `armedNow(state)` 로 무장 여부를 보는데, 그 값이
 * **같은 이벤트 물결 안에서 아직 커밋됐는지**가 두 리액션의 등록 순서로 갈린다.
 * 등록 순서 = installAugment 호출 순서 = **드래프트 픽 순서**다.
 *
 * 기대: 어느 쪽이든 한 값으로 고정돼야 한다(정산 순서 단일 진실 settleStages.ts의 취지).
 * 실측: 픽 순서로 +10,000 / -10,000 이 갈린다 → 20,000점 차.
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS } from "../../harness.js";
import type { PlayerId } from "@majak/core";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function once(order: string[]): Promise<void> {
  const preset: Record<PlayerId, readonly string[]> = { p0: order, p1: [], p2: [], p3: [] };
  const agents = SEATS.map((id, i) => new PersonaAgent(id, PERSONAS["masher"]!, 7 * 131 + i));
  const log: string[] = [];
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode: "tonpuu", seed: 7, maxWind: 1, westEntry: false,
    draftSchedules: ["eastFirst"],
    extraAugments: contentAugments,
    presetAugments: preset,
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onEvent: (j: string) => {
      try {
        const e = JSON.parse(j) as any;
        if (e.type === "ScoreChanged" && String(e.payload?.reason ?? "").includes("devils")) {
          log.push(`ScoreChanged ${e.payload?.player} ${e.payload?.delta} reason=${e.payload?.reason}`);
        }
      } catch { /* ignore */ }
    },
  } as never);
  const p = ctrl.run();
  const to = new Promise((_r, rej) => setTimeout(() => { ctrl.requestAbort(); rej(new Error("timeout")); }, 90_000));
  try { await Promise.race([p, to]); } catch { /* ignore */ }
  const st = ctrl.gameState;
  console.log(`픽 순서 ${JSON.stringify(order)}`);
  console.log(`  ${log.join("\n  ") || "(가불 발행 없음)"}`);
  console.log(`  최종: ${st === null ? "?" : st.players.map((x: any) => `${x.id}=${x.score}`).join(" ")}`);
}

async function main(): Promise<void> {
  console.log("=== S2: 같은 시드·같은 카드, 픽 순서만 바꾼다 ===");
  await once(["devils_advance", "sign_flip"]);
  await once(["sign_flip", "devils_advance"]);
}
void main();
