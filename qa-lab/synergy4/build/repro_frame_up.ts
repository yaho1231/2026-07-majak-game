/**
 * 재현 — 누명(frame_up)의 `frame_discard`는 **턴을 소비하는 버림**인데
 * BotAgent의 «1층: 추가 행동»(BotAgent.ts:604-622)에서 결정된다. 1층은 리치·버림 평가
 * (2층)보다 먼저 끝나므로, 누명이 켜지는 순마다 **리치·버림 판단 자체가 건너뛰어진다.**
 *
 * 여기서는 프롬프트에 `riichi`가 함께 제시된 순에 봇이 무엇을 골랐는지 센다.
 *   tsx qa-lab/synergy4/build/repro_frame_up.ts [seeds=10]
 */
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";

const N = Number(process.argv[2] ?? 10);
const proto = BotAgent.prototype as unknown as { decide: (p: unknown) => Promise<{ type: string }> };
const orig = proto.decide;

for (const ids of [["frame_up"], []] as readonly string[][]) {
  const stat = { riichiOffered: 0, tookRiichi: 0, tookFrame: 0, tookOther: 0, frameTotal: 0 };
  proto.decide = async function (prompt: unknown): Promise<{ type: string }> {
    const p = prompt as { options?: { type: string }[] };
    const types = new Set((p.options ?? []).map((o) => o.type));
    const chosen = await orig.call(this, prompt);
    const me = (this as unknown as { id: string }).id;
    if (me === "p0") {
      if (chosen.type === "frame_discard") stat.frameTotal++;
      if (types.has("riichi")) {
        stat.riichiOffered++;
        if (chosen.type === "riichi") stat.tookRiichi++;
        else if (chosen.type === "frame_discard") stat.tookFrame++;
        else stat.tookOther++;
      }
    }
    return chosen;
  };
  let score = 0;
  for (let s = 1; s <= N; s++) {
    const r = await runBuild({
      seed: s, mode: "hanchan",
      preset: { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>,
      timeoutMs: 300_000,
    });
    score += r.finalScores.p0 ?? 0;
  }
  console.log(
    `보유=${ids.length === 0 ? "(없음)" : ids.join("+")} · p0평균점수=${(score / N).toFixed(0)}` +
    ` · 리치 제시된 순=${stat.riichiOffered} → 리치선언 ${stat.tookRiichi} / 누명버림 ${stat.tookFrame} / 그 외 ${stat.tookOther}` +
    ` · 누명 총 발동=${stat.frameTotal}`,
  );
}
proto.decide = orig;
