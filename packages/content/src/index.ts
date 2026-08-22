/**
 * @majak/content — 콘텐츠 팩: 증강 카탈로그.
 *
 * 코어(@majak/core)의 등록 API만 사용한다 — 엔진 수정 없이 데이터 등록만으로
 * 추가되는 것이 이 패키지의 존재 이유다 (PROJECT_CHARTER "가장 중요한 목표").
 *
 * 서버는 contentAugments를 HanchanController({ extraAugments })로 넘긴다.
 * 리플레이 재구성(replayFile)에도 같은 목록을 넘겨야 한다.
 *
 * 2026-07-22 (48차) 도파민 리디자인: 순수 패시브 점수/판 보너스 28종을 삭제했다
 * (현상금 6종·미식가·본장 수집가·부수 장인·천천히 꾸준히·선봉 등).
 * 신규 증강은 10_AUGMENT_SYSTEM §0 도파민 리트머스를 통과해야 한다 —
 * addHanBonus/addWinPointBonus만 쓰는 증강은 자동 탈락이다.
 */

import type { AugmentDef } from "@majak/core";

import { withConflictNotes } from "./conflictNotes.js";

// 봇이 판단할 수 없어 정책을 두지 않은 액티브 증강 목록 (드래프트 후순위·커버리지 테스트)
export { BOT_UNUSABLE_AUGMENTS } from "./augments/botHelpers.js";

// 초읽기(time_pressure)의 제한 시간·채널 — 서버(HumanAgent)와 클라이언트가 함께 읽는다.
// 제한 시간은 게임 규칙이 아니라 접속·진행의 문제라 엔진 밖에서 다룬다.
export { TIME_PRESSURE_CHANNEL, TIME_PRESSURE_SECONDS } from "./augments/time_pressure.js";

// ── Silver — 기본 능력 (규칙 훼손 적음) ──
import { redFiveTouch } from "./augments/red_five_touch.js";
import { counter } from "./augments/counter.js";
import { avenger } from "./augments/avenger.js";
import { uraPeek } from "./augments/ura_peek.js";
import { takeBack } from "./augments/take_back.js";

// ── Gold — 게임 플레이에 큰 영향 ──
import { riichiUpgrade } from "./augments/riichi_upgrade.js";
import { freeRiichiDiscard } from "./augments/free_riichi_discard.js";
import { peekRiichiWaits } from "./augments/peek_riichi_waits.js";
import { xrayHand } from "./augments/xray_hand.js";
import { rinshanPreview } from "./augments/rinshan_preview.js";
import { yakumanShield } from "./augments/yakuman_shield.js";
import { omniChi } from "./augments/omni_chi.js";
import { pseudoDealer } from "./augments/pseudo_dealer.js";
import { lastStand } from "./augments/last_stand.js";
import { dieHard } from "./augments/die_hard.js";
import { hiddenBlade } from "./augments/hidden_blade.js";
import { tileDyeing } from "./augments/tile_dyeing.js";
import { scapegoat } from "./augments/scapegoat.js";
import { letItRide } from "./augments/let_it_ride.js";
import { openRiichiReveal } from "./augments/open_riichi_reveal.js";
import { invincible } from "./augments/invincible.js";

// ── Prism — 리치마작의 상식을 깨는 능력 ──
import { hiddenRiver } from "./augments/hidden_river.js";
import { suitUnify } from "./augments/suit_unify.js";
import { handSwap3 } from "./augments/hand_swap3.js";
import { fullHandSwap } from "./augments/full_hand_swap.js";
import { discardLock } from "./augments/discard_lock.js";
import { tanyaoBreak } from "./augments/tanyao_break.js";
import { openKokushi } from "./augments/open_kokushi.js";
import { brokenWall } from "./augments/broken_wall.js";
import { seatSwap } from "./augments/seat_swap.js";
import { futureSight } from "./augments/future_sight.js";
import { bottomDeal } from "./augments/bottom_deal.js";
import { trueDragon } from "./augments/true_dragon.js";
import { parasite } from "./augments/parasite.js";
import { jackpot } from "./augments/jackpot.js";
import { bigHand } from "./augments/big_hand.js";
import { lateBloomer } from "./augments/late_bloomer.js";
import { nagashiYakuman } from "./augments/nagashi_yakuman.js";
import { cliffBloom } from "./augments/cliff_bloom.js";
import { noRetreat } from "./augments/no_retreat.js";
import { alchemist } from "./augments/alchemist.js";
import { bloodContract } from "./augments/blood_contract.js";
import { aotenjouCeiling } from "./augments/aotenjou_ceiling.js";
import { devilsAdvance } from "./augments/devils_advance.js";
import { allOrNothing } from "./augments/all_or_nothing.js";
import { eternalDealer } from "./augments/eternal_dealer.js";
import { brokenBorder } from "./augments/broken_border.js";
import { pondSnatch } from "./augments/pond_snatch.js";
import { graveRob } from "./augments/grave_rob.js";
import { spy } from "./augments/spy.js";
import { karma } from "./augments/karma.js";
import { timeStop } from "./augments/time_stop.js";

// ── 동풍전 전용 템포 변형 (2026-07-19) — 같은 이름·다른 템포, modes:["tonpuu"] ──
import { lateBloomerEast } from "./augments/late_bloomer_east.js";

// ── 52차 신규 12종 (2026-07-22, docs/16 §1c) — 전부 프리즘급 단일 기준으로 설계됐다 ──
import { riichiSeal } from "./augments/riichi_seal.js";
import { mixedNineGates } from "./augments/mixed_nine_gates.js";
import { haiteiLord } from "./augments/haitei_lord.js";
import { offByOne } from "./augments/off_by_one.js";
import { silentSwap } from "./augments/silent_swap.js";
import { ankanDora } from "./augments/ankan_dora.js";
import { foresight } from "./augments/foresight.js";
import { rankGate } from "./augments/rank_gate.js";
import { deadWallMaster } from "./augments/dead_wall_master.js";
import { stealthRiichi } from "./augments/stealth_riichi.js";
import { voidKan } from "./augments/void_kan.js";
import { honbaHunter } from "./augments/honba_hunter.js";

// ── 56차 백로그 구현 배치 1 (2026-07-23, docs/16 §2 · docs/17) — decompose·리치 확장 ──
import { mixedTriplet } from "./augments/mixed_triplet.js";
import { royalKokushi } from "./augments/royal_kokushi.js";
import { siegeRiichi } from "./augments/siege_riichi.js";
import { polarEnds } from "./augments/polar_ends.js";
import { asyncChiitoi } from "./augments/async_chiitoi.js";

// ── 56차 백로그 배치 3 (2026-07-23) — 액티브/구조 증강 ──
import { genesis } from "./augments/genesis.js";
import { unification } from "./augments/unification.js";
import { tableFlip } from "./augments/table_flip.js";
import { soulHunt } from "./augments/soul_hunt.js";
import { bluffPretense } from "./augments/bluff_pretense.js";

// ── 5차 §2b 사용자 발안 구현 (2026-07-25, docs/16 §2b · docs/17 §2b) ──
import { blameShift } from "./augments/blame_shift.js";
import { noRonPact } from "./augments/no_ron_pact.js";
import { alwaysTenpai } from "./augments/always_tenpai.js";
import { doraConceal } from "./augments/dora_conceal.js";
import { lateDouble } from "./augments/late_double.js";
import { callSeal } from "./augments/call_seal.js";
import { evenWorld } from "./augments/even_world.js";
import { briefFog } from "./augments/brief_fog.js";
import { giantGod } from "./augments/giant_god.js";
import { conjureDraw } from "./augments/conjure_draw.js";
import { bottomYaku } from "./augments/bottom_yaku.js";
// ── 5차 §2b 배치 2 (2026-07-25) — 정보형 3종·파혼·ankan_dora 개편 ──
import { tenpaiScan } from "./augments/tenpai_scan.js";
import { dangerSense } from "./augments/danger_sense.js";
import { triplePeek } from "./augments/triple_peek.js";
import { meldDissolve } from "./augments/meld_dissolve.js";
// ── 5차 배치 3 (2026-07-25) — 코어확장 ──
import { windLineage } from "./augments/wind_lineage.js";
import { silentPact } from "./augments/silent_pact.js";
import { regret } from "./augments/regret.js";
import { disarm } from "./augments/disarm.js";
import { pushRiichi } from "./augments/push_riichi.js";
import { reload } from "./augments/reload.js";
import { honorReturn } from "./augments/honor_return.js";
import { tileSplit } from "./augments/tile_split.js";
import { frameUp } from "./augments/frame_up.js";
import { threeDragonsWill } from "./augments/three_dragons_will.js";
import { snakeKan } from "./augments/snake_kan.js";
import { palmFlip } from "./augments/palm_flip.js";
import { northTrader } from "./augments/north_trader.js";
import { hourglass } from "./augments/hourglass.js";

// ── 6차 사용자 발안 8종 (2026-08-04, docs/16 §2c) — 도라 확장·메타·국 한정 자동 발동 ──
import { mirrorDora } from "./augments/mirror_dora.js";
import { cornucopia } from "./augments/cornucopia.js";
import { timePressure } from "./augments/time_pressure.js";
import { blindRon } from "./augments/blind_ron.js";
import { doraAfterimage } from "./augments/dora_afterimage.js";
import { signFlip } from "./augments/sign_flip.js";
import { soulStrike } from "./augments/soul_strike.js";
import { pickyEater } from "./augments/picky_eater.js";

// ── 7차 사용자 발안 (2026-08-07) — 만능패 ──
import { joker } from "./augments/joker.js";

export {
  redFiveTouch,
  counter,
  avenger,
  uraPeek,
  takeBack,
  riichiUpgrade,
  freeRiichiDiscard,
  peekRiichiWaits,
  xrayHand,
  rinshanPreview,
  hiddenRiver,
  yakumanShield,
  omniChi,
  pseudoDealer,
  lastStand,
  dieHard,
  hiddenBlade,
  tileDyeing,
  scapegoat,
  letItRide,
  openRiichiReveal,
  invincible,
  suitUnify,
  handSwap3,
  fullHandSwap,
  discardLock,
  tanyaoBreak,
  openKokushi,
  brokenWall,
  seatSwap,
  futureSight,
  bottomDeal,
  trueDragon,
  parasite,
  jackpot,
  bigHand,
  lateBloomer,
  nagashiYakuman,
  cliffBloom,
  noRetreat,
  alchemist,
  bloodContract,
  aotenjouCeiling,
  devilsAdvance,
  allOrNothing,
  eternalDealer,
  brokenBorder,
  pondSnatch,
  graveRob,
  spy,
  karma,
  timeStop,
  lateBloomerEast,
  riichiSeal,
  mixedNineGates,
  haiteiLord,
  offByOne,
  silentSwap,
  ankanDora,
  foresight,
  rankGate,
  deadWallMaster,
  stealthRiichi,
  voidKan,
  honbaHunter,
  mixedTriplet,
  royalKokushi,
  siegeRiichi,
  polarEnds,
  asyncChiitoi,
  genesis,
  unification,
  tableFlip,
  soulHunt,
  bluffPretense,
  blameShift,
  noRonPact,
  alwaysTenpai,
  doraConceal,
  lateDouble,
  callSeal,
  evenWorld,
  briefFog,
  giantGod,
  conjureDraw,
  bottomYaku,
  tenpaiScan,
  dangerSense,
  triplePeek,
  meldDissolve,
  windLineage,
  silentPact,
  regret,
  disarm,
  pushRiichi,
  reload,
  honorReturn,
  tileSplit,
  frameUp,
  threeDragonsWill,
  snakeKan,
  palmFlip,
  northTrader,
  hourglass,
  mirrorDora,
  cornucopia,
  timePressure,
  blindRon,
  doraAfterimage,
  signFlip,
  soulStrike,
  pickyEater,
  joker,
};

/**
 * 콘텐츠 팩 전체 카탈로그 — **113종** (2026-08-07, 조커 추가).
 *
 * 등급(tier)은 52차에 표시상 폐기됐다(docs/10 §2a) — 필드는 RuleLayer 합성 우선순위로만 남아 있고,
 * 드래프트는 카탈로그 전체에서 균등·비복원으로 3장을 뽑는다(`AugmentRegistry.rollUniform`).
 * 그래서 아래 배열의 구획 주석은 등급이 아니라 **추가된 시기**를 나타낸다.
 */
const CONTENT_AUGMENTS: AugmentDef[] = [
  // Silver
  redFiveTouch,
  counter,
  avenger,
  uraPeek,
  takeBack,
  // Gold
  riichiUpgrade,
  freeRiichiDiscard,
  peekRiichiWaits,
  xrayHand,
  rinshanPreview,
  yakumanShield,
  omniChi,
  pseudoDealer,
  lastStand,
  dieHard,
  hiddenBlade,
  tileDyeing,
  scapegoat,
  letItRide,
  openRiichiReveal,
  invincible,
  // Prism
  hiddenRiver,
  suitUnify,
  handSwap3,
  fullHandSwap,
  discardLock,
  tanyaoBreak,
  openKokushi,
  brokenWall,
  seatSwap,
  futureSight,
  bottomDeal,
  trueDragon,
  parasite,
  jackpot,
  bigHand,
  lateBloomer,
  lateBloomerEast,
  nagashiYakuman,
  cliffBloom,
  noRetreat,
  alchemist,
  bloodContract,
  aotenjouCeiling,
  devilsAdvance,
  allOrNothing,
  eternalDealer,
  brokenBorder,
  pondSnatch,
  graveRob,
  spy,
  karma,
  timeStop,
  // 52차 신규 (2026-07-22, docs/16 §1c)
  riichiSeal,
  mixedNineGates,
  haiteiLord,
  offByOne,
  silentSwap,
  ankanDora,
  foresight,
  rankGate,
  deadWallMaster,
  stealthRiichi,
  voidKan,
  honbaHunter,
  // 56차 백로그 배치 1 (2026-07-23) — 동수의 결속·왕의 징표·공성계
  mixedTriplet,
  royalKokushi,
  siegeRiichi,
  // 56차 백로그 배치 2 (2026-07-23) — 양극·비대칭 치또이 (decompose 계열)
  polarEnds,
  asyncChiitoi,
  // 56차 백로그 배치 3 (2026-07-23) — 개벽·천하통일·밥상 뒤엎기·혼 사냥·허장성세
  genesis,
  unification,
  tableFlip,
  soulHunt,
  bluffPretense,
  // 5차 §2b 사용자 발안 배치 1 (2026-07-25) — 순수 콘텐츠·소코어확장 9종
  blameShift, // 책임전가 — 론 지불 3분할 재배선
  noRonPact, // 불가침 조약 — 첫 6순 론 면역
  alwaysTenpai, // 승승장구 — 유국 항상 텐파이
  doraConceal, // 가려진 도라 — 상대에게 도라 표시패 은닉
  lateDouble, // 뒤늦은 출진 — 7순까지 더블리치
  callSeal, // 함구령 — 6순 상대 후로 봉인
  evenWorld, // 짝수의 세계 — 손패 홀수→짝수
  briefFog, // 박무 — 6순 안개
  giantGod, // 마작의 거신병 — 손패↔바닥 국사 교환
  conjureDraw, // 소환 — 지목한 손패를 다음 쯔모로
  bottomYaku, // 바닥의 족보 — 내 바닥이 역을 만든다(§2 백로그)
  // 5차 §2b 배치 2 (2026-07-25)
  tenpaiScan, // 천리안 — 텐파이 상대 감지
  dangerSense, // 지뢰 탐지 — 내 손패의 방총패 표시
  triplePeek, // 삼세 예지 — 다음 쯔모 3장 열람
  meldDissolve, // 파혼 — 자기 후로 해체(§2 백로그)
  // 5차 배치 3 (2026-07-25) — 코어확장
  windLineage, // 바람의 계보 — 자패 슌쯔(§2 백로그)
  silentPact, // 묵계 — 멘젠 유지 퐁(§2 백로그)
  regret, // 미련 — 유국 텐파이 손을 다음 국 배패로(§2 백로그)
  disarm, // 무장해제 — 상대 증강 1국 무효(§2 백로그)
  pushRiichi, // 등 떠밀기 — 낙인 대상 강제 리치(§2 백로그)
  reload, // 재장전 — 소진 증강 1회 복구(§2 백로그)
  honorReturn, // 귀환 — 버린 자패를 다음 국 배패로(§2b)
  tileSplit, // 분열 — 수패 1장을 두 숫자로(§2 백로그)
  frameUp, // 누명 — 내 버림을 상대 바닥에(§2 백로그)
  threeDragonsWill, // 삼원의 의지 — 7장 대삼원(§2 백로그)
  snakeKan, // 장사진 — 4연속 깡(§2 백로그)
  palmFlip, // 손바닥 뒤집기 — 리치 해제+무료 재리치(§2 백로그)
  northTrader, // 북풍 상인 — 북빼기+개인 도라(§2 백로그)
  hourglass, // 뒤집힌 모래시계 — 유국 거부 솔로 쯔모(§2 백로그)
  // 6차 사용자 발안 (2026-08-04) — docs/16 §2c
  mirrorDora, // 거울의 도라 — 표시패의 앞도 내 도라
  cornucopia, // 화수분 — 획득 즉시 무작위 증강 2개
  timePressure, // 초읽기 — 이번 국 전원 5초 제한
  blindRon, // 눈먼 총알 — 이번 국 모든 론이 무작위 대상에게
  doraAfterimage, // 도라의 잔상 — 직전 국의 도라를 되살린다
  signFlip, // 음양 반전 — 이번 국 내 점수의 부호가 뒤집힌다
  soulStrike, // 영혼의 일격 — 리치(2판) + 연속 6쯔모
  pickyEater, // 편식 — 한 무늬만 12장 버리면 단색 세계
  // 7차 사용자 발안 (2026-08-07)
  joker, // 조커 — 이번 국 손패의 백이 무엇이든 되는 만능패
];

/**
 * 배타(`conflicts`) 문장은 카탈로그에서 생성해 detail 끝에 붙인다 — 손으로 적으면
 * 배열이 바뀔 때마다 낡는다(2026-08-22 QA round2 확정 1). conflictNotes.ts 참조.
 */
export const contentAugments: AugmentDef[] = withConflictNotes(CONTENT_AUGMENTS);
