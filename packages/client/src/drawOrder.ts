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
 */
export function projectedDrawSeats(
  turnSeat: number,
  direction: number,
  seatCount: number,
  count: number,
): number[] {
  const step = direction < 0 ? -1 : 1;
  const out: number[] = [];
  for (let i = 1; i <= count; i++) {
    out.push((((turnSeat + i * step) % seatCount) + seatCount) % seatCount);
  }
  return out;
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
