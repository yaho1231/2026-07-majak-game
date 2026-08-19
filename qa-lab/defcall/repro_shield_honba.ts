/**
 * 확정 재현 — 역만 방어술(yakuman_shield)이 **본장(적립) 부담까지 환급**한다.
 *
 * detail: "본장(1본당 300)과 공탁 부담은 환급 대상이 아니다 — 2본장 역만 직격이면
 *          손실이 0이 아니라 600 남는다."
 * 실제  : 역만 **쯔모**에서는 보유자 손실이 정확히 0이 된다(본장 몫까지 사라진다).
 *         원인: 환급 상한(cap)이 화료 **전액**(winInfo.points)인데 쯔모는 보유자 몫이
 *         그 1/3~1/2뿐이라 상한이 절대 물리지 않는다 → min(-loss, cap) = -loss.
 *
 * 실행: tsx qa-lab/defcall/repro_shield_honba.ts
 */
import type { PlayerId } from "@majak/core";
import { PERSONAS } from "../harness.js";
import { runDefcall } from "./run.js";

const KOKUSHI = [
  "man1", "man9", "pin1", "pin9", "sou1", "sou9",
  "wind1", "wind2", "wind3", "wind4", "dragon1", "dragon2", "dragon3",
];

const preset: Record<PlayerId, string[]> = { p0: ["yakuman_shield"], p1: [], p2: [], p3: [] };
const personas: any = { p0: PERSONAS.folder, p1: PERSONAS.masher, p2: PERSONAS.folder, p3: PERSONAS.folder };

let hits = 0;
for (let seed = 1; seed <= 40 && hits < 6; seed++) {
  await runDefcall({
    seed, mode: "hanchan", preset, personas, noDraft: true,
    presetHands: { p1: KOKUSHI } as any,
    onEvent: (e, st) => {
      if (e.type !== "RoundSettled") return;
      const p = e.payload;
      if (p.outcome !== "win") return;
      const wi = (p.winInfos ?? []).filter((w: any) => (w.yakumanCount ?? 0) > 0);
      if (wi.length === 0) return;
      // payload.honba 는 "다음 국" 본장이라 정산 당시 본장은 state에서 본다
      const honba = st === null ? "?" : st.round.honba;
      const w = wi[0];
      console.log(
        `seed=${seed} honba(정산직전 payload=${p.honba}) winType=${w.winType} yakuman=${w.yakumanCount} points=${w.points}` +
        `\n   deltas=${JSON.stringify(p.deltas)} augPoints=${JSON.stringify(p.augPoints)}`,
      );
      hits++;
    },
  });
}
