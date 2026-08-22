/**
 * 소환(conjure_draw) × 무르기(take_back) / 시간 정지(time_stop) — 잔량·쿨다운의 상호작용.
 *
 * 기대(먼저 적는다):
 *  ① 소환 → 다음 쯔모가 복제로 바뀐다 → 그 자리에서 무르기를 쓰면
 *     "쯔모한 패를 되돌리고 새로 1장" 이므로 **복제패가 패산 맨 밑으로 들어간다**.
 *     소환은 이미 소모된 채다(매 국 1회). 여기까지는 두 카드 문구의 곱이라 정상.
 *     다만 되돌아간 것은 **생성패**다 — 그 종류는 이제 게임에 5장 이상 존재하고
 *     그 5번째 장이 패산으로 들어가 누구든 뽑을 수 있게 된다. 설명에는 없다.
 *  ② 무르기 뒤 새로 뽑은 패에도 소환이 다시 걸리면 이중 적용이다(그러면 안 된다).
 *  ③ 시간 정지의 추가 순에서 무르기 쿨다운(3순)이 정상적으로 한 순 흐르는가 —
 *     take_back 은 `discardCount` 로 순을 세므로 추가 순도 한 순으로 세어야 한다.
 */
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
  WALL,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { conjureDraw } from "../../../packages/content/src/augments/conjure_draw.js";
import { takeBack } from "../../../packages/content/src/augments/take_back.js";
import { timeStop } from "../../../packages/content/src/augments/time_stop.js";
import {
  craft,
  withAugments,
  handSpec,
  kindKey,
  kindOf,
  kindOverflow,
  tileCensus,
  check,
  section,
  done,
} from "./lib.js";

function scene(augs: string[]): GameState {
  return withAugments(
    craft({
      hands: { p0: "234m567m99p234s55p5z", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z", p1: "2z", p2: "3z", p3: "4z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: augs },
  );
}

const DEFS = { conjure_draw: conjureDraw, take_back: takeBack, time_stop: timeStop } as const;

function build(augs: (keyof typeof DEFS)[]): {
  game: ReturnType<typeof createStandardGameFromState>;
  flow: FlowController;
} {
  const game = createStandardGameFromState(scene(augs));
  for (const a of augs) {
    installAugment(game.engine, DEFS[a], "p0", { yaku: game.yaku, catalog: game.augments });
  }
  const flow = new FlowController(game.engine);
  flow.begin();
  return { game, flow };
}

/** 프롬프트를 소화하며 원하는 액션 타입이 뜨면 그것을 낸다 */
function step(
  game: ReturnType<typeof createStandardGameFromState>,
  flow: FlowController,
  want: string | null,
): { took: boolean; player: PlayerId | null } {
  const st = flow.begin();
  if (st.kind !== "awaiting") return { took: false, player: null };
  const prompt = st.prompts[0];
  if (prompt === undefined) return { took: false, player: null };
  const opts = prompt.options;
  if (want !== null) {
    const hit = opts.find((o) => o.type === want);
    if (hit !== undefined) {
      flow.submit(prompt.player, hit as never);
      return { took: true, player: prompt.player };
    }
  }
  const drawn = game.engine.state.round.lastDrawnTile;
  const tsumogiri = opts.find(
    (o) => o.type === "discard" && (o.payload as { tileId?: number })?.tileId === drawn,
  );
  const pick = tsumogiri ?? opts.find((o) => o.type === "discard") ?? opts.find((o) => o.type === "pass") ?? opts[0];
  if (pick === undefined) return { took: false, player: null };
  flow.submit(prompt.player, pick as never);
  return { took: false, player: prompt.player };
}

const wallTail = (s: GameState, n = 3): string =>
  (s.zones[WALL]?.tileIds ?? []).slice(-n).map((id) => `${id}:${kindKey(kindOf(s, id))}`).join(" ");

section("① 소환 → (다음 쯔모) → 무르기");
{
  const { game, flow } = build(["conjure_draw", "take_back"]);
  // 손패 첫 장(2만)을 소환 대상으로 지목
  const target = game.engine.state.zones["hand:p0"]?.tileIds[0] as number;
  const targetKind = kindKey(kindOf(game.engine.state, target));
  const def = game.engine.actions.get("conjure_tsumo");
  const v = def?.validate(
    { player: "p0", type: "conjure_tsumo", payload: { tileId: target } } as never,
    { state: game.engine.state, rules: game.engine.rules } as never,
  );
  check("소환 발동", v === null, String(v));
  flow.submit("p0", { type: "conjure_tsumo", payload: { tileId: target } });
  console.log(`  소환 목표 = ${targetKind}`);

  // 한 바퀴 돌려 p0 의 다음 쯔모까지 간다
  for (let i = 0; i < 8; i++) {
    const before = game.engine.state.round.lastDrawnTile;
    step(game, flow, null);
    const s = game.engine.state;
    if (
      s.round.turnSeat === 0 &&
      s.round.phase === "turn.act" &&
      s.round.lastDrawnTile !== null &&
      s.round.lastDrawnTile !== before
    ) {
      break;
    }
  }
  const s1 = game.engine.state;
  const drawn = s1.round.lastDrawnTile as number;
  console.log(`  다음 쯔모 = ${drawn}:${kindKey(kindOf(s1, drawn))} (소환 목표 ${targetKind})`);
  check("소환이 쯔모를 복제로 바꿨다", kindKey(kindOf(s1, drawn)) === targetKind, kindKey(kindOf(s1, drawn)));
  console.log(`  5장 이상: ${JSON.stringify(kindOverflow(s1))}`);

  // 같은 순에 무르기
  const tb = game.engine.actions.get("take_back");
  const tv = tb?.validate(
    { player: "p0", type: "take_back", payload: {} } as never,
    { state: s1, rules: game.engine.rules } as never,
  );
  console.log(`  take_back validate = ${JSON.stringify(tv)}`);
  if (tv === null) {
    flow.submit("p0", { type: "take_back", payload: {} });
    const s2 = game.engine.state;
    const newDrawn = s2.round.lastDrawnTile as number;
    console.log(`  무른 뒤 쯔모 = ${newDrawn}:${kindKey(kindOf(s2, newDrawn))}`);
    console.log(`  패산 맨 밑 3장 = ${wallTail(s2)}`);
    check(
      "무른 뒤 새 쯔모에 소환이 다시 걸리지 않는다",
      kindKey(kindOf(s2, newDrawn)) !== targetKind || newDrawn === drawn,
      `새 쯔모=${kindKey(kindOf(s2, newDrawn))}`,
    );
    check(
      "되돌린 생성패가 패산 맨 밑에 있다",
      (s2.zones[WALL]?.tileIds ?? []).at(-1) === drawn,
      String((s2.zones[WALL]?.tileIds ?? []).at(-1)),
    );
    console.log(`  손패 = ${handSpec(s2, "p0")}`);
    const c = tileCensus(s2);
    check("존 중복 없음", c.dupes.length === 0, c.dupes.join(","));
    check("총 136장", c.total === 136, String(c.total));
    console.log(`  5장 이상: ${JSON.stringify(kindOverflow(s2))}`);
  }
}

section("② 시간 정지의 추가 순은 무르기 쿨다운을 한 순 진행시키는가");
{
  const { game, flow } = build(["time_stop", "take_back"]);
  // 첫 순에 무르기 사용
  flow.submit("p0", { type: "take_back", payload: {} });
  const s0 = game.engine.state;
  console.log(`  무르기 사용 turnNo=${s0.round.byPlayer["p0"]?.discardCount}`);
  // 시간 정지 선언 후 버림 → 같은 좌석이 한 번 더
  const ts = game.engine.actions.get("time_stop_use");
  const tv = ts?.validate(
    { player: "p0", type: "time_stop_use", payload: {} } as never,
    { state: game.engine.state, rules: game.engine.rules } as never,
  );
  check("시간 정지 발동", tv === null, String(tv));
  flow.submit("p0", { type: "time_stop_use", payload: {} });
  step(game, flow, null); // p0 버림 → 추가 순
  const s1 = game.engine.state;
  console.log(
    `  버림 뒤 turnSeat=${s1.round.turnSeat} phase=${s1.round.phase} discardCount(p0)=${s1.round.byPlayer["p0"]?.discardCount}`,
  );
  step(game, flow, null); // 추가 쯔모
  const s2 = game.engine.state;
  console.log(
    `  추가 순: turnSeat=${s2.round.turnSeat} discardCount(p0)=${s2.round.byPlayer["p0"]?.discardCount}`,
  );
  const tb = game.engine.actions.get("take_back");
  const v2 = tb?.validate(
    { player: "p0", type: "take_back", payload: {} } as never,
    { state: s2, rules: game.engine.rules } as never,
  );
  console.log(`  추가 순에서 take_back validate = ${JSON.stringify(v2)}`);
  check("추가 순(2순째)에서는 아직 쿨다운 중", v2 !== null, String(v2));
}

done();
