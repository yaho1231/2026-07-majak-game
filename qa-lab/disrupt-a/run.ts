/**
 * disrupt-a 통합 러너 — 상태 불변식 + 이벤트/정산 불변식.
 * 사용: tsx qa-lab/disrupt-a/run.ts <seedFrom> <seedTo> [presetName]
 * 결과는 게임마다 즉시 stdout에 한 줄.
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type { GameEvent, GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS, checkState } from "./h.js";
import type { Persona, Violation } from "./h.js";
import { checkDisrupt, newCtx } from "./inv.js";

const D = ["pseudo_dealer", "scapegoat", "hidden_river", "discard_lock",
  "seat_swap", "parasite", "time_stop", "rank_gate"] as const;

const PRESETS: Record<string, Record<PlayerId, string[]>> = {
  split: { p0: [D[0], D[1]], p1: [D[2], D[3]], p2: [D[4], D[5]], p3: [D[6], D[7]] },
  rot: { p0: [D[2], D[5]], p1: [D[7], D[0]], p2: [D[1], D[6]], p3: [D[3], D[4]] },
  mark: { p0: ["scapegoat", "rank_gate"], p1: ["parasite", "discard_lock"], p2: ["scapegoat", "parasite"], p3: ["rank_gate", "discard_lock"] },
  dealer: { p0: ["pseudo_dealer", "seat_swap"], p1: ["pseudo_dealer", "seat_swap"], p2: ["time_stop", "hidden_river"], p3: ["time_stop", "hidden_river"] },
  all4: { p0: [...D], p1: [], p2: [], p3: [] },
  scapeonly: { p0: ["scapegoat"], p1: ["scapegoat"], p2: [], p3: [] },
  paraonly: { p0: ["parasite"], p1: [], p2: ["parasite"], p3: [] },
  gateonly: { p0: ["rank_gate"], p1: [], p2: ["rank_gate"], p3: [] },
  lockonly: { p0: ["discard_lock"], p1: [], p2: ["discard_lock"], p3: [] },
  tsonly: { p0: ["time_stop"], p1: ["time_stop"], p2: ["time_stop"], p3: ["time_stop"] },
};

const PSETS: Record<string, Record<PlayerId, Persona>> = {
  masher: { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.masher!, p3: PERSONAS.masher! },
  stallfold: { p0: PERSONAS.stall!, p1: PERSONAS.folder!, p2: PERSONAS.stall!, p3: PERSONAS.folder! },
  caller: { p0: PERSONAS.caller!, p1: PERSONAS.caller!, p2: PERSONAS.caller!, p3: PERSONAS.caller! },
};

interface Settled {
  outcome: string;
  deltas: Record<string, number>;
  winInfos?: { winner: PlayerId; winType: string; han: number; yakumanCount: number; extraHan?: number }[];
  dealerSeat: number;
  rotationSeat?: number;
  roundNumber: number;
  prevalentWind: number;
}

function analyzeRound(
  events: readonly GameEvent[],
  pre: GameState,
  out: Violation[],
): void {
  const rk = `${pre.round.prevalentWind}-${pre.round.roundNumber}-${pre.round.honba}`;
  const add = (kind: string, detail: string): void => { if (out.length < 300) out.push({ kind, detail, round: rk }); };

  // 이 국에 걸린 지목
  const ad = pre.augmentData;
  const scapeTargets: Record<string, string> = {};
  const paraTargets: Record<string, string> = {};
  const gateTargets: Record<string, string> = {};
  for (const [k, v] of Object.entries(ad)) {
    if (typeof v !== "string") continue;
    let m = /^scapegoat:target:(.+):(p\d)$/.exec(k);
    if (m !== null && m[1] === rk) scapeTargets[m[2]!] = v;
    m = /^parasite:target:(p\d):(.+)$/.exec(k);
    if (m !== null && m[2] === rk) paraTargets[m[1]!] = v;
    m = /^rank_gate:mark:(.+):(p\d)$/.exec(k);
    if (m !== null && m[1] === rk) gateTargets[m[2]!] = v;
  }

  // 쯔모 순서(영상 제외) / time_stop 선언
  const draws: (PlayerId | "CALL")[] = [];
  const declares: Record<string, number> = {};
  let usurped: PlayerId | null = null;
  let settled: Settled | null = null;
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    if (e.type === "TileDrawn" && p.rinshan !== true) draws.push(p.player as PlayerId);
    if (e.type === "CallMade") draws.push("CALL");
    if (e.type === "DealerUsurped") usurped = p.holder as PlayerId;
    if (e.type === "AugmentDataSet") {
      const k = String(p.key);
      if (/^time_stop:used:/.test(k) && p.value === true) {
        const who = k.split(":").pop()!;
        declares[who] = (declares[who] ?? 0) + 1;
      }
    }
    if (e.type === "RoundSettled") settled = p as unknown as Settled;
  }

  // 1) time_stop — 선언 수보다 추가 턴이 많으면 안 된다
  const extras: Record<string, number> = {};
  for (let i = 1; i < draws.length; i++) {
    const cur = draws[i];
    if (cur === "CALL" || draws[i - 1] === "CALL") continue;
    if (cur === draws[i - 1]) extras[cur as string] = (extras[cur as string] ?? 0) + 1;
  }
  for (const [who, n] of Object.entries(declares)) {
    if (n > 1) add("TIMESTOP_MULTI_DECLARE", `${who} ${n}회/국`);
  }
  for (const [who, n] of Object.entries(extras)) {
    const d = declares[who] ?? 0;
    if (n > d) add("TIMESTOP_EXTRA_GT_DECLARE", `${who} 추가턴 ${n} > 선언 ${d}`);
  }

  if (settled === null) return;
  const s = settled;

  // 2) scapegoat — 보유자 쯔모 + 지목 시, 제3자 지불은 0이어야 한다
  for (const [holder, target] of Object.entries(scapeTargets)) {
    const wi = (s.winInfos ?? []).find((w) => w.winner === holder && w.winType === "tsumo");
    if (wi === undefined) continue;
    for (const pl of pre.players) {
      if (pl.id === holder || pl.id === target) continue;
      const d = s.deltas[pl.id] ?? 0;
      if (d < 0) add("SCAPEGOAT_THIRD_PARTY_PAYS", `${holder}쯔모 target=${target} ${pl.id} delta=${d}`);
    }
  }

  // 3) rank_gate — 지목당한 사람이 화료했다면 5판 이상(또는 역만)이어야 한다
  for (const [holder, target] of Object.entries(gateTargets)) {
    for (const w of s.winInfos ?? []) {
      if (w.winner !== target) continue;
      const han = w.han + (w.extraHan ?? 0);
      if (w.yakumanCount > 0) continue;
      if (han < 5) add("RANKGATE_CHEAP_WIN", `${holder}->${target} han=${w.han}+${w.extraHan ?? 0}`);
    }
  }
  // 2b) scapegoat — 보유자 쯔모 시 지목자 지불 = 보유자 수령 (다른 증강 없을 때)
  for (const [holder, target] of Object.entries(scapeTargets)) {
    const wi = (s.winInfos ?? []).find((w) => w.winner === holder && w.winType === "tsumo");
    if (wi === undefined) continue;
    const dh = s.deltas[holder] ?? 0;
    const dt = s.deltas[target] ?? 0;
    if (dh + dt !== 0) add("SCAPEGOAT_SUM", `${holder}=${dh} ${target}=${dt} (합 ${dh + dt})`);
  }
  // 5) parasite — 숙주가 잃는 국엔 영향이 없어야 한다
  for (const [holder, host] of Object.entries(paraTargets)) {
    const dh = s.deltas[host] ?? 0;
    const dp = s.deltas[holder] ?? 0;
    if (dh < 0 && dp > 0 && (s.winInfos ?? []).every((w) => w.winner !== holder)) {
      add("PARASITE_GAIN_ON_HOST_LOSS", `host=${host}(${dh}) holder=${holder}(${dp})`);
    }
  }

  // 4) pseudo_dealer — 강탈한 국이 끝나면 rotationSeat 기준으로 이어져야 한다
  if (usurped !== null) {
    const rotBefore = pre.round.rotationSeat ?? pre.round.dealerSeat;
    const renchan = s.roundNumber === pre.round.roundNumber && s.prevalentWind === pre.round.prevalentWind;
    if (!renchan) {
      const expected = (rotBefore + 1) % 4;
      if (s.rotationSeat !== undefined && s.rotationSeat !== expected) {
        add("PSEUDO_ROTATION_BROKEN", `rotBefore=${rotBefore} next=${s.rotationSeat} expected=${expected}`);
      }
      if (s.dealerSeat !== s.rotationSeat) {
        add("PSEUDO_DEALER_ROT_MISMATCH", `dealerSeat=${s.dealerSeat} rotationSeat=${s.rotationSeat}`);
      }
    }
  }
}

async function one(seed: number, mode: "hanchan" | "tonpuu", pname: string, sname: string): Promise<void> {
  const preset = PRESETS[pname]!;
  const personas = PSETS[sname]!;
  const violations: Violation[] = [];
  const agents = SEATS.map((id, i) => new PersonaAgent(id, personas[id]!, seed * 131 + i * 7 + 1));
  const ledger = { notes: [] as string[], reasons: [] as string[] } as never;
  const c = newCtx();
  const effectErrors: string[] = [];
  let rounds = 0;
  let cursor = 0;
  let preState: GameState | null = null;
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG, mode, seed,
    maxWind: mode === "tonpuu" ? 1 : 2,
    westEntry: false,
    draftSchedules: [],
    extraAugments: contentAugments,
    presetAugments: preset,
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundStart: (g: { engine: { eventLog: GameEvent[]; state: GameState } }) => {
      rounds++; cursor = g.engine.eventLog.length; preState = g.engine.state;
    },
    onRoundEnd: (g: { engine: { eventLog: GameEvent[] } }) => {
      if (preState !== null) analyzeRound(g.engine.eventLog.slice(cursor), preState, violations);
      cursor = g.engine.eventLog.length;
    },
    onEffectError: (f: unknown) => { if (effectErrors.length < 20) effectErrors.push(JSON.stringify(f).slice(0, 200)); },
  } as never);
  ctrl.addSpectator({
    id: "qa",
    sendView: () => {
      const st = ctrl.gameState;
      if (st === null) return;
      checkState(st, violations, ledger);
      checkDisrupt(st, violations, c);
    },
  });
  let crash = "";
  try {
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error("TIMEOUT 120s (소프트락 의심)")), 120_000);
      ctrl.run().then(() => { clearTimeout(t); res(); }, (e) => { clearTimeout(t); rej(e); });
    });
  } catch (e) { crash = e instanceof Error ? e.message : String(e); }
  const uniq = new Map<string, number>();
  for (const v of violations) {
    const k = `${v.kind}: ${v.detail}`.slice(0, 150);
    uniq.set(k, (uniq.get(k) ?? 0) + 1);
  }
  const tag = `${pname}/${sname}/seed=${seed}/${mode}`;
  console.log(`${tag} rounds=${rounds} crash=${crash || "-"} eff=${effectErrors.length} viol=${uniq.size}`);
  for (const [k, n] of uniq) console.log(`    x${n} ${k}`);
  for (const e of effectErrors.slice(0, 3)) console.log(`    EFF ${e}`);
}

const a = process.argv.slice(2);
const from = Number(a[0] ?? 1), to = Number(a[1] ?? 4);
const onlyP = a[2];
for (let seed = from; seed <= to; seed++) {
  for (const pname of Object.keys(PRESETS)) {
    if (onlyP !== undefined && pname !== onlyP) continue;
    for (const sname of Object.keys(PSETS)) {
      await one(seed, seed % 2 === 0 ? "tonpuu" : "hanchan", pname, sname);
    }
  }
}
