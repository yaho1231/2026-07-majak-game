/**
 * **후리텐 리치** — 선언패 자체가 자기 대기일 때 봇이 그대로 건다.
 *
 * `bot/discard.ts:bidRiichi:425-433`
 * ```ts
 * const myDiscards = new Set(...);          // ← 이 버림 **전**의 내 바닥
 * const waits = winningKinds(rest, ...);    // ← 이 버림 **후**의 대기
 * const furiten = waits.some((w) => myDiscards.has(kindKey(w)));
 * ```
 * `myDiscards`는 선언패가 바닥에 놓이기 **전**의 목록이라, 선언패 자신이 대기에
 * 들어 있는 경우(`waits.includes(선언패)`)를 한 번도 못 본다. 그 리치는 선언하는
 * 순간 후리텐이라 **국이 끝날 때까지 론이 안 된다** — 쯔모만 남는다.
 *
 * 기존 테스트 `BotPlay.test.ts:143`("후리텐 대기로는 걸지 않는다")는 **이미 바닥에
 * 있던** 패로만 검사하므로 이 자리를 지나간다.
 *
 *   tsx qa-lab/round2/bot/riichi_furiten_probe.ts
 */
import { botScene } from "../../../packages/server/test/botTestView.js";
import { buildRead } from "../../../packages/server/src/bot/read.js";
import { bidRiichi, chooseRiichi } from "../../../packages/server/src/bot/discard.js";
import { profileOf } from "../../../packages/server/src/bot/profile.js";
import type { ArchetypeName } from "../../../packages/server/src/bot/profile.js";
import { kindKey, winningKinds } from "@majak/core";
import type { TileKind } from "@majak/core";

const ARCH: ArchetypeName[] = ["balanced", "attacker", "defender", "speedster", "valueHunter", "wildcard"];

/**
 * 111m 999m 111p 555s 67s.
 * 7s로 선언하면 남는 손은 111m999m111p555s6s → 6s 단기? 아니다 —
 * 555s를 5s5s + 5s로 쪼개면 5s6s7s가 서고 대기가 넓어진다. 어떤 갈래든 **7s가 대기에
 * 들어간다** → 선언하는 순간 후리텐.
 */
const HAND = "111m999m111p555s67s";

const sc = botScene({
  hand: HAND,
  turnCount: 6,
  wallLeft: 50,
  discards: { p1: "1z2z3z", p2: "1z2z3z", p3: "1z2z3z" },
});
const view = sc.view;
const read = buildRead(view, "p0", { mode: "hanchan" });
const options = sc.riichiOptions();

console.log(`손패 ${HAND} · 내 바닥 비어 있음 · read.furiten=${read.furiten}`);
console.log("\n선언패별 — 선언 후 대기와 '그 선언이 곧 후리텐인가'");
const seen = new Set<string>();
for (const o of options) {
  const id = (o.payload as { tileId: number }).tileId;
  const key = kindKey(view.tiles[id]!.kind);
  if (seen.has(key)) continue;
  seen.add(key);
  const rest: TileKind[] = [...read.hand];
  rest.splice(
    rest.findIndex((x) => kindKey(x) === key),
    1,
  );
  const waits = winningKinds(rest, 0, undefined, read.opts).map(kindKey);
  if (waits.length === 0) continue;
  const bid = bidRiichi(read, [o], null, profileOf("balanced"));
  console.log(
    `  ${key.padEnd(8)} 대기[${waits.join(",").padEnd(20)}]  ` +
      `${waits.includes(key) ? "✗ 선언 즉시 후리텐" : "○ 정상"}  ` +
      `bidRiichi ${bid === null ? "거절" : `EV ${bid.value.toFixed(0)}`}`,
  );
}

console.log("\n원형별 실제 리치 판단 (chooseRiichi — 다마텐과 견준 결과):");
for (const a of ARCH) {
  const opt = chooseRiichi(read, options, profileOf(a), null);
  const id = (opt?.payload as { tileId: number } | undefined)?.tileId;
  const key = id === undefined ? null : kindKey(view.tiles[id]!.kind);
  if (key === null) {
    console.log(`  [${a.padEnd(11)}] 리치 안 건다`);
    continue;
  }
  const rest: TileKind[] = [...read.hand];
  rest.splice(
    rest.findIndex((x) => kindKey(x) === key),
    1,
  );
  const waits = winningKinds(rest, 0, undefined, read.opts).map(kindKey);
  console.log(
    `  [${a.padEnd(11)}] ${key}로 리치 · 대기[${waits.join(",")}]` +
      `${waits.includes(key) ? "   ← 선언 즉시 후리텐 (론 불가 · 쯔모만)" : ""}`,
  );
}
