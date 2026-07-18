/**
 * Replay CLI
 *
 * 사용:
 *   npm run replay -w @majak/server -- replays/game.jsonl
 *   npm run replay -w @majak/server -- replays/game.jsonl --viewer p0
 */

import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { buildReplayView, replayFile } from "./ReplayReader.js";

interface ReplayCliArgs {
  path: string;
  viewer: PlayerId | null;
}

function parseArgs(argv: readonly string[]): ReplayCliArgs {
  const args = [...argv];
  const path = args.find((arg) => !arg.startsWith("--"));
  if (path === undefined) {
    throw new Error("Usage: npm run replay -w @majak/server -- <replay.jsonl> [--viewer p0]");
  }
  const viewerFlag = args.findIndex((arg) => arg === "--viewer");
  const viewer = viewerFlag >= 0 ? args[viewerFlag + 1] : undefined;
  return {
    path,
    viewer: viewer === undefined ? null : (viewer as PlayerId),
  };
}

async function main(): Promise<void> {
  const { path, viewer } = parseArgs(process.argv.slice(2));
  const result = await replayFile(path, contentAugments);
  const output =
    viewer === null
      ? result.summary
      : {
          summary: result.summary,
          view: buildReplayView(result.state, viewer, contentAugments),
        };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
