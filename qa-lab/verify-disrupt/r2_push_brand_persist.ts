/**
 * 재검증 2: push_riichi 낙인 표시가 정산·드래프트 화면 내내 남는가.
 *
 * 낙인 표시 채널 `view:*:push_riichi:{holder}#round` 는 국 스코프라 **다음 국
 * setupRound**에서 지워진다. 국 종료 → 정산 → 드래프트 → 다음 국 배패 사이 구간에서
 * 채널이 살아 있으면, 이미 죽은 낙인 관계선이 이름표에 계속 선다.
 * (blind_ron 은 2026-08-12에 ROUND_SETTLED 리액션으로 같은 표시를 내리도록 고쳤다.)
 *
 * 실행: tsx qa-lab/verify-disrupt/r2_push_brand_persist.ts [seed]
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type {
  ActionOption, AugmentDef, DecisionPrompt, DraftStage,
  PlayerAgent, PlayerId, PlayerView,
} from "@majak/core";
import { contentAugments } from "@majak/content";

const SEED = Number(process.argv[2] ?? 5);
const HOLDER: PlayerId = "p0";
/* eslint-disable @typescript-eslint/no-explicit-any */
let GAME: any = null;
let branded = false;
const out: string[] = [];

const brandKeys = (): [string, unknown][] =>
  GAME === null ? [] :
    Object.entries(GAME.engine.state.augmentData as Record<string, unknown>)
      .filter(([k]) => k.includes("push_riichi") && !k.includes("fired"));

class A implements PlayerAgent {
  readonly isBot = true;
  nickname: string;
  constructor(readonly id: PlayerId) { this.nickname = id; }
  /** 정산 화면·드래프트 화면에서 클라이언트가 받는 뷰에 낙인 채널이 실려 있는가 */
  sendView(v: PlayerView): void {
    if (this.id !== "p1") return;
    const b = Object.entries(v.augmentView).filter(
      ([k, val]) => k.startsWith("push_riichi:") && !k.startsWith("push_riichi:fired:") &&
        typeof val === "string" && val !== "",
    );
    if (b.length > 0) lastViewBrand = JSON.stringify(b);
    else lastViewBrand = "(없음)";
  }
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const o = p.options;
    if (this.id === HOLDER && !branded) {
      const s = o.find(
        (x) => x.type === "push_brand" &&
          (x.payload as { target?: string } | undefined)?.target === "p1",
      );
      if (s !== undefined) { branded = true; out.push(">>> p0 push_brand → p1"); return s; }
    }
    // 낙인 대상 p1은 절대 리치하지 않는다 (낙인을 국 끝까지 살려 둔다)
    const w = o.find((x) => x.type === "win");
    if (w !== undefined) return w;
    const pass = o.find((x) => x.type === "pass");
    if (pass !== undefined) return pass;
    const d = o.filter((x) => x.type === "discard");
    if (d.length > 0) return d[0]!;
    return o[0]!;
  }
  async decideDraft(s: DraftStage, c: AugmentDef[]): Promise<string> {
    if (this.id === "p1") {
      out.push(`  [드래프트 ${String(s)}] augmentData 낙인 키=${JSON.stringify(brandKeys())}`);
      out.push(`  [드래프트 ${String(s)}] p1이 마지막으로 받은 뷰의 낙인 채널=${lastViewBrand}`);
    }
    return c[0]!.id;
  }
}
let lastViewBrand = "(없음)";

const agents = (["p0", "p1", "p2", "p3"] as PlayerId[]).map((id) => new A(id));
const ctrl = new HanchanController(agents, {
  ...DEFAULT_HANCHAN_CONFIG, mode: "tonpuu", seed: SEED, maxWind: 1, westEntry: false,
  extraAugments: contentAugments,
  presetAugments: { p0: ["push_riichi"], p1: [], p2: [], p3: [] },
  agentDecideTimeoutMs: 20_000,
} as never, {
  onRoundEnd: () => {
    out.push(`  [국 종료 직후] augmentData 낙인 키=${JSON.stringify(brandKeys())}`);
    out.push(`  [국 종료 직후] p1 뷰 낙인 채널=${lastViewBrand}`);
  },
  onRoundStart: (g: any) => {
    GAME = g;
    out.push(`  [다음 국 배패 후] augmentData 낙인 키=${JSON.stringify(brandKeys())}`);
    branded = false;
  },
} as never);

await ctrl.run().catch((e) => out.push("end " + String(e).slice(0, 80)));
for (const l of out) console.log(l);
