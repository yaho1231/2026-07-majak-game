import { C, signup, autoPlay, sleep, uniq } from "./lib.js";
const { c } = await signup(uniq("D"));
c.onMsg = (m) => {
  if (m.type === "prompt") {
    const list = m.prompt.options ?? [];
    console.log("PROMPT seat", m.prompt.player, "auto", m.prompt.auto, "opts", list.map((o:any)=>o.type).join(","), "deadline", m.deadlineMs);
    const chosen = list.find((o:any)=>o.type==="discard") ?? list.find((o:any)=>o.type==="pass") ?? list[0];
    if (chosen) { console.log("  -> send", chosen.type, JSON.stringify(chosen.payload)); c.send({ type:"action", actionType: chosen.type, payload: chosen.payload ?? {} }); }
  } else if (m.type === "error") console.log("ERROR", m.code, m.message);
  else if (m.type === "draftOffer") { console.log("DRAFT", m.choices.map((x:any)=>x.id).join(",")); c.send({type:"draftPick", stage:m.stage, augmentId:m.choices[0].id}); }
  else if (m.type === "promptCancel") console.log("CANCEL", m.reason, m.chosen);
  else if (m.type === "roundOver") { console.log("ROUNDOVER", m.outcome); c.send({type:"roundContinue"}); }
  else if (m.type === "gameOver") console.log("GAMEOVER");
};
c.send({ type: "createRoom" });
const rc = await c.wait("roomCreated");
c.send({ type: "setGameMode", mode: "tonpuu" });
for (let k=0;k<3;k++){ c.send({type:"addBot"}); await sleep(50); }
await sleep(200); c.send({ type:"startGame" });
await sleep(40000);
process.exit(0);
