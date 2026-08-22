/**
 * 멘젠 복구 축 — silent_pact(묵계) × meld_dissolve(파혼) × open_riichi(개문선언)
 *
 * 설명이 약속한 것:
 *  - 묵계: "⚠ 이 증강으로 부른 퐁 1회만 멘젠이 유지된다. 같은 국에 평범한 퐁·치·대명깡을
 *    하나라도 더 하면 손이 열려 **전부 잃는다**(안깡은 예외)."
 *  - 파혼: "후로가 하나뿐이었다면 그 순간 손이 다시 멘젠이 되어 리치를 걸 수 있다."
 *
 * 기대(먼저 적음):
 *  1) 묵계 퐁 하나만 → 멘젠(리치 가능 · 멘젠쯔모 성립)
 *  2) 묵계 퐁 + 평범한 퐁 → 손이 열린다 (리치 불가 · 멘젠쯔모 없음)
 *  3) 그 상태에서 파혼으로 **평범한 퐁**을 해체 → 묵계는 이미 "전부 잃었다"이므로
 *     여전히 열린 손이어야 한다. (묵계가 되살아나면 설명 위반)
 *  4) 파혼 대상 목록에 묵계 퐁도 뜨는가 / 해체하면 손패 장수는 맞는가
 */
import {
  FlowController,
  handIdsOf,
  meldCountOf,
  openMeldCountOf,
} from "@majak/core";
import type { GameState, Meld, PlayerId } from "@majak/core";
import { craft, start, table, winReport } from "./lib.js";
import { silentPact } from "../../../packages/content/src/augments/silent_pact.js";
import { meldDissolve } from "../../../packages/content/src/augments/meld_dissolve.js";

/** 크래프트한 후로에 silent 표식을 단다 (묵계 퐁과 같은 상태) */
function markSilent(s: GameState, p: PlayerId, index: number): GameState {
  const rs = s.round.byPlayer[p]!;
  const melds: Meld[] = rs.melds.map((m, i) =>
    i === index ? { ...m, silent: true } : m,
  );
  return {
    ...s,
    round: { ...s.round, byPlayer: { ...s.round.byPlayer, [p]: { ...rs, melds } } },
  };
}

// ── ① 실제 묵계 퐁 액션으로 silent 후로가 생기는지부터 확인 ────────────────
{
  const base = craft({
    hands: { p0: "234m567p99s77z", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "111p", from: "p2" }] },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "7z" },
  });
  const g = start(base, [silentPact, meldDissolve]);
  const r = g.engine.submit({
    player: "p0" as PlayerId,
    type: "silent_pon",
    payload: {
      tileIds: handIdsOf(g.engine.state, "p0" as PlayerId)
        .filter((id) => {
          const k = g.engine.state.tiles[id]!.kind;
          return k.suit === "dragon" && k.rank === 3;
        })
        .slice(0, 2),
    },
  });
  const st = g.engine.state;
  table("① 평범한 퐁 1개 있는 상태에서 묵계 퐁", [
    { label: "silent_pon 결과", value: r.ok ? "OK" : JSON.stringify(r).slice(0, 120) },
    { label: "melds", value: (st.round.byPlayer["p0"]?.melds ?? []).map((m) => `${m.kind}${m.silent === true ? "(silent)" : ""}`) },
    { label: "openMeldCount (0이면 멘젠)", value: openMeldCountOf(st, "p0" as PlayerId) },
    { label: "meldCount", value: meldCountOf(st, "p0" as PlayerId) },
    { label: "손패 장수", value: handIdsOf(st, "p0" as PlayerId).length },
  ]);
}

// ── ② 묵계 퐁 + 평범한 퐁 → 파혼으로 평범한 쪽을 해체 ──────────────────────
function scene2(): GameState {
  const base = craft({
    // 손 8장 + 후로 2개(6장) = 14장 (자기 턴, 버릴 차례)
    hands: { p0: "234m567p99s", p1: "*", p2: "*", p3: "*" },
    melds: {
      p0: [
        { kind: "pon", spec: "777z", from: "p1" }, // 묵계로 부른 퐁 (아래에서 표식)
        { kind: "pon", spec: "111p", from: "p2" }, // 평범한 퐁
      ],
    },
    phase: "turn.act",
    turnSeat: 0,
  });
  return markSilent(base, "p0" as PlayerId, 0);
}

function meldState(s: GameState): unknown {
  return {
    melds: (s.round.byPlayer["p0"]?.melds ?? []).map(
      (m) => `${m.kind}${m.silent === true ? "(silent)" : ""}`,
    ),
    open: openMeldCountOf(s, "p0" as PlayerId),
    hand: handIdsOf(s, "p0" as PlayerId).length,
  };
}

{
  const g = start(scene2(), [silentPact, meldDissolve]);
  const before = meldState(g.engine.state);
  // 파혼 후보 목록
  const flow = new FlowController(g.engine);
  const status = flow.begin();
  const opts =
    status.kind === "awaiting"
      ? (status.prompts.find((p) => p.player === "p0")?.options ?? [])
      : [];
  const dissolveOpts = opts.filter((o) => o.type === "dissolve_meld");
  const r = g.engine.submit({
    player: "p0" as PlayerId,
    type: "dissolve_meld",
    payload: { meldIndex: 1 }, // 평범한 퐁
  });
  table("② 묵계 퐁 + 평범한 퐁 → 평범한 쪽을 파혼", [
    { label: "해체 전", value: before },
    { label: "파혼 후보 개수(묵계 퐁도 뜨나)", value: dissolveOpts.map((o) => JSON.stringify(o.payload)) },
    { label: "dissolve 결과", value: r.ok ? "OK" : JSON.stringify(r).slice(0, 160) },
    { label: "해체 후", value: meldState(g.engine.state) },
    {
      label: "리치 가능?(riichi.requiresClosed 대비 openMeldCount)",
      value: openMeldCountOf(g.engine.state, "p0" as PlayerId) === 0 ? "멘젠 — 리치 가능" : "열린 손",
    },
  ]);
}

// ── ③ 그 손으로 쯔모하면 멘젠쯔모가 붙나 (대조군 4칸) ─────────────────────
/** 묵계 퐁 + (평범한 퐁 유무) 상태에서 p0 쯔모 화료 */
function winScene(opts: { extraPon: boolean; silent: boolean }): GameState {
  const melds: { kind: Meld["kind"]; spec: string; from?: PlayerId }[] = [
    { kind: "pon", spec: "777z", from: "p1" as PlayerId },
  ];
  if (opts.extraPon) melds.push({ kind: "pon", spec: "111p", from: "p2" as PlayerId });
  // 손패: 후로 1개면 11장(쯔모 포함), 2개면 8장
  const hand = opts.extraPon ? "234m567p99s" : "234m567p234s99s";
  const base = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    melds: { p0: melds },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0" as PlayerId,
  });
  return opts.silent ? markSilent(base, "p0" as PlayerId, 0) : base;
}

for (const cell of [
  { label: "A. 후로 1개 · 평범", v: { extraPon: false, silent: false } },
  { label: "B. 후로 1개 · 묵계", v: { extraPon: false, silent: true } },
  { label: "C. 후로 2개 · 묵계+평범", v: { extraPon: true, silent: true } },
]) {
  const g = start(winScene(cell.v), [silentPact, meldDissolve]);
  const r = winReport(g, "p0" as PlayerId);
  table(`③ ${cell.label}`, [
    { label: "화료", value: r.err === null ? "OK" : r.err },
    { label: "han/fu", value: `${r.han}/${r.fu}` },
    { label: "yaku", value: r.yaku },
    { label: "손 점수", value: r.points },
  ]);
}
