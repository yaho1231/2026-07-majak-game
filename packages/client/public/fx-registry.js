/* MAJAK 증강 연출 랩 — 연출 레지스트리
 *
 * 연출 모듈들이 여기에 등록하고 UI(fx-lab.js)가 여기서 읽는다.
 * 연출을 추가할 때 UI 코드를 건드리지 않게 하려고 분리했다 — 배치가 계속 늘어날 예정이다.
 */

export const EFFECTS = [];

/** 연출 하나 등록. { id, name, tier, fam, tag, tech, run(tok) } */
export const def = (o) => EFFECTS.push(o);
