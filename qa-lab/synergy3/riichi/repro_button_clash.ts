/**
 * "리치를 거는 버튼"이 여럿일 때 — 리치는 국당 한 번뿐이다.
 *
 * no_retreat · all_or_nothing · open_riichi_reveal · soul_strike · stealth_riichi 는
 * 전부 **자기만의 리치 선언 액션**이다. 서로 conflicts가 아니고(스텔스 목록 제외),
 * 시너지 표에서는 전부 `riichi` 태그라 드래프트가 **함께 뜨도록 끌어당긴다**.
 * 실제로는 한 국에 하나만 쓸 수 있다 — 나머지는 그 국 내내 죽은 카드다.
 */
import { craft, mkGame, setIndicators, withAugments, optionsFor, FlowController } from "./lib.js";
import type { ActionOption, GameState } from "@majak/core";

const RIICHI_ACTIONS = [
  "riichi",
  "no_retreat_riichi",
  "all_in_riichi",
  "open_riichi",
  "soul_strike",
  "stealth_riichi",
];

function scene(augs: string[]): GameState {
  let s = craft({
    hands: { p0: "123m456m789m222p1s9s", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "123z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  return withAugments(s, { p0: augs });
}

function buttons(status: unknown): string[] {
  return RIICHI_ACTIONS.filter((t) => optionsFor(status, "p0").some((o) => o.type === t));
}

function run(augs: string[], use: string): void {
  const st = scene(augs);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  const before = buttons(status);
  const opt = optionsFor(status, "p0").find((o) => {
    if (o.type !== use) return false;
    const id = (o.payload as { tileId?: number }).tileId;
    if (id === undefined) return false;
    const k = game.engine.state.tiles[id]!.kind;
    return k.suit === "sou" && k.rank === 9;
  });
  if (opt === undefined) {
    console.log(`  [${use}] 후보 없음`);
    return;
  }
  status = flow.submit("p0", opt);
  // 같은 순에 남은 버튼(리치 선언 뒤) — 그리고 남은 사용 횟수 표식
  const after = buttons(status);
  const uses = Object.entries(game.engine.state.augmentData)
    .filter(([k]) => /uses|used|usedSeq|cooldown/.test(k) && !k.startsWith("view:"))
    .map(([k, v]) => `${k.split(":").slice(0, 2).join(":")}=${String(v)}`);
  console.log(
    `  선언=${use.padEnd(18)} 선언 전 버튼=[${before.join(",")}] → 선언 후=[${after.join(",")}] 소모기록=[${uses.join(" ")}]`,
  );
}

const ALL = ["no_retreat", "all_or_nothing", "open_riichi_reveal", "soul_strike"];
console.log(`p0 = ${ALL.join(" + ")} (전부 conflicts 아님)`);
for (const use of ["riichi", "no_retreat_riichi", "all_in_riichi", "open_riichi", "soul_strike"]) {
  run(ALL, use);
}
