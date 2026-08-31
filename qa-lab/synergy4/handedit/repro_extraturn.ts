/**
 * 추가 순(順)을 만드는 카드끼리 — 시간 정지(time_stop) × 영혼의 일격(soul_strike)
 * / 뒤집힌 모래시계(hourglass).
 *
 * 세 카드 전부 `TURN_PASSED` 인터셉터로 nextSeat 을 보유자로 되돌려 «추가 순»을 만든다.
 *
 * 예측(먼저 적는다):
 *   - 시간 정지 단독: 보유자의 순이 1번 늘어난다 (기준선 N → N+1).
 *   - 영혼의 일격 단독: 리치 + 연속 6쯔모 = 보유자 버림 6회.
 *   - A+B(같은 좌석): 폭주 중 시간 정지를 선언하면 **7회**여야 한다.
 *     그런데 폭주 중에는 이미 nextSeat 이 보유자로 고정돼 있으므로, 시간 정지의
 *     인터셉터가 하는 일이 없고 «되돌림이 적용됐다»고 판정하는 리액션
 *     (`turnSeat === seat`)이 그대로 참이 되어 armed 를 내린다 →
 *     **매 국 1회 충전이 아무 이득 없이 소모된다(6회 그대로)**고 의심한다.
 *   - 모래시계 연장(솔로 4순) 중에도 같은 모양을 의심한다: 4 → 5 가 아니라 4.
 */
import {
  FlowController,
  WALL,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { timeStop } from "../../../packages/content/src/augments/time_stop.js";
import { soulStrike } from "../../../packages/content/src/augments/soul_strike.js";
import { hourglass } from "../../../packages/content/src/augments/hourglass.js";
import { craft, withAugments, check, section, done } from "./lib.js";

const DEFS: Record<string, Parameters<typeof installAugment>[1]> = {
  time_stop: timeStop,
  soul_strike: soulStrike,
  hourglass,
};

function trimWall(s: GameState, n: number): GameState {
  const ids = s.zones[WALL]?.tileIds ?? [];
  const keep = ids.slice(0, n);
  const drop = ids.slice(n);
  const p3 = s.zones["discards:p3"];
  return {
    ...s,
    zones: {
      ...s.zones,
      [WALL]: { ...(s.zones[WALL] as never), tileIds: keep },
      "discards:p3": { ...(p3 as never), tileIds: [...(p3?.tileIds ?? []), ...drop] },
    },
  };
}

/** p0 은 멘젠 텐파이(3만 단기), 나머지는 아무 손 */
function scene(augs: string[], wall: number): GameState {
  const base = craft({
    hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "5m5p", p1: "2z", p2: "5z", p3: "6z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return trimWall(withAugments(base, { p0: augs }), wall);
}

interface DriveOpts {
  /** 제시되면 누르는 증강 액션 (한 번만) */
  press?: string[];
  /** 그 액션을 누를 수 있는 시점 제한 (state 를 보고 판단) */
  when?: Record<string, (s: GameState) => boolean>;
  maxSteps?: number;
}

/**
 * 화료·후로는 피하고 쯔모기리만 한다. `press` 에 적힌 액션은 제시되는 즉시 누른다
 * (soul_strike 는 버릴 패가 필요해 payload 가 있는 후보 중 첫 번째를 고른다).
 */
function drive(
  game: ReturnType<typeof createStandardGameFromState>,
  flow: FlowController,
  o: DriveOpts = {},
): { outcome: string; steps: number; p0Discards: number; pressed: string[]; log: string[]; seq: string; runMax: number } {
  const want = new Set(o.press ?? []);
  const pressed: string[] = [];
  const log: string[] = [];
  let st = flow.begin();
  let steps = 0;
  let p0Discards = 0;
  const seat: string[] = [];
  while (st.kind === "awaiting" && steps < (o.maxSteps ?? 400)) {
    steps++;
    const prompt = st.prompts[0];
    if (prompt === undefined) break;
    const opts = prompt.options;
    let pick = undefined as (typeof opts)[number] | undefined;
    if (prompt.player === "p0") {
      for (const t of want) {
        const gate = o.when?.[t];
        if (gate !== undefined && !gate(game.engine.state)) continue;
        const hit = opts.find((x) => x.type === t);
        if (hit !== undefined) {
          pick = hit;
          want.delete(t);
          pressed.push(t);
          break;
        }
      }
    }
    if (pick === undefined) {
      const drawn = game.engine.state.round.lastDrawnTile;
      pick =
        opts.find(
          (x) => x.type === "discard" && (x.payload as { tileId?: number })?.tileId === drawn,
        ) ??
        opts.find((x) => x.type === "discard") ??
        opts.find((x) => x.type === "pass") ??
        opts[0];
    }
    if (pick === undefined) break;
    if (prompt.player === "p0" && (pick.type === "discard" || pick.type === "soul_strike")) {
      p0Discards++;
    }
    if (pick.type === "discard" || pick.type === "soul_strike") seat.push(prompt.player.slice(1));
    log.push(`${prompt.player}:${pick.type}`);
    st = flow.submit(prompt.player, pick as never);
  }
  let best = 0;
  let cur = 0;
  for (const x of seat) {
    if (x === "0") { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return {
    outcome: st.kind === "roundOver" ? st.outcome : `stuck(${st.kind})`,
    steps,
    p0Discards,
    pressed,
    log,
    seq: seat.join(""),
    runMax: best,
  };
}

function run(
  label: string,
  augs: string[],
  wall: number,
  press: string[],
  when?: Record<string, (s: GameState) => boolean>,
): { p0Discards: number; runMax: number; seq: string; pressed: string[]; state: GameState } {
  const st = scene(augs, wall);
  const game = createStandardGameFromState(st);
  for (const a of augs) {
    installAugment(game.engine, DEFS[a] as never, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
  }
  const flow = new FlowController(game.engine);
  const r = drive(game, flow, when === undefined ? { press } : { press, when });
  console.log(
    `  · ${label}: p0 버림 ${r.p0Discards}회 · **최장 p0 연속 ${r.runMax}** · 누른 것 [${r.pressed.join(",")}] · 결과 ${r.outcome}\n      순서열 ${r.seq}`,
  );
  return { p0Discards: r.p0Discards, runMax: r.runMax, seq: r.seq, pressed: r.pressed, state: game.engine.state };
}

// ─────────────────────────────────────────────────────────────
section("§1 시간 정지 단독 — 추가 순이 실제로 붙는가 (기준선)");
// 패산 12장 = p0 3순 + 나머지. 시간 정지를 누르면 p0 이 한 번 더 돈다.
const base1 = run("A0: 아무것도 안 누름 (time_stop 보유)", ["time_stop"], 40, []);
const ts1 = run("A1: time_stop 누름", ["time_stop"], 40, ["time_stop_use"]);
check(
  "시간 정지 단독 — p0 가 연속 2순을 받는다 (기준선: 추가 순은 실제로 붙는다)",
  ts1.runMax === base1.runMax + 1,
  `연속 ${base1.runMax} → ${ts1.runMax}`,
);

// ─────────────────────────────────────────────────────────────
section("§2 영혼의 일격 × 시간 정지 — 폭주 중 추가 순이 겹칠 때");
const ss = run("B: soul_strike 만", ["soul_strike"], 40, ["soul_strike"]);
const ssts = run(
  "A+B: soul_strike → 폭주 중 time_stop",
  ["soul_strike", "time_stop"],
  40,
  ["soul_strike", "time_stop_use"],
);
check(
  "폭주 중 시간 정지를 눌렀다 (제시는 됐다)",
  ssts.pressed.includes("time_stop_use"),
  ssts.pressed.join(","),
);
check(
  "A+B 의 연속 순은 A 보다 1 많아야 한다 (6쯔모 + 추가 1순)",
  ssts.runMax === ss.runMax + 1,
  `soul_strike 연속 ${ss.runMax} vs +time_stop 연속 ${ssts.runMax} (순서열 동일? ${String(ss.seq === ssts.seq)})`,
);
console.log(
  `    time_stop used 플래그 = ${JSON.stringify(
    Object.entries(ssts.state.augmentData).filter(([k]) => k.startsWith("time_stop")),
  )}`,
);

// ─────────────────────────────────────────────────────────────
section("§3 모래시계 연장 × 시간 정지");
const opened = (s: GameState): boolean =>
  Object.entries(s.augmentData).some(
    ([k, v]) => k.startsWith("hourglass:opened") && v === true,
  );
const hg = run("C: hourglass 만", ["hourglass"], 1, []);
const hgts = run(
  "A+C: hourglass 연장 «중»에만 time_stop",
  ["hourglass", "time_stop"],
  1,
  ["time_stop_use"],
  { time_stop_use: opened },
);
check(
  "연장 중 시간 정지를 눌렀다",
  hgts.pressed.includes("time_stop_use"),
  hgts.pressed.join(","),
);
check(
  "A+C 의 연장 솔로 순은 C 보다 1 많아야 한다 (4순 + 추가 1순)",
  hgts.runMax === hg.runMax + 1,
  `hourglass 연속 ${hg.runMax} vs +time_stop 연속 ${hgts.runMax} (순서열 동일? ${String(hg.seq === hgts.seq)})`,
);
console.log(
  `    time_stop used 플래그 = ${JSON.stringify(
    Object.entries(hgts.state.augmentData).filter(([k]) => k.startsWith("time_stop")),
  )}`,
);

done();
