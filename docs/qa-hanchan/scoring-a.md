# 반장전 밸런스 QA — GROUP `scoring-a`

대상 12종 (전부 `category: "scoring"`). 기준: 동풍전 4국(+본장·남입) vs 반장전 8국(+본장·서입),
드래프트 3회 vs 4회. 근거는 전부 실제 파일 확인.

| id | 이름 | 판정 | 심각도 | 근거(파일:줄) | 제안 |
|---|---|---|---|---|---|
| hidden_blade | 숨은 칼날 | OK (상시형 공통 강화) | P2 | packages/content/src/augments/hidden_blade.ts:50-124 (국 스코프 riichi 이력, 매 화료 판정) | 없음 |
| let_it_ride | 판돈 굴리기 | 강화 | P2 | let_it_ride.ts:41-49(게임 단위 streak, `Math.min(...,4)` 상한), 111-125(초기화 조건) | 없음(상한 4가 폭주를 막는다). 굳이 조이려면 반장전 상한 3 |
| scapegoat | 덤터기 | OK | P2 | scapegoat.ts:39-40(roundScopedKey = 매 국 1회), 114-144(Redistribute+Reassert 전액 이전) | 없음 |
| ankan_dora | 밀실의 도라 | OK (상시형 공통 강화) | P2 | ankan_dora.ts:58-60(안깡 장수 = 판), 85-94(`score.extraHan`) | 없음 |
| aotenjou_ceiling | 뚫린 천장 | OK (상시형 공통 강화) | P2 | aotenjou_ceiling.ts:59-110(`score.uncapped` + winPointTransfer) | 없음 |
| big_hand | 큰손 | OK | — | big_hand.ts:49(`COOLDOWN_ROUNDS = 2`), 66-69, 115(`trackRoundSeq`) | 없음 — 국 단위 쿨다운이라 국 수에 자동 비례 |
| blame_shift | 책임전가 | OK | — | blame_shift.ts:85-138(Redistribute), 155-193(Reassert). 총액·홀더 수령액 불변 | 없음 |
| blood_contract | 핏빛 계약 | OK | P2 | blood_contract.ts:52-53(roundScopedKey = 매 국 1회), 104-149(1.5배) | 없음 |
| devils_advance | 가불 인생 | 약화 | P1 | devils_advance.ts:44-46(ADVANCE 10000·BURST 3000), 63(`draftStages:["gameStart"]`), 90(`burstKey` = 게임당 1회, `scaledUses` 미사용) | 폭발을 `scaledUses(state,1)`(동풍 1 · 반장 2)로, 또는 반장전 가불액 15,000 |
| dora_afterimage | 잔상 | OK | — | dora_afterimage.ts:51(`COOLDOWN_ROUNDS = 2`), 135(`trackRoundSeq`) | 없음 |
| eternal_dealer | 만년 오야 | OK(모드 인지 있음) / 부분 강화 | P2 | eternal_dealer.ts:53-59(`TONPUU_KEEPS=3` → `scaledUses` 3/5), 107-145(상시 오야 배율·역패 동·keepDealer) | 없음. 다만 상시 파트(오야 배율·역패 동)는 스케일 대상이 아님 — 의도 확인 |
| honba_hunter | 본장 사냥꾼 | 강화 | P1 | honba_hunter.ts:22(`HONBA_PER_STICK = 1500`), 38(`setHolderRule`) — 상한 없음 | 본장 수 상한(예: 6본 = +9,000) 도입, 또는 반장전 단가 1,000 |

## P1

### devils_advance — 반장전에서 국당 밀도 절반 (약화)
게임당 총 가치가 **고정**이다: 첫 국 +10,000(:73-78) + 만관 이상 화료 시 상대 3명에게서 3,000씩
1회(:89-118, `burstKey`로 게임당 1회 잠금). `draftStages: ["gameStart"]`(:63)이라 반드시 첫 국에
들어오므로, 이 카드의 총 산출은 두 모드에서 **똑같이 10,000 + 9,000(상대 감소분)**이다.
- 동풍전: 4국 기준, 25,000 시작점 대비 첫 국 +10,000은 즉시 선두. 국당 환산 2,500점.
- 반장전: 8국(+서입·연장 시 그 이상). 국당 환산 1,250점 — **정확히 절반**.
같은 팩의 다른 prism(상시형 aotenjou/ankan_dora/blame_shift)이 반장전에서 발동 횟수가 2배가 되는
동안 이 카드만 총량이 고정이라, 드래프트 4픽 환경에서 상대적 가치가 가장 크게 떨어진다.
저장소에 이미 `scaledUses`(util.ts:141-145, 동풍 N → 반장 ⌈1.5N⌉) 규약이 있고 eternal_dealer가
쓰고 있는데 여기만 안 쓴다.

### honba_hunter — 본장 상한이 없어 긴 판에서 꼬리가 두 배 (강화)
`setHolderRule("score.honbaPerStick", 1500)`(:38) 하나가 전부이고, 주석·detail이 **"상한은 없다"**를
명시한다(:6, :33). 본장은 오야 연장·유국·도중유국으로만 쌓이므로 **국 수에 비례해 최대 도달치가
커진다.**
정량(보수적으로 유국·연장 확률 ~25%/국, 오야 교대 시 리셋):
- 동풍전 4국 — 현실적 최대 연속 본장 3~4본 → 화료 1회에 +4,500~6,000.
- 반장전 8국 — 6~8본 → +9,000~12,000. **꼬리가 정확히 2배.**
- 같은 팩의 eternal_dealer와 겹치면 상한이 더 밀린다: `round.keepDealer` 연장이 동풍전 3회 ·
  반장전 5회(:53-59)이므로 오야 리셋 없이 연속 유국/연장으로 도달 가능한 본장이 반장전에서
  최소 2본 더 높다 → 화료 한 방 +7,500(동풍) vs +12,000(반장).
상시형이라 발동 횟수 2배는 공통 사정이지만, 이 카드는 **1회 발동의 크기 자체가 국 수에 비례해
커지는 유일한 카드**다(다른 상시형은 한 국 안에서 크기가 닫혀 있다: ankan_dora는 안깡 4묶음
= +16판, aotenjou는 판수, blame_shift·scapegoat는 제로섬). 이 그룹에서 유일한 진짜 성장형이다.

## 총평
- 12종 중 **깨짐(P0)은 없다.** 시점 하드코딩(오라스·동4국·남4국·서입)을 쓰는 카드도 없고,
  30,000/토비/우마 같은 고정 점수 임계값을 읽는 카드도 없다 — 이 그룹은 그 축에서는 깨끗하다.
- 국 단위 쿨다운(`COOLDOWN_ROUNDS=2` + `trackRoundSeq`: big_hand, dora_afterimage)과 국 스코프
  1회(scapegoat, blood_contract)는 국 수에 자동 비례해 **두 모드에서 밀도가 같다.** 이 패턴이
  정답 사례다.
- 실제 어긋남은 딱 두 축뿐이다. ① 게임 단위 고정 자원 devils_advance가 반장전에서 국당 절반으로
  희석되고(`scaledUses` 미사용), ② 상한 없는 성장형 honba_hunter의 1회 크기가 국 수에 비례해
  두 배가 된다.
- let_it_ride는 상한 4가, ankan_dora는 안깡 4묶음이, aotenjou는 판수 곡선이 각각 폭주를
  막고 있어 누적형 폭주는 없다. eternal_dealer는 이미 `scaledUses`로 모드를 인지하는 선례다.
- 권고: honba_hunter에 본장 상한을 두고, devils_advance의 폭발을 `scaledUses`로 올린다.
  나머지 10종은 손대지 않는다.
