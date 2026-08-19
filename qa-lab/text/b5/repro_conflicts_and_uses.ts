/**
 * ① 죽기살기 / 역만 방어술 — 문구에 없는 **드래프트 배제**가 실제로 걸린다.
 * ② 만년 오야 — "남은 횟수는 전원에게 보인다"가 실제로는 보유자 전용 채널이다.
 *
 * 실행: /Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b5/repro_conflicts_and_uses.ts
 */
import { contentAugments } from "@majak/content";
import type { AugmentDef } from "@majak/core";
import { craft, start } from "../../score-b/scene.js";

const say = (s: string): void => {
  console.log(s);
};

const byId = new Map(contentAugments.map((d) => [d.id, d]));
const nameOf = (id: string): string => `${id}(${byId.get(id)?.name ?? "?"})`;

/** 코어 후보 필터와 같은 기준 — 배제는 양방향이다 (Augment.ts:508,528-529) */
function symmetricConflicts(id: string): string[] {
  const own = (byId.get(id) as AugmentDef | undefined)?.conflicts ?? [];
  const rev = contentAugments
    .filter((d) => (d.conflicts ?? []).includes(id))
    .map((d) => d.id);
  return [...new Set([...own, ...rev])];
}

for (const id of ["die_hard", "yakuman_shield"]) {
  const d = byId.get(id)!;
  say(`\n===== ${nameOf(id)}`);
  say(`DESC   : ${d.description}`);
  say(`DETAIL : ${d.detail}`);
  say(`선언된 conflicts : ${JSON.stringify(d.conflicts ?? [])}`);
  say(`실제 잠기는 것   : ${symmetricConflicts(id).map(nameOf).join(", ")}`);
  const mentions = symmetricConflicts(id).filter((c) => {
    const n = byId.get(c)?.name ?? c;
    return `${d.description}${d.detail}`.includes(n);
  });
  say(`문구가 언급한 것 : ${mentions.length === 0 ? "(없음)" : mentions.join(", ")}`);
}

// ── ② 만년 오야 — 남은 연장 횟수 채널의 가시성 ────────────────────────────
say("\n===== eternal_dealer 남은 연장 횟수 채널");
const base = craft({
  hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const { game, flow } = start(base, { p2: ["eternal_dealer"] } as never);
// 아무 이벤트나 한 번 흘려 publishUsesLeft("*")를 돌린다
{
  const st = game.engine.state;
  const hand = st.zones[`hand:p0`]?.tileIds ?? [];
  flow.submit("p0", { type: "discard", payload: { tileId: hand[0]! } });
}
const keys = Object.keys(game.engine.state.augmentData).filter((k) =>
  k.includes("eternal_dealer"),
);
for (const k of keys) {
  const pub = k.startsWith("view:*:");
  say(`  ${k} = ${JSON.stringify(game.engine.state.augmentData[k])}  ${pub ? "← 전원 공개" : "← 보유자 전용"}`);
}
say(`  전원 공개 채널(view:*:...eternal_dealer...) 개수 = ${keys.filter((k) => k.startsWith("view:*:")).length}`);
