import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vite";

const projectName = process.env.PROJECT_MANAGER_PROJECT ?? "sample";
const repoRoot = process.cwd();
const ganttFilePath = path.resolve(repoRoot, "output", projectName, "gantt.mmd");

function ganttPlugin(): Plugin {
  let devServer: ViteDevServer | undefined;

  return {
    name: "project-manager-gantt-viewer",
    configureServer(server) {
      devServer = server;

      server.middlewares.use("/__gantt", async (_req, res) => {
        try {
          const source = await readFile(ganttFilePath, "utf8");
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(source);
        } catch {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: "Gantt file not found",
              projectName,
              filePath: ganttFilePath,
            }),
          );
        }
      });

      server.watcher.add(ganttFilePath);
      server.watcher.on("change", (changedPath) => {
        if (path.resolve(changedPath) !== ganttFilePath) {
          return;
        }
        server.ws.send({ type: "full-reload" });
      });
      server.watcher.on("add", (addedPath) => {
        if (path.resolve(addedPath) !== ganttFilePath) {
          return;
        }
        server.ws.send({ type: "full-reload" });
      });
    },
    buildStart() {
      this.info(`Watching ${ganttFilePath}`);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/__gantt", async (_req, res) => {
        try {
          const source = await readFile(ganttFilePath, "utf8");
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(source);
        } catch {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: "Gantt file not found",
              projectName,
              filePath: ganttFilePath,
            }),
          );
        }
      });
    },
    transformIndexHtml(html) {
      const envScript = `<script>window.__PROJECT_MANAGER_VIEWER__=${JSON.stringify({
        projectName,
        ganttEndpoint: "/__gantt",
        ganttFilePath,
      })};</script>`;
      return html.replace("</head>", `  ${envScript}\n</head>`);
    },
    closeBundle() {
      devServer = undefined;
    },
  };
}

export default defineConfig({
  plugins: [ganttPlugin()],
  server: {
    host: "127.0.0.1",
  },
  preview: {
    host: "127.0.0.1",
  },
});
