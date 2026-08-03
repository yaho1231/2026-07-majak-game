/**
 * BotAgent — 사람처럼 치는 것을 목표로 하는 규칙 기반 봇.
 *
 * 매 결정마다 판을 한 번 읽고(`bot/read.ts`), 그 읽기를 네 갈래 판단이 나눠 쓴다.
 *
 * - **버림** (`bot/discard.ts`) — 버린 뒤의 샹텐과 우케이레(받는 패의 실제 장수)로 고르고,
 *   도라를 흘리는 손해와 노리는 역의 방향을 얹는다. 상대가 리치를 걸면 그 비중을 낮추고
 *   안전도(현물·스지·노찬스)를 섞는다 = **밀기/접기**.
 * - **리치** (`bot/discard.ts`) — 기본은 건다. 죽은 대기·후리텐·패산 고갈·고타점 다마텐·
 *   남의 리치에 맞선 싸구려 나쁜 대기만 참는다. 선언패는 가장 넓은 대기를 남기는 쪽.
 * - **후로** (`bot/call.ts`) — 손이 실제로 전진하고(역패 펑만 예외) 화료할 역이 있을 때만.
 *   종반에는 형식텐파이를 위해 부른다.
 * - **깡** (`bot/kan.ts`) — 손이 상하지 않을 때만. 남이 리치 중이면 도라를 늘려 주지 않는다.
 *
 * 액티브 증강은 각 증강 파일의 `bot` 정책(AugmentDef.bot)에 위임하고, 그 정책이 쓸 수
 * 있도록 위 읽기(샹텐·대기·위협·안전도·잔여 장수)를 `BotDecisionContext`로 넘긴다.
 * 봇마다 성격(`bot/profile.ts`)이 달라 미는 정도·우는 문턱·생각 시간이 갈린다.
 *
 * 설계: docs/00_MASTER_ARCHITECTURE.md §5.4
 */

import { BOT_UNUSABLE_AUGMENTS } from "@majak/content";
import { Prng } from "@majak/core/engine/random/Prng.js";
import {
  AUGMENT_POWER_TIERS,
  powerScore,
} from "@majak/core/augment/powerTier.js";
import type { PlayerAgent } from "@majak/core/match/PlayerAgent.js";
import type { PlayerView } from "@majak/core/information/PlayerView.js";
import type { ActionOption, DecisionPrompt } from "@majak/core/mahjong/flow/FlowController.js";
import type {
  AugmentDef,
  BotDecisionContext,
  BotRng,
} from "@majak/core/augment/Augment.js";
import type { DraftStage, SandboxBotRules } from "@majak/core/network/protocol.js";
import type { PlayerId } from "@majak/core/engine/zones/Zone.js";
import type { TileKind } from "@majak/core/mahjong/tiles/Tile.js";
import { chooseCall } from "./bot/call.js";
import { chooseDiscard, chooseRiichi } from "./bot/discard.js";
import { chooseKan } from "./bot/kan.js";
import { buildRead, readPlan } from "./bot/read.js";
import type { BotRead, HandPlan } from "./bot/read.js";
import { rollProfile } from "./bot/profile.js";
import type { BotProfile } from "./bot/profile.js";

/** 후로(리액션 콜)로 취급하는 액션 — 봇 후로 금지 시 후보에서 뺀다 */
const CALL_TYPES = new Set(["pon", "chi", "minkan"]);

/**
 * 표준 마작 액션 — 이 밖의 액션 타입은 전부 액티브 증강의 발동이다
 * (증강이 자기 이름의 액션을 등록한다). 봇 증강 금지 판정에 쓴다.
 */
const STANDARD_ACTION_TYPES = new Set([
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

/**
 * 봇 제약(증강 테스트)에 걸리는 선택지를 후보에서 뺀다.
 *
 * 결정 **직전에 후보를 좁히는** 방식이라 판단 로직 자체는 손대지 않는다 —
 * 제약이 없으면(기본) 원본 배열을 그대로 돌려주므로 실대국 봇은 한 치도 달라지지 않는다.
 * 전부 걸러져 고를 것이 없어지면 원본을 그대로 쓴다(봇이 답을 못 내면 판이 멈춘다).
 */
export function restrictOptions(
  options: ActionOption[],
  rules: SandboxBotRules | null,
): ActionOption[] {
  if (rules === null) return options;
  const kept = options.filter((o) => {
    if (rules.noWin === true && o.type === "win") return false;
    if (rules.noRiichi === true && o.type === "riichi") return false;
    if (rules.noCall === true && CALL_TYPES.has(o.type)) return false;
    if (rules.noAugment === true && !STANDARD_ACTION_TYPES.has(o.type)) return false;
    return true;
  });
  return kept.length > 0 ? kept : options;
}

/** 플레이어 id에서 안정적 시드 파생 (결정론 유지) */
function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class BotAgent implements PlayerAgent {
  readonly id: PlayerId;
  readonly nickname: string;
  readonly isBot = true;
  private readonly rng: Prng;
  /** 증강 정책이 쓰는 결정론 난수 어댑터 (같은 rng를 공유) */
  private readonly botRng: BotRng;
  /** 이 봇의 성격 — 미는 정도·우는 문턱·생각 시간이 여기서 갈린다 */
  private readonly profile: BotProfile;
  /** 증강 id → 정의 (액티브 증강 정책 조회용). 없으면 봇은 증강을 발동하지 않는다 */
  private readonly catalog: ReadonlyMap<string, AugmentDef>;
  private lastView: PlayerView | null = null;
  /** 이번 결정의 판 읽기 (뷰가 바뀌면 무효화) */
  private read: BotRead | null = null;
  /** 현재 국 식별자 (바뀌면 목표 역 초기화) */
  private roundKey = "";
  /** 후로로 확정한 이번 국의 목표 역 */
  private plan: HandPlan = null;
  /**
   * 봇 행동 제약 (증강 테스트 전용). null(기본)이면 제약 없음 —
   * 실대국 봇은 이 값이 절대 채워지지 않으므로 판단이 종전과 완전히 동일하다.
   */
  private restrictions: SandboxBotRules | null = null;

  constructor(
    id: PlayerId,
    nickname?: string,
    seed?: number,
    catalog?: Iterable<AugmentDef>,
    /** 행동 전 생각 시간(ms). 0이면 즉시 결정(테스트 기본) */
    private readonly thinkMs = 0,
  ) {
    this.id = id;
    this.nickname = nickname ?? `Bot_${id}`;
    this.rng = new Prng(seed ?? seedFromId(id));
    this.botRng = {
      int: (n) => this.rng.int(n),
      float: () => this.rng.next(),
    };
    this.profile = rollProfile(this.rng);
    const map = new Map<string, AugmentDef>();
    for (const def of catalog ?? []) map.set(def.id, def);
    this.catalog = map;
  }

  /**
   * 봇 행동 제약을 건다 (증강 테스트 전용). 전부 꺼진 객체·null이면 제약 해제.
   * 진행 중인 판에도 다음 결정부터 즉시 반영된다.
   */
  setRestrictions(rules: SandboxBotRules | null): void {
    const on =
      rules !== null &&
      (rules.noCall === true ||
        rules.noRiichi === true ||
        rules.noWin === true ||
        rules.noAugment === true);
    this.restrictions = on ? rules : null;
  }

  sendView(view: PlayerView): void {
    this.lastView = view;
    this.read = null; // 판이 바뀌었다 — 다음 결정에서 다시 읽는다
    const rk = `${view.round.prevalentWind}-${view.round.roundNumber}-${view.round.honba}`;
    if (rk !== this.roundKey) {
      this.roundKey = rk;
      this.plan = null; // 새 국 → 목표 역 초기화
    }
  }

  /**
   * 결정 자체는 즉시 나오지만, 사람이 보기에 자연스럽도록 생각 시간을 둔다.
   * 성격(tempo)과 난수로 매번 조금씩 달라지고, 후로·리치처럼 실제로 고민할 만한
   * 선택은 조금 더 길게 끈다. 패스(리액션 거절)는 화면에 아무 변화도 없어 즉시 넘긴다.
   */
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const chosen = this.decideNow(prompt);
    if (this.thinkMs > 0 && chosen.type !== "pass") {
      const weighty =
        chosen.type === "riichi" ||
        chosen.type === "chi" ||
        chosen.type === "pon" ||
        chosen.type === "win";
      const jitter = 0.65 + this.rng.next() * 0.8;
      const ms = Math.round(this.thinkMs * this.profile.tempo * jitter * (weighty ? 1.4 : 1));
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    return chosen;
  }

  private decideNow(prompt: DecisionPrompt): ActionOption {
    // 증강 테스트 제약(후로·리치·화료·증강 금지)에 걸리는 선택지를 먼저 걷어낸다.
    // 제약이 없으면 prompt.options 그대로다.
    const options = restrictOptions(prompt.options, this.restrictions);

    // 1. 화료는 무조건 (론·쯔모)
    const win = options.find((o) => o.type === "win");
    if (win) return win;

    const read = this.currentRead();
    if (read === null) {
      const fallback = options.find((o) => o.type === "pass") ?? options[0];
      return fallback ?? options[0]!;
    }
    this.plan = readPlan(read, this.plan);

    // 2. 액티브 증강 발동 — 상황에 맞으면(증강 정책이 판단) 발동한다.
    //    증강 액션은 버림을 소비하지 않는 '추가 행동'이라, 발동 후 봇은 다시
    //    프롬프트를 받아 리치·버림을 이어간다. 그래서 콜·리치·버림보다 먼저 본다.
    const augment = this.chooseAugment(read, options);
    if (augment) return augment;

    // 3. 깡(안깡·가깡) — 손을 망치지 않을 때만. 깡도 버림을 소비하지 않는 추가 행동이라
    //    (영상패를 뽑고 다시 프롬프트가 온다) 콜·리치보다 먼저 본다.
    const kan = chooseKan(read, options, this.profile);
    if (kan) return kan;

    // 4. 리액션 콜(펑·치·대명깡)
    const call = chooseCall(read, options, this.plan, this.profile);
    if (call) {
      this.plan = call.plan;
      return call.option;
    }

    // 5. 멘젠 텐파이면 리치 — 걸 만할 때만, 가장 넓은 대기를 남기는 패로
    const riichis = options.filter((o) => o.type === "riichi");
    if (riichis.length > 0) {
      const declared = chooseRiichi(read, riichis, this.profile);
      if (declared !== null) return declared;
    }

    // 6. (콜 프롬프트에서 후로 안 하기로 함) 패스
    const pass = options.find((o) => o.type === "pass");
    if (pass) return pass;

    // 7. 내 차례 버림 — 진행·값어치·방향·안전을 섞어 고른다
    const discards = options.filter((o) => o.type === "discard");
    if (discards.length > 0) {
      const picked = chooseDiscard(read, discards, this.plan, this.profile);
      if (picked !== null) return picked;
    }

    // 8. 그 외(강제 선택지) 랜덤
    const idx = this.rng.int(options.length);
    return options[idx] ?? options[0]!;
  }

  /** 이번 결정의 판 읽기 (뷰당 한 번만 계산) */
  private currentRead(): BotRead | null {
    if (this.read !== null) return this.read;
    if (this.lastView === null) return null;
    this.read = buildRead(this.lastView, this.id);
    return this.read;
  }

  // ─────────────────────────── 액티브 증강 발동 ───────────────────────────

  /**
   * 보유 액티브 증강의 봇 정책을 순회하며 발동할 옵션을 고른다. 없으면 null.
   * 각 증강 정책(AugmentDef.bot)은 자기 소유 옵션만 골라야 하고, 여기서는
   * 정책이 돌려준 옵션이 실제로 이번 프롬프트에 제시됐는지 한 번 더 확인한다
   * (제시되지 않은 옵션을 제출하면 FlowController가 throw).
   */
  private chooseAugment(read: BotRead, options: ActionOption[]): ActionOption | null {
    const me = read.view.players.find((p) => p.id === this.id);
    if (me === undefined || me.augments.length === 0) return null;

    const ctx: BotDecisionContext = {
      view: read.view,
      options,
      holder: this.id,
      rng: this.botRng,
      tenpai: read.tenpai,
      shanten: read.shanten,
      waits: read.waits,
      turn: read.turn,
      wallLeft: read.wallLeft,
      threat: read.threat,
      remaining: (kind: TileKind) => read.remainingOf(kind),
      safety: (kind: TileKind) => read.safetyOf(kind),
    };
    // 보유 증강 순서대로 — 먼저 발동을 원하는 증강을 채택 (결정론적)
    for (const augId of me.augments) {
      const policy = this.catalog.get(augId)?.bot;
      if (policy === undefined) continue;
      const picked = policy.choose(ctx);
      if (picked === null) continue;
      const key = JSON.stringify(picked);
      const match = options.find((o) => JSON.stringify(o) === key);
      if (match !== undefined) return match;
    }
    return null;
  }

  async decideDraft(_stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    // 봇이 발동 판단을 할 수 없는 액티브 증강(다단계 교환류)은 뽑아 봐야 게임 내내
    // 놀린다 → 나머지 선택지가 있으면 그쪽을 먼저 고른다.
    // (패시브 증강은 발동이 필요 없으므로 여기서 걸리지 않는다.)
    const usable = choices.filter((c) => !BOT_UNUSABLE_AUGMENTS.includes(c.id));
    const pool = usable.length > 0 ? usable : choices;
    // 파워 점수가 높은 쪽을 고른다. 예전에는 평가 없이 균등 난수라 SS+와 D를 같은
    // 확률로 집었고, 그래서 사람 대 봇 게임의 통계로는 "증강이 센지"를 판정할 수
    // 없었다(docs/25 시스템 횡단 #9). 티어표는 core가 이미 전수 관리한다.
    let best = pool[0] as AugmentDef;
    let bestScore = powerOf(best.id);
    const tied: AugmentDef[] = [best];
    for (const c of pool.slice(1)) {
      const score = powerOf(c.id);
      if (score > bestScore) {
        best = c;
        bestScore = score;
        tied.length = 0;
        tied.push(c);
      } else if (score === bestScore) {
        tied.push(c);
      }
    }
    // 동점은 시드 PRNG로 (시드만으로 재현 가능 — 결정론 유지)
    return (tied[this.rng.int(tied.length)] ?? best).id;
  }
}

/** 증강의 파워 점수 (티어표에 없으면 중간값으로 본다 — 새 증강이 과대·과소평가되지 않게) */
function powerOf(id: string): number {
  const entry = AUGMENT_POWER_TIERS[id];
  return entry === undefined ? 25 : powerScore(entry);
}
