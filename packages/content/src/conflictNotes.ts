/**
 * 배타(`conflicts`) 문장을 **카탈로그에서 생성**한다 — 손으로 적지 않는다.
 *
 * 배타는 후보 필터가 양방향으로 본다(`Augment.ts` rollUniform —
 * `d.conflicts.includes(a) || catalog.get(a).conflicts.includes(d.id)`). 그런데 그 사실을
 * 알려 주는 창구가 화면 어디에도 없어서, 배타에 걸린 33종 중 29종이 자기 문구에서
 * 한 글자도 말하지 않았다(2026-08-22 QA round2 확정 1). 리치 빌드를 짠 사람이
 * **그 픽이 후보에 안 뜨는 이유를 알 방법이 없다.**
 *
 * 문구에 일일이 적으면 `conflicts` 배열이 바뀔 때마다 낡는다 — 실제로 `die_hard` 넷은
 * 적어 두었고 반대편 `always_tenpai`·`no_ron_pact`는 침묵하는 비대칭이 그렇게 생겼다.
 * 그래서 **메타데이터 하나를 진실로 삼고** 여기서 detail 끝에 한 줄을 붙인다.
 * 손으로 적을 것은 목록이 아니라 **왜 겹치면 안 되는가**(`CONFLICT_REASON`)뿐이다.
 *
 * 붙는 자리는 `detail`이다 — 도감 상세(`variant="codex"`)가 펼치는 층이고, 배타를
 * 확인하러 오는 자리다. 드래프트 카드는 요약+`description`만 펼치므로 이 줄이 뜨지 않는다
 * (거기에 배지를 그리는 것은 App.tsx의 일이라 손대지 않았다 — 보고서 참조).
 */

import type { AugmentDef } from "@majak/core";

/**
 * 배타의 **이유** — 목록은 자동이고 이유만 손으로 적는다.
 * 없으면 목록만 뜬다(그것만으로도 "왜 안 뜨는가"에는 답이 된다).
 */
const CONFLICT_REASON: Record<string, string> = {
  die_hard:
    "넷 다 '크게 잃는 국'을 없애는 방어라 이 증강의 발동 조건 자체를 지운다.",
  yakuman_shield: "둘 다 정산 마지막에 손실을 되돌려 서로의 결과를 뒤엎는다.",
  true_dragon:
    "14장·4몸통을 전제하는 국사·치또이·구련류, 성립하지 않는 깡, 그리고 17장인 손과는 바꿀 상대가 없어 영영 발동하지 못하는 손패 교환이다.",
  stealth_riichi: "전부 '내가 건 리치'의 모양을 바꿔 은닉과 화면이 어긋난다.",
  open_riichi_reveal:
    "전부 리치 중에 대기를 바꾸거나 리치의 모양을 다시 써서, 공개한 오름패가 거짓이 된다.",
  avenger: "둘 다 후리텐·무역 해제를 열어 만개 구간에서 통째로 중복된다.",
  regret: "둘 다 유국 손패를 다음 국 배패로 덮어써 뒤에 도는 쪽이 앞의 결과를 지운다.",
  frame_up: "남의 바닥에 심은 패 한 장이 편식의 한 무늬 셈을 통째로 깬다.",
  hidden_blade: "둘 다 리치 없는 뒷도라를 열어 멘젠 다마텐 론에서 완전히 중복된다.",
  free_riichi_discard: "둘 다 리치를 무르는데, 이 증강은 선언 시점의 손패를 국 내내 고정한다.",
  seat_swap: "손패 장수가 다른 상대와는 바꿀 수 없어(가드), 17장짜리 손과 함께 들면 한 번도 발동하지 못한다.",
  full_hand_swap: "손패 장수가 다른 상대와는 바꿀 수 없어(가드), 17장짜리 손과 함께 들면 한 번도 발동하지 못한다.",
};

/**
 * 양방향 배타 관계를 펼친 뒤 detail 끝에 한 줄을 붙인 카탈로그를 돌려준다.
 * 원본 정의는 건드리지 않는다(얕은 복사).
 */
export function withConflictNotes(defs: readonly AugmentDef[]): AugmentDef[] {
  const nameOf = new Map(defs.map((d) => [d.id, d.name]));
  // 양방향으로 펼친다 — 한쪽에만 적힌 배타도 반대편 카드에 떠야 한다.
  const both = new Map<string, Set<string>>(defs.map((d) => [d.id, new Set<string>()]));
  for (const d of defs) {
    for (const c of d.conflicts ?? []) {
      if (!nameOf.has(c)) continue; // 카탈로그 밖 id는 조용히 넘긴다
      both.get(d.id)?.add(c);
      both.get(c)?.add(d.id);
    }
  }

  return defs.map((d) => {
    const ids = [...(both.get(d.id) ?? [])];
    if (ids.length === 0) return d;
    // 이름 순서는 카탈로그 순서를 따른다 — 배열이 바뀌어도 문장이 흔들리지 않게.
    const names = defs
      .filter((o) => ids.includes(o.id))
      .map((o) => o.name)
      .join(" · ");
    const reason = CONFLICT_REASON[d.id];
    const line = `⚠ 함께 가질 수 없다 — ${names}.${reason === undefined ? "" : ` ${reason}`}`;
    return { ...d, detail: `${d.detail ?? d.description}\n\n${line}` };
  });
}
