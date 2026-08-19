/**
 * 정보 누설 QA — 좌석별 PlayerView 가로채기.
 *
 * harness.ts를 복사하지 않고 import 해서 PersonaAgent를 상속한다.
 * 각 좌석이 실제로 받는 PlayerView를 전부 훑어 "내가 알아서는 안 되는 것"을 찾는다.
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  DEAD_WALL,
  WALL,
  handZone,
  discardsZone,
  meldsZone,
} from "@majak/core";
import { uraIndicatorIds, kindKey, nextSeat, playerAtSeat } from "@majak/core";
import type { ActionOption, DecisionPrompt, GameState, PlayerId, PlayerView } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PersonaAgent, SEATS, checkState } from "../harness.js";

const AUG_IDS = new Set(contentAugments.map((d) => d.id));
/** 국을 넘어 남아 있는 것이 정상인 채널 (누적 카운터·낙인·게임 단위 지정) */
const PERSISTENT_OK = /^(uses:|cooldown:|cooldownTurns:|spent:|seq:|stack|mark|brand|scar|debt|contract|curse|oath|vow|pact|target:|nominate)/;
import type { Persona, Violation } from "../harness.js";

/** 손패를 남에게 열 수 있는 증강 */
const HAND_OPENERS = new Set(["xray_hand"]);
/** 패산을 여는 증강 */
const WALL_OPENERS = new Set(["bottom_deal"]);
/** 왕패를 여는 증강 */
const DEADWALL_OPENERS = new Set([
  "cliff_bloom", "dead_wall_master", "rinshan_preview", "ura_peek",
]);
/** 남의 버림패/후로를 가리는 증강 (보이는 게 정상이므로 누설 판정 대상 아님) */

/** 내 담당 증강의 "보유자 전용" 채널 → 그 증강 id */
const PRIVATE_CHANNELS: { match: (k: string) => boolean; aug: string }[] = [
  { match: (k) => k === "ura", aug: "ura_peek" },
  { match: (k) => k.startsWith("waits:"), aug: "peek_riichi_waits" },
  { match: (k) => k === "foresight_peek", aug: "foresight" },
  { match: (k) => k === "foresight:reorderSpent", aug: "foresight" },
  { match: (k) => k === "tenpai_scan", aug: "tenpai_scan" },
  { match: (k) => k === "danger_sense", aug: "danger_sense" },
  { match: (k) => k === "triple_peek", aug: "triple_peek" },
  { match: (k) => k === "rinshan_preview", aug: "rinshan_preview" },
];

export interface Leak {
  kind: string;
  detail: string;
  round: string;
  viewer: PlayerId;
}

export interface SpyReport {
  seed: number;
  crash?: string;
  effectErrors: string[];
  violations: Violation[];
  leaks: Leak[];
  /** 좌석별로 본 augmentView 키 census: key -> {viewer, holds} */
  census: Map<string, Set<string>>;
  /** 비보유자가 받은 공개 채널의 값 샘플 (수동 검토용) */
  publicSamples: Map<string, Set<string>>;
  views: number;
  rounds: number;
}

class SpyAgent extends PersonaAgent {
  constructor(
    id: PlayerId, persona: Persona, seed: number,
    private readonly rep: SpyReport,
    private readonly truth: () => GameState | null,
  ) { super(id, persona, seed); }

  /** 직전 국 키 + 그때 마지막으로 본 private 채널들 */
  private lastRound = "";
  private prevRoundPrivate = new Map<string, unknown>();
  private curRoundPrivate = new Map<string, unknown>();
  private prevRoundAll = new Map<string, unknown>();
  /** 직전 뷰에서 본 삼세 예지 예측 (다음 쯔모 kind 3개) */
  private prevTriple: string[] | null = null;
  private lastDrawn: number | null = null;
  private ring: string[] = [];
  private prevWall = new Set<number>();
  private curRoundAll = new Map<string, unknown>();
  private newRoundFirstView = false;

  /** 프롬프트 후보 자체가 정보다 — 후보 payload에 실린 tileId가 내가 볼 수 없는 패인가 */
  override async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const st = this.truth();
    const me = this.id;
    if (st !== null) {
      const player = st.players.find((p) => p.id === me);
      const mine = new Set(player?.augments ?? []);
      const hidden = new Map<number, string>();
      for (const p of st.players) {
        if (p.id === me || mine.has("xray_hand")) continue;
        for (const id of st.zones[handZone(p.id)]?.tileIds ?? []) hidden.set(id as unknown as number, `${p.id}.hand`);
      }
      if (![...mine].some((a) => WALL_OPENERS.has(a))) {
        for (const id of st.zones[WALL]?.tileIds ?? []) hidden.set(id as unknown as number, "wall");
      }
      if (![...mine].some((a) => DEADWALL_OPENERS.has(a))) {
        for (const id of st.zones[DEAD_WALL]?.tileIds ?? []) hidden.set(id as unknown as number, "deadWall");
      }
      const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
      for (const o of prompt.options) {
        for (const [k, n] of tileFields(o)) {
          const where = hidden.get(n);
          if (where !== undefined && this.rep.leaks.length < 300) {
            this.rep.leaks.push({
              kind: "PROMPT_TILE_LEAK", round: rk, viewer: me,
              detail: `option ${o.type} payload.${k}=${n} names a tile in ${where} (viewer augments [${[...mine]}])`,
            });
          }
        }
      }
    }
    return super.decide(prompt);
  }

  override sendView(v: PlayerView): void {
    this.rep.views++;
    const me = v.playerId;
    const rk = `${v.round.prevalentWind}-${v.round.roundNumber}-${v.round.honba}`;
    const add = (kind: string, detail: string): void => {
      if (this.rep.leaks.length < 300) this.rep.leaks.push({ kind, detail, round: rk, viewer: me });
    };
    const mine = new Set(v.players.find((p) => p.id === me)?.augments ?? []);
    const others = v.players.filter((p) => p.id !== me).map((p) => p.id);
    const allAug = new Map(v.players.map((p) => [p.id, new Set(p.augments)]));

    // ── 1) 남의 손패 ──
    for (const o of others) {
      const z = v.zones[handZone(o)];
      if (z === undefined) continue;
      const shown = z.tileIds.filter((id) => v.tiles[id] !== undefined);
      if (shown.length === 0) continue;
      const opener = [...mine].filter((a) => HAND_OPENERS.has(a));
      if (opener.length === 0) {
        add("HAND_LEAK", `sees ${shown.length} tiles of ${o}'s hand with augments [${[...mine]}]`);
      } else if (v.augmentView[`xray_hand:${me}`] === undefined) {
        add("HAND_LEAK_INACTIVE", `xray holder ${me} sees ${o}'s hand (${shown.length}) but no public xray notice this round`);
      }
    }

    // ── 2) 패산 ──
    const wall = v.zones[WALL];
    if (wall !== undefined) {
      const shown = wall.tileIds.filter((id) => v.tiles[id] !== undefined);
      if (shown.length > 0 && ![...mine].some((a) => WALL_OPENERS.has(a))) {
        add("WALL_LEAK", `sees ${shown.length} wall tiles with augments [${[...mine]}]`);
      }
    }

    // ── 3) 왕패 ──
    const dw = v.zones[DEAD_WALL];
    if (dw !== undefined) {
      const shown = dw.tileIds.filter((id) => v.tiles[id] !== undefined);
      const openers = [...mine].filter((a) => DEADWALL_OPENERS.has(a));
      if (shown.length > 0 && openers.length === 0) {
        add("DEADWALL_LEAK", `sees ${shown.length} deadWall tiles with augments [${[...mine]}]`);
      }
      if (shown.length > 1 && openers.length === 1 && openers[0] === "rinshan_preview") {
        add("DEADWALL_COUNT", `rinshan_preview holder sees ${shown.length} deadWall tiles (expected <=1)`);
      }
      // ura_peek 단독 보유자가 아직 발동 안 했는데 왕패가 열려 있는가
      if (shown.length > 0 && openers.length === 1 && openers[0] === "ura_peek"
          && v.augmentView["ura"] === undefined) {
        add("DEADWALL_URA_EARLY", `ura_peek holder sees ${shown.length} deadWall tiles before revealing ura`);
      }
    }

    // ── 4) 가려진 도라 ──
    const concealer = others.find((o) => allAug.get(o)?.has("dora_conceal") === true);
    if (concealer !== undefined && !mine.has("dora_conceal") && v.round.phase !== "round.over") {
      if (v.round.doraIndicators.length > 0) {
        add("DORA_CONCEAL_LEAK", `doraIndicators visible (${v.round.doraIndicators.length}) though ${concealer} holds dora_conceal`);
      }
      // 왕패로 새는가 (표시패 실물의 kind가 tiles에 실렸는가)
      // → concealedTileIdAt 자리표로 바뀌어야 한다
    }

    // ── 5) 우라도라 ──
    if (v.round.uraDoraIndicators !== null && v.round.phase !== "round.over") {
      add("URA_EARLY", `uraDoraIndicators in view at phase=${v.round.phase}`);
    }

    // ── 6) tiles 맵 고아 (어느 가시 존에도 없는데 정체가 실렸다) ──
    const seen = new Set<number>();
    for (const z of Object.values(v.zones)) for (const id of z.tileIds) seen.add(id as unknown as number);
    for (const id of v.round.doraIndicators) seen.add(id as unknown as number);
    for (const id of v.round.uraDoraIndicators ?? []) seen.add(id as unknown as number);
    if (v.round.lastDiscard !== null) seen.add(v.round.lastDiscard.tileId as unknown as number);
    for (const pr of Object.values(v.round.byPlayer)) {
      for (const m of pr.melds) for (const id of m.tileIds) seen.add(id as unknown as number);
    }
    const revealed = new Set<number>();
    for (const [k, val] of Object.entries(v.augmentView)) {
      if (k.startsWith("revealTiles:") && Array.isArray(val)) {
        for (const id of val as number[]) revealed.add(id);
      }
    }
    for (const key of Object.keys(v.tiles)) {
      const id = Number(key);
      if (!seen.has(id) && !revealed.has(id)) {
        add("ORPHAN_TILE", `tiles[${id}] present but tile in no visible zone`);
        break;
      }
    }

    // ── 6b) 진짜 상태와 대조 (도라 표시패·뒷도라가 tiles에 실렸는가) ──
    const st = this.truth();
    if (st !== null) {
      const concealed = st.players.some((p) => p.id !== me && p.augments.includes("dora_conceal"))
        && !mine.has("dora_conceal") && v.round.phase !== "round.over";
      if (concealed) {
        for (const id of st.round.doraIndicators) {
          if (v.tiles[id] !== undefined) {
            add("DORA_CONCEAL_TILE_LEAK", `dora indicator tile ${id} kind exposed in tiles map despite dora_conceal`);
            break;
          }
        }
      }
      // 뒷도라 실물: 정산 전에 정체가 실리면 누설 (왕패를 여는 증강 보유자는 제외)
      if (![...mine].some((a) => DEADWALL_OPENERS.has(a)) && v.round.uraDoraIndicators === null) {
        for (const id of uraIndicatorIds(st)) {
          if (v.tiles[id] !== undefined) {
            add("URA_TILE_LEAK", `ura indicator tile ${id} exposed in tiles map (phase=${v.round.phase})`);
            break;
          }
        }
      }
      // 남의 손패 실물이 tiles에 실렸는가 (Zone을 우회한 채널까지 잡는다)
      if (!mine.has("xray_hand")) {
        for (const o of others) {
          const oh = st.zones[handZone(o)]?.tileIds ?? [];
          const hit = oh.find((id) => v.tiles[id] !== undefined && v.round.lastDiscard?.tileId !== id && !revealed.has(id as unknown as number));
          if (hit !== undefined) {
            const inView = Object.values(v.zones).filter((z) => z.tileIds.includes(hit)).map((z) => z.id);
            const revealedVia = Object.entries(v.augmentView).filter(([k, val]) => Array.isArray(val) && (val as unknown[]).includes(hit)).map(([k]) => k);
            add("HAND_TILE_LEAK", `tile ${hit} (${JSON.stringify(st.tiles[hit]?.kind)}) truly in ${o}'s hand exposed in ${me}'s tiles; viewZones=[${inView}] channels=[${revealedVia}] lastDiscard=${v.round.lastDiscard?.tileId === hit ? `yes(${v.round.lastDiscard.player})` : "no"} dora=${v.round.doraIndicators.includes(hit)} meld=${Object.entries(v.round.byPlayer).filter(([, pr]) => pr.melds.some((m) => m.tileIds.includes(hit))).map(([k]) => k)} phase=${v.round.phase} turn=${v.round.turnCount} augs(${o})=[${[...(allAug.get(o) ?? [])]}]`);
            break;
          }
        }
      }
    }

    // ── 6c) 삼세 예지 — "다음 쯔모 세 장은 항상 맞는다"는 단언 검증 ──
    if (mine.has("triple_peek") && st !== null) {
      if (rk !== this.lastRound) { this.prevTriple = null; this.lastDrawn = null; }
      const drawn = v.round.myDrawnTile;
      // 영상패(깡 보충)는 패산 예고의 대상이 아니다 — 제외
      // 울어서 가져온 패는 쯔모가 아니다 — 직전 뷰에서 패산에 있던 패만 본다
      if (drawn !== null && drawn !== this.lastDrawn && !st.round.lastDrawRinshan
          && this.prevWall.has(drawn as unknown as number)) {
        const pred = this.prevTriple;
        if (pred !== null && pred.length > 0) {
          const actual = kindKey(st.tiles[drawn]?.kind ?? { suit: "?", rank: 0 });
          if (actual !== pred[0]) {
            add("TRIPLE_PEEK_WRONG", `predicted [${pred.join(",")}] but drew ${actual} (tile ${drawn}) rinshan=${st.round.lastDrawRinshan} phase=${v.round.phase} turn=${v.round.turnCount} nowChannel=${JSON.stringify(v.augmentView["triple_peek"])} wallLeft=${st.zones[WALL]?.tileIds.length}\n      TRACE:\n        ${this.ring.join("\n        ")}`);
          }
        }
        this.lastDrawn = drawn;
      }
      // 표시된 예고가 **지금 상태에서 다시 계산한 값**과 같은가 (증강 자신의 알고리즘 복제)
      const shown = v.augmentView["triple_peek"];
      if (Array.isArray(shown) && (shown as string[]).length > 0) {
        const want = recomputePeek(st, me);
        const got = (shown as string[]).join(",");
        if (want.join(",") !== got && v.round.phase !== "round.over") {
          add("TRIPLE_PEEK_STALE", `channel shows [${got}] but recomputing now gives [${want.join(",")}] phase=${v.round.phase} turn=${v.round.turnCount} wallLeft=${st.zones[WALL]?.tileIds.length}`);
        }
      }
      const cur = v.augmentView["triple_peek"];
      this.prevTriple = Array.isArray(cur) ? (cur as string[]) : null;
      this.prevWall = new Set((st.zones[WALL]?.tileIds ?? []).map((id) => id as unknown as number));
      const wallFront = (st.zones[WALL]?.tileIds ?? []).slice(0, 8).map((id) => kindKey(st.tiles[id]?.kind ?? { suit: "?", rank: 0 }));
      const seats = st.players.map((p) => `${p.id}@${p.seat}`).join(",");
      this.ring.push(`ph=${v.round.phase} tc=${v.round.turnCount} turnSeat=${st.round.turnSeat} rinshan=${st.round.lastDrawRinshan} drawn=${st.round.lastDrawnTile} ch=${JSON.stringify(cur)} wall8=${wallFront.join("/")} seats=${seats}`);
      if (this.ring.length > 14) this.ring.shift();
    }

    // ── 7) augmentView 채널 census + 보유자 전용 채널 누설 ──
    const nowPrivate = new Map<string, unknown>();
    const nowAll = new Map<string, unknown>();
    for (const [k, val] of Object.entries(v.augmentView)) {
      let set = this.rep.census.get(k);
      if (set === undefined) { set = new Set(); this.rep.census.set(k, set); }
      if (set.size < 12) set.add(`${me}:${[...mine].sort().join("+")}`);
      // 채널 이름 앞부분이 증강 id면, 그 증강을 갖지 않은 사람이 받은 값을 표본으로 남긴다
      const owner = k.split(":")[0] ?? "";
      if (!mine.has(owner) && AUG_IDS.has(owner)) {
        let ss = this.rep.publicSamples.get(k);
        if (ss === undefined) { ss = new Set(); this.rep.publicSamples.set(k, ss); }
        if (ss.size < 4) ss.add(JSON.stringify(val).slice(0, 200));
      }
      // 숫자·불리언 카운터는 국을 넘겨도 정상 — 스냅샷(배열·객체·문장)만 본다
      const snap = typeof val === "object" || (typeof val === "string" && val.length > 0);
      if (snap && !PERSISTENT_OK.test(k)) nowAll.set(k, JSON.stringify(val));
      const pc = PRIVATE_CHANNELS.find((p) => p.match(k));
      if (pc !== undefined) {
        nowPrivate.set(k, JSON.stringify(val));
        if (!mine.has(pc.aug)) {
          add("PRIVATE_CHANNEL_LEAK", `viewer ${me} (augments [${[...mine]}]) receives private channel "${k}" of ${pc.aug} = ${JSON.stringify(val).slice(0, 120)}`);
        }
      }
    }

    // ── 8) 국이 바뀐 뒤 잔류 ──
    // 국 경계에서 "배패가 끝난 새 국의 첫 뷰"만 본다. 국이 넘어가는 사이(정산 화면·
    // 국 번호만 오른 순간)에는 지난 국의 채널이 아직 남아 있는 게 정상이다.
    const dealt = (v.zones[handZone(me)]?.tileIds.length ?? 0) >= 13
      && v.round.phase !== "round.over";
    if (rk !== this.lastRound) {
      if (this.lastRound !== "") {
        this.prevRoundPrivate = this.curRoundPrivate;
        this.newRoundFirstView = true;
      }
      this.lastRound = rk;
      this.curRoundPrivate = new Map();
      if (this.newRoundFirstView) this.prevRoundAll = this.curRoundAll;
      this.curRoundAll = new Map();
    }
    if (this.newRoundFirstView && dealt) {
      for (const [k, val] of nowPrivate) {
        const before = this.prevRoundPrivate.get(k);
        if (before !== undefined && before === val) {
          add("RESIDUE", `private channel "${k}" alive in freshly dealt round (phase=${v.round.phase} turn=${v.round.turnCount}): ${String(val).slice(0, 100)}`);
        }
      }
      for (const [k, val] of nowAll) {
        const before = this.prevRoundAll.get(k);
        if (before !== undefined && before === val) {
          add("RESIDUE_ANY", `channel "${k}" alive unchanged in freshly dealt round: ${String(val).slice(0, 90)}`);
        }
      }
      this.newRoundFirstView = false;
    }
    for (const [k, val] of nowPrivate) this.curRoundPrivate.set(k, val);
    for (const [k, val] of nowAll) this.curRoundAll.set(k, val);
  }
}

export interface SpyOpts {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  personas: Record<PlayerId, Persona>;
  presetHands?: Record<PlayerId, readonly string[]>;
  onState?: (st: GameState) => void;
  /** 드래프트를 끈다 — preset 증강만 남는다 */
  noDraft?: boolean;
  timeoutMs?: number;
}

export async function runSpyMatch(o: SpyOpts): Promise<SpyReport> {
  const mode = o.mode ?? "hanchan";
  const rep: SpyReport = {
    seed: o.seed, effectErrors: [], violations: [], leaks: [],
    census: new Map(), publicSamples: new Map(), views: 0, rounds: 0,
  };
  const ctrlRef: { c: HanchanController | null } = { c: null };
  const agents = SEATS.map((id, i) => new SpyAgent(id, o.personas[id]!, o.seed * 131 + i * 7 + 1, rep, () => ctrlRef.c?.gameState ?? null));
  const seen: { scoreTotal?: number } = {};
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode,
    seed: o.seed,
    maxWind: mode === "tonpuu" ? 1 : 2,
    westEntry: false,
    draftSchedules: o.noDraft === true ? [] : mode === "tonpuu"
      ? ["eastFirst", "eastThird", "eastFourth"]
      : ["eastFirst", "eastThird", "southEntry", "southThird"],
    extraAugments: contentAugments,
    presetAugments: o.preset,
    ...(o.presetHands !== undefined ? { presetHands: o.presetHands } : {}),
    agentDecideTimeoutMs: 20_000,
  }, {
    onRoundStart: () => { rep.rounds++; },
    onEffectError: (f: unknown) => {
      const s = `${(f as { event?: { type?: string } }).event?.type ?? "?"}: ${String((f as { error?: unknown }).error ?? "")}`;
      if (rep.effectErrors.length < 60) rep.effectErrors.push(s);
    },
  } as never);
  ctrlRef.c = ctrl;
  ctrl.addSpectator({
    id: "qa",
    sendView: () => {
      const st = ctrl.gameState;
      if (st === null) return;
      checkState(st, rep.violations, seen);
      o.onState?.(st);
    },
  });
  try {
    await withTimeout(ctrl.run(), o.timeoutMs ?? 180_000);
  } catch (e) {
    rep.crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 5).join("\n")}` : String(e);
  }
  return rep;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

/** option payload에서 "tile" 이 들어간 키의 숫자들을 모은다 */
function tileFields(o: unknown, path = ""): [string, number][] {
  const out: [string, number][] = [];
  const walk = (val: unknown, key: string, depth: number): void => {
    if (depth > 4) return;
    if (typeof val === "number") {
      if (/tile/i.test(key)) out.push([key, val]);
      return;
    }
    if (Array.isArray(val)) { for (const x of val) walk(x, key, depth + 1); return; }
    if (val !== null && typeof val === "object") {
      for (const [k, x] of Object.entries(val as Record<string, unknown>)) walk(x, k, depth + 1);
    }
  };
  walk(o, path, 0);
  return out;
}

/** triple_peek의 peekMyDrawKinds 복제 (direction=1 가정) */
function recomputePeek(st: GameState, holder: PlayerId): string[] {
  const wall = st.zones[WALL]?.tileIds ?? [];
  let seat = st.round.phase === "turn.draw" ? st.round.turnSeat : nextSeat(st, st.round.turnSeat, 1);
  const kinds: string[] = [];
  for (let i = 0; i < wall.length && kinds.length < 3; i++) {
    const id = wall[i];
    if (id !== undefined && playerAtSeat(st, seat).id === holder) {
      kinds.push(kindKey(st.tiles[id]?.kind ?? { suit: "?", rank: 0 }));
    }
    seat = nextSeat(st, seat, 1);
  }
  return kinds;
}
