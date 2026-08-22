/**
 * 뷰(PlayerView) 감시 러너 — harness.runMatch와 같은 구성이지만 **좌석별 PlayerView**를
 * 매 브로드캐스트마다 받아 정보 누수/표시 불일치를 검사한다.
 *
 * 검사하는 것:
 *  L1 패산(WALL)·왕패(DEAD_WALL) 실물이 그 권한 없는 좌석의 뷰에 실렸는가
 *  L2 남의 손패 실물이 뷰에 실렸는가 (허용 목록 밖)
 *  L3 보유자 전용이어야 할 증강 채널이 남의 augmentView에 실렸는가
 *  L4 가려진 도라(dora_conceal): 비보유자 뷰에 도라 표시패가 남아 있는가
 */
import {
  DEAD_WALL,
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  WALL,
  handZone,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  DecisionPrompt,
  DraftStage,
  GameState,
  PlayerAgent,
  PlayerId,
  PlayerView,
} from "@majak/core";
import { contentAugments } from "@majak/content";
import { PersonaAgent, SEATS } from "../../harness.js";
import type { Persona } from "../../harness.js";

export const VIEWS = { seen: 0 };

export interface Leak {
  kind: string;
  viewer: PlayerId;
  detail: string;
}

/** 이 좌석이 패산/왕패를 볼 권한이 있는 증강을 들었는가 */
const WALL_PEEK = new Set(["bottom_deal", "future_sight", "wall_peek"]);
const DEADWALL_PEEK = new Set(["dead_wall_master", "cliff_bloom", "grave_rob"]);

/** 남의 손패를 볼 권한을 주는 증강 (하나라도 있으면 L2는 건너뛴다) */
const HAND_PEEK = new Set([
  "discard_lock", "danger_sense", "xray", "hand_peek", "peek_riichi_waits",
  "open_hand", "mind_reader", "spy", "grave_rob", "bluff_pretense",
]);

class WatchAgent extends PersonaAgent {
  lastView: PlayerView | null = null;
  override sendView(v: PlayerView): void {
    this.lastView = v;
  }
}

export interface ViewRunOpts {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  personas: Record<PlayerId, Persona>;
  timeoutMs?: number;
}

export interface ViewRunReport {
  seed: number;
  crash?: string;
  effectErrors: string[];
  leaks: Leak[];
  rounds: number;
}

export async function runViewMatch(o: ViewRunOpts): Promise<ViewRunReport> {
  const mode = o.mode ?? "hanchan";
  const leaks: Leak[] = [];
  const effectErrors: string[] = [];
  const agents = SEATS.map(
    (id, i) => new WatchAgent(id, o.personas[id]!, o.seed * 131 + i * 7 + 1),
  );
  let rounds = 0;
  const seenLeak = new Set<string>();
  const add = (l: Leak): void => {
    const k = `${l.kind}|${l.viewer}|${l.detail}`;
    if (seenLeak.has(k) || leaks.length > 60) return;
    seenLeak.add(k);
    leaks.push(l);
  };

  const ctrl = new HanchanController(
    agents as unknown as PlayerAgent[],
    {
      ...DEFAULT_HANCHAN_CONFIG,
      mode,
      seed: o.seed,
      maxWind: mode === "tonpuu" ? 1 : 2,
      westEntry: false,
      draftSchedules:
        mode === "tonpuu"
          ? ["eastFirst", "eastThird", "eastFourth"]
          : ["eastFirst", "eastThird", "southEntry", "southThird"],
      extraAugments: contentAugments,
      presetAugments: o.preset,
      agentDecideTimeoutMs: 20_000,
    },
    {
      onRoundStart: () => {
        rounds++;
      },
      onEffectError: (f: unknown) => {
        const s = `${(f as { event?: { type?: string } }).event?.type ?? "?"}: ${String(
          (f as { error?: unknown }).error ?? "",
        )}`;
        if (effectErrors.length < 50) effectErrors.push(s);
      },
    } as never,
  );

  ctrl.addSpectator({
    id: "qa-view",
    sendView: () => {
      const st = ctrl.gameState;
      if (st === null) return;
      check(st, agents, add);
    },
  });

  const report: ViewRunReport = { seed: o.seed, effectErrors, leaks, rounds };
  try {
    await withTimeout(ctrl.run(), o.timeoutMs ?? 180_000);
  } catch (e) {
    report.crash = e instanceof Error ? e.message : String(e);
  }
  report.rounds = rounds;
  return report;
}

function check(
  st: GameState,
  agents: WatchAgent[],
  add: (l: Leak) => void,
): void {
  const over = st.round.phase === "round.over";
  const wall = new Set(st.zones[WALL]?.tileIds ?? []);
  const dead = new Set(st.zones[DEAD_WALL]?.tileIds ?? []);
  const doraIds = new Set(st.round.doraIndicators);
  const augOf = (pid: PlayerId): readonly string[] =>
    st.players.find((p) => p.id === pid)?.augments ?? [];

  for (const a of agents) {
    const v = a.lastView;
    if (v === null) continue;
    VIEWS.seen++;
    if (process.env["QA_DEBUG"] === "1" && VIEWS.seen % 500 === 1) {
      console.log(`[dbg] viewer=${a.id} dora=${v.round.doraIndicators.length} tiles=${Object.keys(v.tiles).length} chans=${Object.keys(v.augmentView).join(",")}`);
    }
    const mine = augOf(a.id);
    const ids = Object.keys(v.tiles).map(Number);

    // L1 — 패산/왕패
    if (!mine.some((x) => WALL_PEEK.has(x))) {
      for (const id of ids) {
        if (wall.has(id) && !doraIds.has(id)) {
          add({ kind: "WALL_LEAK", viewer: a.id, detail: `tile ${id} (aug=${mine.join("+")})` });
          break;
        }
      }
    }
    if (!mine.some((x) => DEADWALL_PEEK.has(x)) && !over) {
      for (const id of ids) {
        if (dead.has(id) && !doraIds.has(id)) {
          add({ kind: "DEADWALL_LEAK", viewer: a.id, detail: `tile ${id} (aug=${mine.join("+")})` });
          break;
        }
      }
    }

    // L2 — 남의 손패
    if (!mine.some((x) => HAND_PEEK.has(x)) && !over) {
      for (const p of st.players) {
        if (p.id === a.id) continue;
        if (augOf(p.id).some((x) => LEAKY_SELF.has(x))) continue;
        const hand = st.zones[handZone(p.id)]?.tileIds ?? [];
        const leaked = hand.filter((id) => v.tiles[id] !== undefined);
        if (leaked.length > 0) {
          add({
            kind: "HAND_LEAK",
            viewer: a.id,
            detail: `${p.id} 손패 ${leaked.length}장 (viewerAug=${mine.join("+")} ownerAug=${augOf(p.id).join("+")})`,
          });
        }
      }
    }

    // L4 — 가려진 도라
    const concealers = st.players.filter((p) => augOf(p.id).includes("dora_conceal"));
    if (concealers.length > 0 && !over && !mine.includes("dora_conceal")) {
      if (v.round.doraIndicators.length > 0) {
        add({
          kind: "DORA_CONCEAL_LEAK",
          viewer: a.id,
          detail: `표시패 ${v.round.doraIndicators.length}장이 그대로 보인다 (phase=${st.round.phase})`,
        });
      }
    }

    // L3 — 보유자 전용 채널이 남에게
    for (const key of Object.keys(v.augmentView)) {
      for (const priv of PRIVATE_CHANNELS) {
        if (!key.startsWith(priv)) continue;
        if (!mine.some((x) => PRIVATE_OWNER[priv]?.includes(x))) {
          add({ kind: "CHANNEL_LEAK", viewer: a.id, detail: `${key} (aug=${mine.join("+")})` });
        }
      }
    }
  }
}

/** 자기 손을 스스로 공개하는 증강 (그 소유자의 손패는 남에게 보여도 정상) */
const LEAKY_SELF = new Set([
  "open_riichi", "open_hand", "glass_hand", "honest_hand", "open_kokushi",
]);

const PRIVATE_CHANNELS = ["danger_sense", "sealed:", "discardLockReveal:", "dora_afterimage:prev:"];
const PRIVATE_OWNER: Record<string, string[]> = {
  danger_sense: ["danger_sense"],
  "sealed:": ["discard_lock"],
  "discardLockReveal:": ["discard_lock"],
  "dora_afterimage:prev:": ["dora_afterimage"],
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        res(v);
      },
      (e) => {
        clearTimeout(t);
        rej(e);
      },
    );
  });
}
