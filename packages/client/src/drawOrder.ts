/**
 * 패산 앞 N장이 **누구의 쯔모가 되는지** — 예지(foresight) 모달의 자리 라벨.
 *
 * 예전에는 `["하가","대면","상가","나"]` 고정 배열이었다. 그러면 역행(`turn.direction`
 * = −1)에서 자리 이름이 통째로 뒤집히고, 후로·깡으로 차례가 건너뛴 뒤에도 예전 순서를
 * 그대로 읽는다 — **정보 증강이 틀린 라벨을 확신 있게 보여 주는** 셈이다
 * (docs/25 정보 계열, 예지 자리 라벨 하드코딩).
 *
 * 지금은 렌더 시점의 `turnSeat`·`direction`에서 매번 다시 계산한다. 공개된 배열은
 * 쯔모가 나올 때마다 앞에서 한 칸씩 소비되므로(foresight의 TILE_DRAWN 반응),
 * 배열 i번째는 **지금 차례인 사람의 i+1번째 다음 자리**가 뽑는다.
 */

/** 4인 기준 상대 자리 이름. 인덱스 = (상대 자리 − 내 자리)를 진행 방향으로 센 값 */
const RELATIVE_LABELS = ["나", "하가", "대면", "상가"] as const;

/**
 * 공개된 패산 앞 `count`장이 각각 누구의 쯔모가 되는지 — 자리 번호 목록.
 *
 * @param turnSeat   지금 차례인 사람의 자리
 * @param direction  진행 방향 (1=시계, −1=역행)
 * @param seatCount  자리 수
 * @param skipNextDrawOf  이 자리(들)의 **다음 한 번** 쯔모는 패산 앞을 쓰지 않는다 — 밑장빼기를
 *   예약해 둔 경우다(content `foresight`도 밑장 쯔모는 앞 장을 소비하지 않는다고 본다). 그 한 번을
 *   건너뛰어 뒤 라벨을 한 칸씩 당긴다. 건너뛰지 않으면 예지 맨 앞 칸에 «나 ★»가 틀리게 선다
 *   (2026-09-25, docs/59 U50 W3 통합 리뷰). 예약은 전원 공개 채널이라 **상대의 예약**도 알 수 있다 —
 *   자리 하나가 아니라 여럿을 받는다(W3 수정 커밋 리뷰: 상가의 예약을 무시해 라벨이 한 칸 밀렸다).
 */
export function projectedDrawSeats(
  turnSeat: number,
  direction: number,
  seatCount: number,
  count: number,
  skipNextDrawOf?: number | readonly number[],
): number[] {
  const step = direction < 0 ? -1 : 1;
  const out: number[] = [];
  const pending = new Set<number>(
    skipNextDrawOf === undefined ? [] : typeof skipNextDrawOf === "number" ? [skipNextDrawOf] : skipNextDrawOf,
  );
  // 자리마다 건너뛰기는 한 번뿐이라 count + (건너뛸 자리 수) 바퀴면 충분하다
  const limit = count + pending.size;
  for (let i = 1; out.length < count && i <= limit; i++) {
    const seat = (((turnSeat + i * step) % seatCount) + seatCount) % seatCount;
    if (pending.has(seat)) {
      pending.delete(seat);
      continue;
    }
    out.push(seat);
  }
  return out;
}

/**
 * 밑장빼기를 예약해 둔 자리들 — 전원 공개 채널 `bottom_deal:armed:{플레이어}`(content bottom_deal
 * `noticeKey`)를 읽는다. `projectedDrawSeats`의 건너뛸 자리로 넘긴다.
 */
export function bottomDealArmedSeats(
  players: readonly { id: string; seat: number }[],
  augmentView: Readonly<Record<string, unknown>>,
): number[] {
  return players.filter((p) => augmentView[`bottom_deal:armed:${p.id}`] === true).map((p) => p.seat);
}

/**
 * 내 자리에서 본 상대 자리의 호칭. 진행 방향을 따라 센다 —
 * 역행이면 "하가"(다음에 두는 사람)도 반대쪽 사람이 된다.
 */
export function relativeSeatLabel(
  mySeat: number,
  theirSeat: number,
  direction: number,
  seatCount: number,
): string {
  const step = direction < 0 ? -1 : 1;
  const diff = (((theirSeat - mySeat) * step % seatCount) + seatCount) % seatCount;
  return RELATIVE_LABELS[diff] ?? `자리 ${theirSeat}`;
}
