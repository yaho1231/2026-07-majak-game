/**
 * 정보 축 조합 스위프 — 실제 판을 돌리며 **좌석별 PlayerView 직렬화**를 매 브로드캐스트마다
 * 검사한다(에이전트의 sendView = 서버가 실제로 보내는 그 뷰).
 *
 * 검사하는 불변식
 *  H  남의 손패가 보인다 — 손패를 여는 증강을 안 들었는데 보이면 누출
 *  W  패산이 보인다 — 밑장빼기를 안 들었는데 보이면 누출
 *  D  왕패가 보인다 — 왕패를 여는 증강을 안 들었는데 보이면 누출
 *  CX 남이 «가려진 도라»를 들었는데 내 뷰에 도라 표시패가 실렸다 (은폐 실패)
 *  CB 내가 «가려진 도라»를 들었는데 내 뷰에 도라 표시패가 없다 (자기 눈이 멀었다)
 *  S  tiles 맵에 어느 존에서도 안 보이는 패가 실렸다 (revealTiles 채널 누출 후보)
 *
 * 사용: tsx qa-lab/synergy4/info/sweep.ts [pairs|triples] [seeds]
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  DEAD_WALL,
  WALL,
  discardsZone,
  handZone,
} from "@majak/core";
import type { GameState, PlayerId, PlayerView } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, conflicting } from "../../harness.js";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];

/** 이 축의 증강 */
export const AXIS = [
  // wall_info
  "ura_peek", "rinshan_preview", "future_sight", "bottom_deal", "cliff_bloom",
  "foresight", "dead_wall_master", "conjure_draw", "triple_peek",
  // opp_info
  "peek_riichi_waits", "xray_hand", "hidden_river", "hand_swap3",
  "full_hand_swap", "dora_conceal", "brief_fog", "tenpai_scan", "danger_sense",
  // dora info
  "red_five_touch", "mirror_dora", "dora_afterimage",
];

/** 남의 손패를 정당하게 볼 수 있는 증강 */
const HAND_OPENERS = new Set(["xray_hand", "hand_swap3", "full_hand_swap", "discard_lock"]);
/** 패산을 정당하게 볼 수 있는 증강 */
const WALL_OPENERS = new Set(["bottom_deal"]);
/** 왕패를 정당하게 볼 수 있는 증강 */
const DEAD_OPENERS = new Set(["dead_wall_master", "rinshan_preview", "cliff_bloom", "ura_peek"]);

export interface Hit {
  kind: string;
  seat: PlayerId;
  detail: string;
}

/** 관전 뷰에서 읽은 «좌석 전용 채널» 소유 맵 (seat:{owner}:{ch}) */
const owners: { map: Map<string, Set<string>>; specDora: number } = { map: new Map(), specDora: 0 };
/** 같은 이름을 «전원 공개»로도 쓰는 채널 — 소유 판정의 오탐이라 제외한다 */
const DUAL_CHANNELS = ["bottom_deal:armed:", "mirror_dora:"];

class ViewAgent extends PersonaAgent {
  hits: Hit[] = [];
  holds: Record<PlayerId, readonly string[]> = {} as never;
  override sendView(v: PlayerView): void {
    const me = v.playerId as PlayerId;
    // 실제 보유 증강은 뷰가 알려 준다 (드래프트로 더 붙을 수 있어 preset만 보면 안 된다)
    const bySeat = new Map<PlayerId, Set<string>>(
      v.players.map((p) => [p.id as PlayerId, new Set(p.augments)]),
    );
    const mine = bySeat.get(me) ?? new Set<string>();
    const add = (kind: string, detail: string): void => {
      if (this.hits.length > 60) return;
      if (this.hits.some((h) => h.kind === kind && h.detail === detail)) return;
      this.hits.push({ kind, seat: me, detail });
    };
    for (const o of SEATS) {
      if (o === me) continue;
      const n = v.zones[handZone(o)]?.tileIds.length ?? 0;
      if (n > 0 && ![...mine].some((a) => HAND_OPENERS.has(a))) {
        add("H", `${o}의 손패 ${n}장이 보임 (보유: ${[...mine].join(",")})`);
      }
    }
    const w = v.zones[WALL]?.tileIds.length ?? 0;
    if (w > 0 && ![...mine].some((a) => WALL_OPENERS.has(a))) {
      add("W", `패산 ${w}장이 보임 (보유: ${[...mine].join(",")})`);
    }
    const d = v.zones[DEAD_WALL]?.tileIds.length ?? 0;
    if (d > 0 && ![...mine].some((a) => DEAD_OPENERS.has(a))) {
      add("D", `왕패 ${d}장이 보임 (보유: ${[...mine].join(",")})`);
    }
    // 가려진 도라
    const concealers = SEATS.filter((s) => bySeat.get(s)?.has("dora_conceal") === true);
    const shown = v.round.doraIndicators.filter((id) => v.tiles[id] !== undefined).length;
    if (concealers.length > 0 && v.round.phase !== "round.over" && owners.specDora > 0) {
      if (!mine.has("dora_conceal") && shown > 0) {
        add("CX", `은폐 중인데 도라 표시패 ${shown}장이 보임`);
      }
      if (mine.has("dora_conceal") && v.round.doraIndicators.length === 0) {
        add("CB", `보유자인데 도라 표시패가 하나도 안 보임 (은폐자 ${concealers.join(",")})`);
      }
    }
    // 남의 전용 채널이 내 뷰에 실렸는가 (관전 뷰의 seat:{owner}:{ch} 사본으로 소유를 판정)
    for (const k of Object.keys(v.augmentView)) {
      if (DUAL_CHANNELS.some((d) => k.startsWith(d))) continue;
      const set = owners.map.get(k);
      if (set !== undefined && !set.has(me)) {
        add("P", `${[...set].join("/")}의 전용 채널 «${k}»이 내 뷰에 실림`);
      }
    }
    // stray
    const seen = new Set<number>();
    for (const z of Object.values(v.zones)) for (const id of z.tileIds) seen.add(id);
    for (const id of v.round.doraIndicators) seen.add(id);
    for (const id of v.round.uraDoraIndicators ?? []) seen.add(id);
    const stray = Object.keys(v.tiles).map(Number).filter((id) => !seen.has(id));
    if (stray.length > 0) {
      const chans = Object.keys(v.augmentView).filter((k) => k.includes("reveal"));
      add("S", `tiles에 존 밖 패 ${stray.length}장 (채널: ${chans.join(",") || "없음"})`);
    }
    super.sendView(v);
  }
}

export interface RunOut {
  crash?: string;
  effectErrors: string[];
  hits: Hit[];
  rounds: number;
}

export async function run(
  preset: Record<PlayerId, readonly string[]>,
  seed: number,
  mode: "tonpuu" | "hanchan" = "tonpuu",
  timeoutMs = 90_000,
): Promise<RunOut> {
  const personas = { p0: PERSONAS["masher"]!, p1: PERSONAS["masher"]!, p2: PERSONAS["chaos"]!, p3: PERSONAS["riichiRusher"]! };
  const agents = SEATS.map((id, i) => new ViewAgent(id, personas[id]!, seed * 131 + i * 7 + 1));
  for (const a of agents) a.holds = preset;
  const effectErrors: string[] = [];
  let rounds = 0;
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode,
    seed,
    maxWind: mode === "tonpuu" ? 1 : 2,
    westEntry: false,
    draftSchedules: mode === "tonpuu" ? ["eastFirst"] : ["eastFirst", "southEntry"],
    extraAugments: contentAugments,
    presetAugments: preset,
    agentDecideTimeoutMs: 20_000,
  }, {
    onRoundStart: () => { rounds++; },
    onEffectError: (f: unknown) => {
      const s = `${(f as { event?: { type?: string } }).event?.type ?? "?"}: ${String((f as { error?: unknown }).error ?? "")}`;
      if (effectErrors.length < 40 && !effectErrors.includes(s)) effectErrors.push(s);
    },
  } as never);
  owners.map = new Map();
  ctrl.addSpectator({
    id: "qa",
    sendView: (sv: PlayerView) => {
      owners.specDora = sv.round.doraIndicators.length;
      for (const k of Object.keys(sv.augmentView)) {
        const m = /^seat:(p\d):(.+)$/.exec(k);
        if (m === null) continue;
        const set = owners.map.get(m[2]!) ?? new Set<string>();
        set.add(m[1]!);
        owners.map.set(m[2]!, set);
      }
    },
  } as never);
  const out: RunOut = { effectErrors, hits: [], rounds: 0 };
  try {
    await withTimeout(ctrl.run(), timeoutMs, () => ctrl.requestAbort());
  } catch (e) {
    out.crash = e instanceof Error ? e.message : String(e);
  }
  out.rounds = rounds;
  for (const a of agents) out.hits.push(...a.hits);
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => { onTimeout?.(); rej(new Error(`TIMEOUT ${ms}ms`)); }, ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

// ─────────────── 실행부 ───────────────
async function main(): Promise<void> {
  const mode = process.argv[2] ?? "pairs";
  const seeds = Number(process.argv[3] ?? 2);
  const combos: string[][] = [];
  if (mode === "singles") {
    for (const a of AXIS) combos.push([a]);
  } else if (mode === "pairs") {
    for (let i = 0; i < AXIS.length; i++) {
      for (let j = i + 1; j < AXIS.length; j++) {
        const a = AXIS[i]!, b = AXIS[j]!;
        if (conflicting(a, b)) continue;
        combos.push([a, b]);
      }
    }
  } else if (mode === "triples") {
    for (let i = 0; i < AXIS.length; i++) {
      for (let j = i + 1; j < AXIS.length; j++) {
        for (let k = j + 1; k < AXIS.length; k++) {
          const [a, b, c] = [AXIS[i]!, AXIS[j]!, AXIS[k]!];
          if (conflicting(a, b) || conflicting(a, c) || conflicting(b, c)) continue;
          combos.push([a, b, c]);
        }
      }
    }
  }
  const shard = Number(process.argv[4] ?? 0);
  const shards = Number(process.argv[5] ?? 1);
  console.log(`# ${mode}: ${combos.length} 조합 × ${seeds} 시드 (shard ${shard}/${shards})`);
  let n = -1;
  for (const combo of combos) {
    n++;
    if (n % shards !== shard) continue;
    for (let s = 1; s <= seeds; s++) {
      // p0가 조합 전부를 들고, p1은 같은 조합의 첫 장을 들어 «둘이 같은 카드»도 함께 본다
      const preset: Record<PlayerId, readonly string[]> = {
        p0: combo,
        p1: [combo[0]!],
        p2: combo.length > 1 ? [combo[1]!] : [],
        p3: combo.length > 2 ? [combo[2]!] : [],
      };
      const r = await run(preset, s * 1000 + n);
      const bad = [
        ...(r.crash !== undefined ? [`CRASH ${r.crash}`] : []),
        ...r.effectErrors.map((e) => `EFFECT ${e}`),
        ...r.hits.map((h) => `${h.kind} ${h.seat} ${h.detail}`),
      ];
      if (bad.length > 0) {
        console.log(`\n[${combo.join(" + ")}] seed=${s * 1000 + n} rounds=${r.rounds}`);
        for (const b of [...new Set(bad)]) console.log(`   ${b}`);
      }
    }
    if (n % 20 === 0) console.error(`  ... ${n}/${combos.length}`);
  }
  console.log("\n# 끝");
}

if (process.argv[1]?.includes("sweep")) void main();
