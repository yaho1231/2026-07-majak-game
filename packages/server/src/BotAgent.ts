/**
 * BotAgent — 사람처럼 치는 것을 목표로 하는 봇.
 *
 * 매 결정마다 판을 한 번 읽고(`bot/read.ts`), 그 읽기를 여러 평가자가 나눠 쓴 뒤
 * **전부 점수로 입찰**한다. 이긴 입찰이 실행된다(`bot/decide.ts`).
 *
 * - **값어치·확률** (`bot/value.ts`) — 예상 판수를 코어 점수표로 옮겨 손을 점수로 매기고,
 *   대기·우케이레·남은 순목으로 화료 확률을 낸다. 모든 입찰의 공통 눈금이다.
 * - **순위** (`bot/match.ts`) — 점수판과 남은 국 수를 `riskAppetite` 한 축으로 압축한다.
 * - **위험** (`bot/danger.ts`) — 현물·스지·노찬스로 방총 확률을, 상대 리치·후로·도라로
 *   예상 실점을 낸다. 곱하면 기대 실점 — 기대 획득과 같은 단위다.
 * - **버림·리치** (`bot/discard.ts`) — 후보마다 버린 뒤의 판 EV. 다마텐은 규칙이 아니라
 *   리치 입찰이 진 결과다.
 * - **후로** (`bot/call.ts`) — 울고 간 판과 안 울고 간 판의 EV 비교. 구조적으로 불가능한
 *   콜(역 없음·전진 없음·멘젠 텐파이 파괴)만 걸러 낸다.
 * - **깡** (`bot/kan.ts`) — 새 도라와 영상패가 버는 것에서, 남에게 붙는 도라를 뺀다.
 *
 * 액티브 증강은 각 증강 파일의 `bot` 정책(AugmentDef.bot)에 위임하고, 그 정책이 쓸 수
 * 있도록 위 읽기(샹텐·대기·위협·안전도·잔여 장수)를 `BotDecisionContext`로 넘긴다.
 * 정책이 말하는 발동 강도는 `augmentPoints`가 점수 축으로 옮긴다.
 * 봇마다 성격(`bot/profile.ts`)이 달라 미는 정도·우는 문턱·생각 시간이 갈린다.
 *
 * 설계: docs/00_MASTER_ARCHITECTURE.md §5.4
 */

import { BOT_UNUSABLE_AUGMENTS } from "@majak/content";
import { Prng } from "@majak/core/engine/random/Prng.js";
import {
  AUGMENT_POWER_TIERS,
  defaultBotWeight,
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
import { bidCall, bidPass } from "./bot/call.js";
import { bidDiscard, bidRiichi } from "./bot/discard.js";
import { bidKan } from "./bot/kan.js";
import { augmentPoints, bestBid, EXTRA_ACTION_FLOOR } from "./bot/decide.js";
import type { ActionBid } from "./bot/decide.js";
import { buildRead, readPlan } from "./bot/read.js";
import type { BotRead, HandPlan } from "./bot/read.js";
import { rollProfile } from "./bot/profile.js";
import type { BotProfile } from "./bot/profile.js";
import type { BotGameMode } from "./bot/match.js";
import { OpponentMemory } from "./bot/opponents.js";

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
  /**
   * 게임 모드 — **몇 국짜리 게임인가**. 뷰에는 없는 정보라 서버가 알려 준다.
   * 이게 있어야 "지금이 올라스인가"를 알 수 있고, 그래야 순위를 지키거나 뒤집는
   * 사람다운 판단이 나온다(`bot/match.ts`). 모르면 반장전으로 본다.
   */
  private mode: BotGameMode = "hanchan";
  /**
   * **상대가 어떤 사람인가**를 국을 넘어 기억한다.
   *
   * 예전 봇에게 상대 셋은 매 국 처음 보는 사람이었다 — 다섯 국 내내 한 번도 안 운
   * 사람과 매 국 세 번씩 우는 사람을 똑같이 취급했다. 관측은 전부 뷰에서만 하므로
   * 정보 비대칭이 깨지지 않는다(`bot/opponents.ts`).
   */
  private readonly opponents = new OpponentMemory();

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

  /** 이 방의 게임 모드를 알린다 (게임 시작 시 서버가 호출). 순위 판단의 전제가 된다 */
  setGameMode(mode: BotGameMode): void {
    this.mode = mode;
    this.read = null;
  }

  sendView(view: PlayerView): void {
    this.lastView = view;
    this.read = null; // 판이 바뀌었다 — 다음 결정에서 다시 읽는다
    // 뷰의 변화에서 상대의 리치·후로를 읽어 성향으로 쌓는다 (국 경계도 여기서 잡는다)
    this.opponents.observe(view, this.id);
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

  /**
   * 이번 프롬프트에서 무엇을 할지.
   *
   * **2026-08-05 재작성.** 예전에는 고정된 우선순위 사슬이었다 —
   * `화료 → 증강 → 깡 → 후로 → 리치 → 버림`. 각 단계가 "한다/안 한다"만 돌려주고
   * 앞 단계가 하겠다면 뒤 단계는 물어보지도 않아서, 봇은 **비교를 한 적이 없었다.**
   * 이 펑이 리치보다 이득인지, 이 깡이 안전패 한 장보다 나은지를 물을 자리가 구조적으로
   * 없었고, 새 판단을 붙이려면 사슬 어딘가에 끼워 넣어야 했다 — 그 위치가 곧 판단이
   * 되어 버리는 구조였다.
   *
   * 지금은 후보가 전부 **점수로 입찰**한다. 남아 있는 층은 취향이 아니라 게임의
   * 사실이다 — 깡과 증강은 턴을 소비하지 않아 다른 행동과 경쟁하지 않는다
   * (하고 나서 그대로 버릴 수 있다). 자세한 근거는 `bot/decide.ts`.
   */
  private decideNow(prompt: DecisionPrompt): ActionOption {
    // 증강 테스트 제약(후로·리치·화료·증강 금지)에 걸리는 선택지를 먼저 걷어낸다.
    // 제약이 없으면 prompt.options 그대로다.
    const options = restrictOptions(prompt.options, this.restrictions);

    // 화료는 비교하지 않는다 — 이기는 것보다 나은 선택지는 없다
    const win = options.find((o) => o.type === "win");
    if (win) return win;

    const read = this.currentRead();
    if (read === null) {
      const fallback = options.find((o) => o.type === "pass") ?? options[0];
      return fallback ?? options[0]!;
    }
    this.plan = readPlan(read, this.plan);

    // ── 1층: 추가 행동 (깡 · 액티브 증강) ──
    // 턴을 소비하지 않으므로 버림·리치와 경쟁하지 않는다. 이득이 눈에 보이면 먼저 한다.
    const extra = bestBid([
      bidKan(read, options, this.profile, this.plan),
      ...this.augmentBids(read, options),
    ]);
    if (extra !== null && extra.value > EXTRA_ACTION_FLOOR) return extra.option;

    // ── 2층: 턴을 소비하는 행동 ──
    // 전부 "그 길로 갔을 때 이 판이 얼마짜리인가"(절대 EV)로 입찰하므로 직접 견줄 수 있다.
    // 다마텐도 '울지 않기'도 여기서 규칙 없이 나온다 — 그냥 그쪽 입찰이 이긴 것이다.
    const call = bidCall(read, options, this.plan, this.profile);
    const turn = bestBid([
      call,
      bidPass(read, options, this.plan, this.profile),
      bidRiichi(read, options.filter((o) => o.type === "riichi"), this.plan, this.profile),
      bidDiscard(read, options.filter((o) => o.type === "discard"), this.plan, this.profile),
    ]);
    if (turn !== null) {
      // 후로가 이겼으면 이번 국의 역 방향이 그 콜로 확정된다
      if (call !== null && turn.option === call.option) this.plan = call.plan;
      return turn.option;
    }

    // 아무도 입찰하지 않는 프롬프트(증강이 만든 강제 선택지 등)는 난수로
    const idx = this.rng.int(options.length);
    return options[idx] ?? options[0]!;
  }

  /** 이번 결정의 판 읽기 (뷰당 한 번만 계산) */
  private currentRead(): BotRead | null {
    if (this.read !== null) return this.read;
    if (this.lastView === null) return null;
    this.read = buildRead(this.lastView, this.id, {
      mode: this.mode,
      traitsOf: (p) => this.opponents.traitsOf(p),
    });
    return this.read;
  }

  // ─────────────────────────── 액티브 증강 발동 ───────────────────────────

  /**
   * 보유 액티브 증강의 봇 정책을 순회하며 **입찰 목록**을 만든다.
   *
   * 각 증강 정책(AugmentDef.bot)은 자기 소유 옵션만 골라야 하고, 여기서는 정책이
   * 돌려준 옵션이 실제로 이번 프롬프트에 제시됐는지 한 번 더 확인한다 (제시되지 않은
   * 옵션을 제출하면 FlowController가 throw).
   *
   * 정책들은 `BOT_WEIGHT`라는 **별도 눈금**(0~100)으로 말한다. 그 눈금은 증강끼리
   * 비교하는 데는 충분했지만 깡·리치·버림과는 비교할 수 없었다 — 그래서 예전 봇은
   * 발동 가능한 증강이 있으면 그 값어치와 무관하게 **무조건 먼저 태웠다.**
   * 정책 115개를 고쳐 쓰는 대신 `augmentPoints`가 두 눈금 사이의 환율이 된다.
   * 정책은 지금 쓰는 말을 그대로 쓰고, 코어가 그 말을 점수로 옮긴다.
   */
  private augmentBids(read: BotRead, options: ActionOption[]): ActionBid[] {
    const me = read.view.players.find((p) => p.id === this.id);
    if (me === undefined || me.augments.length === 0) return [];

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
    // 증강의 값어치는 손의 값어치에 매인다 — 만관 손에서의 '평시 발동'과
    // 1000점 손에서의 '평시 발동'은 같은 강도라도 실제 값이 다르다
    const handPoints = read.valueOf({ plan: this.plan }).points;

    const bids: ActionBid[] = [];
    for (const augId of me.augments) {
      const def = this.catalog.get(augId);
      const policy = def?.bot;
      if (def === undefined || policy === undefined) continue;
      const picked = policy.choose(ctx);
      if (picked === null) continue;
      const weighted =
        "option" in picked
          ? picked
          : { option: picked, weight: defaultBotWeight(augId, def.category) };
      const key = JSON.stringify(weighted.option);
      const match = options.find((o) => JSON.stringify(o) === key);
      if (match === undefined) continue;
      bids.push({
        option: match,
        value: augmentPoints(weighted.weight, handPoints),
        reason: `증강 ${augId} (강도 ${weighted.weight})`,
      });
    }
    // 동점은 먼저 본 쪽(보유 순서)이 이긴다 — bestBid가 순수 부등호라 그렇게 된다
    return bids;
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
