/**
 * **감시자의 복구가 실제로 복구인가** (QA 2차 server 확정 3).
 *
 * 감시자가 스스로 적어 둔 판단 기준은 "프로세스가 있느냐"가 아니라 `/healthz` 응답이다.
 * 그런데 복구 수단이 `serve.sh start` 였다: `majak.sh start` 는 첫 줄에서
 * `is_running`(PID 파일 + `kill -0`)을 보고 «이미 실행 중입니다»를 찍은 뒤 **종료코드
 * 0으로 즉시 반환**한다. 감시자는 그걸 성공으로 읽어 "다시 세움 완료"를 남기고
 * gaveup 표식을 지우고 «자동 복구는 성공» 알림까지 보낸다 — 실제로는 아무 것도 하지
 * 않았고 서버는 계속 죽어 있는데.
 *
 * 그리고 그게 가장 흔한 운영 고장이다(프로세스는 살아 있는데 서비스가 멎음). 서버가
 * 스스로 «응답은 오는데 정상이 아니다»를 말하는 유일한 경로인 `/healthz`의 HTTP 500도
 * 여기로 들어오는데, 받는 쪽에 실행할 수단이 없었다. 15분에 3회를 채우면 "부팅 자체가
 * 깨졌다"는 **틀린 진단**과 함께 포기한다.
 *
 * 격리 ROOT에서 실측한 전후 (2026-08-21):
 *   before(`start`): "이미 실행 중입니다 (pid …)" → "다시 세움 완료" → 3987 여전히 죽음
 *   after (`restart`): 굳은 프로세스를 치우고 다시 세움 → `/healthz` {"ok":true}
 *
 * 여기서는 셸을 돌리지 않고 **어느 명령을 부르는가**만 못 박는다 — 실제 복구는
 * launchd·포트·빌드가 얽혀 있어 단위 테스트에 담을 것이 아니고, 되돌아갈 수 있는
 * 한 줄(`start` ↔ `restart`)이 정확히 이 결함의 전부다. (`BackupCoverage.test.ts`와
 * 같은 방식이다.)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const WATCHDOG = readFileSync(join(REPO, "scripts/watchdog.sh"), "utf8");
const MAJAK = readFileSync(join(REPO, "scripts/majak.sh"), "utf8");

/**
 * 감시자가 «복구» 하려고 **실제로 실행하는** serve.sh 하위명령들.
 *
 * 실행되는 것만 센다: `bash "$ROOT/deploy/serve.sh" …` 형태다. 알림 문구 안에도
 * `bash deploy/serve.sh status` 같은 문장이 들어 있는데(사람이 손으로 칠 명령이다)
 * 그건 코드가 아니라 안내문이라 `$ROOT` 유무로 갈라낸다.
 * 상태 조회(`health`)는 복구가 아니므로 뺀다.
 */
function recoveryCommands(): string[] {
  const out: string[] = [];
  for (const m of WATCHDOG.matchAll(/\$ROOT\/deploy\/serve\.sh"\s+(\w+)/g)) {
    const sub = m[1]!;
    if (sub !== "health") out.push(sub);
  }
  return out;
}

describe("감시자의 자동 복구", () => {
  it("복구를 restart 로 한다 — start 는 이미 살아 있는 프로세스 앞에서 no-op 이다", () => {
    const cmds = recoveryCommands();
    expect(cmds, "감시자가 serve.sh 로 복구를 시도하는 자리가 없다").toContain("restart");
    expect(
      cmds,
      "복구를 `serve.sh start` 로 하고 있다 — majak.sh 가 «이미 실행 중»으로 exit 0 해서 " +
        "감시자가 아무 것도 안 하고 «다시 세움 완료»를 보고한다 (QA 2차 server 확정 3)",
    ).not.toContain("start");
  });

  it("`majak.sh start` 는 여전히 살아 있는 프로세스 앞에서 즉시 반환한다 (이 결함의 전제)", () => {
    /*
     * 이 전제가 사라지면(= start 가 재기동까지 하게 되면) 위 테스트의 근거가 바뀐다.
     * 그때는 두 테스트를 함께 다시 보라는 뜻으로 여기 남겨 둔다.
     */
    expect(MAJAK).toMatch(/start\(\)\s*\{\s*\n\s*if is_running; then/);
    expect(MAJAK).toContain("이미 실행 중입니다");
  });

  it("restart 는 빌드가 성공했을 때만 서버를 교체한다 (내려간 채로 남지 않는다)", () => {
    /*
     * `start` → `restart` 로 바꾸는 것이 안전한 이유다. 예전에는 stop → 빌드 → start
     * 순서라 빌드가 깨진 커밋을 배포하면 서버가 내려간 채로 남았다(2026-08-17에 고쳤다).
     * 감시자가 1분마다 restart 를 부를 수 있으려면 그 순서가 유지돼야 한다.
     */
    const restartBody = /restart\)\n([\s\S]*?)\n\s*status\)/.exec(MAJAK)?.[1] ?? "";
    expect(restartBody, "majak.sh 의 restart 분기를 못 찾았다").not.toBe("");
    const buildAt = restartBody.indexOf("build_client");
    const stopAt = restartBody.indexOf("stop --for-restart");
    expect(buildAt, "restart 가 빌드를 먼저 하지 않는다").toBeGreaterThanOrEqual(0);
    expect(stopAt).toBeGreaterThan(buildAt);
    expect(restartBody, "빌드 실패 시 돌고 있던 서버를 그대로 둬야 한다").toContain("exit 1");
  });
});
