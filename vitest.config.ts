import { configDefaults, defineConfig } from "vitest/config";

/**
 * 설정이 없으면 vitest 기본 exclude에 `.claude/`가 없어서 **워크트리 안의
 * 테스트까지 전부 긁어 온다**. 워크트리 10개가 붙어 있던 시점에 실제로
 * 테스트 파일 99개 → 981개, 실행 시간 165초 → 879초가 됐고, 사본들이 같은
 * 임시 디렉터리 이름을 동시에 쓰다 `ENOTEMPTY`로 무관한 파일이 줄줄이
 * 실패했다. 무엇보다 "master의 테스트 결과"를 신뢰할 수 없게 된다.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
