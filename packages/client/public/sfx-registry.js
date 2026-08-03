/* MAJAK 효과음 랩 — 사운드 카탈로그 + 바리에이션 레지스트리
 *
 * 바리에이션 모듈(sfx-sounds-*.js)이 def() 로 등록하고 UI(sfx-lab.js)가 읽는다.
 */

/**
 * 게임에 실제로 채택된 바리에이션 id 집합 (UI 가 "채택됨" 배지로 표시한다).
 * 여기 없는 사운드는 현재 게임 소리(= `<sound>-current`)를 그대로 쓴다는 뜻이다.
 *
 * 2026-08-03 1차 청음 — 18종 중 2종만 교체하고 나머지는 현재 소리 유지로 확정.
 */
export const ADOPTED = new Set(["slide-silk", "countTick-orgel"]);

/**
 * 게임에서 쓰는 사운드 이벤트 카탈로그. UI 는 이 순서로 그린다.
 * parts 가 있으면 "세트" — 바리에이션 하나가 세트 전체를 정의하고,
 * run(partKey) 로 구성원을 골라 재생한다.
 */
export const SOUNDS = [
  // ── 조작·피드백 ──
  { key: "hover", fam: "조작·피드백", name: "손패 훑기", when: "손패 위로 커서가 지나갈 때 (최대 31회/초, 빠르게 쓸면 '타라라락')" },
  { key: "slide", fam: "조작·피드백", name: "패 슬라이드", when: "손패를 드래그해 슬롯 하나 넘길 때" },
  { key: "callPrompt", fam: "조작·피드백", name: "후로 버튼 등장", when: "치·펑·깡·론 버튼이 화면에 뜰 때" },
  { key: "score", fam: "조작·피드백", name: "점수 틱", when: "점수가 오르내릴 때" },
  { key: "countTick", fam: "조작·피드백", name: "점수 카운트업 틱", when: "결과창 점수 카운트업 중 (진행도에 따라 피치 상승)" },
  { key: "countDone", fam: "조작·피드백", name: "카운트업 피니시", when: "결과창 점수 카운트업이 끝날 때" },

  // ── 후로 ──
  {
    key: "callSet", fam: "후로", name: "치·펑·깡 세트", when: "후로 선언 시 — 한 동작에 '탁' 한 번, 종류는 음색으로 구분",
    parts: [
      { key: "chi", label: "치" },
      { key: "pon", label: "펑" },
      { key: "kan", label: "깡" },
    ],
  },

  // ── 증강 ──
  {
    key: "augmentSet", fam: "증강", name: "증강 3단 세트", when: "증강 발동/알림 — 게임의 정체성. 후로(밝은 클랙)와 계열이 달라야 함",
    parts: [
      { key: "soft", label: "알림" },
      { key: "light", label: "발동" },
      { key: "heavy", label: "대형 사건" },
    ],
  },

  // ── 선언·화료 ──
  { key: "riichi", fam: "선언·화료", name: "리치 선언", when: "리치 선언 — 0.2s에 배너 글자가 꽂힌다 (임팩트 동기)", sync: "임팩트 0.2s" },
  { key: "ron", fam: "선언·화료", name: "론", when: "론 화료 — 0.2s에 컷인 글자 슬램 (임팩트 동기)", sync: "임팩트 0.2s" },
  { key: "tsumo", fam: "선언·화료", name: "쯔모", when: "쯔모 화료 — 론보다 밝고 가볍게. 0.2s 임팩트 동기", sync: "임팩트 0.2s" },

  // ── 대형 화료 ──
  {
    key: "manganSet", fam: "대형 화료", name: "만관~삼배만 세트", when: "등급이 오를수록 길고 무겁고 화려하게. 0.2s 임팩트 동기",
    sync: "임팩트 0.2s",
    parts: [
      { key: "mangan", label: "만관" },
      { key: "haneman", label: "하네만" },
      { key: "baiman", label: "배만" },
      { key: "sanbaiman", label: "삼배만" },
    ],
  },
  { key: "yakuman", fam: "대형 화료", name: "역만", when: "게임 최대 이벤트 — 0.45s에 대형 슬램 (임팩트 동기)", sync: "임팩트 0.45s" },

  // ── 흐름·결과 ──
  { key: "round", fam: "흐름·결과", name: "새 국 시작", when: "새 국이 시작될 때 / 국 배너" },
  { key: "draft", fam: "흐름·결과", name: "드래프트 카드 등장", when: "증강 드래프트 카드가 펼쳐질 때" },
  { key: "pick", fam: "흐름·결과", name: "드래프트 픽 확정", when: "증강 카드를 골랐을 때" },
  { key: "draw", fam: "흐름·결과", name: "유국", when: "아무도 화료 못 하고 국이 끝날 때 — 의도적으로 조용하게" },
  {
    key: "yakuSteps", fam: "흐름·결과", name: "역 스탬프 계단", when: "결과창에서 역 이름이 하나씩 찍힐 때 (0.15s + i×0.09s 간격)",
    parts: [
      { key: "3", label: "3역" },
      { key: "6", label: "6역" },
      { key: "10", label: "10역" },
    ],
  },
];

/** 등록된 바리에이션 전부. { id, sound, name, tag, dur, run(partKey?) } */
export const VARIANTS = [];

/**
 * 바리에이션 하나 등록.
 *  id    — 전역 유일 ("riichi-orgel" 처럼 <sound>-<슬러그>)
 *  sound — SOUNDS 의 key
 *  name  — 한 줄 이름 (한국어)
 *  tag   — 소리 설명 한 줄
 *  dur   — 대략 길이(초, 숫자). 세트면 가장 긴 구성원 기준
 *  run(partKey?) — 재생. 세트 사운드면 partKey 로 구성원 선택
 */
export const def = (v) => VARIANTS.push(v);
