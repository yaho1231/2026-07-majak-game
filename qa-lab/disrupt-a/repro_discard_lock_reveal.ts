/**
 * 봉인술사(discard_lock) — "보유자는 각 상대의 봉인된 실제 패를 그대로 확인한다"가
 * 실제로 뷰에 실리는가.
 *
 * 채널: view:{holder}:discardLockReveal:{target}#round  (discard_lock.ts:90)
 * 코어 PlayerView는 `revealTiles:` 로 시작하는 채널만 tiles에 메타데이터를 얹는다
 * (PlayerView.ts:625). 채널 이름이 discardLockReveal로 바뀐 뒤 그 경로가 끊겼는지 본다.
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type { ActionOption, AugmentDef, DecisionPrompt, DraftStage, PlayerAgent, PlayerId, PlayerView } from "@majak/core";
import { contentAugments } from "@majak/content";

const HOLDER: PlayerId = "p0";
let reported = false;

class A implements PlayerAgent {
  readonly isBot = true;
  nickname: string;
  constructor(readonly id: PlayerId) { this.nickname = id; }
  sendView(v: PlayerView): void {
    if (this.id !== HOLDER || reported) return;
    const chans = Object.entries(v.augmentView).filter(([k]) => k.startsWith("discardLockReveal:"));
    if (chans.length === 0) return;
    reported = true;
    console.log("보유자 뷰의 봉인 채널:");
    for (const [k, val] of chans) {
      const ids = (val as unknown[]).filter((x): x is number => typeof x === "number");
      const inTiles = ids.filter((id) => v.tiles[id] !== undefined);
      console.log(`  ${k}: tileId ${ids.length}장 → view.tiles에 실린 것 ${inTiles.length}장`);
      if (inTiles.length > 0) console.log(`     실제 패: ${inTiles.map((id) => `${v.tiles[id]!.kind.suit}${v.tiles[id]!.kind.rank}`).join(",")}`);
    }
    const seals = Object.entries(v.augmentView).filter(([k]) => k.startsWith("sealed:"));
    console.log("  폴백 채널(종류만):", JSON.stringify(seals));
    // 비교군 — revealTiles: 로 시작하는 채널은 정상 노출되는지
    const rt = Object.entries(v.augmentView).filter(([k]) => k.startsWith("revealTiles:"));
    console.log("  revealTiles 채널:", JSON.stringify(rt));
  }
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const o = p.options;
    if (this.id === HOLDER) {
      const s = o.find((x) => x.type === "seal_hands");
      if (s !== undefined) return s;
    }
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

const agents = (["p0", "p1", "p2", "p3"] as PlayerId[]).map((id) => new A(id));
const ctrl = new HanchanController(agents, {
  ...DEFAULT_HANCHAN_CONFIG, mode: "tonpuu", seed: 3, maxWind: 1, westEntry: false, draftSchedules: [],
  extraAugments: contentAugments,
  presetAugments: { p0: ["discard_lock"], p1: [], p2: [], p3: [] },
  agentDecideTimeoutMs: 20_000,
} as never, {} as never);
await ctrl.run().catch((e) => console.log("end", String(e).slice(0, 80)));
