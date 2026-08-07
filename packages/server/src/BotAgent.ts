/**
 * BotAgent — 사람처럼 치는 것을 목표로 하는 봇.
 *
 * 매 결정마다 판을 한 번 읽고(`bot/read.ts`), 그 읽기를 여러 평가자가 나눠 쓴 뒤
 * **전부 점수로 입찰**한다. 이긴 입찰이 실행된다(`bot/decide.ts`).
 *
 * - **값어치·확률** (`bot/value.ts`) — 예상 판수를 코어 점수표로 옮겨 손을 점수로 매기고,
 *   대기·우케이레·남은 순목으로 화료 확률을 낸다. 모든 입찰의 공통 눈금이다.
 * - **순위** (`bot/match.ts`) — 점수판과 남은 국 수를 `riskAppetite` 한 축으로 압축한다.
 * - **위험** (`bot/danger.ts` · `bot/suji.ts`) — 이 패를 잡는 대기형을 세워 놓고 현물·
 *   통과패·스지·벽·장수 셈으로 지워진 몫을 빼 방총 확률을, 상대 리치·후로·도라로
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
import { bidAbort } from "./bot/abort.js";
import { bidCall, bidPass } from "./bot/call.js";
import type { CallAudit } from "./bot/callAudit.js";
import { bidDiscard, bidRiichi } from "./bot/discard.js";
import { bidKan } from "./bot/kan.js";
import { augmentPoints, bestBid, EXTRA_ACTION_FLOOR } from "./bot/decide.js";
import type { ActionBid } from "./bot/decide.js";
import { buildRead, readPlan } from "./bot/read.js";
import type { BotRead, HandPlan } from "./bot/read.js";
import { rollProfile, withDifficulty } from "./bot/profile.js";
import type { ArchetypeName, BotDifficulty, BotProfile } from "./bot/profile.js";
import type { BotGameMode } from "./bot/match.js";
import { OpponentMemory } from "./bot/opponents.js";
import { chooseDraft } from "./bot/draft.js";
import { NO_FLAGS } from "./bot/flags.js";
import type { BotFlags } from "./bot/flags.js";

/** 후로(리액션 콜)로 취급하는 액션 — 봇 후로 금지 시 후보에서 뺀다 */
const CALL_TYPES = new Set(["pon", "chi", "minkan"]);

/**
 * **content가 준 코드가 던진 예외를 여기서 끊는다.**
 *
 * 증강 정책(`AugmentDef.bot.choose`)은 content 패키지의 코드다. 그 함수 하나가
 * 던지면 예외는 `HanchanController` → `RoomManager`로 올라가 GAME_CRASHED가 나가고
 * **방이 삭제된다** — 사람의 반장전 하나가 통째로 사라진다. 증강 66종의 정책이
 * 봇의 모든 결정마다 도는데, 그중 하나의 버그가 그 대가를 치를 이유가 없다.
 *
 * 그래서 정책의 실패는 "이 증강은 이번 순에 입찰하지 않는다"로 **강등**한다.
 * 봇은 남은 판단(버림·리치·후로)으로 멀쩡히 계속 두고, 운영자는 로그에서
 * 증강 id와 예외를 그대로 본다.
 */
function logContentFailure(where: string, err: unknown): void {
  console.error(`[BotAgent] 증강 코드 실패 (${where}) — 이 판단만 건너뛴다:`, err);
}

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
/**
 * 문자열 하나를 시드로 (FNV-1a).
 *
 * 방마다 다른 성격이 앉게 하려면 **방 코드까지 섞어서** 넘겨야 한다
 * (`RoomManager.newBot`) — id만 쓰면 좌석 이름이 늘 `p1`·`p2`·`p3`이라
 * 모든 방이 같은 성격 조합을 받는다.
 */
export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 봇 좌석 하나의 시드 — **판마다 달라야 한다.**
 *
 * 지금 `RoomManager`는 `seedFromId(`${code}:${id}`)`를 쓴다. 방 코드와 좌석 이름은
 * 둘 다 방이 사는 동안 변하지 않으므로, **같은 방 코드에서는 영원히 같은 성격 셋**이
 * 앉는다. 재대국(`newBot`을 다시 부른다)에도 같은 시드가 들어가 리롤이 없다 —
 * 친구들과 방 하나를 계속 쓰면 몇십 판을 두어도 상대 셋이 한 번도 안 바뀐다.
 *
 * `game`(그 방에서 몇 번째 판인가)을 섞으면 판마다 새 사람이 앉는다. 같은 판 안에서는
 * 여전히 결정론적이라 리플레이가 깨지지 않는다.
 */
export function botSeed(code: string, id: PlayerId, game = 0): number {
  return seedFromId(`${code}:${id}:${game}`);
}

export class BotAgent implements PlayerAgent {
  readonly id: PlayerId;
  readonly nickname: string;
  readonly isBot = true;
  private readonly rng: Prng;
  /** 증강 정책이 쓰는 결정론 난수 어댑터 (같은 rng를 공유) */
  private readonly botRng: BotRng;
  /**
   * 이 봇의 성격 — 원형(공격형·수비형·속공형·타점형·균형형·변덕형) 하나에서 나온다.
   * 미는 정도·우는 문턱·타점 취향·참을성·흔들림·허세가 전부 여기서 갈린다.
   */
  private profile: BotProfile;
  /** 증강 id → 정의 (액티브 증강 정책 조회용). 없으면 봇은 증강을 발동하지 않는다 */
  private readonly catalog: ReadonlyMap<string, AugmentDef>;
  private lastView: PlayerView | null = null;
  /** 이번 결정의 판 읽기 (뷰가 바뀌면 무효화) */
  private read: BotRead | null = null;
  /** 현재 국 식별자 (바뀌면 목표 역 초기화) */
  private roundKey = "";
  /**
   * **한 순에 같은 액티브 증강을 두 번 태우지 않는다.**
   *
   * 증강 발동은 턴을 소비하지 않아서(1층), 발동 뒤에 온 새 프롬프트에서 같은 정책이
   * 또 이길 수 있다. 왕패의 주인이 그랬다 — 교환 1회 = 액션 1개라, 봇은 자기 첫 순에
   * dw_swap을 연달아 두 번 보내고 사람 화면에는 발동 컷인이 두 번 떴다
   * (2026-08-07 사용자 보고). 사람은 모달에서 쌍을 모아 **한 번에** 확정하므로,
   * 봇도 한 순에 한 번으로 맞춘다.
   *
   * 막는 단위는 **액션 타입**이다 — 예지(공개 → 재배열)나 등가교환(넘기기 → 받기)처럼
   * 발동 한 번이 서로 다른 액션 두 개로 이어지는 흐름은 그대로 둔다.
   */
  private turnKey = "";
  private firedThisTurn = new Set<string>();
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
  /**
   * 실험 스위치 — **2:2 정책 대전 전용**(`bot/arena.ts`). 실대국 봇은 항상 비어 있다.
   * 새 판단을 곧바로 갈아치우지 않고 이 뒤에 두면, 같은 탁에 두 정책을 앉혀
   * 평균 순위로 강함을 잴 수 있다(자기대국은 넷이 같아 순위가 2.5로 수렴한다).
   */
  private flags: BotFlags = NO_FLAGS;
  /** 콜 기회 집계기 (측정 전용 — 실대국은 undefined) */
  private callAudit: CallAudit | undefined = undefined;
  /**
   * 대기 중인 '생각 시간'을 즉시 끝내는 손잡이들 (`cancelDecision`).
   * 하나의 봇이 동시에 두 프롬프트를 받는 일은 없지만, 취소가 어긋나면 판이 멈추므로
   * 집합으로 두고 전부 깨운다.
   */
  private readonly thinkAborts = new Set<() => void>();

  constructor(
    id: PlayerId,
    nickname?: string,
    seed?: number,
    catalog?: Iterable<AugmentDef>,
    /** 행동 전 생각 시간(ms). 0이면 즉시 결정(테스트 기본) */
    private readonly thinkMs = 0,
    /**
     * 원형 고정 — 방장이 대기실에서 이 자리의 성향을 지정했을 때만 온다.
     * 생략하면 종전대로 시드에서 뽑는다.
     */
    archetype?: ArchetypeName,
  ) {
    this.id = id;
    this.nickname = nickname ?? `Bot_${id}`;
    this.rng = new Prng(seed ?? seedFromId(id));
    this.botRng = {
      int: (n) => this.rng.int(n),
      float: () => this.rng.next(),
    };
    this.profile = rollProfile(this.rng, archetype);
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

  /** 실험 스위치를 건다 (측정 전용) */
  setFlags(flags: BotFlags): void {
    this.flags = flags;
    this.read = null;
  }

  /** 콜 기회 집계기를 건다 (측정 전용 — `bot/callAudit.ts`) */
  setCallAudit(audit: CallAudit | undefined): void {
    this.callAudit = audit;
    this.read = null;
  }

  /** 이 봇의 원형 (표시·집계용) */
  get archetype(): BotProfile["archetype"] {
    return this.profile.archetype;
  }

  /**
   * `PlayerAgent.botArchetype` — 이름표·대기실·순위표에 성향을 세우려고 코어가 읽는다.
   * `archetype`와 같은 값이지만 코어는 원형 타입을 모르므로 문자열로 넘긴다.
   */
  get botArchetype(): string {
    return this.profile.archetype;
  }

  /**
   * 성격을 지정한다 — **측정·재현 전용**(`bot/arena.ts`, 테스트).
   * 실대국 봇은 시드에서 스스로 뽑으므로 이 경로를 타지 않는다.
   */
  setProfile(profile: BotProfile): void {
    this.profile = profile;
    // 판 읽기가 성격을 탄다(`sujiTrust`) — 캐시된 읽기는 옛 사람의 것이다
    this.read = null;
  }

  /**
   * 이 봇의 **난이도**를 정한다 (`bot/profile.ts`의 `skill` 한 칸).
   *
   * 성격은 그대로 두고 실력만 바꾼다 — 공격형 초보와 공격형 숙련자가 둘 다 있어야
   * 난이도가 "다른 봇"이 아니라 "같은 사람의 다른 숙련도"로 읽힌다.
   * 부르지 않으면 `hard`(= 지금까지의 봇)와 완전히 같다.
   */
  setDifficulty(difficulty: BotDifficulty): void {
    this.profile = withDifficulty(this.profile, difficulty);
    this.read = null;
  }

  /** 이 봇의 난이도 눈금 0(초보)~1(숙련) — 표시·집계용 */
  get skill(): number {
    return this.profile.skill;
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
    // 순이 넘어가면 '이 순에 태운 증강' 기록을 비운다 (한 순 1회 제한의 창)
    const tk = `${rk}-${view.round.turnCount}-${view.round.turnSeat}`;
    if (tk !== this.turnKey) {
      this.turnKey = tk;
      this.firedThisTurn = new Set();
    }
  }

  /**
   * 결정 자체는 즉시 나오지만, 사람이 보기에 자연스럽도록 생각 시간을 둔다.
   * 성격(tempo)과 난수로 매번 조금씩 달라지고, 후로·리치처럼 실제로 고민할 만한
   * 선택은 조금 더 길게 끈다. 패스(리액션 거절)는 화면에 아무 변화도 없어 즉시 넘긴다.
   */
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const chosen = this.decideSafely(prompt);
    if (this.thinkMs > 0 && chosen.type !== "pass") {
      const weighty =
        chosen.type === "riichi" ||
        chosen.type === "chi" ||
        chosen.type === "pon" ||
        chosen.type === "win";
      const jitter = 0.65 + this.rng.next() * 0.8;
      const ms = Math.round(this.thinkMs * this.profile.tempo * jitter * (weighty ? 1.4 : 1));
      await this.think(ms);
    }
    return chosen;
  }

  /**
   * 생각하는 척하는 시간 — **끊을 수 있어야 한다.**
   *
   * 리액션 경합(같은 버림에 론과 펑이 함께 걸린 자리)에서 상위 선언이 확정되면
   * `HanchanController`가 진 쪽의 프롬프트를 `cancelDecision()`으로 접는다. 그런데
   * 이 자리가 그냥 `setTimeout`이면 **봇은 그 신호를 못 듣고 끝까지 잔다.** 국은
   * `Promise.all`로 전원의 응답을 기다리므로, 펑을 고른 봇 하나(weighty ×1.4 →
   * 최대 3초 남짓)가 **이미 결판난 남의 론을 그만큼 붙들고 있었다.** 경합이 붙은
   * 모든 버림이 1~3초씩 죽은 시간을 먹었다.
   *
   * 결정 자체는 이미 나와 있으므로 취소는 **답을 바꾸지 않는다** — 남은 대기만
   * 건너뛴다. 컨트롤러는 접힌 프롬프트의 답을 어차피 버린다.
   */
  private think(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.thinkAborts.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.thinkAborts.add(done);
    });
  }

  /**
   * 상위 선언이 확정돼 이 결정이 무의미해졌다 — 남은 생각 시간을 즉시 끝낸다.
   * (`PlayerAgent.cancelDecision`. 대기 중이 아니면 아무 일도 하지 않는다.)
   */
  cancelDecision(): void {
    for (const abort of [...this.thinkAborts]) abort();
  }

  /**
   * **마지막 안전망** — 판단이 어떤 이유로 던지더라도 방은 살아남는다.
   *
   * 정책 예외는 `augmentBids`가 이미 증강 단위로 잡는다. 여기 있는 것은 그 그물을
   * 빠져나간 것(정책이 만든 이상한 옵션을 다른 평가자가 만졌다든지)까지도
   * **합법적인 한 수**로 강등하기 위한 것이다. 봇이 한 순 바보처럼 두는 것과
   * 사람의 반장전이 삭제되는 것은 비교할 수 있는 손해가 아니다.
   *
   * 조용히 삼키지는 않는다 — 로그에 그대로 남으므로 운영자가 찾을 수 있다.
   */
  private decideSafely(prompt: DecisionPrompt): ActionOption {
    try {
      return this.decideNow(prompt);
    } catch (err) {
      logContentFailure("decide", err);
      // 제약을 다시 적용해 고른다 — 안전망이 금지된 수를 두면 그것대로 규칙 위반이다
      return this.fallbackOption(restrictOptions(prompt.options, this.restrictions));
    }
  }

  /**
   * 아무 판단도 못 했을 때 두는 수 — 패스가 있으면 패스(판을 흔들지 않는다),
   * 없으면 첫 선택지.
   *
   * 선택지가 **하나도 없으면** 봇이 낼 답이 없다. 예전에는 `options[0]!`로 단언해
   * `undefined`가 흐름으로 흘러갔고, 거기서 나는 오류는 원인을 가리키지 않았다.
   * 이건 봇의 잘못이 아니라 프롬프트가 잘못된 것이므로 그렇게 말하고 던진다.
   */
  private fallbackOption(options: readonly ActionOption[]): ActionOption {
    const fallback = options.find((o) => o.type === "pass") ?? options[0];
    if (fallback === undefined) {
      throw new Error(`BotAgent(${this.id}): 선택지가 없는 프롬프트에는 답할 수 없다`);
    }
    return fallback;
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
    if (read === null) return this.fallbackOption(options);
    this.plan = readPlan(read, this.plan);

    // ── 1층: 추가 행동 (깡 · 액티브 증강) ──
    // 턴을 소비하지 않으므로 버림·리치와 경쟁하지 않는다. 이득이 눈에 보이면 먼저 한다.
    const extra = bestBid([
      bidKan(read, options, this.profile, this.plan),
      // 이 순에 이미 태운 액션은 후보에서 뺀다 — 정책은 남은 것 중에서 고른다
      ...this.augmentBids(
        read,
        this.firedThisTurn.size === 0
          ? options
          : options.filter((o) => !this.firedThisTurn.has(o.type)),
      ),
    ]);
    if (extra !== null && extra.value > EXTRA_ACTION_FLOOR) {
      // 증강 발동이면 이 순에는 같은 액션을 다시 태우지 않는다 (위 firedThisTurn 주석)
      if (!STANDARD_ACTION_TYPES.has(extra.option.type)) {
        this.firedThisTurn.add(extra.option.type);
      }
      return extra.option;
    }

    // ── 2층: 턴을 소비하는 행동 ──
    // 전부 "그 길로 갔을 때 이 판이 얼마짜리인가"(절대 EV)로 입찰하므로 직접 견줄 수 있다.
    // 다마텐도 '울지 않기'도 여기서 규칙 없이 나온다 — 그냥 그쪽 입찰이 이긴 것이다.
    const call = bidCall(read, options, this.plan, this.profile);
    const turn = bestBid([
      call,
      // 구종구패 — 이 옵션에 입찰하는 평가자가 없어 봇은 여태 한 번도 선언하지 못했다
      bidAbort(read, options),
      bidPass(read, options, this.plan, this.profile),
      bidRiichi(read, options.filter((o) => o.type === "riichi"), this.plan, this.profile),
      bidDiscard(
        read,
        options.filter((o) => o.type === "discard"),
        this.plan,
        this.profile,
        // 사람다운 흔들림 — 값이 엇비슷한 후보들 사이에서만 갈린다(bot/profile.ts)
        this.botRng,
      ),
    ]);
    if (turn !== null) {
      // 후로가 이겼으면 이번 국의 역 방향이 그 콜로 확정된다
      if (call !== null && turn.option === call.option) {
        this.plan = call.plan;
        call.audit("taken");
      } else if (call !== null) {
        // 관문은 다 통과했는데 EV에서 졌다 — 집계에서 유일하게 '판단'인 항목이다.
        // 얼마나 아슬아슬하게 졌는지를 이긴 입찰값 대비 비율로 남긴다.
        const scale = Math.max(1, Math.abs(turn.value));
        call.audit("lost_to_pass", (call.value - turn.value) / scale);
      }
      return turn.option;
    }

    // 아무도 입찰하지 않는 프롬프트(증강이 만든 강제 선택지 등)는 난수로
    const idx = this.rng.int(options.length);
    return options[idx] ?? this.fallbackOption(options);
  }

  /** 이번 결정의 판 읽기 (뷰당 한 번만 계산) */
  private currentRead(): BotRead | null {
    if (this.read !== null) return this.read;
    if (this.lastView === null) return null;
    this.read = buildRead(this.lastView, this.id, {
      mode: this.mode,
      traitsOf: (p) => this.opponents.traitsOf(p),
      // 수비도 성격을 탄다 — 스지를 밀 구실로 쓰는 사람과 현물만 내는 사람이 갈린다
      profile: this.profile,
      flags: this.flags,
      callAudit: this.callAudit,
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

    /**
     * 정책에 넘기는 손 값어치는 **증강 배수를 얹지 않은** 값이다.
     *
     * `botPlan.myHandPoints`가 `ctx.handPoints`에 `augmentValueMultiplier`를 스스로
     * 곱한다(content). 여기서 이미 곱한 값을 넘기면 같은 배수가 두 번 걸린다 —
     * 뚫린 천장 하나로 1.35가 아니라 1.8이 되어 증강 발동 문턱이 통째로 무너진다.
     * 배수는 버림·리치가 보는 `read.valueOf`에서만 걸리고, 정책 쪽 눈금은 종전 그대로다.
     */
    const handPoints = read.valueOf({ plan: this.plan, withoutAugments: true }).points;

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
      // 증강 정책도 순위와 손 값어치를 본다 — 버림·리치가 쓰는 것과 같은 축이다
      placement: {
        rank: read.match.rank,
        allLast: read.match.allLast,
        riskAppetite: read.match.riskAppetite,
      },
      handPoints,
      // 증강 정책의 판단도 스위치 뒤에 두고 2:2로 잴 수 있게 한다 (실대국은 항상 비어 있다)
      flags: this.flags,
    };

    const bids: ActionBid[] = [];
    for (const augId of me.augments) {
      const def = this.catalog.get(augId);
      const policy = def?.bot;
      if (def === undefined || policy === undefined) continue;
      /**
       * **정책 하나의 실패가 판을 죽이지 않는다.** 여기서 도는 것은 content의 코드고,
       * 던지면 방이 삭제된다(파일 위 `logContentFailure` 주석). 실패는 "이 증강은
       * 이번 순에 입찰하지 않는다"까지만 간다 — 나머지 65종과 버림·리치는 그대로 돈다.
       *
       * `choose` 밖의 후처리(`JSON.stringify`)도 같은 try 안에 둔다. 정책이 순환
       * 참조가 든 옵션을 돌려주면 거기서 던지는데, 그것도 정책의 실패이지
       * 봇의 실패가 아니다.
       */
      let bid: ActionBid | null = null;
      try {
        const picked = policy.choose(ctx);
        if (picked === null) continue;
        const weighted =
          "option" in picked
            ? picked
            : { option: picked, weight: defaultBotWeight(augId, def.category) };
        const key = optionKey(weighted.option);
        const match = options.find((o) => optionKey(o) === key);
        if (match === undefined) {
          /**
           * 정책이 **제시되지 않은 옵션**을 돌려줬다. 예전에는 여기서 조용히
           * `continue`했다 — 그래서 옵션을 `ctx.options`에서 고르지 않고 직접
           * **만들어** 돌려주는 정책은 키 순서 하나만 달라도 영영 발동하지 않았고,
           * 경고도 테스트 신호도 없었다(`optionKey` 주석 참고).
           *
           * 제약(샌드박스)이 걸린 자리에서는 정상적으로 걸러진 것일 수 있으므로
           * 그때는 조용히 넘어간다.
           */
          if (this.restrictions === null) {
            console.warn(
              `[BotAgent] 증강 ${augId} 정책이 제시되지 않은 옵션을 돌려줬다 — 이번 순 무시:`,
              key,
            );
          }
          continue;
        }
        bid = {
          option: match,
          // 참을성 있는 봇은 같은 강도라도 "지금 태우는 것"의 값을 낮게 본다 —
          // 아껴 두었다 더 좋은 자리에서 쓰려 한다.
          value: augmentPoints(weighted.weight, handPoints) * (1.15 - this.profile.patience * 0.3),
          reason: `증강 ${augId} (강도 ${weighted.weight})`,
        };
      } catch (err) {
        logContentFailure(`정책 ${augId}`, err);
        continue;
      }
      bids.push(bid);
    }
    // 동점은 먼저 본 쪽(보유 순서)이 이긴다 — bestBid가 순수 부등호라 그렇게 된다
    return bids;
  }

  /**
   * 드래프트 — 무엇을 뽑을 것인가.
   *
   * 예전에는 파워 티어표 하나만 봤다. 그건 "이 증강이 센가"를 말하는 표이고, 그것만
   * 보면 **네 봇이 전부 같은 기준으로 고른다** — 성격이 여섯이어도 덱은 한 종류다.
   * 지금은 파워에 **성격 궁합**과 **이미 모으는 계열과의 시너지**를 곱한다
   * (`bot/draft.ts`). 궁합은 파워를 뒤엎지 않고 비슷한 값 사이에서만 갈린다.
   */
  async decideDraft(_stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    /**
     * **무작위 드래프트** — 티어표를 검증하기 위한 측정 전용 모드(`draftRandom`).
     *
     * 봇이 티어표를 보고 뽑는 한, 낮은 티어 증강은 "다른 둘이 더 나빴을 때"만 손에
     * 들어온다. 그 표본으로 티어표를 검증하면 **표가 만든 표본으로 그 표를 검증하는**
     * 순환이 된다. 무작위로 뽑으면 보유가 실력·판세와 독립이 되어, 보유 판의 평균
     * 순위가 그 증강의 값어치를 편향 없이 잰다.
     *
     * 실대국은 이 스위치가 비어 있어 영향이 없다.
     */
    if (this.flags.has("draftRandom")) {
      const pick = choices[this.botRng.int(choices.length)] ?? choices[0];
      if (pick !== undefined) return pick.id;
    }
    /**
     * 픽 판단도 **content가 준 정의**(`AugmentDef`의 id·category)를 만진다.
     * 발동 경로와 같은 이유로 여기서도 예외를 끊는다 — 드래프트에서 던지면
     * 게임이 시작도 못 하고 방이 사라진다. 못 고르면 첫 후보를 뽑는다:
     * 나쁜 픽은 한 판의 손해지만, 던지는 것은 판 전체의 손해다.
     */
    try {
      const held = this.lastView?.players.find((p) => p.id === this.id)?.augments ?? [];
      const picked = chooseDraft(
        choices,
        {
          profile: this.profile,
          held,
          catalog: this.catalog,
          powerOf,
          unusable: BOT_UNUSABLE_AUGMENTS,
        },
        this.botRng,
      );
      return (picked ?? choices[0])?.id ?? "";
    } catch (err) {
      logContentFailure("draft", err);
      return choices[0]?.id ?? "";
    }
  }
}

/**
 * 옵션 하나의 **비교용 열쇠** — 키 순서에 흔들리지 않는다.
 *
 * 예전에는 `JSON.stringify(option)`을 그대로 비교했다. `JSON.stringify`는 객체의
 * **삽입 순서**를 그대로 찍으므로, 같은 뜻의 옵션이라도 `{type, payload}`와
 * `{payload, type}`은 다른 문자열이 된다. 증강 정책이 `ctx.options`에서 고르는 대신
 * 옵션을 **직접 만들어** 돌려주면(정책 쪽에서는 자연스러운 일이다) 그 정책은
 * 조용히 한 번도 발동하지 않았고, 로그도 테스트 실패도 남지 않았다.
 *
 * 키를 정렬해 찍으면 그 함정이 사라진다. 값의 순서(배열)는 뜻이 있으므로 그대로 둔다.
 */
export function optionKey(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(optionKey).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${optionKey(v)}`).join(",")}}`;
}

/** 증강의 파워 점수 (티어표에 없으면 중간값으로 본다 — 새 증강이 과대·과소평가되지 않게) */
function powerOf(id: string): number {
  const entry = AUGMENT_POWER_TIERS[id];
  return entry === undefined ? 25 : powerScore(entry);
}
