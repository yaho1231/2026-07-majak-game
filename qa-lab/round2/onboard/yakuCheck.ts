/** 도움말 «역 목록»이 실제 구현 역(standardYakuList)을 빠짐없이 싣는가 */
import { standardYakuList } from "@majak/core";
import { readFileSync } from "node:fs";

const app = readFileSync("packages/client/src/App.tsx", "utf8");
const block = app.slice(app.indexOf("const HELP_YAKU"), app.indexOf("function YakuTab"));
const helpText = block;
const missing: string[] = [];
for (const y of standardYakuList) {
  // 도움말은 이름을 묶어 적기도 한다 (「해저로월 · 하저로어」·「소사희 · 대사희」)
  if (!helpText.includes(y.name)) missing.push(`${y.id} (${y.name})`);
}
console.log("구현 역:", standardYakuList.length);
console.log("도움말에 없는 역:", missing.length === 0 ? "없음" : missing);
