/**
 * 재검증 3: 사전 지급(presetAugments) 경로에서 수상한 주사위가
 *   (A) 중복(같은 증강을 둘이 보유) 을 뚫는가  ← reservedAugmentIds 로 닫혔는가
 *   (B) 상호 배제(conflicts) 를 뚫는가         ← 같은 좌석의 **아직 설치 안 된** preset 과
 *
 * 실행: tsx qa-lab/verify-disrupt/r3_preset_grant.ts <시드수>
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type {
  ActionOption, AugmentDef, DecisionPrompt, DraftStage,
  PlayerAgent, PlayerId, PlayerView,
} from "@majak/core";
import { contentAugments } from "@majak/content";

const N = Number(process.argv[2] ?? 60);
/* eslint-disable @typescript-eslint/no-explicit-any */

const byId = new Map(contentAugments.map((a) => [a.id, a]));
const conflictsOf = (id: string): string[] => (byId.get(id)?.conflicts ?? []) as string[];
const clash = (a: string, b: string): boolean =>
  conflictsOf(a).includes(b) || conflictsOf(b).includes(a);

class A implements PlayerAgent {
  readonly isBot = true;
  nickname: string;
  constructor(readonly id: PlayerId) { this.nickname = id; }
  sendView(_v: PlayerView): void { /* noop */ }
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const o = p.options;
    const w = o.find((x) => x.type === "win");
    if (w !== undefined) return w;
    const pass = o.find((x) => x.type === "pass");
    if (pass !== undefined) return pass;
    const d = o.filter((x) => x.type === "discard");
    if (d.length > 0) return d[0]!;
    return o[0]!;
  }
  async decideDraft(_s: DraftStage, c: AugmentDef[]): Promise<string> { return c[0]!.id; }
}

/**
 * 배패까지만 세우고 각 좌석의 보유 증강을 읽는다 (국은 치지 않는다).
 * onRoundStart 에서 상태를 낚아채고 즉시 abort.
 */
async function held(
  seed: number,
  preset: Record<string, string[]>,
): Promise<Record<string, string[]>> {
  const agents = (["p0", "p1", "p2", "p3"] as PlayerId[]).map((id) => new A(id));
  let snap: Record<string, string[]> = {};
  const ctrl: any = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG, mode: "tonpuu", seed, maxWind: 1, westEntry: false,
    draftSchedules: [], extraAugments: contentAugments,
    presetAugments: preset, agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundStart: (g: any) => {
      snap = Object.fromEntries(
        g.engine.state.players.map((p: any) => [p.id, [...p.augments]]),
      );
      ctrl.requestAbort();
    },
  } as never);
  await ctrl.run().catch(() => { /* abort */ });
  return snap;
}

// ── (A) 중복: 두 좌석이 수상한 주사위를 들고, 뒷자리에 노리는 preset 이 있다 ──────
// ── (B) 상호 배제: **같은 좌석**이 [cornucopia, X] 를 preset 으로 받는다 ──────────
const CONFLICT_SEED_AUG = process.argv[3] ?? "stealth_riichi"; // 상호배제 8종

let dup = 0;
let conflictHits = 0;
const dupEx: string[] = [];
const conEx: string[] = [];

for (let seed = 1; seed <= N; seed++) {
  // (A) p0 이 cornucopia, 뒷자리 p2/p3 에 사전 지급 증강 — 예약분으로 막히는가
  const a = await held(seed, {
    p0: ["cornucopia"], p1: [], p2: ["regret", "spy"], p3: ["discard_lock", "parasite"],
  });
  const seen = new Map<string, string>();
  for (const [pid, ids] of Object.entries(a)) {
    for (const id of ids) {
      const prev = seen.get(id);
      if (prev !== undefined && prev !== pid) {
        dup++;
        if (dupEx.length < 3) dupEx.push(`seed=${seed} DUP ${id} = ${prev} + ${pid}`);
      }
      seen.set(id, pid);
    }
  }

  // (B) 같은 좌석 preset = [cornucopia, all_or_nothing] — 지급이 conflicts 를 뚫는가
  const b = await held(seed, {
    p0: [], p1: [], p2: [], p3: process.argv[4] === "rev" ? [CONFLICT_SEED_AUG, "cornucopia"] : ["cornucopia", CONFLICT_SEED_AUG],
  });
  const p3 = b["p3"] ?? [];
  if (seed <= 0) console.log(`  seed=${seed} A:${JSON.stringify(a)}\n           B p3=${JSON.stringify(p3)}`);
  for (let i = 0; i < p3.length; i++) {
    for (let j = i + 1; j < p3.length; j++) {
      if (clash(p3[i]!, p3[j]!)) {
        conflictHits++;
        if (conEx.length < 5) conEx.push(`seed=${seed} CONFLICT p3=[${p3.join(",")}] → ${p3[i]} × ${p3[j]}`);
      }
    }
  }
}

console.log(`시드 ${N}개`);
console.log(`(A) 중복(AUG_DUP): ${dup}건`);
for (const e of dupEx) console.log("   " + e);
console.log(`(B) 같은 좌석 상호배제 위반: ${conflictHits}건`);
for (const e of conEx) console.log("   " + e);
