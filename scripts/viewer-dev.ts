#!/usr/bin/env node

import path from "node:path";
import { createServer } from "vite";

type ViewerArgs = {
  projectName: string;
};

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  process.env.PROJECT_MANAGER_PROJECT = args.projectName;

  const server = await createServer({
    configFile: path.resolve("vite.config.ts"),
    server: {
      open: false,
    },
  });

  await server.listen();

  const resolvedUrls = server.resolvedUrls;
  const localUrl = resolvedUrls?.local[0] ?? "http://127.0.0.1:5173";
  console.log(`Viewer ready for project ${args.projectName}`);
  console.log(`Open ${localUrl}`);
  console.log(`Watching output/${args.projectName}/gantt.mmd`);

  const closeServer = async (): Promise<void> => {
    await server.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void closeServer();
  });
  process.once("SIGTERM", () => {
    void closeServer();
  });

  return new Promise<number>(() => {
    // Keep the process alive until terminated.
  });
}

function parseArgs(argv: string[]): ViewerArgs {
  let projectName: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      projectName = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!projectName) {
    throw new Error("Specify --project NAME for viewer");
  }

  return { projectName };
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

void main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
