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
    ["task_id", "title", "summary", "assignee_id", "estimate_days", "due_date", "priority", "depends_on", "status"],
    ["TASK-001", "A", "API設計をまとめる", "MEM-001", "1", "2026-03-10", "高", "TASK-002", "未着手"],
    ["TASK-002", "B", "実装前の調査", "MEM-002", "1", "2026-03-11", "中", "TASK-001", "未着手"],
  ]);
  await writeCsv(path.join(root, "members.csv"), [
    ["member_id", "name", "specialties", "available_from", "available_until"],
    ["MEM-001", "佐藤", "設計|要件定義", "2026-03-10", "2026-03-31"],
    ["MEM-002", "佐藤", "調査|実装", "2026-03-10", "2026-03-31"],
  ]);
  await writeCsv(path.join(root, "project.csv"), [
    ["project_name", "start_date"],
    ["Test", "2026-03-10"],
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
    ["task_id", "title", "summary", "assignee_id", "estimate_days", "due_date", "priority", "depends_on", "status"],
    ["TASK-001", "Design", "画面構成と要件を確定する", "MEM-001", "2", "2026-03-12", "高", "", "完了"],
    ["TASK-002", "Build", "画面とAPIを実装する", "MEM-002", "2", "2026-03-14", "中", "TASK-001", "進行中"],
  ]);
  await writeCsv(path.join(inputDir, "members.csv"), [
    ["member_id", "name", "specialties", "available_from", "available_until"],
    ["MEM-001", "Alice", "design|requirements", "2026-03-10", "2026-03-31"],
    ["MEM-002", "Bob", "frontend|backend", "2026-03-10", "2026-03-31"],
  ]);
  await writeCsv(path.join(inputDir, "project.csv"), [
    ["project_name", "start_date"],
    ["Test", "2026-03-10"],
  ]);

  const result = await runCli(["draft", "--input-dir", inputDir, "--output-dir", outputDir]);
  const gantt = await readFile(path.join(outputDir, "gantt.mmd"), "utf8");
  const schedule = await readFile(path.join(outputDir, "schedule.csv"), "utf8");

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(gantt, /Design \[MEM-001\] :done, TASK-001, 2026-03-10, 2026-03-11/);
  assert.match(gantt, /Build \[MEM-002\] :active, TASK-002, 2026-03-12, 2026-03-13/);
  assert.match(
    schedule,
    /TASK-002,Build,画面とAPIを実装する,MEM-002,進行中,中,2026-03-12,2026-03-13,2026-03-14,TASK-001/,
  );
});

test("draft does not overlap tasks assigned to the same member", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-manager-"));
  const inputDir = path.join(root, "data");
  const outputDir = path.join(root, "output");
  await mkdir(inputDir, { recursive: true });
  await writeCsv(path.join(inputDir, "tasks.csv"), [
    ["task_id", "title", "summary", "assignee_id", "estimate_days", "due_date", "priority", "depends_on", "status"],
    ["TASK-001", "API Design", "API設計を行う", "MEM-001", "2", "2026-03-12", "高", "", "未着手"],
    ["TASK-002", "Schema Design", "DB設計を行う", "MEM-001", "2", "2026-03-12", "中", "", "未着手"],
  ]);
  await writeCsv(path.join(inputDir, "members.csv"), [
    ["member_id", "name", "specialties", "available_from", "available_until"],
    ["MEM-001", "佐藤", "設計|API|DB", "2026-03-10", "2026-03-31"],
  ]);
  await writeCsv(path.join(inputDir, "project.csv"), [
    ["project_name", "start_date"],
    ["Test", "2026-03-10"],
  ]);

  const result = await runCli(["draft", "--input-dir", inputDir, "--output-dir", outputDir]);
  const schedule = await readFile(path.join(outputDir, "schedule.csv"), "utf8");

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(schedule, /TASK-001,API Design,API設計を行う,MEM-001,未着手,高,2026-03-10,2026-03-11,2026-03-12,/);
  assert.match(schedule, /TASK-002,Schema Design,DB設計を行う,MEM-001,未着手,中,2026-03-12,2026-03-13,2026-03-12,/);
});

test("draft still overlaps tasks assigned to different members when project capacity allows", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-manager-"));
  const inputDir = path.join(root, "data");
  const outputDir = path.join(root, "output");
  await mkdir(inputDir, { recursive: true });
  await writeCsv(path.join(inputDir, "tasks.csv"), [
    ["task_id", "title", "summary", "assignee_id", "estimate_days", "due_date", "priority", "depends_on", "status"],
    ["TASK-001", "Frontend", "画面を実装する", "MEM-001", "2", "2026-03-12", "高", "", "未着手"],
    ["TASK-002", "Backend", "APIを実装する", "MEM-002", "2", "2026-03-12", "中", "", "未着手"],
  ]);
  await writeCsv(path.join(inputDir, "members.csv"), [
    ["member_id", "name", "specialties", "available_from", "available_until"],
    ["MEM-001", "田中", "frontend|ui", "2026-03-10", "2026-03-31"],
    ["MEM-002", "鈴木", "backend|api", "2026-03-10", "2026-03-31"],
  ]);
  await writeCsv(path.join(inputDir, "project.csv"), [
    ["project_name", "start_date"],
    ["Test", "2026-03-10"],
  ]);

  const result = await runCli(["draft", "--input-dir", inputDir, "--output-dir", outputDir]);
  const schedule = await readFile(path.join(outputDir, "schedule.csv"), "utf8");

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(schedule, /TASK-001,Frontend,画面を実装する,MEM-001,未着手,高,2026-03-10,2026-03-11,2026-03-12,/);
  assert.match(schedule, /TASK-002,Backend,APIを実装する,MEM-002,未着手,中,2026-03-10,2026-03-11,2026-03-12,/);
});

test("render generates gantt from schedule", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-manager-"));
  const outputDir = path.join(root, "output");
  await mkdir(outputDir, { recursive: true });
  await writeCsv(path.join(root, "project.csv"), [
    ["project_name", "start_date"],
    ["Adjusted", "2026-03-10"],
  ]);
  await writeCsv(path.join(outputDir, "schedule.csv"), [
    ["task_id", "title", "summary", "assignee_id", "status", "priority", "start_date", "end_date", "due_date", "depends_on"],
    ["TASK-001", "Adjusted Design", "設計を調整", "MEM-001", "完了", "高", "2026-03-10", "2026-03-11", "2026-03-12", ""],
    ["TASK-002", "Adjusted Build", "実装順を調整", "MEM-002", "進行中", "中", "2026-03-12", "2026-03-13", "2026-03-14", "TASK-001"],
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
  assert.match(gantt, /Adjusted Design \[MEM-001\] :done, TASK-001, 2026-03-10, 2026-03-11/);
  assert.match(gantt, /Adjusted Build \[MEM-002\] :active, TASK-002, 2026-03-12, 2026-03-13/);
});

test("validate fails when assignee_id references undefined member_id", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-manager-"));
  await writeCsv(path.join(root, "tasks.csv"), [
    ["task_id", "title", "summary", "assignee_id", "estimate_days", "due_date", "priority", "depends_on", "status"],
    ["TASK-001", "A", "APIの棚卸し", "MEM-999", "1", "2026-03-10", "高", "", "未着手"],
  ]);
  await writeCsv(path.join(root, "members.csv"), [
    ["member_id", "name", "specialties", "available_from", "available_until"],
    ["MEM-001", "佐藤", "設計", "2026-03-10", "2026-03-31"],
  ]);
  await writeCsv(path.join(root, "project.csv"), [
    ["project_name", "start_date"],
    ["Test", "2026-03-10"],
  ]);

  const result = await runCli(["validate", "--input-dir", root]);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /undefined member_id/);
});

test("draft delays a task until the assigned member becomes available", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-manager-"));
  const inputDir = path.join(root, "data");
  const outputDir = path.join(root, "output");
  await mkdir(inputDir, { recursive: true });
  await writeCsv(path.join(inputDir, "tasks.csv"), [
    ["task_id", "title", "summary", "assignee_id", "estimate_days", "due_date", "priority", "depends_on", "status"],
    ["TASK-001", "Implementation", "実装する", "MEM-001", "2", "2026-03-20", "高", "", "未着手"],
  ]);
  await writeCsv(path.join(inputDir, "members.csv"), [
    ["member_id", "name", "specialties", "available_from", "available_until"],
    ["MEM-001", "鈴木", "implementation", "2026-03-12", "2026-03-31"],
  ]);
  await writeCsv(path.join(inputDir, "project.csv"), [
    ["project_name", "start_date"],
    ["Test", "2026-03-10"],
  ]);

  const result = await runCli(["draft", "--input-dir", inputDir, "--output-dir", outputDir]);
  const schedule = await readFile(path.join(outputDir, "schedule.csv"), "utf8");

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(schedule, /TASK-001,Implementation,実装する,MEM-001,未着手,高,2026-03-12,2026-03-13,2026-03-20,/);
});

test("validate fails when member availability range is invalid", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-manager-"));
  await writeCsv(path.join(root, "tasks.csv"), [
    ["task_id", "title", "summary", "assignee_id", "estimate_days", "due_date", "priority", "depends_on", "status"],
    ["TASK-001", "A", "APIの棚卸し", "MEM-001", "1", "2026-03-10", "高", "", "未着手"],
  ]);
  await writeCsv(path.join(root, "members.csv"), [
    ["member_id", "name", "specialties", "available_from", "available_until"],
    ["MEM-001", "佐藤", "設計", "2026-03-20", "2026-03-10"],
  ]);
  await writeCsv(path.join(root, "project.csv"), [
    ["project_name", "start_date"],
    ["Test", "2026-03-10"],
  ]);

  const result = await runCli(["validate", "--input-dir", root]);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /available_from must be on or before available_until/);
});
