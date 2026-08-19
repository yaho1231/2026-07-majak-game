/**
 * 재장전(reload) detail:
 *   "⚠ 그 밖에 복구할 수 있는 것은 게임 단위 사용 횟수를 쓰는 증강뿐이다.
 *    **국 단위 쿨다운으로 도는 증강은 눈에 띄게 소진돼 보여도 후보에 뜨지 않는다.**"
 *
 * 그런데 봉인술사(discard_lock)는 2국 쿨다운 증강인데, 쿨다운 기준점을
 * `discard_lock:used:{holder}`(국 시퀀스 번호)에 넣는다 — 공용 규약(`{id}:usedSeq:{h}`,
 * util.ts:346)을 쓰지 않는 유일한 예외다. 재장전의 후보 판정(reload.ts:47)은
 * `{id}:used:{h}`도 사용 카운터로 인정하므로 **봉인술사가 후보에 뜬다.**
 * 그리고 그 값을 1 깎으면 쿨다운이 한 국 짧아져 그 자리에서 버튼이 다시 열린다.
 */
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { discardLock } from "../../../packages/content/src/augments/discard_lock.js";
import { reload } from "../../../packages/content/src/augments/reload.js";
import { hourglass } from "../../../packages/content/src/augments/hourglass.js";
import { frameUp } from "../../../packages/content/src/augments/frame_up.js";

const base = craft({
  hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
});

// p0 = 봉인술사 + 재장전 + (대조군) 모래시계 · 누명
const s: GameState = {
  ...base,
  players: base.players.map((p) =>
    p.id === "p0"
      ? { ...p, augments: ["discard_lock", "reload", "hourglass", "frame_up"] }
      : p,
  ),
  augmentData: {
    ...base.augmentData,
    // 국이 4번 지났고, 3번째 국에 봉인술사를 썼다 → 아직 쿨다운(2국) 중
    "discard_lock:seq:p0": 4,
    "discard_lock:used:p0": 3,
    // 대조군: 공용 규약(usedSeq)을 쓰는 두 쿨다운 증강도 같은 시점에 소진해 둔다
    "hourglass:seq:p0": 4,
    "hourglass:usedSeq:p0": 3,
    "frame_up:seq:p0": 4,
    "frame_up:usedSeq:p0": 3,
  },
};

const game = createStandardGameFromState(s, undefined, []);
for (const [id, def] of [
  ["discard_lock", discardLock],
  ["reload", reload],
  ["hourglass", hourglass],
  ["frame_up", frameUp],
] as const) {
  void id;
  installAugment(game.engine, def, "p0", { yaku: game.yaku });
}

const opts = (): { type: string; payload: unknown }[] =>
  game.engine.turnOptionProviders.flatMap((p) => p(game.engine.state, "p0"));

const reloadTargets = (): string[] =>
  opts()
    .filter((o) => o.type === "reload_use")
    .map((o) => (o.payload as { augmentId: string }).augmentId);

const sealButton = (): boolean => opts().some((o) => o.type === "seal_hands");

console.log("재장전 후보(= '복구 가능'이라고 화면에 뜨는 것):", reloadTargets());
console.log("  기대: 국 단위 쿨다운 증강(discard_lock/hourglass/frame_up)은 하나도 없어야 한다");
console.log("봉인술사 버튼(쿨다운 중이므로 없어야 정상):", sealButton());
console.log("  discard_lock:used:p0 =", game.engine.state.augmentData["discard_lock:used:p0"]);

const r = game.engine.submit({
  player: "p0",
  type: "reload_use",
  payload: { augmentId: "discard_lock" },
});
console.log("\n재장전 → discard_lock 제출:", r.ok, r.ok ? "" : (r as { reason?: string }).reason);
console.log("  discard_lock:used:p0 =", game.engine.state.augmentData["discard_lock:used:p0"]);
console.log("재장전 직후 봉인술사 버튼:", sealButton(), " ← 쿨다운이 그 자리에서 풀렸다");

const seal = game.engine.submit({ player: "p0", type: "seal_hands", payload: {} });
console.log("실제로 다시 봉인 발동:", seal.ok);
console.log(
  "  p1 봉인 종류:",
  game.engine.state.augmentData["view:p0:round:sealed:p1"],
);

// 대조군 — 공용 규약을 쓰는 쿨다운 증강은 정말로 거부된다
for (const id of ["hourglass", "frame_up"]) {
  const rr = game.engine.submit({ player: "p0", type: "reload_use", payload: { augmentId: id } });
  console.log(`대조군 재장전 → ${id}:`, rr.ok, rr.ok ? "" : (rr as { reason?: string }).reason);
}
