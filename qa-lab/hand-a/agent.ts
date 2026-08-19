/** 최소 재현용 스크립트 에이전트 — 프롬프트를 규칙 함수로 답한다. */
import type {
  ActionOption,
  AugmentDef,
  DecisionPrompt,
  DraftStage,
  PlayerAgent,
  PlayerId,
  PlayerView,
} from "@majak/core";

export type Chooser = (
  prompt: DecisionPrompt,
  view: PlayerView | null,
) => ActionOption | undefined;

export class ScriptAgent implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  view: PlayerView | null = null;
  actionLog: string[] = [];
  log: string[] = [];
  constructor(
    readonly id: PlayerId,
    private readonly choose: Chooser,
  ) {
    this.nickname = `script-${id}`;
  }
  sendView(v: PlayerView): void {
    this.view = v;
  }
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const picked = this.choose(prompt, this.view);
    if (picked !== undefined) {
      this.actionLog.push(picked.type);
      this.log.push(`${this.id} -> ${picked.type} ${JSON.stringify(picked.payload)}`);
      return picked;
    }
    // 기본: pass > 쯔모기리(마지막 discard) > 첫 옵션
    const pass = prompt.options.find((o) => o.type === "pass");
    if (pass !== undefined) {
      this.actionLog.push("pass");
      return pass;
    }
    const disc = prompt.options.filter((o) => o.type === "discard");
    const pick = disc[disc.length - 1] ?? prompt.options[0]!;
    this.actionLog.push(pick.type);
    return pick;
  }
  async decideDraft(_s: DraftStage, choices: AugmentDef[]): Promise<string> {
    return (choices[0] as AugmentDef).id;
  }
}

/** payload에서 tileId를 꺼낸다 (discard 옵션 등) */
export function tileIdOf(o: ActionOption): number | undefined {
  return (o.payload as { tileId?: number }).tileId;
}
