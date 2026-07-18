/**
 * @majak/content — 콘텐츠 팩: 증강 카탈로그.
 *
 * 코어(@majak/core)의 등록 API만 사용한다 — 엔진 수정 없이 데이터 등록만으로
 * 추가되는 것이 이 패키지의 존재 이유다 (PROJECT_CHARTER "가장 중요한 목표").
 *
 * 서버는 contentAugments를 HanchanController({ extraAugments })로 넘긴다.
 * 리플레이 재구성(replayFile)에도 같은 목록을 넘겨야 한다.
 */

import type { AugmentDef } from "@majak/core";

// ── Silver — 기본 능력 (규칙 훼손 적음) ──
import { gokuakumudo } from "./augments/gokuakumudo.js";
import { riichiMarket } from "./augments/riichi_market.js";
import { notenInsurance } from "./augments/noten_insurance.js";
import { honbaCollector } from "./augments/honba_collector.js";
import { redFiveTouch } from "./augments/red_five_touch.js";
import { dealerGrit } from "./augments/dealer_grit.js";
import { finalSpurt } from "./augments/final_spurt.js";
import { flow } from "./augments/flow.js";
import { overtime } from "./augments/overtime.js";
import { counter } from "./augments/counter.js";
import { avenger } from "./augments/avenger.js";
import { redHand } from "./augments/red_hand.js";
import { greed } from "./augments/greed.js";
import { doraHunter } from "./augments/dora_hunter.js";
import { pickyEater } from "./augments/picky_eater.js";
import { gambler } from "./augments/gambler.js";
// ── Silver — 현상금 사냥꾼 계열 (특정 역을 노리는 본인 전용 상금) ──
import { bountyTanyao } from "./augments/bounty_tanyao.js";
import { bountyRiichi } from "./augments/bounty_riichi.js";
import { bountyYakuhai } from "./augments/bounty_yakuhai.js";
import { bountySanshoku } from "./augments/bounty_sanshoku.js";
import { bountyHonitsu } from "./augments/bounty_honitsu.js";
import { bountyToitoi } from "./augments/bounty_toitoi.js";

// ── Gold — 게임 플레이에 큰 영향 ──
import { slowSteady } from "./augments/slow_steady.js";
import { furoMaster } from "./augments/furo_master.js";
import { promiseNext } from "./augments/promise_next.js";
import { riichiUpgrade } from "./augments/riichi_upgrade.js";
import { freeRiichiDiscard } from "./augments/free_riichi_discard.js";
import { peekRiichiWaits } from "./augments/peek_riichi_waits.js";
import { xrayHand } from "./augments/xray_hand.js";
import { rinshanPreview } from "./augments/rinshan_preview.js";
import { hiddenRiver } from "./augments/hidden_river.js";
import { yakumanShield } from "./augments/yakuman_shield.js";
import { omniChi } from "./augments/omni_chi.js";
import { pseudoDealer } from "./augments/pseudo_dealer.js";
import { veteran } from "./augments/veteran.js";
import { composure } from "./augments/composure.js";
import { gamblerPro } from "./augments/gambler_pro.js";
import { underdog } from "./augments/underdog.js";
import { waitArt } from "./augments/wait_art.js";
import { momentum } from "./augments/momentum.js";
import { minimalist } from "./augments/minimalist.js";
import { lastStand } from "./augments/last_stand.js";
import { dieHard } from "./augments/die_hard.js";
import { vanguard } from "./augments/vanguard.js";

// ── Prism — 리치마작의 상식을 깨는 능력 ──
import { suitUnify } from "./augments/suit_unify.js";
import { handSwap3 } from "./augments/hand_swap3.js";
import { fullHandSwap } from "./augments/full_hand_swap.js";
import { discardLock } from "./augments/discard_lock.js";
import { tanyaoBreak } from "./augments/tanyao_break.js";
import { openKokushi } from "./augments/open_kokushi.js";
import { brokenWall } from "./augments/broken_wall.js";
import { seatSwap } from "./augments/seat_swap.js";
import { futureSight } from "./augments/future_sight.js";
import { rinshanGamble } from "./augments/rinshan_gamble.js";
import { trueDragon } from "./augments/true_dragon.js";
import { parasite } from "./augments/parasite.js";
// ── Prism — 도파민 계열 (판이 크게 요동치는 본인 전용 능력) ──
import { jackpot } from "./augments/jackpot.js";
import { bigHand } from "./augments/big_hand.js";
import { lateBloomer } from "./augments/late_bloomer.js";
import { nagashiYakuman } from "./augments/nagashi_yakuman.js";
import { cliffBloom } from "./augments/cliff_bloom.js";
import { noRetreat } from "./augments/no_retreat.js";

export {
  gokuakumudo,
  riichiMarket,
  notenInsurance,
  honbaCollector,
  redFiveTouch,
  dealerGrit,
  finalSpurt,
  flow,
  overtime,
  counter,
  avenger,
  redHand,
  greed,
  doraHunter,
  pickyEater,
  gambler,
  bountyTanyao,
  bountyRiichi,
  bountyYakuhai,
  bountySanshoku,
  bountyHonitsu,
  bountyToitoi,
  slowSteady,
  furoMaster,
  promiseNext,
  riichiUpgrade,
  freeRiichiDiscard,
  peekRiichiWaits,
  xrayHand,
  rinshanPreview,
  hiddenRiver,
  yakumanShield,
  omniChi,
  pseudoDealer,
  veteran,
  composure,
  gamblerPro,
  underdog,
  waitArt,
  momentum,
  minimalist,
  lastStand,
  dieHard,
  vanguard,
  suitUnify,
  handSwap3,
  fullHandSwap,
  discardLock,
  tanyaoBreak,
  openKokushi,
  brokenWall,
  seatSwap,
  futureSight,
  rinshanGamble,
  trueDragon,
  parasite,
  jackpot,
  bigHand,
  lateBloomer,
  nagashiYakuman,
  cliffBloom,
  noRetreat,
};

/** 콘텐츠 팩 전체 카탈로그 (Silver 22 / Gold 22 / Prism 18) */
export const contentAugments: AugmentDef[] = [
  // Silver
  gokuakumudo,
  riichiMarket,
  notenInsurance,
  honbaCollector,
  redFiveTouch,
  dealerGrit,
  finalSpurt,
  flow,
  overtime,
  counter,
  avenger,
  redHand,
  greed,
  doraHunter,
  pickyEater,
  gambler,
  bountyTanyao,
  bountyRiichi,
  bountyYakuhai,
  bountySanshoku,
  bountyHonitsu,
  bountyToitoi,
  // Gold
  slowSteady,
  furoMaster,
  promiseNext,
  riichiUpgrade,
  freeRiichiDiscard,
  peekRiichiWaits,
  xrayHand,
  rinshanPreview,
  hiddenRiver,
  yakumanShield,
  omniChi,
  pseudoDealer,
  veteran,
  composure,
  gamblerPro,
  underdog,
  waitArt,
  momentum,
  minimalist,
  lastStand,
  dieHard,
  vanguard,
  // Prism
  suitUnify,
  handSwap3,
  fullHandSwap,
  discardLock,
  tanyaoBreak,
  openKokushi,
  brokenWall,
  seatSwap,
  futureSight,
  rinshanGamble,
  trueDragon,
  parasite,
  jackpot,
  bigHand,
  lateBloomer,
  nagashiYakuman,
  cliffBloom,
  noRetreat,
];
