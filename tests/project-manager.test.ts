import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");

function runCli(args: string[], cwd = repoRoot): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["--import", "tsx", "scripts/project-manager.ts", ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function writeCsv(filePath: string, rows: string[][]): Promise<void> {
  const content = `${rows.map((row) => row.join(",")).join("\n")}\n`;
  await writeFile(filePath, content, "utf8");
}

test("validate passes for template data", async () => {
  const result = await runCli(["validate", "--input-dir", "template"]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Validation passed with no issues\./);
});

test("validate fails for cyclic dependency", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-manager-"));
  await writeCsv(path.join(root, "tasks.csv"), [
    ["task_id", "title", "estimate_days", "due_date", "priority", "depends_on", "status"],
    ["TASK-001", "A", "1", "2026-03-10", "高", "TASK-002", "未着手"],
    ["TASK-002", "B", "1", "2026-03-11", "中", "TASK-001", "未着手"],
  ]);
  await writeCsv(path.join(root, "project.csv"), [
    ["project_name", "start_date", "parallel_task_limit"],
    ["Test", "2026-03-10", "1"],
  ]);

  const result = await runCli(["validate", "--input-dir", root]);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /cyclic dependencies/);
});

test("draft generates gantt and schedule", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-manager-"));
  const inputDir = path.join(root, "data");
  const outputDir = path.join(root, "output");
  await mkdir(inputDir, { recursive: true });
  await writeCsv(path.join(inputDir, "tasks.csv"), [
    ["task_id", "title", "estimate_days", "due_date", "priority", "depends_on", "status"],
    ["TASK-001", "Design", "2", "2026-03-12", "高", "", "完了"],
    ["TASK-002", "Build", "2", "2026-03-14", "中", "TASK-001", "進行中"],
  ]);
  await writeCsv(path.join(inputDir, "project.csv"), [
    ["project_name", "start_date", "parallel_task_limit"],
    ["Test", "2026-03-10", "1"],
  ]);

  const result = await runCli(["draft", "--input-dir", inputDir, "--output-dir", outputDir]);
  const gantt = await readFile(path.join(outputDir, "gantt.mmd"), "utf8");
  const schedule = await readFile(path.join(outputDir, "schedule.csv"), "utf8");

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(gantt, /Design :done, TASK-001, 2026-03-10, 2026-03-11/);
  assert.match(gantt, /Build :active, TASK-002, 2026-03-12, 2026-03-13/);
  assert.match(schedule, /TASK-002,Build,進行中,中,2026-03-12,2026-03-13,2026-03-14,TASK-001/);
});

test("render generates gantt from schedule", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-manager-"));
  const outputDir = path.join(root, "output");
  await mkdir(outputDir, { recursive: true });
  await writeCsv(path.join(root, "project.csv"), [
    ["project_name", "start_date", "parallel_task_limit"],
    ["Adjusted", "2026-03-10", "1"],
  ]);
  await writeCsv(path.join(outputDir, "schedule.csv"), [
    ["task_id", "title", "status", "priority", "start_date", "end_date", "due_date", "depends_on"],
    ["TASK-001", "Adjusted Design", "完了", "高", "2026-03-10", "2026-03-11", "2026-03-12", ""],
    ["TASK-002", "Adjusted Build", "進行中", "中", "2026-03-12", "2026-03-13", "2026-03-14", "TASK-001"],
  ]);

  const result = await runCli([
    "render",
    "--project-file",
    path.join(root, "project.csv"),
    "--schedule-file",
    path.join(outputDir, "schedule.csv"),
    "--output-file",
    path.join(outputDir, "gantt.mmd"),
  ]);
  const gantt = await readFile(path.join(outputDir, "gantt.mmd"), "utf8");

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(gantt, /Adjusted Design :done, TASK-001, 2026-03-10, 2026-03-11/);
  assert.match(gantt, /Adjusted Build :active, TASK-002, 2026-03-12, 2026-03-13/);
});
