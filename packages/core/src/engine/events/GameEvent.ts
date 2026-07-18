/**
 * GameEvent — GameState를 바꿀 수 있는 유일한 수단.
 *
 * 확정된 Event의 순서 있는 목록(Event Log)이 곧 리플레이다.
 * 세부 파이프라인(Action → Event → Effect → GameState)은
 * docs/00_MASTER_ARCHITECTURE.md §4 참조.
 */
export interface GameEvent<TType extends string = string, TPayload = unknown> {
  /** 확정 이벤트 로그 내 순번. Reducer 적용 순서이자 리플레이 순서 */
  seq: number;
  type: TType;
  payload: TPayload;
  /** 이 이벤트를 유발한 이벤트의 seq. 증강 연쇄 추적·디버깅용 */
  causedBy?: number;
}

/** 아직 확정되지 않은 이벤트 제안. Interceptor를 통과해 적용될 때 seq를 받는다 */
export interface ProposedEvent<TType extends string = string, TPayload = unknown> {
  type: TType;
  payload: TPayload;
}
