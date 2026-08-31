/**
 * 확정 재현 — 누명(frame_up) 봇 정책의 `pick`이 **자기 액션이 아닌 표준 선택지**를
 * 돌려준다.  packages/content/src/augments/frame_up.ts:264
 *     return preferred ?? sameTile[0] ?? options[0] ?? null;
 * `pickIsolatedDiscard`가 null이면(= 이번 프롬프트에 frame_discard 후보가 없다:
 * 쿨다운·첫 바퀴·리치 중·리액션 프롬프트) `sameTile === options`가 되어 **프롬프트의
 * 첫 선택지**가 그대로 반환된다. BotAgent는 그것이 제시된 옵션이므로 정상 입찰로 받고
 * (BotAgent.ts:749-753), 1층에서 이기면 **버림·리치·후로 평가(2층)를 통째로 건너뛴다.**
 *
 * 여기서는 정책이 무엇을 돌려주는지와 그것이 실제로 채택되는지를 센다.
 *   tsx qa-lab/synergy4/build/repro_frame_up_pick.ts [seeds=6]
 */
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { runBuild } from "../../synergy3/build/run.js";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";

const def = contentAugments.find((d) => d.id === "frame_up") as any;
const origChoose = def.bot.choose.bind(def.bot);
const returned: Record<string, number> = {};
let lastReturn: string | null = null;
def.bot.choose = (ctx: any) => {
  const r = origChoose(ctx);
  const opt = r === null ? null : ("option" in r ? r.option : r);
  lastReturn = opt === null ? null : String(opt.type);
  if (lastReturn !== null) returned[lastReturn] = (returned[lastReturn] ?? 0) + 1;
  return r;
};
const proto = BotAgent.prototype as any;
const orig = proto.decide;
const taken: Record<string, number> = {};
proto.decide = async function (p: any) {
  lastReturn = null;
  const r = await orig.call(this, p);
  if ((this as any).id === "p0" && lastReturn !== null && r.type === lastReturn && lastReturn !== "frame_discard") {
    taken[lastReturn] = (taken[lastReturn] ?? 0) + 1;
  }
  return r;
};
const N = Number(process.argv[2] ?? 6);
for (let s = 1; s <= N; s++) {
  await runBuild({ seed: s, mode: "hanchan", preset: { p0: ["frame_up"], p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>, timeoutMs: 300000 });
}
proto.decide = orig; def.bot.choose = origChoose;
console.log(`정책이 돌려준 선택지 종류: ${JSON.stringify(returned)}`);
console.log(`그중 «누명이 아닌 표준 선택지»가 그 순의 최종 선택과 일치한 횟수: ${JSON.stringify(taken)}`);
