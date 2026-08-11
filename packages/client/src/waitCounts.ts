/**
 * 오름패 옆에 붙는 **남은 장수(장 세기)** 계산.
 *
 * "이 오름패가 기본 4장 중 몇 장 아직 안 보이는가" — 사람이 탁자에서 손으로 세는 그
 * 값이다. 대기가 넓어도 남은 장수가 0이면 그 대기는 죽어 있고, 3장 남은 대기는
 * 같은 모양이라도 훨씬 두껍다. 오름패를 크게 띄우면서 이 숫자를 같이 주지 않으면
 * "무슨 패인지"만 알고 "먹을 수 있는지"는 여전히 모른다.
 *
 * ## 세는 곳 = 화면에 보이는 곳뿐
 * 전원 버림패 · 공개된 후로 · 공개된 도라 표시패 · **뷰어 본인의 손패**.
 * 남의 비공개 손패와 패산은 절대 보지 않는다 — 정보 비대칭이 이 게임의 규칙이라
 * 클라이언트가 몰래 세면 그건 룰 위반이다. (뷰에 애초에 안 실려 오지만, zone을
 * 명시적으로 골라 세는 편이 나중에 뷰가 넓어져도 안전하다.)
 *
 * 그래서 이 값은 "확정 잔량"이 아니라 **"아직 어딘가 숨어 있을 수 있는 장수"**다.
 * 남의 손에 쥐여 있어도 여기서는 남은 것으로 센다 — 사람이 세는 것과 같다.
 *
 * ## ⚠ 증강 생성패(`attrs.conjured`)는 세지 않는다
 * 증강은 "없던 패를 준다"를 기존 타일의 kind를 덮어쓰는 방식으로 구현하므로 같은
 * 종류가 5장 이상 존재할 수 있다(docs/25 P8 — 프리즘의 의도된 상식 파괴). 생성패를
 * 진짜 패로 세면 아직 1장 남은 대기를 "다 나갔다"고 표시하게 된다 — 화면이 거짓말을
 * 하는 쪽이 가장 나쁘다. 봇의 `tileTracker`(server/bot/danger.ts)도 같은 이유로 같은
 * 규칙을 쓴다. 사람과 봇이 같은 정보를 본다.
 *
 * (한계: 덮어쓰기 전의 종류는 복원할 수 없어 그 원래 종류는 실제보다 한 장 더 남은
 * 것으로 센다. 봇 쪽과 동일한 한계다.)
 */

import { discardsZone, handZone, kindKey, meldsZone } from "@majak/core";
import type { TileKind } from "@majak/core";

/**
 * 계산에 필요한 뷰의 최소 형태. `PlayerView`가 그대로 들어맞고, 테스트는 이 모양만
 * 손으로 만들면 된다(뷰 전체를 흉내 낼 필요가 없다).
 */
export interface RemainingSource {
  tiles: Readonly<Record<number, { kind: TileKind; attrs?: { conjured?: boolean } } | undefined>>;
  zones: Readonly<Record<string, { tileIds: readonly number[] } | undefined>>;
  players: readonly { id: string }[];
  round: { doraIndicators: readonly number[] };
}

/** 기본 구성 장수 — 모든 종류가 4장이다. 생성패는 이 셈 밖이다. */
export const TILES_PER_KIND = 4;

/**
 * 뷰어에게 보이는 곳에 나온 종류별 장수(생성패 제외).
 *
 * @param handOwner 손패를 셀 사람. 뷰어 본인(관전이면 하단 시점 좌석)만 넘긴다 —
 *                  여기에 남을 넣으면 안 보여야 할 손패를 세게 된다.
 */
export function seenKindCounts(
  src: RemainingSource,
  handOwner: string | null,
): Map<string, number> {
  const seen = new Map<string, number>();
  const bump = (id: number): void => {
    const tile = src.tiles[id];
    if (tile === undefined) return; // 뒷면(뷰에 정체가 안 실린 패) — 셀 수 없다
    if (tile.attrs?.conjured === true) return; // 증강 생성패 — 진짜 장수가 아니다
    const key = kindKey(tile.kind);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  };
  const countZone = (zoneId: string): void => {
    for (const id of src.zones[zoneId]?.tileIds ?? []) bump(id);
  };
  if (handOwner !== null) countZone(handZone(handOwner));
  for (const p of src.players) {
    countZone(discardsZone(p.id));
    countZone(meldsZone(p.id));
  }
  for (const id of src.round.doraIndicators) bump(id);
  return seen;
}

/**
 * "이 종류가 아직 몇 장 남았나"를 돌려주는 함수를 만든다. 0~4.
 *
 * 생성패 때문에 같은 종류가 4장을 넘어 보일 수 있으므로 아래로도 자른다.
 */
export function remainingCounter(
  src: RemainingSource,
  handOwner: string | null,
): (kind: TileKind) => number {
  const seen = seenKindCounts(src, handOwner);
  return (kind) => Math.max(0, TILES_PER_KIND - (seen.get(kindKey(kind)) ?? 0));
}
