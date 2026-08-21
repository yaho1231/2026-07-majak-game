/**
 * 연출 목록 — 점검 페이지가 읽는 단일 진실.
 *
 * 연출을 새로 만들면 **여기에 등록한다.** 등록하지 않으면 점검 페이지에 안 뜨고,
 * 안 뜨면 아무도 확인하지 않는다. 목록을 코드 옆에 두는 이유가 그것이다.
 *
 * `freq`(빈도)를 함께 적는 것이 중요하다 — 연출 예산은 **얼마나 자주 보이는가**로
 * 정해진다. 매 순 보이는 것에 0.5초를 쓰면 그건 연출이 아니라 지연이고, 한 판에 한 번
 * 보이는 것에 0.1초만 쓰면 사건이 사건처럼 안 보인다.
 */

/** 이 연출이 실제 게임에서 얼마나 자주 보이는가 */
export type FxFreq =
  /** 매 순 (한 국에 수십 번) — 예산 0.12~0.26초 */
  | "매순"
  /** 국마다 몇 번 (후로·리치·도라) — 0.3~0.6초 */
  | "가끔"
  /** 국에 한 번쯤 (화료·유국) — 0.6~1.5초 */
  | "드묾"
  /** 판에 한 번 있을까 (역만·큰 증강) — 예산을 몰아준다 */
  | "희귀";

export interface FxDemo {
  id: string;
  group: string;
  name: string;
  /** 게임의 어느 순간에 나오는가 — 점검할 때 맥락이 없으면 판단이 안 선다 */
  when: string;
  freq: FxFreq;
  /** 무엇을 노렸는가 (판단 근거) */
  intent: string;
  play: (stage: FxStage) => void;
}

/** 점검 페이지의 모의 판 — 연출이 잡을 수 있는 요소들 */
export interface FxStage {
  root: HTMLElement;
  table: HTMLElement;
  hand: HTMLElement;
  /** 손패 타일들 (DOM 순서) */
  tiles: () => HTMLElement[];
  wall: HTMLElement;
  discard: HTMLElement;
  meldSlot: HTMLElement;
  seats: HTMLElement[];
  center: HTMLElement;
  /** 컷인·배너가 뜨는 층 */
  overlay: HTMLElement;
  /** 손패 순서를 바꾼다 (FLIP 시연용) */
  shuffleHand: () => void;
  sortHand: () => void;
  /** 판을 처음 상태로 되돌린다 */
  reset: () => void;
  /** 점검 페이지에 한 줄 남긴다 */
  log: (msg: string) => void;
}
