/**
 * 우클릭 기본 메뉴 차단 — 우클릭을 **게임 입력**으로 쓰기 위해 자리를 비운다
 * (2026-08-07 사용자 지시: 쯔모기리를 우클릭에 걸 예정).
 *
 * 브라우저 메뉴가 뜨면 판 위에서 오른쪽 버튼을 쓰는 순간 메뉴가 화면을 덮고,
 * 그 아래에서 일어난 게임 동작은 눌린 줄도 모르게 지나간다. 그래서 문서 전체에서 막는다.
 *
 * ⚠ **글자를 치는 칸은 예외다.** 로그인·닉네임·방 코드 칸에서 메뉴를 막으면
 * 붙여넣기·전체선택·맞춤법 같은 표준 수단이 통째로 사라진다 — 비밀번호 관리자를
 * 쓰는 사람에게는 로그인 자체가 막히는 셈이다. 게임 입력과 겹치지도 않는 자리다.
 *
 * 이건 **복사 방지가 아니다.** 판 위의 글자는 선택·복사가 그대로 되고(우클릭 메뉴만
 * 안 뜬다), 키보드 단축키(⌘/Ctrl + C)도 손대지 않는다.
 */

/** 지금 글자를 치는 칸인가 — 여기서는 브라우저 메뉴를 그대로 둔다. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (el === null || typeof el.closest !== "function") return false;
  // closest로 올라가는 이유: contenteditable 안의 글자 노드·자식 span에서 눌러도
  // "치는 칸 안"이다. tagName만 보면 그 경우를 놓친다.
  return el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']") !== null;
}

/** 앱 부팅 시 1회. 해제 함수를 돌려준다(테스트·HMR용). */
export function blockContextMenu(): () => void {
  const onContextMenu = (e: MouseEvent): void => {
    if (isTypingTarget(e.target)) return;
    e.preventDefault();
  };
  window.addEventListener("contextmenu", onContextMenu);
  return () => window.removeEventListener("contextmenu", onContextMenu);
}
