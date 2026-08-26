# 이능마작 (저장소 이름: newMajak)

## 작업 브랜치 → master 자동 반영 규칙 (필수)

사용자가 상시 승인한 규칙이다. 작업이 끝나면 **묻지 않고** 아래를 끝까지 수행한다.

1. **작업은 항상 브랜치에서.** master에 직접 커밋 금지.
2. 커밋 후 `git push -u origin <branch>`.
3. 게이트: **테스트 전부 통과 + 타입 에러 0**. 현재 기준선 개수와 알려진 플레이크는 [docs/23_TEST_BASELINE.md](docs/23_TEST_BASELINE.md)가 단일 진실이다 — 이 파일에 개수를 적어 두면 곧 낡는다.
   ```
   npm test
   npm run typecheck && npm run typecheck:content && npm run typecheck:server && npm run typecheck:client
   ```
   - 실패가 생기면 머지 금지. 원인을 고친다.
   - 실패가 났을 때 **먼저 그 파일만 단독 실행해 본다** — 병렬 부하 탓 플레이크일 수 있다(기준선 문서에 알려진 것들이 있다).
   - 못 고치면 PR을 draft로 두고 사용자에게 보고한다.
   - **워크트리에서는 먼저 workspace 링크를 만든다 (필수).** 워크트리의 `node_modules`에는 vite 캐시만 있고 `@majak` 디렉터리가 없어서, `@majak/*` 해석이 상위 메인 체크아웃으로 올라가 **master의 소스**로 간다. 링크를 만들지 않으면 `npm test`와 **타입체크 4종 전부** 워크트리 코드가 아니라 master를 검사한다(`tsconfig.base.json`에는 `paths`가 없다 — 2026-08-07 확인):
     ```
     mkdir -p node_modules/@majak
     for p in core content server client; do ln -sfn ../../packages/$p node_modules/@majak/$p; done
     ```
     확인: `node -e "console.log(require('fs').realpathSync('node_modules/@majak/core'))"` 가 워크트리 경로를 찍어야 한다. `node_modules/`는 .gitignore 대상이라 커밋에 영향이 없다.
4. `gh pr create --base master` — 제목은 Conventional Commits, 본문에 변경 요약·검증 결과(테스트/타입체크 통과 여부)를 적는다.
5. `gh pr merge --squash --delete-branch` 로 즉시 병합. **CI를 기다리지 않는다** — `--auto` 금지, `gh pr checks` 대기 금지.
6. 병합 후 `git checkout master && git pull` 로 로컬 master를 동기화하고, 결과 요약을 사용자에게 보고한다.

### GitHub Actions CI는 꺼져 있다 (2026-08-17)
Actions 무료 한도를 다 써서 런이 계속 실패 메일을 보냈다. `.github/workflows/ci.yml` 은 **수동 비활성화** 상태다(`gh workflow disable CI`). 유일한 게이트는 위 3번의 **로컬** `npm test` + 타입체크 4종이다 — 이건 그대로 지킨다.

- 다시 켜려면: `gh workflow enable CI`
- 워크플로 파일은 남겨 둔다(한도가 리셋되거나 저장소를 공개로 바꾸면 그대로 쓴다).

### 메인 체크아웃은 항상 master (필수)
`/Users/skul/majak` 는 **공개 서버가 서빙하는 코드**다(`deploy/serve.sh` → `majak.yaho1231.com`). 여기서 다른 브랜치를 체크아웃하면 그 브랜치가 그대로 배포된다 — 실제로 이 저장소가 `c45dbab`(막다른 커밋)에 며칠간 서 있어서 PR #1·#5·#4·#3 이 전부 서버에 반영되지 않았다.

- 메인 체크아웃은 `master` 고정. 갱신은 `git pull` 만.
- 작업은 워크트리에서 한다.
- master 갱신 후 배포: `npm run serve` (클라 빌드 + 서버 재시작 포함). 확인은 서빙되는 에셋 해시가 방금 빌드한 `packages/client/dist/assets/` 와 일치하는지 본다.
  - ⚠ **이미 떠 있는 공개 서버를 갈아 끼울 때는 `bash deploy/serve.sh restart` 다.** `npm run serve`는 `serve.sh start`라서 "이미 실행 중입니다"만 찍고 **아무것도 바꾸지 않는다**.
  - ⚠ **`npm run restart` 는 공개 서버용이 아니다.** 그건 `scripts/majak.sh` 직행이라 `deploy/majak.env`(PORT=3011 등)를 읽지 않는다 — 공개 서버(3011)를 죽이고 **개발 기본 포트 3001로** 다시 세운다. 2026-08-26에 이걸로 사이트가 35초 내려갔다. 공개 서버는 언제나 `deploy/serve.sh` 로만 다룬다.
- `restart` 는 **빌드를 먼저 하고 성공했을 때만** 서버를 교체한다(2026-08-17). 예전에는 stop → 빌드 → start 순서라 빌드가 깨진 커밋을 배포하면 서버가 내려간 채로 남았다.

### 서버 감시자 + 백업 (launchd)
`npm run agents:install` 로 **감시자와 백업을 함께** 등록한다. 감시자는 1분마다 `/healthz`를 보고 응답이 없을 때 `serve.sh start`로 되살리고(RunAtLoad라 로그인 직후에도 한 번 돈다 = 재부팅 후 자동 기동 경로), 백업은 매일 04:30에 DB 스냅샷 + 리플레이 미러를 뜬다. 배포 중 `stop`만 되고 `start`가 오지 않아 서버가 조용히 꺼져 있던 구간(2026-08-08 새벽 53분·5시간)이 감시자를 만든 이유다.

- **등록됐다 ≠ 돈다.** `npm run agents` 는 등록 여부가 아니라 **마지막 실행의 종료코드**를 본다. 2026-08-17 감사에서 감시자가 등록돼 있다고 문서에 적혀 있는데 실제로는 한 번도 돈 적이 없었다 — 원인은 macOS TCC였다(저장소가 `~/Documents` 아래라 launchd가 띄운 프로세스의 파일 접근이 막힌다).
- **2026-08-18에 저장소를 `~/majak` 으로 옮겨 그 원인을 없앴다** (`deploy/relocate.sh`, 사용자 결정). 옮긴 직후 `agents.sh status` 가 감시자·백업 모두 **"등록됨 · 정상"** 으로 바뀌었다 — 등록만이 아니라 **실제로 돈다**는 뜻이다(같은 자리에서 백업도 한 번 돌았다). 워크트리 22개는 `git worktree repair` 로 함께 따라왔고 커밋되지 않은 변경도 그대로다.
  - ⚠ **다시 `~/Documents`·`~/Desktop`·`~/Downloads` 아래로 옮기지 마라.** 그 순간 감시자·백업이 조용히 다시 죽는다(등록은 계속 성공한다).
- **플리스트에 `AbandonProcessGroup` 이 반드시 있어야 한다 (2026-08-19).** 없으면 launchd가
  작업 종료와 함께 프로세스 그룹을 SIGTERM으로 쓸어서, 감시자가 **방금 세운 서버를 스스로
  죽인다** — 1분 주기 재시작 폭주가 된다. 플리스트는 `install` 때만 다시 쓰이므로 낡은
  플리스트가 남아 있으면 계속 폭주한다: `npm run agents:install` 로 다시 쓴다. 자세한 건
  [DEPLOYMENT.md §6-1](DEPLOYMENT.md).
- 조용한 실패를 없애려고 알림을 붙였다: 감시자 포기·복구 실패·백업 실패는 `.majak/alerts.log` + macOS 알림 센터, `NOTIFY_WEBHOOK_URL`을 설정하면 웹훅으로도 나간다.
- 백업 상세와 복구 절차는 [DEPLOYMENT.md §6](DEPLOYMENT.md).

- `npm stop` 은 `.majak/paused` 를 남긴다 → 감시자가 손대지 않는다. 다시 켜려면 `npm start`.
- `npm run restart` / `serve.sh restart` 는 표식을 남기지 않는다 → 중간에 끊겨도 감시자가 이어서 세운다.
- 15분 안에 3번 넘게 되살리면 멈추고 로그에 적는다(부팅 자체가 깨진 상황). 로그는 `.majak/watchdog.log`.
- LaunchAgent라 **로그인 세션에서만** 돈다.

### 절대 하지 않는 것
- `git push --force`, force-with-lease, master에 대한 강제 갱신
- 브랜치·태그·원격 참조 삭제 (병합된 PR의 소스 브랜치 삭제는 예외)
- 이미 병합된 오래된 브랜치에 새 작업을 머지하기 → **과거에 이걸로 변경사항이 유실됐다** (`c45dbab` 참고)
- **작업 중인 파일에 `git checkout -- <path>` · `git restore` · `git stash`** → 2026-08-23에 이걸로 **미커밋 CSS 722줄이 통째로 날아갔다.** 커밋이 없는 브랜치에서 그 명령은 «내 변경만 되돌린다»가 아니라 **«master로 되돌린다»** 다. 되돌릴 일이 있으면 파일을 직접 편집한다.
- **`pkill -f <패턴>` 으로 프로세스 죽이기** → 2026-08-23에 테스트 서버를 정리하려던 패턴이 **공개 서버(3011)까지 잡아** 사이트가 60~90초 내려갔다. 죽일 것은 **PID로** 지정한다. 공개 서버는 `deploy/serve.sh` 로만 다룬다.

### 오래 미커밋으로 두지 않는다
브랜치에서 몇 시간짜리 작업을 커밋 없이 워킹트리에만 두면, 위의 사고 하나로 전부 사라진다. 게이트를 아직 못 통과했어도 **`wip:` 커밋으로 먼저 붙잡아 둔다** — 커밋은 되돌릴 수 있고 워킹트리는 되돌릴 수 없다. 여러 에이전트가 같은 워크트리에서 동시에 일할 때는 특히 그렇다.

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
