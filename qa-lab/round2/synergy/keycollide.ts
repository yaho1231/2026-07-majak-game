/**
 * augmentData 키 충돌 — 서로 다른 증강이 같은 키를 쓰면 한쪽이 다른 쪽을 덮어쓴다.
 * 실게임에서 각 키를 누가(어느 증강 소스가) 썼는지는 알 수 없으므로, 소스에서
 * 키 리터럴/템플릿의 접두사를 뽑아 증강 id 와 대조한다.
 */
import { readdirSync, readFileSync } from "node:fs";
const dir = "packages/content/src/augments/";
const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
const owner = new Map<string, Set<string>>();
for (const f of files) {
  const id = f.replace(/\.ts$/, "");
  const src = readFileSync(dir + f, "utf-8");
  // "foo:bar" / `foo:bar${...}` 꼴의 키 후보 — 콜론이 든 문자열 리터럴
  for (const m of src.matchAll(/[`"']([a-z][a-z0-9_]*:[a-zA-Z0-9_:${}.\-]*)[`"']/g)) {
    const key = m[1]!;
    const pre = key.split(":")[0]!;
    if (pre.length < 4) continue;
    if (!owner.has(pre)) owner.set(pre, new Set());
    owner.get(pre)!.add(id);
  }
}
let n = 0;
for (const [pre, who] of [...owner].sort()) {
  if (who.size > 1) { n++; console.log(`SHARED_PREFIX "${pre}:" ← ${[...who].join(", ")}`); }
}
console.log(`\n공유 접두사 ${n}건 / 접두사 ${owner.size}종`);
