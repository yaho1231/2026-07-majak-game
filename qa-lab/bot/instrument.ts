/**
 * 봇 × 증강 계측기 — 소스는 건드리지 않고 프로토타입·카탈로그를 감싸 관측만 한다.
 *
 * 재는 것:
 *  - 액티브 증강별 **기회(옵션 제시) / 정책 제안 / 실제 발동** 횟수
 *  - 정책 예외(logContentFailure) · 미제시 옵션 경고 · safeDecide 폴백
 *  - 드래프트 픽의 conflicts/mode 위반, 픽 편향
 */
import { BotAgent } from "../../packages/server/src/BotAgent.js";
import { contentAugments } from "@majak/content";
import type { AugmentDef } from "@majak/core";

export interface AugCounters {
  chooseCalls: number;
  proposed: number; // choose가 non-null
  threw: number;
  fired: number; // 실제로 그 증강의 액션이 선택됨
  opportunity: number; // 보유자에게 그 증강의 액션이 제시된 결정 수
  /** 제안했는데 다른 것이 이긴 경우 — 이긴 액션 타입별 */
  lostTo: Map<string, number>;
  /** 발동한 옵션의 payload가 자기 자신을 지목한 횟수 */
  selfTarget: number;
  /** 정책 제안 없이(=입찰자 없는 프롬프트의 난수 경로로) 발동된 횟수 */
  randomFire: number;
  /** 발동한 옵션 payload 샘플 */
  samples: string[];
}

export interface Metrics {
  aug: Map<string, AugCounters>;
  actionToAug: Map<string, string>;
  augActions: Map<string, Set<string>>;
  decideNowThrows: { msg: string; stack: string }[];
  contentFailures: Map<string, number>;
  unofferedWarns: Map<string, number>;
  drafts: number;
  draftPicks: Map<string, number>;
  conflictViolations: { picked: string; held: string[] }[];
  modeViolations: { picked: string; mode: string }[];
  decisions: number;
  /** 임의 커스텀 훅 */
  onDecision?: (info: {
    bot: BotAgent;
    prompt: any;
    chosen: any;
    firedAug: string | null;
  }) => void;
  onDraft?: (info: { bot: BotAgent; choices: AugmentDef[]; picked: string }) => void;
}

/** 이번 결정에서 제안한 증강들 (decide 래퍼가 비운다) */
const pending = new Set<string>();

const STANDARD = new Set([
  "discard",
  "riichi",
  "win",
  "pon",
  "chi",
  "ankan",
  "minkan",
  "shouminkan",
  "kyushuKyuhai",
  "pass",
]);

function counters(m: Metrics, id: string): AugCounters {
  let c = m.aug.get(id);
  if (c === undefined) {
    c = {
      chooseCalls: 0,
      proposed: 0,
      threw: 0,
      fired: 0,
      opportunity: 0,
      lostTo: new Map(),
      selfTarget: 0,
      randomFire: 0,
      samples: [],
    };
    m.aug.set(id, c);
  }
  return c;
}

export function newMetrics(): Metrics {
  return {
    aug: new Map(),
    actionToAug: new Map(),
    augActions: new Map(),
    decideNowThrows: [],
    contentFailures: new Map(),
    unofferedWarns: new Map(),
    drafts: 0,
    draftPicks: new Map(),
    conflictViolations: [],
    modeViolations: [],
    decisions: 0,
  };
}

/** 카탈로그를 감싼다: install(액션 매핑) + bot.choose(제안/예외) */
export function wrapCatalog(m: Metrics, defs: readonly AugmentDef[] = contentAugments): AugmentDef[] {
  return defs.map((def): AugmentDef => {
    const policy = def.bot;
    return {
      ...def,
      install: (ctx: any) => {
        let before: Set<string> | null = null;
        try {
          before = new Set(ctx.engine.actions.types() as string[]);
        } catch {
          before = null;
        }
        def.install(ctx);
        if (before !== null) {
          for (const t of ctx.engine.actions.types() as string[]) {
            if (!before.has(t)) {
              m.actionToAug.set(t, def.id);
              let s = m.augActions.get(def.id);
              if (s === undefined) {
                s = new Set();
                m.augActions.set(def.id, s);
              }
              s.add(t);
            }
          }
        }
      },
      ...(policy === undefined
        ? {}
        : {
            bot: {
              ...policy,
              choose: (ctx: any) => {
                const c = counters(m, def.id);
                c.chooseCalls++;
                try {
                  const out = policy.choose(ctx);
                  if (out !== null && out !== undefined) {
                    c.proposed++;
                    pending.add(def.id);
                  }
                  return out;
                } catch (err) {
                  c.threw++;
                  throw err;
                }
              },
            },
          }),
    };
  });
}

/** BotAgent 프로토타입을 감싼다. 되돌리는 함수를 준다. */
export function patchBot(m: Metrics): () => void {
  const proto = BotAgent.prototype as any;
  const origDecide = proto.decide;
  const origDecideNow = proto.decideNow;
  const origDraft = proto.decideDraft;

  proto.decideNow = function (prompt: any) {
    try {
      return origDecideNow.call(this, prompt);
    } catch (err: any) {
      m.decideNowThrows.push({
        msg: String(err?.message ?? err),
        stack: String(err?.stack ?? "").split("\n").slice(0, 6).join("\n"),
      });
      throw err;
    }
  };

  proto.decide = async function (prompt: any) {
    m.decisions++;
    const held: string[] =
      this.lastView?.players?.find((p: any) => p.id === this.id)?.augments ?? [];
    const offeredTypes = new Set<string>((prompt.options ?? []).map((o: any) => o.type));
    for (const augId of held) {
      const acts = m.augActions.get(augId);
      if (acts === undefined) continue;
      for (const t of acts) {
        if (offeredTypes.has(t)) {
          counters(m, augId).opportunity++;
          break;
        }
      }
    }
    pending.clear();
    const chosen = await origDecide.call(this, prompt);
    let firedAug: string | null = null;
    if (chosen !== undefined && !STANDARD.has(chosen.type)) {
      firedAug = m.actionToAug.get(chosen.type) ?? null;
      if (firedAug !== null) {
        const c = counters(m, firedAug);
        c.fired++;
        const pl: any = chosen.payload ?? {};
        const targets = [pl.target, pl.player, pl.victim, pl.to, pl.aim, pl.against].filter(
          (x: unknown) => typeof x === "string",
        );
        if (targets.includes(this.id)) c.selfTarget++;
        if (!pending.has(firedAug)) c.randomFire++;
        if (c.samples.length < 5) c.samples.push(JSON.stringify(chosen).slice(0, 200));
      }
    }
    for (const id of pending) {
      if (id === firedAug) continue;
      const c = counters(m, id);
      c.lostTo.set(chosen?.type ?? "?", (c.lostTo.get(chosen?.type ?? "?") ?? 0) + 1);
    }
    pending.clear();
    m.onDecision?.({ bot: this, prompt, chosen, firedAug });
    return chosen;
  };

  proto.decideDraft = async function (stage: any, choices: AugmentDef[]) {
    const held: string[] =
      this.lastView?.players?.find((p: any) => p.id === this.id)?.augments ?? [];
    const picked = await origDraft.call(this, stage, choices);
    m.drafts++;
    m.draftPicks.set(picked, (m.draftPicks.get(picked) ?? 0) + 1);
    const def = choices.find((c) => c.id === picked);
    if (def !== undefined) {
      const conf = new Set(def.conflicts ?? []);
      const bad = held.filter(
        (h) =>
          conf.has(h) ||
          (choices.length > 0 &&
            (this.catalog?.get?.(h)?.conflicts ?? []).includes(picked)),
      );
      if (bad.length > 0) m.conflictViolations.push({ picked, held: bad });
      const mode = this.mode === "tonpuu" ? "tonpuu" : "hanchan";
      if (def.modes !== undefined && !def.modes.includes(mode)) {
        m.modeViolations.push({ picked, mode });
      }
    }
    m.onDraft?.({ bot: this, choices, picked });
    return picked;
  };

  const origErr = console.error;
  const origWarn = console.warn;
  console.error = (...args: unknown[]) => {
    const s = args.map(String).join(" ");
    const mt = /증강 코드 실패 \(([^)]+)\)/.exec(s);
    if (mt !== null) {
      const key = `${mt[1]} :: ${String((args[1] as any)?.message ?? args[1] ?? "").slice(0, 120)}`;
      m.contentFailures.set(key, (m.contentFailures.get(key) ?? 0) + 1);
      return;
    }
    origErr(...args);
  };
  console.warn = (...args: unknown[]) => {
    const s = args.map(String).join(" ");
    const mt = /증강 (\w+) 정책이 제시되지 않은 옵션/.exec(s);
    if (mt !== null) {
      const key = `${mt[1]} :: ${String(args[1] ?? "").slice(0, 160)}`;
      m.unofferedWarns.set(key, (m.unofferedWarns.get(key) ?? 0) + 1);
      return;
    }
    origWarn(...args);
  };

  return () => {
    proto.decide = origDecide;
    proto.decideNow = origDecideNow;
    proto.decideDraft = origDraft;
    console.error = origErr;
    console.warn = origWarn;
  };
}
