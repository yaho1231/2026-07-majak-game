/**
 * 좌석을 걸친 조합 — 한 사람에게 몰아 주는 스위프로는 못 보는 것들.
 * (깡을 하는 쪽과 창깡하는 쪽, 도라를 가리는 쪽과 앞도라를 공개하는 쪽 …)
 */
import { runMatch, PERSONAS } from "../../harness.js";
import type { PlayerId } from "@majak/core";

/** [p0가 드는 것, p1이 드는 것, 이유] */
const CASES: [string[], string[], string][] = [
  [["void_kan"], ["snake_kan"], "연속 4장 깡을 창깡으로 잡을 때 깡패가 4종이다"],
  [["void_kan"], ["cliff_bloom"], "만개 직전의 두 번째 깡을 창깡으로 끊으면"],
  [["void_kan"], ["ankan_dora"], "안깡 창깡 — 깡 취소 시 개인 도라 판수"],
  [["void_kan", "blame_shift"], ["snake_kan"], "창깡 론 + 3분할"],
  [["mirror_dora"], ["dora_conceal"], "가려진 도라 × 앞도라 공개 (0823 수정 회귀)"],
  [["mirror_dora", "dora_afterimage"], ["dora_conceal"], "가려진 국에 개인 도라 둘"],
  [["blind_ron"], ["blame_shift"], "무작위 청구 × 3분할 (0823 수정 회귀)"],
  [["blind_ron"], ["scapegoat"], "무작위 청구 × 쯔모 몰아주기"],
  [["blind_ron"], ["aotenjou_ceiling"], "무작위 청구 × 상한 해제분의 청구처"],
  [["sign_flip"], ["blame_shift"], "부호 반전이 3분할된 지불을 맞을 때"],
  [["sign_flip"], ["aotenjou_ceiling"], "부호 반전 × 상한 해제 방총"],
  [["sign_flip"], ["scapegoat"], "몰아 준 손실 전액이 흑자로 (0823 «고치지 않음» 회귀)"],
  [["big_hand"], ["blind_ron"], "하한 발행 × 무작위 청구"],
  [["big_hand", "jackpot"], ["blame_shift"], "하한 + 배수 + 3분할"],
  [["devils_advance"], ["scapegoat"], "상환 3,000×3 × 몰아주기"],
  [["devils_advance"], ["blame_shift"], "상환 3,000×3 × 3분할"],
  [["counter"], ["all_or_nothing"], "선리치자 판돈을 카운터가 강탈하는가"],
  [["counter"], ["big_hand"], "강탈 대상의 하한"],
  [["unification"], ["devils_advance"], "가불 +10,000이 문턱을 앞당기는가"],
  [["unification", "big_hand"], ["jackpot"], "뱅크 발행으로 문턱을 넘는가"],
  [["eternal_dealer", "honba_hunter"], ["let_it_ride"], "연장 + 본장 1,500 + 연승 배수"],
  [["let_it_ride", "jackpot"], ["blood_contract"], "배수 3종이 두 좌석에"],
  [["ankan_dora", "aotenjou_ceiling"], ["snake_kan"], "실판 +8 × 상한 해제"],
  [["snake_kan", "cliff_bloom", "ankan_dora"], ["void_kan"], "만개 3장 콤보를 창깡이 끊을 때"],
  [["ura_peek"], ["soul_hunt"], "뒷도라 표시패 바꿔치기 × 리치 강탈"],
  [["ura_peek", "hidden_blade"], ["mirror_dora"], "리치 없는 뒷도라 × 바꿔치기"],
  [["red_five_touch", "mirror_dora", "dora_afterimage"], ["dora_conceal"], "개인 도라 3종 겹침"],
  [["north_trader", "ankan_dora"], ["snake_kan"], "실판 두 갈래 합산"],
  [["rinshan_preview", "cliff_bloom"], ["snake_kan"], "영상패를 둘이 고른다"],
  [["rinshan_preview"], ["cliff_bloom"], "영상패 순서 재배치 × 영상패 직접 선택 (좌석 교차)"],
];

async function main(): Promise<void> {
  let bad = 0;
  for (const [a, b, why] of CASES) {
    for (const seed of [901, 902]) {
      const preset: Record<PlayerId, readonly string[]> = { p0: a, p1: b, p2: [], p3: [] };
      const r = await runMatch({
        seed, mode: "tonpuu", preset,
        personas: { p0: PERSONAS["masher"]!, p1: PERSONAS["masher"]!, p2: PERSONAS["caller"]!, p3: PERSONAS["riichiRusher"]! },
        timeoutMs: 90_000,
      });
      const un = r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
      if (r.crash !== undefined || r.effectErrors.length > 0 || un.length > 0) {
        bad++;
        console.log(`\n### p0[${a.join("+")}] × p1[${b.join("+")}] seed=${seed} — ${why}`);
        if (r.crash !== undefined) console.log(`  CRASH: ${r.crash.split("\n").slice(0, 3).join(" | ")}`);
        for (const e of r.effectErrors.slice(0, 3)) console.log(`  EFFECT_ERR: ${e}`);
        const kinds = new Map<string, number>();
        for (const v of un) kinds.set(v.kind, (kinds.get(v.kind) ?? 0) + 1);
        console.log(`  위반: ${[...kinds].map(([k, n]) => `${k}×${n}`).join(", ")}`);
        for (const v of un.slice(0, 3)) console.log(`    ${v.kind} ${v.round} ${v.detail.slice(0, 220)}`);
      } else {
        process.stdout.write(".");
      }
    }
  }
  console.log(`\n\n완료 — 신호 있는 판 ${bad} / ${CASES.length * 2}`);
}
void main();
