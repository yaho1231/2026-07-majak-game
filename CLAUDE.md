# newMajak (증강 리치마작)

## 작업 브랜치 → master 자동 반영 규칙 (필수)

사용자가 상시 승인한 규칙이다. 작업이 끝나면 **묻지 않고** 아래를 끝까지 수행한다.

1. **작업은 항상 브랜치에서.** master에 직접 커밋 금지.
2. 커밋 후 `git push -u origin <branch>`.
3. 게이트: **테스트 1585개 전부 통과 + 타입 에러 0**. 기준선과 알려진 플레이크는 [docs/23_TEST_BASELINE.md](docs/23_TEST_BASELINE.md).
   ```
   npm test
   npm run typecheck && npm run typecheck:content && npm run typecheck:server && npm run typecheck:client
   ```
   - 실패가 생기면 머지 금지. 원인을 고친다.
   - 실패가 났을 때 **먼저 그 파일만 단독 실행해 본다** — 병렬 부하 탓 플레이크일 수 있다(기준선 문서에 알려진 1건 있음).
   - 못 고치면 PR을 draft로 두고 사용자에게 보고한다.
   - **워크트리의 vitest는 메인 체크아웃 core를 본다.** `node_modules`가 없어 `@majak/core`가 상위 심볼릭링크로 해석되기 때문이다. core를 고쳤다면 alias 설정으로 한 번 더 돌린다:
     ```
     npx vitest run --config vitest.core.config.ts
     ```
     (타입체크는 tsconfig `paths` 덕에 워크트리 core를 본다 — 그대로 믿어도 된다.)
4. `gh pr create --base master` — 제목은 Conventional Commits, 본문에 변경 요약·검증 결과(테스트/타입체크 통과 여부)를 적는다.
5. `gh pr merge --squash --delete-branch` 로 즉시 병합. (auto-merge가 켜져 있으면 `--auto` 사용)
6. 병합 후 `git checkout master && git pull` 로 로컬 master를 동기화하고, 결과 요약을 사용자에게 보고한다.

### 메인 체크아웃은 항상 master (필수)
`/Users/skul/Documents/newMajak` 는 **공개 서버가 서빙하는 코드**다(`deploy/serve.sh` → `majak.yaho1231.com`). 여기서 다른 브랜치를 체크아웃하면 그 브랜치가 그대로 배포된다 — 실제로 이 저장소가 `c45dbab`(막다른 커밋)에 며칠간 서 있어서 PR #1·#5·#4·#3 이 전부 서버에 반영되지 않았다.

- 메인 체크아웃은 `master` 고정. 갱신은 `git pull` 만.
- 작업은 워크트리에서 한다.
- master 갱신 후 배포: `npm run serve` (클라 빌드 + 서버 재시작 포함). 확인은 서빙되는 에셋 해시가 방금 빌드한 `packages/client/dist/assets/` 와 일치하는지 본다.

### 절대 하지 않는 것
- `git push --force`, force-with-lease, master에 대한 강제 갱신
- 브랜치·태그·원격 참조 삭제 (병합된 PR의 소스 브랜치 삭제는 예외)
- 이미 병합된 오래된 브랜치에 새 작업을 머지하기 → **과거에 이걸로 변경사항이 유실됐다** (`c45dbab` 참고)

### 브랜치 분기 규칙
새 브랜치는 **반드시 최신 `origin/master`에서** 딴다. 여러 브랜치가 같은 base에서 동시에 갈라지면 하나가 누락되기 쉽다. 작업 시작 전 `git fetch origin && git checkout -b <branch> origin/master`.

### 머지 안 된 변경 정기 점검
master에 안 들어간 커밋이 남아 있는지 확인:
```
git fetch --all
for b in $(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes | grep -v HEAD); do
  n=$(git rev-list --count origin/master..$b 2>/dev/null); [ "${n:-0}" -gt 0 ] && echo "$n  $b"
done
```

## 프로젝트 구조
- `packages/core` — 마작 룰 엔진 + 증강 훅
- `packages/content` — 증강 104종 구현 및 테스트
- `packages/server` — 게임 서버, 봇
- `packages/client` — React 클라이언트
- `docs/` — 설계·감사 문서

## 테스트
`npm test` (vitest). 증강 관련 변경은 `packages/content/test/` 에 회귀 테스트를 추가한다.
