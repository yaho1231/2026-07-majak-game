import { newHarness, speak, cleanup, tick } from "./harness.js";
async function main() {
  const { rm } = newHarness();
  const a = await speak(rm, { type: "register", username: "타입검사", password: "goodpass123" });
  for (const cur of [123, null, { a: 1 }, undefined]) {
    a.clear();
    a.clientSend({ type: "changePassword", currentPassword: cur, newPassword: "brandnew99" });
    await tick(300);
    console.log("currentPassword =", JSON.stringify(cur), "→", JSON.stringify(a.last("error") ?? a.last("authOk")));
  }
  a.clear();
  a.clientSend({ type: "changePassword", currentPassword: "goodpass123", newPassword: 12345678 });
  await tick(300);
  console.log("newPassword = 숫자 →", JSON.stringify(a.last("error") ?? a.last("authOk")));
  a.clear();
  a.clientSend({ type: "changePassword", currentPassword: "x".repeat(60000), newPassword: "brandnew99" });
  await tick(500);
  console.log("currentPassword 60KB →", JSON.stringify(a.last("error") ?? a.last("authOk")));
  cleanup();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
