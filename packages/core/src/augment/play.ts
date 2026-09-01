/**
 * play — 증강이 **판의 값어치를 어떻게 바꾸는가**, 표로.
 *
 * ## 무엇이 문제였나
 *
 * 봇은 증강을 "발동할 것"으로만 본다(`botPlan.ts`의 의도). 그런데 증강의 절반 이상은
 * 발동하는 물건이 아니라 **상시 효과**이고, 그것들은 발동이 아니라 **값어치 계산**에
 * 들어가야 한다. 지금은 두 곳이 통째로 비어 있다.
 *
 *   1. **내가 뭘 들었는지 내 손 값어치에 반영이 안 된다.** 뚫린 천장(상한 없음)이나
 *      밀실의 도라(안깡당 +4판)를 들고 있어도 봇은 자기 손을 평범한 손으로 센다.
 *      그러면 밀어야 할 자리에서 접고, 리치를 걸어야 할 자리에서 다마를 친다.
 *   2. **상대가 뭘 들었는지 위험 계산에 반영이 안 된다.** 상대 증강은 `PlayerInfo.augments`로
 *      뷰에 **버젓이 보이는데**, 봇은 무장해제 대상을 고를 때 말고는 한 번도 안 본다.
 *      만년 오야(항상 오야 점수)에게 쏘는 것과 죽기살기에게 쏘는 것을 똑같이 센다.
 *
 * ## 왜 표인가
 *
 * 증강마다 함수를 쓰면 1000종에서 무너진다(차터 §1). 여기 있는 것은 **데이터**이고
 * 엔진(아래 두 함수)은 표만 읽는다. 새 증강이 들어오면 행 하나를 적으면 되고,
 * 적지 않으면 **중립(1.0)** 이 된다 — 빠뜨려도 봇이 이상해지지 않는다.
 *
 * ## ⚠ 뱅크가 내는 점수와 지불자가 내는 점수는 다르다
 *
 * 처음 표를 채울 때 "타점이 커지면 쏘는 쪽도 더 낸다"고 뭉뚱그렸는데, **틀렸다.**
 * 이 게임의 큰 점수 증강 중 상당수는 늘어난 몫을 **뱅크가 발행**한다 — 큰손(차액을
 * 뱅크가 채움) · 일확천금 · 판돈 굴리기 · 핏빛 계약 · 카운터 · 모 아니면 도.
 * 그런 증강을 든 상대에게 쏴도 **내 지갑에서 나가는 돈은 한 푼도 안 늘어난다.**
 *
 * 반대로 뚫린 천장은 초과분을 **지불자에게서 가져오고**(무페널티 원칙의 명시적 예외),
 * 가불 인생은 상대 셋에게서 직접 뜯는다. 판수를 올리는 것들(도라·리치 타점·오야 점수·
 * 본장)도 전부 지불자 부담이다.
 *
 * 그래서 `value`는 커도 `threat`은 1.0인 항목이 있다. 이건 표의 오류가 아니라
 * **이 게임의 정산 구조**다.
 *
 * ## 표에 넣지 않는 것
 *
 * - **그 국에만 사는 효과.** 눈먼 총알·초읽기는 "뽑는 순간 자동 발동, 이번 국"이고,
 *   반전은 "자기 첫 순에 켜면 그 국만"(3국에 1회, 2026-09-01)이다.
 *   보유 목록에는 게임 내내 남으므로, 보유를 근거로 배수를 걸면 **끝난 효과를 계속
 *   무서워한다.**
 * - **내 실점 비용을 바꾸지 않는 것.** 반전(sign_flip)은 보유자의 점수만 뒤집고
 *   **남의 지불은 정상**이다 — 쏘는 쪽 비용은 그대로라 위협 배수가 1.0이다.
 *   (보유자가 쏘이고 싶어 한다는 건 다른 문제이고, 그건 위험 계산이 아니라 읽기다.)
 * - **발동으로 값이 나는 것.** 그건 `botPlan.ts`의 의도가 이미 다룬다.
 *
 * ## 왜 코어에 있나
 *
 * 처음에는 서버 봇 쪽(`server/bot/augmentPlaybook.ts`)에 뒀는데, **증강 정책도 이 표를
 * 읽어야 한다는 것**이 곧 드러났다 — 무장해제가 "누구의 무엇을 잠글까"를 고르려면
 * "무엇이 무서운가"를 알아야 하고, 그 정책은 content에 있어 server를 import할 수 없다.
 * 증강 메타데이터 표(파워 티어·시너지)가 이미 전부 코어에 있으므로 여기로 옮겼다.
 *
 * ## 아직 값어치·위험 계산에는 안 꽂혀 있다
 *
 * `bot/value.ts`·`bot/danger.ts` 연결은 별도 PR이다. 지금 읽는 곳은 증강 정책의
 * **표적 선택**이다.
 */

/** 한 증강이 값어치·위험에 거는 배수 (없는 항목은 1.0) */
export interface AugmentPlay {
  /**
   * 이 증강을 **든 상대에게 실점하는** 비용 배수.
   * 1보다 크면 그 사람에게 쏘는 것이 더 비싸고, 작으면 덜 비싸다.
   */
  threat?: number;
  /**
   * 이 증강을 **내가 들고 있을 때** 내 화료 값어치에 곱하는 배수.
   * 상시 효과만 센다 — 조건부는 그 조건이 붙을 확률만큼 깎아서 적는다.
   */
  value?: number;
  /**
   * 이 증강을 든 사람이 **어떤 패를 모으는가**.
   *
   * `threat`·`value`는 점수 축의 스칼라라 "얼마나 비싼가"만 말한다. 그런데 수비에서
   * 정작 필요한 것은 **어느 패가 비싼가**다 — 자패를 그러모으는 상대에게 자패를
   * 흘리는 것과 5통을 흘리는 것은 전혀 다른 일인데, 배수 하나로는 둘을 구별할 수
   * 없다(2026-08-18 사용자 보고: 개벽 쓴 상대에게 봇 셋이 자패를 다 내주고 더블
   * 역만을 헌납했다).
   *
   * 적지 않으면 중립이다 — 빠뜨려도 봇이 이상해지지 않는다.
   */
  collect?: CollectHint;
  /**
   * **발동이 전원에게 공개되는** 증강의 읽기 — 그 사건을 본 뒤에만 걸린다.
   *
   * `collect`(보유 기반)와 방향이 다르다. 보유는 "그럴지도 모른다"이고 발동은
   * "그렇게 됐다"이므로 훨씬 세게 잡을 수 있다 — 개벽을 **들고만 있는** 사람은
   * 평범한 손이지만, **쓴** 사람의 손은 통째로 자패다.
   *
   * 여기 적으면 `bot/collect.ts`가 알아서 읽는다. 예전에는 증강마다 if 블록을
   * 손으로 늘렸는데, 그 방식은 100종을 넘길 수 없다(차터 §1) — 새 증강은 행 하나다.
   */
  fired?: AugmentFired;
  /**
   * 이 증강이 그 사람을 **론당하지 않게** 만드는 구간이 있는가.
   *
   * 방어 증강 중에는 "값이 커지는" 것이 아니라 **쏘일 일 자체가 없어지는** 것이 있다
   * (천하무적·불가침 조약). 그런 상대에게 안전패를 고르는 것은 순수한 낭비다 — 무엇을
   * 버려도 그 사람에게는 방총이 성립하지 않으므로, 봇은 그 국에 자기 손을 밀어야 한다.
   *
   * 배수(`threat`)로는 못 담는다. 배수는 국 내내 고정이고 이건 **켜졌다 꺼지는** 것이다.
   * 그래서 공개 채널을 읽어 그 순간에만 건다 — 조약이 파기되면 즉시 평범한 상대가 된다.
   */
  ronImmune?: AugmentRonImmune;
  /**
   * 이 증강이 그 사람의 **후리텐을 무력화**하는가 — 그렇다면 현물이 안전패가 아니다.
   *
   * 봇 수비의 첫 번째 기둥은 "그 사람이 이미 버린 패로는 론이 안 된다"(현물 = 위험 0)다.
   * 규칙이 아니라 **가정**이고, 이 게임에는 그 가정을 부수는 증강이 있다 —
   * 대기만성의 만개(후리텐 무시), 조커(백이 넓힌 대기는 후리텐이 안 걸린다),
   * 손바닥 뒤집기(리치 중에 대기를 갈아탄다: 지금까지의 버림으로 계산한 후리텐이 무효).
   *
   * 이 가정이 틀리면 봇은 **위험도 0으로 확신한 패**를 흘린다. 개벽 사고(2026-08-18)와
   * 같은 종류의, 가장 조용하고 가장 비싼 오판이다.
   */
  furitenBroken?: AugmentRonImmune;
  /**
   * 이 사람의 **대기가 표준 모형보다 넓은가** — 무스지·스지 판정이 덜 미더워진다.
   *
   * 봇의 안전패 계산(`bot/suji.ts`)은 "슌쯔는 같은 무늬 연속, 커쯔는 같은 패, 치또이
   * 쌍은 같은 패"라는 **모양의 전제** 위에 서 있다. 그 전제를 넓히는 증강이 있다 —
   * 동수의 결속(무늬 무관 커쯔)·비대칭 치또이(랭크 쌍)·무너진 국경(혼색 슌쯔)·
   * 부숴진 벽(순환 슌쯔). 그런 상대에게는 같은 "스지"라도 지워지는 대기가 더 적다.
   *
   * 값은 수패 위험에 곱한다. **현물은 건드리지 않는다** — 후리텐은 그대로라 여전히 0이다.
   */
  wideWaits?: number;
  /**
   * 이 사람의 **리치가 텐파이라는 보장이 있는가** (1 = 표준, 그대로 믿는다).
   *
   * 공성계는 노텐 리치를 허용한다 — "리치 배너 = 텐파이"라는 대전제가 이 사람에게만
   * 깨진다. 위협도(`level`)에 곱해 그만큼 덜 믿는다.
   *
   * ⚠ 과하게 낮추지 않는다. 덜 무서워하는 방향의 오차는 **방총으로 갚는다** —
   * 블러프를 못 알아채는 손해보다 진짜 리치에 미는 손해가 훨씬 크다.
   */
  riichiTrust?: number;
  /**
   * **상대를 지목하는** 증강의 공개 지목 채널 — 지목 관계가 전원에게 보인다.
   *
   * 지목형은 보유자가 아니라 **지목당한 사람**에게 효과가 붙으므로, 다른 축과 달리
   * "이 증강을 든 사람"을 보는 것으로는 아무것도 알 수 없다.
   */
  targeting?: AugmentTargeting;
  /** 그 국의 **지불 구조 자체**를 바꾼다 (눈먼 총알) */
  tableRule?: AugmentTableRule;
}

/** 지목형 증강의 공개 채널 규약 */
export interface AugmentTargeting {
  /** 지목 채널 이름. `{p}`는 **시전자** 자리다 (기본 `{증강id}:{p}`) */
  channel?: string;
  /** 채널 값에서 대상 id를 꺼낼 필드. 없으면 값 자체가 대상 id다 */
  targetField?: string;
  /**
   * 대상이 **나**일 때 내 위험 선호(`riskAppetite`)를 이만큼 민다.
   * 덤터기는 지목당한 사람이 홀더의 쯔모를 혼자 전액 문다 — 버림으로는 막을 수
   * 없는 실점이라, 할 수 있는 것은 **그 국을 내 손으로 먼저 끝내는 것**뿐이다.
   */
  selfAppetite?: number;
  /**
   * 대상이 **상대**일 때 그 사람 실점 추정에 얹을 판수.
   * 격(rank_gate)에 지목당한 사람은 4판 이하로 화료할 수 없다 — 그 사람이 이기면
   * 그것은 반드시 만관 이상이다.
   */
  oppHanBonus?: number;
}

/**
 * **판 전체의 지불 구조**를 바꾸는 증강 — 그 국에는 방총의 값 자체가 달라진다.
 *
 * 눈먼 총알이 유일한 사례다. 론의 지불자가 실제로 쏜 사람이 아니라 넷 중 무작위
 * 한 명으로 다시 정해지므로, **내가 쏴도 내 지갑이 열릴 확률은 1/4뿐이다.**
 * 나머지 3/4은 내가 무엇을 버리든 똑같이 걸리는 몫이라 버림 선택과 무관하다 —
 * 즉 그 국에는 "위험패를 피한다"는 행위의 값이 통째로 4분의 1이 된다.
 *
 * 보유자 한 명의 채널이지만 효과는 **테이블 전원**에게 걸린다는 점이 다른 축과 다르다.
 */
export interface AugmentTableRule {
  /** 이 채널이 켜진 국에 적용 (기본 `{증강id}:{p}`) */
  channel?: string;
  when: "present" | "true";
  /** 내가 방총했을 때 **실제로 내가 무는** 몫 (1 = 표준) */
  dealInShare: number;
}

/** "지금 이 구간에 켜져 있다"를 알리는 공개 채널의 규약 (`ronImmune`·`furitenBroken` 공용) */
export interface AugmentRonImmune {
  /** 공개 채널 이름. `{p}`가 보유자 자리다. 기본 `{증강id}:{p}` */
  channel?: string;
  /**
   * - `present` — 채널에 값이 실려 있기만 하면 켜진 것(국 스코프 채널이라 국이 끝나면 사라진다)
   * - `true` — 값이 정확히 `true`일 때만
   *
   * ⚠ 사람이 읽는 문구를 조건으로 삼지 않는다 — 문구는 언제든 다듬어지고, 그때
   * 봇은 **조용히** 틀린다(면역이 아닌데 밀거나, 면역인데 접는다).
   */
  when: "present" | "true";
}

/**
 * 발동 공개 채널 하나를 읽는 규약.
 *
 * ⚠ **전원 공개 채널만** 적을 수 있다(`roundViewKey("*", …)`). 보유자 전용 채널은
 * 애초에 뷰에 실리지 않으므로 적어도 아무 일도 일어나지 않는다 — 그 침묵이 곧
 * "봇이 반영하고 있다"는 착각이 되므로, 테스트가 실제 채널 이름과 대조한다.
 */
export interface AugmentFired {
  /**
   * 공개 채널 이름. `{p}` 자리에 보유자 id가 들어간다.
   * 생략하면 이 게임의 관례인 `{증강id}:{p}`다.
   */
  channel?: string;
  /**
   * 채널에 실리는 값의 모양.
   * - `flag`  — `true`면 켜진 것 (개벽·거신병 …)
   * - `suit`  — 수패 무늬 문자열이 실린다 (단색 세계·편식 …)
   * - `kinds` — `kindKey` 문자열 배열이 실린다 (오픈 리치의 공개된 오름패 …)
   */
  kind: "flag" | "suit" | "kinds";
  /**
   * 무엇이 위험해지는가.
   * - `channelSuit` — 채널에 실린 그 무늬
   * - `channelKinds` — 채널에 실린 **바로 그 패들**. 추정이 아니라 확정이라 가장 세다.
   */
  danger?: "honor" | "terminal" | "even" | "channelSuit" | "channelKinds";
  /** `danger`에 해당하는 패의 위험 배수 (기본 없음 = 패를 짚지 않는다) */
  riskMul?: number;
  /** 실점 추정에 얹을 판수 */
  hanBonus?: number;
  /**
   * 텐파이 확률의 **하한**.
   *
   * 배수만으로는 부족한 자리가 있다 — 손을 통째로 갈아엎은 사람은 리치도 후로도
   * 없어 위협도가 다마텐 어림값(0.1 남짓)에 머물고, 거기에 무엇을 곱해도 기대
   * 실점이 작아 봇은 그냥 민다. **그 일이 일어난 것을 봤다**는 것 자체가 정보다.
   */
  minLevel?: number;
}

/**
 * 그 증강이 노리는 패의 분류.
 *
 * - `honor` — 자패(풍패·삼원패)를 모은다. 자일색·대삼원·대사희 계열.
 * - `terminal` — 요구패(1·9·자패)를 모은다. 국사무쌍 계열.
 *
 * 색 계열(혼일색·청일색·구련)은 **어느 색인지가 국마다 다르므로** 여기 적지 않는다.
 * 그건 표가 아니라 그 국의 버림패를 읽어야 아는 것이다(`bot/collect.ts`).
 */
export type CollectHint = "honor" | "terminal";

/**
 * 증강 id → 배수. **값이 붙는 것만** 적는다(나머지는 중립).
 *
 * 배수를 매긴 기준은 하나다 — **평범한 손 대비 기대 타점이 몇 배가 되는가.**
 * 조건이 붙는 것은 그 조건이 실제로 붙을 확률만큼 깎았다. 예를 들어 밀실의 도라는
 * 안깡 한 번에 +4판(≈4배)이지만 안깡이 나는 국이 흔치 않아 1.3으로 잡았다.
 */
export const AUGMENT_PLAY: Readonly<Record<string, AugmentPlay>> = {
  // ───────────────────────── 타점 상한·배수 ─────────────────────────
  /** 뚫린 천장 — 상한이 없다. 판이 오르는 만큼 계속 커진다 */
  /**
   * 뚫린 천장 — 상한이 없다. 초과분을 **지불자에게서 가져오므로** 쏘는 쪽도 아프다.
   * 실효 배율은 6판 1.0 · 8판 1.25 · 10판 1.75라(그 파일 주석) 평균으로 1.3을 잡았다.
   */
  aotenjou_ceiling: { threat: 1.3, value: 1.35 },
  /** 큰손 — 최소 만관. **차액은 뱅크가 채운다** → 쏘는 쪽 비용은 그대로다 */
  big_hand: { value: 1.4 },
  /** 판돈 굴리기 — 연속 화료로 최대 4배. **뱅크 지급**이라 위협은 없다 */
  let_it_ride: { value: 1.25 },
  /** 일확천금 — 0.5·1·2·3배 룰렛. **늘어난 몫은 뱅크 지급**이라 위협은 없다 */
  jackpot: { value: 1.2 },
  /** 핏빛 계약 — 계약한 역을 맞추면 1.5배. **뱅크 발행**이라 위협은 없다 */
  blood_contract: { value: 1.12 },
  /** 가불 인생 — 만관 이상으로 오르면 **상대 셋에게서 각 3000점**을 뜯는다(제로섬) */
  devils_advance: { threat: 1.2, value: 1.12 },
  /** 모 아니면 도 — 리치 화료에 판돈이 붙는다. **뱅크 발행**이라 위협은 없다 */
  all_or_nothing: { value: 1.15 },
  /** 카운터 — 추격 리치 반격. 가산은 **뱅크 발행**이라 위협은 없다 */
  counter: { value: 1.12 },
  /** 만년 오야 — 언제나 오야 점수(≈1.5배) + 역패 동이 항상 붙는다 */
  eternal_dealer: { threat: 1.4, value: 1.35 },
  /** 본장 사냥꾼 — 본장 1개당 300점이 1500점. 본장이 쌓여야 값이 난다 */
  honba_hunter: { threat: 1.1, value: 1.08 },

  // ───────────────────────── 리치 타점 ─────────────────────────
  /** 물러설 수 없는 선언 — 리치·일발·뒷도라가 각각 2판(그 국 한정) */
  no_retreat: { threat: 1.22, value: 1.2 },
  /** 이중 선언 — 리치가 언제나 더블리치 */
  riichi_upgrade: { threat: 1.18, value: 1.15 },
  /** 뒤늦은 출진 — 7순까지의 리치가 더블리치 + 1판 */
  late_double: { threat: 1.16, value: 1.14 },
  /** 영혼의 일격 — 리치 2판 + 연속 6쯔모의 일발 */
  soul_strike: { threat: 1.18, value: 1.16 },
  /**
   * 스텔스 리치 — 타점보다 **읽히지 않는 것**이 본질이다. 리치 배너가 없으니
   * 봇의 위협 추정이 통째로 눈을 감는다. 배수로 그 눈먼 부분을 메운다.
   */
  stealth_riichi: { threat: 1.3, value: 1.15 },
  /** 이면투시 — 뒷도라를 보고 바꿔치기까지 한다 */
  ura_peek: { threat: 1.15, value: 1.12 },
  /** 혼 사냥 — 리치 중인 상대를 론하면 그 리치를 통째로 강탈 */
  soul_hunt: { threat: 1.18, value: 1.15 },
  /** 숨은 칼날 — **리치를 안 걸고도** 멘젠 론에 +2판·뒷도라. 배너가 없어 더 무섭다 */
  hidden_blade: { threat: 1.3, value: 1.25 },
  /** 자유 선언 — 리치 후 아무 패나 버린다. 타점보다 **읽기가 안 된다**는 것이 위협이다 */
  free_riichi_discard: { threat: 1.2, value: 1.1 },
  /** 한 끗 차이 — 대기가 ±1로 넓어진다. 안전패 판단이 흔들린다 */
  off_by_one: { threat: 1.25, value: 1.15 },

  // ───────────────────────── 도라 ─────────────────────────
  /** 밀실의 도라 — 안깡 1묶음당 +4판. 안깡이 나는 국이 흔치 않아 깎았다 */
  ankan_dora: { threat: 1.3, value: 1.28 },
  /** 거울 — 도라 표시패의 앞 패도 내 도라. 상시로 도라가 배로 는다 */
  mirror_dora: { threat: 1.18, value: 1.16 },
  /** 장사진 — 연속 4장 깡으로 새 도라가 열린다 */
  snake_kan: { threat: 1.08, value: 1.08 },
  /** 잔상 — 직전 국 도라를 겹친다(2국에 1회) */
  dora_afterimage: { threat: 1.08, value: 1.08 },
  /** 붉은 손길 — 지정한 숫자가 내 적도라가 된다 */
  red_five_touch: { threat: 1.08, value: 1.08 },
  /** 북풍 상인 — 北 한 장당 도라 1판 */
  north_trader: { threat: 1.08, value: 1.08 },
  /** 가려진 도라 — 도라가 상대에게 안 보인다. 상대 손의 크기를 못 읽는다 */
  dora_conceal: { threat: 1.12 },

  // ───────────────────────── 화료형·판수 ─────────────────────────
  /** 진짜 용 — 17장 화료에 +3판 */
  true_dragon: { threat: 1.25, value: 1.22 },
  /** 절벽 위에 피어난 꽃 — 깡 두 번이면 즉시 영상개화(4판) */
  cliff_bloom: { threat: 1.2, value: 1.18 },
  /** 탕야오 해방 — 탕야오가 2판이 되고 1·9가 섞여도 붙는다 */
  tanyao_break: { threat: 1.1, value: 1.1 },
  /** 해저의 지배자 — 해저 쯔모가 무조건 화료 +3판. 해저는 국에 한 번뿐 */
  haitei_lord: { threat: 1.05, value: 1.05 },
  /** 바닥의 족보 — 버림패가 최대 3판을 얹는다 */
  bottom_yaku: { threat: 1.1, value: 1.1 },
  /**
   * 정적의 손 — 발동한 국의 화료에 +2판.
   *
   * ⚠ threat이 없다(2026-08-19 정정). 이 +2판은 `addWinHanBonus` → **BankTopUp**이라
   * 보유자 delta에만 얹히고 **지불자 delta는 그대로**다 — 이 파일이 맨 위에서 못박은
   * 뱅크/지불자 구분에 따르면 쏘는 쪽 비용은 한 푼도 안 는다. 예전에 1.06이 붙어 있던
   * 것은 "타점이 커지면 쏘는 쪽도 더 낸다"는 그 오해가 한 줄 남아 있던 자리다.
   */
  silent_swap: { value: 1.08 },
  /** 예지 — 발동한 국의 화료에 +2판(정적의 손과 같은 뱅크 발행) + 패산 열람·재배열 */
  foresight: { value: 1.08 },
  /** 미래를 보는 자 — 스택당 +1판. 뱅크 발행이라 쏘는 쪽 비용은 그대로다 */
  future_sight: { value: 1.12 },
  /**
   * 대기만성(반장) — 남4국부터 만개: **후리텐 무시**·무형화료 + 3판(뱅크 발행).
   * 만개하면 현물이 안전패가 아니다 — 그게 이 증강의 가장 무서운 부분이고,
   * 봇은 여태 그 국에도 태연히 현물을 흘리고 있었다.
   */
  late_bloomer: { value: 1.15, furitenBroken: { when: "present" } },
  /** 대기만성(동풍) — 동4국부터 만개 + 2판. 짧은 판이라 만개 구간이 짧다 */
  late_bloomer_east: { value: 1.13, furitenBroken: { when: "present" } },
  /**
   * 조커 — 그 국 동안 백(白)이 만능패가 된다. **조커가 넓힌 대기는 후리텐이 안 걸리므로**
   * 현물 안전이 무너지고, 백 자체도 머리·몸통 아무 데나 들어가는 만능 재료가 된다.
   */
  joker: {
    furitenBroken: { when: "true" },
    fired: { kind: "flag", hanBonus: 3, minLevel: 0.25 },
  },
  /**
   * 손바닥 뒤집기 — 리치 중에 대기를 한 번 갈아탄다. 그 순간 이전까지의 버림으로
   * 계산한 후리텐·현물이 통째로 무의미해진다 — **막 새로 리치를 건 사람**으로 봐야 한다.
   */
  palm_flip: { furitenBroken: { when: "present" } },
  /**
   * 오픈 리치 — 오름패가 **전원에게 그대로 공개**된다(비리치 상대가 그 패로 쏘면 역만).
   * 추정이 아니라 확정이라 이 게임에서 가장 진한 수비 신호다.
   */
  open_riichi_reveal: {
    threat: 1.2,
    value: 1.2,
    fired: { kind: "kinds", danger: "channelKinds", riskMul: 2.8, hanBonus: 10 },
  },
  /**
   * 자패의 귀환 — 이번 국에 버린 자패 최대 4장이 **다음 국 배패로 되돌아온다**.
   * 어느 자패인지가 공개되므로, 다음 국에 그 자패를 또 흘리면 역패·자일색을 그대로 밀어준다.
   */
  honor_return: {
    fired: { kind: "kinds", danger: "channelKinds", riskMul: 1.8, hanBonus: 2 },
  },
  /**
   * 미련 — 유국 때 멘젠 텐파이였던 손패 13장이 **그대로 다음 국 배패**가 되고,
   * 그 13장이 채널로 공개된다. 다음 국 초반에는 그 손이 그대로 서 있다고 봐야 한다.
   */
  regret: {
    fired: { kind: "kinds", danger: "channelKinds", riskMul: 1.6, hanBonus: 2, minLevel: 0.3 },
  },
  /** 왕패의 주인 — 왕패 열람 + 국 첫 순 왕패↔손패 2장 교환(도라 표시패까지 갈 수 있다) */
  dead_wall_master: { threat: 1.08, value: 1.12 },

  // ───────────────── 모양의 전제를 넓히는 것 (스지·무스지가 덜 미덥다) ─────────────────
  /**
   * 동수의 결속 — 커쯔가 무늬를 안 가린다(5만5통5삭도 커쯔). 샤보 대기가 무늬를 넘어
   * 서므로 "이 무늬는 정리됐다"는 읽기가 그 랭크에는 통하지 않는다.
   */
  mixed_triplet: { wideWaits: 1.25 },
  /**
   * 비대칭 치또이 — 치또이 쌍이 랭크만 맞으면 된다(1만+1통도 한 쌍). 단기 대기가
   * 한 종이 아니라 **같은 랭크 세 종**으로 벌어진다.
   */
  async_chiitoi: { wideWaits: 1.25 },
  /**
   * 무너진 국경 — 슌쯔가 무늬를 안 가린다(2만·3통·4삭). 무늬 안에서만 세던 량면·간짱
   * 자리가 무늬를 넘어 서므로 스지가 지우는 몫이 줄어든다.
   */
  broken_border: { wideWaits: 1.3 },
  /**
   * 부숴진 벽 — 8-9-1·9-1-2가 슌쯔가 된다. 9와 1 사이의 벽이 없어져 노두패 근처의
   * "여기서 끊긴다"는 계산이 어긋난다.
   */
  broken_wall: { wideWaits: 1.2 },

  // ───────────────────────── 리치가 텐파이가 아닐 수 있다 ─────────────────────────
  /**
   * 공성계 — 텐파이가 아니어도 리치를 걸 수 있다. "리치 = 텐파이"라는 대전제가
   * 이 사람에게만 깨진다.
   *
   * 0.9로 **얕게** 잡는다. 덜 무서워하는 방향의 오차는 방총으로 갚기 때문이다 —
   * 블러프에 한 번 접는 손해보다 진짜 리치에 미는 손해가 훨씬 크다.
   * (봇은 노텐 리치를 걸지 않으므로 실질 대상은 사람 상대다.)
   */
  siege_riichi: { riichiTrust: 0.9 },

  // ───────────────────────── 지목형 — 효과는 지목당한 쪽에 붙는다 ─────────────────────────
  /**
   * 격 — 지목당한 사람은 그 국에 4판 이하로 화료할 수 없다. 그 사람이 이긴다면
   * 그것은 **반드시 만관 이상**이라는 뜻이다(역만은 코어가 면제).
   */
  rank_gate: { targeting: { targetField: "target", oppHanBonus: 3 } },
  /**
   * 덤터기 — 홀더가 쯔모하면 원래 셋이 나눠 낼 것을 **지목당한 한 명이 전액** 문다.
   *
   * 버림으로는 막을 수 없는 실점이다(쯔모다). 지목당한 쪽이 할 수 있는 것은 그 국을
   * **내 손으로 먼저 끝내는 것**뿐이라, 위험 선호를 미는 쪽으로 건다.
   */
  scapegoat: { targeting: { selfAppetite: 0.25 } },

  // ───────────────────────── 그 국의 지불 구조 자체가 바뀐다 ─────────────────────────
  /**
   * 눈먼 총알 — 그 국의 모든 론이 넷 중 무작위 한 명에게 청구된다.
   * 내가 쏴도 **내가 물 확률은 1/4**이고, 나머지 몫은 무엇을 버리든 똑같이 걸리므로
   * 버림 선택과 무관하다. 즉 그 국에는 "위험패를 피한다"의 값이 4분의 1이 된다.
   */
  blind_ron: { tableRule: { when: "true", dealInShare: 0.25 } },
  /**
   * 소환 — 다음 쯔모를 지목한 종류로 확정한다. 채널에 그 종류가 실린다.
   * 그 패로 쏘일 위험보다는 "이 사람 손이 그 종류를 중심으로 짜인다"는 읽기다
   * (본인이 뽑아 가므로 내가 안 흘려도 들어온다) — 그래서 배수가 얌전하다.
   */
  conjure_draw: { fired: { kind: "kinds", danger: "channelKinds", riskMul: 1.4 } },
  /**
   * 묵계 — 멘젠을 유지한 채 역패를 퐁한다. 봇은 "울었으니 멘젠 역은 없다"고 깎는데
   * 이 사람은 리치·멘젠쯔모·10부가 그대로 살아 있다. 그 국 한정으로 손을 더 비싸게 본다.
   */
  silent_pact: { fired: { kind: "flag", hanBonus: 2 } },
  /** 복수자 — 원수를 론하면 +2판. 내가 그를 쏜 적이 있어야 산다 */
  avenger: { threat: 1.12, value: 1.08 },
  /** 유국역만 — 유국만관이 역만이 된다 */
  // (`collect`를 안 적는다 — 유국역만은 **버림패**로 나는 역이라, 요구패를 쥐여 준다고
  //  위험해지지 않는다. `collect`는 "이 사람에게 이 패를 주면 아프다"만 뜻한다.)
  nagashi_yakuman: { threat: 1.15 },

  // ───────────────────────── 역만 ─────────────────────────
  // 역만은 드물지만 한 방이 국이 아니라 게임을 끝낸다. 확률로 깎되 0으로 두지 않는다.
  /** 우는 국사무쌍 — 퐁으로 국사를 완성한다 */
  open_kokushi: { threat: 1.25, value: 1.2, collect: "terminal" },
  /** 왕의 징표 — 국사가 13종을 다 안 갖춰도 성립 */
  royal_kokushi: { threat: 1.25, value: 1.2, collect: "terminal" },
  /**
   * 마작의 거신병 — 조건이 맞으면 국사가 손에 들어온다.
   * 실제로 들어온 순간(`giant_god:{p}` = true)은 요구패 한 장이 곧 역만이다.
   */
  giant_god: {
    threat: 1.2,
    value: 1.15,
    collect: "terminal",
    fired: { kind: "flag", danger: "terminal", riskMul: 2.4, hanBonus: 8, minLevel: 0.4 },
  },
  /** 삼원의 의지 — 대삼원이 9장이 아니라 7장으로 선다 */
  three_dragons_will: { threat: 1.2, value: 1.15, collect: "honor" },
  /** 뒤섞인 아홉 개의 연꽃 — 구련이 무늬를 안 가린다 */
  mixed_nine_gates: { threat: 1.12, value: 1.1 },
  /**
   * 양극 — 같은 무늬의 1과 9가 한 패로 통해 199·911도 커쯔다. 청노두·스안커가
   * 상시 사정권에 들어오고(설계 주석: "정통 청노두보다 도달률이 높다"),
   * 그 손을 완성시키는 것은 **내가 흘리는 노두패**다.
   */
  polar_ends: { threat: 1.3, value: 1.3, collect: "terminal" },
  /**
   * 바람의 계보 — 자패에 순서가 생겨 슌쯔가 된다(치까지). 낀 자풍·장풍·삼원에 1판씩.
   * 자패를 **이어서** 모으므로 자패를 흘리는 것이 그만큼 위험하다.
   */
  wind_lineage: { threat: 1.1, value: 1.1, collect: "honor" },

  // ───────────────────────── 지불 구조 (쏘는 쪽의 비용이 바뀐다) ─────────────────────────
  /**
   * 책임전가 — 이 사람에게 쏴도 **나 혼자 물지 않는다.** 지불이 셋에게 흩어지므로
   * 내 비용은 절반 아래다. 봇이 이걸 모르면 필요 없이 접는다.
   */
  blame_shift: { threat: 0.5 },
  /**
   * 천하무적 — 발동한 국 동안 **론당하지 않는다**(쯔모·유국은 그대로).
   *
   * 배수가 아니라 `ronImmune`인 것이 요점이다. 배수는 국 내내 고정인데 이건 발동한
   * 국에만 켜진다 — 안 쓴 국까지 "쏴도 안 맞는 사람"으로 보면 봇이 그 사람 앞에서
   * 영영 위험패를 흘린다. 채널은 국 스코프라 국이 끝나면 저절로 꺼진다.
   */
  invincible: { ronImmune: { when: "present" } },
  /**
   * 불가침 조약 — 매 국 첫 6순은 론당하지 않는다. 리치·후로(안깡 포함)로 즉시 파기.
   *
   * 켜졌다 꺼지는 것이라 `ronImmune`으로 읽는다. 그 위에 얇은 할인(0.9)을 둔 이유는,
   * 조약이 살아 있는 구간이 **국의 앞부분 전체**라 이 사람을 상대로 한 기대 실점이
   * 평균적으로도 낮기 때문이다 — 파기된 뒤에는 채널이 꺼져 면역만 사라진다.
   */
  no_ron_pact: { threat: 0.9, ronImmune: { channel: "no_ron_pact:active:{p}", when: "true" } },

  // ───────────────────────── 손을 통째로 갈아엎는 것 (발동이 공개된다) ─────────────────────────
  /**
   * 개벽 — 손패의 수패가 통째로 자패가 된다. 평범한 손패는 대부분 수패이므로 뒤집힌
   * 손은 거의 전부 자패다. 자일색·대사희·소사희·대삼원이 한꺼번에 사정권에 들어오고,
   * 그 손을 완성시켜 주는 것은 **내가 흘리는 자패**다.
   * (2026-08-18 사용자 보고: 봇 셋이 자패를 다 내주고 더블 역만을 헌납했다.)
   */
  genesis: {
    // 보유 배수는 **약하게** — 진짜 위험은 터진 순간이고 그건 아래 `fired`가 정확히
    // 잡는다. 다만 0은 아니다: 이 사람은 언제든 손을 자패 덩어리로 바꿀 수 있다.
    threat: 1.1,
    value: 1.1,
    fired: { kind: "flag", danger: "honor", riskMul: 2.6, hanBonus: 8, minLevel: 0.35 },
  },
  /**
   * 단색 세계 — 손패의 수패가 고른 한 색으로 물든다. 그 색은 청일색이 확정된 것이나
   * 마찬가지다. 다른 두 색은 **건드리지 않는다** — 남는 위험을 지우는 것은 늘 더 위험하다.
   */
  suit_unify: {
    fired: { kind: "suit", danger: "channelSuit", riskMul: 2.2, hanBonus: 5, minLevel: 0.3 },
  },
  /**
   * 편식 — 단색 세계의 퀘스트판. 발동 결과는 완전히 같으므로 같은 값을 쓴다.
   * 발동 **전**의 퀘스트 진행도(12장 중 몇 장)는 표로 표현되지 않는 모양이라
   * `bot/collect.ts`가 따로 읽는다.
   */
  picky_eater: {
    fired: { kind: "suit", danger: "channelSuit", riskMul: 2.2, hanBonus: 5, minLevel: 0.3 },
  },
  /**
   * 짝수의 세계 — 손패의 홀수 수패가 전부 짝수로 다시 태어난다. 그 손을 완성시키는
   * 것은 짝수 수패뿐이고 홀수는 오히려 안전해진다. 탕야오·또이또이가 단숨에 사정권이다.
   */
  even_world: { fired: { kind: "flag", danger: "even", riskMul: 2.0, hanBonus: 3, minLevel: 0.25 } },

  // 역만 방어술·죽기살기처럼 **내 실점**을 줄이는 것들은 여기 없다 — 그건 손 값어치도
  // 상대 위협도 아니라 내 손실 계산(`expectedLossOf`)에 걸리는 축이다. 읽는 곳이
  // 생길 때 그 축을 따로 만든다. 읽는 사람 없는 데이터는 유지비만 든다.
};

/** 배수의 상한 — 셋을 겹쳐 들면 곱이 폭주한다. 판단이 뒤집힐 만큼은 벌리되 거기까지다 */
const MULTIPLIER_CAP = 2.2;
/** 하한 — 아무리 지불이 흩어져도 실점이 0이 되지는 않는다 */
const MULTIPLIER_FLOOR = 0.4;

function combine(
  augments: readonly string[],
  pick: (play: AugmentPlay) => number | undefined,
): number {
  let m = 1;
  for (const id of augments) {
    const v = pick(AUGMENT_PLAY[id] ?? {});
    if (v !== undefined) m *= v;
  }
  return Math.max(MULTIPLIER_FLOOR, Math.min(MULTIPLIER_CAP, m));
}

/**
 * 이 사람에게 **실점하는 비용**의 배수 (1 = 평범한 상대).
 *
 * 인자는 `PlayerInfo.augments` 그대로다 — 뷰에 이미 공개돼 있는 정보다.
 * 표에 없는 증강은 중립이라 **모르는 증강이 섞여도 안전하다.**
 */
export function augmentThreatMultiplier(augments: readonly string[]): number {
  return combine(augments, (p) => p.threat);
}

/**
 * 내가 든 증강이 **내 손 값어치**에 거는 배수 (1 = 증강 없는 손).
 *
 * 상시 효과만 센다. "지금 발동할까"는 여기가 아니라 `botPlan.ts`의 의도가 답한다.
 */
export function augmentValueMultiplier(augments: readonly string[]): number {
  return combine(augments, (p) => p.value);
}

/**
 * 이 사람이 **모으고 있을 만한 패의 분류**들 (표에 적힌 것만).
 *
 * 인자는 `PlayerInfo.augments` 그대로 — 뷰에 공개된 정보다. 표에 없는 증강은 아무것도
 * 내지 않으므로 모르는 증강이 섞여도 안전하다. 중복은 지운다.
 */
export function augmentCollectHints(augments: readonly string[]): CollectHint[] {
  const out = new Set<CollectHint>();
  for (const id of augments) {
    const hint = AUGMENT_PLAY[id]?.collect;
    if (hint !== undefined) out.add(hint);
  }
  return [...out];
}

/**
 * 이 사람이 든 증강들 중 **발동 공개 채널을 가진 것**들 (id와 규약).
 *
 * 채널을 실제로 읽는 것은 `bot/collect.ts`다 — 뷰를 보는 쪽은 서버 봇이고, 코어는
 * "무엇을 어떻게 읽어야 하는가"라는 데이터만 준다.
 */
/**
 * 이 사람이 **지금 론당하지 않는가** — 그렇다면 내 버림은 그에게 아무 위험이 없다.
 *
 * 채널 값을 읽는 것은 뷰를 가진 쪽(`bot/collect.ts`)이라, 여기서는 "어느 채널을
 * 어떻게 보면 되는가"만 준다.
 */
export function augmentRonImmuneReads(
  augments: readonly string[],
): { id: string; immune: AugmentRonImmune }[] {
  const out: { id: string; immune: AugmentRonImmune }[] = [];
  for (const id of augments) {
    const immune = AUGMENT_PLAY[id]?.ronImmune;
    if (immune !== undefined) out.push({ id, immune });
  }
  return out;
}

/**
 * 이 사람에게 **현물이 안전패가 아닌가** — 그렇다면 위험 0으로 확신하면 안 된다.
 */
export function augmentFuritenBreakReads(
  augments: readonly string[],
): { id: string; spec: AugmentRonImmune }[] {
  const out: { id: string; spec: AugmentRonImmune }[] = [];
  for (const id of augments) {
    const spec = AUGMENT_PLAY[id]?.furitenBroken;
    if (spec !== undefined) out.push({ id, spec });
  }
  return out;
}

export function augmentFiredReads(
  augments: readonly string[],
): { id: string; fired: AugmentFired }[] {
  const out: { id: string; fired: AugmentFired }[] = [];
  for (const id of augments) {
    const fired = AUGMENT_PLAY[id]?.fired;
    if (fired !== undefined) out.push({ id, fired });
  }
  return out;
}

/** 대기가 넓어지는 증강들의 누적 배수 (1 = 표준 모형 그대로) */
export function augmentWideWaits(augments: readonly string[]): number {
  let m = 1;
  for (const id of augments) m *= AUGMENT_PLAY[id]?.wideWaits ?? 1;
  // 여럿 겹쳐도 위험 상한(`RISK_CAP`)에서 어차피 잘리지만, 여기서도 상식선을 둔다
  return Math.min(2, m);
}

/** 이 사람의 리치를 얼마나 믿는가 (1 = 그대로 믿는다) */
export function augmentRiichiTrust(augments: readonly string[]): number {
  let m = 1;
  for (const id of augments) m *= AUGMENT_PLAY[id]?.riichiTrust ?? 1;
  return Math.max(0.5, m); // 아무리 겹쳐도 절반 아래로는 안 내린다
}

/** 지목형 증강들 (id와 규약) */
export function augmentTargetingReads(
  augments: readonly string[],
): { id: string; targeting: AugmentTargeting }[] {
  const out: { id: string; targeting: AugmentTargeting }[] = [];
  for (const id of augments) {
    const targeting = AUGMENT_PLAY[id]?.targeting;
    if (targeting !== undefined) out.push({ id, targeting });
  }
  return out;
}

/** 판 전체의 지불 구조를 바꾸는 증강들 (id와 규약) */
export function augmentTableRuleReads(
  augments: readonly string[],
): { id: string; rule: AugmentTableRule }[] {
  const out: { id: string; rule: AugmentTableRule }[] = [];
  for (const id of augments) {
    const rule = AUGMENT_PLAY[id]?.tableRule;
    if (rule !== undefined) out.push({ id, rule });
  }
  return out;
}

/** 공개 채널의 실제 키 (`{p}` → 보유자 id). 기본 관례는 `{증강id}:{보유자}` */
export function firedChannelKey(
  id: string,
  spec: { channel?: string },
  player: string,
): string {
  return (spec.channel ?? `${id}:{p}`).replace("{p}", player);
}
