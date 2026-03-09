#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TASK_HEADERS = [
  "task_id",
  "title",
  "summary",
  "assignee_id",
  "estimate_days",
  "due_date",
  "priority",
  "depends_on",
  "status",
] as const;
const PROJECT_HEADERS = ["project_name", "start_date"] as const;
const HOLIDAY_HEADERS = ["date", "name"] as const;
const MEMBER_HEADERS = ["member_id", "name", "specialties", "available_from", "available_until"] as const;
const SCHEDULE_HEADERS = [
  "task_id",
  "title",
  "summary",
  "assignee_id",
  "status",
  "priority",
  "start_date",
  "end_date",
  "due_date",
  "depends_on",
] as const;
const TASK_ID_PATTERN = /^TASK-\d{3}$/;
const ALLOWED_PRIORITIES = new Map<Priority, number>([
  ["低", 1],
  ["中", 2],
  ["高", 3],
]);
const ALLOWED_STATUSES = new Set<Status>(["未着手", "進行中", "完了"]);
const MERMAID_STATUS = new Map<Status, string>([
  ["未着手", ""],
  ["進行中", "active"],
  ["完了", "done"],
]);

type Priority = "低" | "中" | "高";
type Status = "未着手" | "進行中" | "完了";

type Task = {
  taskId: string;
  title: string;
  summary: string;
  assigneeId: string;
  estimateDays: number;
  dueDate: string;
  priority: Priority;
  dependsOn: string[];
  status: Status;
  rowIndex: number;
};

type Project = {
  projectName: string;
  startDate: string;
};

type Member = {
  memberId: string;
  name: string;
  specialties: string;
  availableFrom: string;
  availableUntil: string;
};

type ScheduleEntry = {
  task: Task;
  startDate: string;
  endDate: string;
};

type ValidationResult = {
  tasks: Task[];
  project: Project | null;
  members: Member[];
  holidays: Set<string>;
  errors: string[];
  warnings: string[];
};

type CsvRows = {
  headers: string[];
  rows: Record<string, string>[];
};

type ParsedArgs = {
  command: "validate" | "draft" | "render";
  inputDir: string;
  outputDir: string;
  projectFile: string;
  scheduleFile: string;
  outputFile: string;
};

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  if (args.command === "render") {
    const project = await readProjectFile(args.projectFile);
    const schedule = await readScheduleFile(args.scheduleFile);
    await mkdir(path.dirname(args.outputFile), { recursive: true });
    await writeGantt(args.outputFile, project, schedule);
    console.log(`Generated ${args.outputFile}`);
    return 0;
  }

  const validation = await validateInputs(args.inputDir);
  printValidationSummary(validation);

  if (args.command === "validate") {
    return validation.errors.length > 0 ? 1 : 0;
  }

  if (validation.errors.length > 0 || validation.project === null) {
    return 1;
  }

  const schedule = buildSchedule(validation.tasks, validation.project, validation.members, validation.holidays);
  for (const warning of buildDueDateWarnings(schedule)) {
    console.log(`WARNING: ${warning}`);
  }

  await mkdir(args.outputDir, { recursive: true });
  const schedulePath = path.join(args.outputDir, "schedule.csv");
  const ganttPath = path.join(args.outputDir, "gantt.mmd");
  await writeScheduleCsv(schedulePath, schedule);
  console.log(`Generated ${schedulePath}`);
  await writeGantt(ganttPath, validation.project, schedule);
  console.log(`Generated ${ganttPath}`);
  return 0;
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    throw new Error(
      "Usage: project-manager <validate|draft|render> [--project NAME] [--input-dir DIR] [--output-dir DIR] [--project-file FILE] [--schedule-file FILE] [--output-file FILE]",
    );
  }

  const command = argv[0];
  if (command !== "validate" && command !== "draft" && command !== "render") {
    throw new Error(`Unknown command: ${command}`);
  }

  let inputDir = "data";
  let outputDir = "output";
  let projectFile = path.join("data", "project.csv");
  let scheduleFile = path.join("output", "schedule.csv");
  let outputFile = path.join("output", "gantt.mmd");

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      const name = requireValue(argv, index, arg);
      inputDir = path.join("data", name);
      outputDir = path.join("output", name);
      projectFile = path.join(inputDir, "project.csv");
      scheduleFile = path.join(outputDir, "schedule.csv");
      outputFile = path.join(outputDir, "gantt.mmd");
      index += 1;
      continue;
    }
    if (arg === "--input-dir") {
      inputDir = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      outputDir = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--project-file") {
      projectFile = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--schedule-file") {
      scheduleFile = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-file") {
      outputFile = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { command, inputDir, outputDir, projectFile, scheduleFile, outputFile };
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

async function validateInputs(inputDir: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tasksPath = path.join(inputDir, "tasks.csv");
  const projectPath = path.join(inputDir, "project.csv");
  const holidaysPath = path.join(inputDir, "holidays.csv");
  const membersPath = path.join(inputDir, "members.csv");

  const taskRows = await readCsvRows(tasksPath, TASK_HEADERS, errors, true);
  const projectRows = await readCsvRows(projectPath, PROJECT_HEADERS, errors, true);
  const memberRows = await readCsvRows(membersPath, MEMBER_HEADERS, errors, true);
  if (errors.length > 0 || taskRows === null || projectRows === null || memberRows === null) {
    return { tasks: [], project: null, members: [], holidays: new Set(), errors, warnings };
  }

  const holidayRows = await readCsvRows(holidaysPath, HOLIDAY_HEADERS, errors, false);
  const tasks = parseTasks(tasksPath, taskRows.rows, errors, warnings);
  const project = parseProject(projectPath, projectRows.rows, errors, warnings);
  const members = parseMembers(membersPath, memberRows.rows, errors, warnings);
  const holidays = parseHolidays(holidaysPath, holidayRows?.rows ?? [], errors, warnings);

  if (members.length === 0) {
    errors.push(`${membersPath} must contain at least one data row`);
  }

  if (tasks.length > 0) {
    validateTaskDependencies(tasks, errors);
  }
  if (tasks.length > 0 && members.length > 0) {
    validateTaskAssignees(tasks, members, errors);
  }

  return { tasks, project, members, holidays, errors, warnings };
}

async function readCsvRows(
  filePath: string,
  expectedHeaders: readonly string[],
  errors: string[],
  required: boolean,
): Promise<CsvRows | null> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    if (required) {
      errors.push(`Required file is missing: ${filePath}`);
    }
    return null;
  }

  const records = parseCsv(content);
  const headers = records[0] ?? [];
  if (headers.join(",") !== expectedHeaders.join(",")) {
    errors.push(`${filePath} headers must match ${expectedHeaders.join(",")} but got ${headers.join(",")}`);
    return { headers, rows: [] };
  }

  const rows = records.slice(1).filter((row) => row.some((value) => value !== ""));
  return {
    headers,
    rows: rows.map((row) => {
      const entries = headers.map((header, index) => [header, row[index] ?? ""]);
      return Object.fromEntries(entries);
    }),
  };
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentValue += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue !== "" || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function parseTasks(
  filePath: string,
  rows: Record<string, string>[],
  errors: string[],
  warnings: string[],
): Task[] {
  const tasks: Task[] = [];
  const seenIds = new Set<string>();
  const titleCount = new Map<string, number>();

  rows.forEach((row, index) => {
    const lineNo = index + 2;
    const taskId = row.task_id.trim();
    const title = row.title.trim();
    const summary = row.summary.trim();
    const assigneeId = row.assignee_id.trim();
    const estimateRaw = row.estimate_days.trim();
    const dueRaw = row.due_date.trim();
    const priority = row.priority.trim();
    const dependsOn = row.depends_on.split("|").map((value) => value.trim()).filter(Boolean);
    const status = row.status.trim();

    if (!TASK_ID_PATTERN.test(taskId)) {
      errors.push(`${filePath}:${lineNo} invalid task_id: ${taskId}`);
    } else if (seenIds.has(taskId)) {
      errors.push(`${filePath}:${lineNo} duplicate task_id: ${taskId}`);
    } else {
      seenIds.add(taskId);
    }

    const estimateDays = parsePositiveInt(
      estimateRaw,
      `${filePath}:${lineNo} invalid estimate_days: ${estimateRaw}`,
      errors,
    );
    const dueDate = parseIsoDate(dueRaw, `${filePath}:${lineNo} invalid due_date: ${dueRaw}`, errors);

    if (!ALLOWED_PRIORITIES.has(priority as Priority)) {
      errors.push(`${filePath}:${lineNo} invalid priority: ${priority}`);
    }
    if (!ALLOWED_STATUSES.has(status as Status)) {
      errors.push(`${filePath}:${lineNo} invalid status: ${status}`);
    }

    titleCount.set(title, (titleCount.get(title) ?? 0) + 1);

    if (
      TASK_ID_PATTERN.test(taskId) &&
      estimateDays !== null &&
      dueDate !== null &&
      ALLOWED_PRIORITIES.has(priority as Priority) &&
      ALLOWED_STATUSES.has(status as Status)
    ) {
      tasks.push({
        taskId,
        title,
        summary,
        assigneeId,
        estimateDays,
        dueDate,
        priority: priority as Priority,
        dependsOn,
        status: status as Status,
        rowIndex: index + 1,
      });
    }
  });

  for (const [title, count] of [...titleCount.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (title !== "" && count > 1) {
      warnings.push(`${filePath} duplicate title: ${title}`);
    }
  }

  return tasks;
}

function parseMembers(
  filePath: string,
  rows: Record<string, string>[],
  errors: string[],
  warnings: string[],
): Member[] {
  const members: Member[] = [];
  const seenIds = new Set<string>();
  const nameCount = new Map<string, number>();

  rows.forEach((row, index) => {
    const lineNo = index + 2;
    const memberId = row.member_id.trim();
    const name = row.name.trim();
    const specialties = row.specialties.trim();
    const availableFrom = parseIsoDate(
      row.available_from.trim(),
      `${filePath}:${lineNo} invalid available_from: ${row.available_from.trim()}`,
      errors,
    );
    const availableUntil = parseIsoDate(
      row.available_until.trim(),
      `${filePath}:${lineNo} invalid available_until: ${row.available_until.trim()}`,
      errors,
    );

    if (memberId === "") {
      errors.push(`${filePath}:${lineNo} invalid member_id: ${memberId}`);
      return;
    }
    if (seenIds.has(memberId)) {
      errors.push(`${filePath}:${lineNo} duplicate member_id: ${memberId}`);
      return;
    }

    if (availableFrom !== null && availableUntil !== null && availableFrom > availableUntil) {
      errors.push(`${filePath}:${lineNo} available_from must be on or before available_until`);
      return;
    }

    seenIds.add(memberId);
    if (availableFrom === null || availableUntil === null) {
      return;
    }
    members.push({ memberId, name, specialties, availableFrom, availableUntil });
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  });

  for (const [name, count] of [...nameCount.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (name !== "" && count > 1) {
      warnings.push(`${filePath} duplicate name: ${name}`);
    }
  }

  return members;
}

function parseProject(
  filePath: string,
  rows: Record<string, string>[],
  errors: string[],
  warnings: string[],
): Project | null {
  if (rows.length === 0) {
    errors.push(`${filePath} must contain exactly one data row`);
    return null;
  }
  if (rows.length > 1) {
    warnings.push(`${filePath} contains multiple data rows; only the first row will be used`);
  }

  const row = rows[0];
  const startDate = parseIsoDate(
    row.start_date.trim(),
    `${filePath}:2 invalid start_date: ${row.start_date.trim()}`,
    errors,
  );

  if (startDate === null) {
    return null;
  }

  return {
    projectName: row.project_name.trim() || "Project",
    startDate,
  };
}

function parseHolidays(
  filePath: string,
  rows: Record<string, string>[],
  errors: string[],
  warnings: string[],
): Set<string> {
  const holidays = new Set<string>();
  const dateCount = new Map<string, number>();

  rows.forEach((row, index) => {
    const lineNo = index + 2;
    const rawDate = row.date.trim();
    const holidayDate = parseIsoDate(rawDate, `${filePath}:${lineNo} invalid date: ${rawDate}`, errors);
    if (holidayDate !== null) {
      holidays.add(holidayDate);
      dateCount.set(rawDate, (dateCount.get(rawDate) ?? 0) + 1);
    }
  });

  for (const [rawDate, count] of [...dateCount.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > 1) {
      warnings.push(`${filePath} duplicate holiday date: ${rawDate}`);
    }
  }

  return holidays;
}

function parsePositiveInt(rawValue: string, errorMessage: string, errors: string[]): number | null {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) {
    errors.push(errorMessage);
    return null;
  }
  return value;
}

function parseIsoDate(rawValue: string, errorMessage: string, errors: string[]): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    errors.push(errorMessage);
    return null;
  }
  const parsed = new Date(`${rawValue}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || formatDate(parsed) !== rawValue) {
    errors.push(errorMessage);
    return null;
  }
  return rawValue;
}

function validateTaskDependencies(tasks: Task[], errors: string[]): void {
  const taskMap = new Map(tasks.map((task) => [task.taskId, task]));
  const indegree = new Map(tasks.map((task) => [task.taskId, 0]));
  const adjacency = new Map(tasks.map((task) => [task.taskId, [] as string[]]));

  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!taskMap.has(dependency)) {
        errors.push(`tasks.csv dependency references undefined task_id: ${task.taskId} -> ${dependency}`);
        continue;
      }
      adjacency.get(dependency)?.push(task.taskId);
      indegree.set(task.taskId, (indegree.get(task.taskId) ?? 0) + 1);
    }
  }

  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([taskId]) => taskId);
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift() as string;
    visited += 1;
    for (const follower of adjacency.get(current) ?? []) {
      const nextDegree = (indegree.get(follower) ?? 0) - 1;
      indegree.set(follower, nextDegree);
      if (nextDegree === 0) {
        queue.push(follower);
      }
    }
  }

  if (visited !== tasks.length) {
    errors.push("tasks.csv contains cyclic dependencies");
  }
}

function validateTaskAssignees(tasks: Task[], members: Member[], errors: string[]): void {
  const memberIds = new Set(members.map((member) => member.memberId));
  for (const task of tasks) {
    if (task.assigneeId !== "" && !memberIds.has(task.assigneeId)) {
      errors.push(`tasks.csv assignee_id references undefined member_id: ${task.taskId} -> ${task.assigneeId}`);
    }
  }
}

function buildSchedule(tasks: Task[], project: Project, members: Member[], holidays: Set<string>): ScheduleEntry[] {
  const scheduled = new Map<string, ScheduleEntry>();
  const orderedTasks = [...tasks].sort(taskSortKey);

  while (scheduled.size < tasks.length) {
    let progress = false;

    for (const task of orderedTasks) {
      if (scheduled.has(task.taskId)) {
        continue;
      }
      if (task.dependsOn.some((dependency) => !scheduled.has(dependency))) {
        continue;
      }

      let earliest = project.startDate;
      if (task.dependsOn.length > 0) {
        const dependencyEnd = task.dependsOn
          .map((dependency) => scheduled.get(dependency) as ScheduleEntry)
          .map((entry) => entry.endDate)
          .sort()
          .at(-1) as string;
        earliest = nextBusinessDay(addCalendarDays(dependencyEnd, 1), holidays);
      }

      const startDate = findEarliestStart(
        task,
        earliest,
        task.estimateDays,
        [...scheduled.values()],
        members,
        holidays,
      );
      const endDate = addBusinessDays(startDate, task.estimateDays, holidays);
      scheduled.set(task.taskId, { task, startDate, endDate });
      progress = true;
    }

    if (!progress) {
      throw new Error("Unable to build a schedule from the provided tasks.");
    }
  }

  return [...scheduled.values()].sort((left, right) => {
    if (left.startDate !== right.startDate) {
      return left.startDate.localeCompare(right.startDate);
    }
    return taskSortKey(left.task, right.task);
  });
}

function taskSortKey(left: Task, right: Task): number {
  const priorityDiff = (ALLOWED_PRIORITIES.get(right.priority) ?? 0) - (ALLOWED_PRIORITIES.get(left.priority) ?? 0);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }
  return left.rowIndex - right.rowIndex;
}

function nextBusinessDay(candidate: string, holidays: Set<string>): string {
  let current = candidate;
  while (!isBusinessDay(current, holidays)) {
    current = addCalendarDays(current, 1);
  }
  return current;
}

function isBusinessDay(candidate: string, holidays: Set<string>): boolean {
  const date = toUtcDate(candidate);
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(candidate);
}

function addBusinessDays(startDate: string, estimateDays: number, holidays: Set<string>): string {
  let current = nextBusinessDay(startDate, holidays);
  let remaining = estimateDays;
  while (remaining > 1) {
    current = nextBusinessDay(addCalendarDays(current, 1), holidays);
    remaining -= 1;
  }
  return current;
}

function findEarliestStart(
  task: Task,
  earliest: string,
  estimateDays: number,
  existingEntries: ScheduleEntry[],
  members: Member[],
  holidays: Set<string>,
): string {
  let candidate = nextBusinessDay(earliest, holidays);
  while (true) {
    const endDate = addBusinessDays(candidate, estimateDays, holidays);
    if (
      respectsGlobalCapacity(candidate, endDate, existingEntries, members, holidays) &&
      respectsAssigneeAvailability(task, candidate, endDate, members, holidays) &&
      respectsAssigneeLimit(task, candidate, endDate, existingEntries, holidays)
    ) {
      return candidate;
    }
    candidate = nextBusinessDay(addCalendarDays(candidate, 1), holidays);
  }
}

function respectsGlobalCapacity(
  startDate: string,
  endDate: string,
  existingEntries: ScheduleEntry[],
  members: Member[],
  holidays: Set<string>,
): boolean {
  let current = startDate;
  while (current <= endDate) {
    if (isBusinessDay(current, holidays)) {
      let activeCount = 1;
      for (const entry of existingEntries) {
        if (entry.startDate <= current && current <= entry.endDate && isBusinessDay(current, holidays)) {
          activeCount += 1;
        }
      }
      if (activeCount > availableMemberCount(current, members)) {
        return false;
      }
    }
    current = addCalendarDays(current, 1);
  }
  return true;
}

function availableMemberCount(date: string, members: Member[]): number {
  return members.filter((member) => member.availableFrom <= date && date <= member.availableUntil).length;
}

function respectsAssigneeAvailability(
  task: Task,
  startDate: string,
  endDate: string,
  members: Member[],
  holidays: Set<string>,
): boolean {
  if (task.assigneeId === "") {
    return true;
  }

  const member = members.find((candidate) => candidate.memberId === task.assigneeId);
  if (!member) {
    return false;
  }

  let current = startDate;
  while (current <= endDate) {
    if (isBusinessDay(current, holidays) && (current < member.availableFrom || current > member.availableUntil)) {
      return false;
    }
    current = addCalendarDays(current, 1);
  }

  return true;
}

function respectsAssigneeLimit(
  task: Task,
  startDate: string,
  endDate: string,
  existingEntries: ScheduleEntry[],
  holidays: Set<string>,
): boolean {
  if (task.assigneeId === "") {
    return true;
  }

  let current = startDate;
  while (current <= endDate) {
    if (isBusinessDay(current, holidays)) {
      for (const entry of existingEntries) {
        if (entry.task.assigneeId !== task.assigneeId) {
          continue;
        }
        if (entry.startDate <= current && current <= entry.endDate) {
          return false;
        }
      }
    }
    current = addCalendarDays(current, 1);
  }

  return true;
}

function buildDueDateWarnings(schedule: ScheduleEntry[]): string[] {
  return schedule
    .filter((entry) => entry.endDate > entry.task.dueDate)
    .map((entry) => `Task ${entry.task.taskId} ends on ${entry.endDate} after due_date ${entry.task.dueDate}`);
}

async function writeGantt(filePath: string, project: Project, schedule: ScheduleEntry[]): Promise<void> {
  const lines = [
    "gantt",
    `    title ${project.projectName}`,
    "    dateFormat  YYYY-MM-DD",
    "    axisFormat  %Y-%m-%d",
    "    section Tasks",
  ];

  for (const entry of schedule) {
    const mermaidStatus = MERMAID_STATUS.get(entry.task.status) ?? "";
    const displayTitle = formatGanttTaskTitle(entry.task);
    if (mermaidStatus !== "") {
      lines.push(`    ${displayTitle} :${mermaidStatus}, ${entry.task.taskId}, ${entry.startDate}, ${entry.endDate}`);
    } else {
      lines.push(`    ${displayTitle} :${entry.task.taskId}, ${entry.startDate}, ${entry.endDate}`);
    }
  }

  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

function formatGanttTaskTitle(task: Task): string {
  if (task.assigneeId === "") {
    return task.title;
  }
  return `${task.title} [${task.assigneeId}]`;
}

async function writeScheduleCsv(filePath: string, schedule: ScheduleEntry[]): Promise<void> {
  const lines = [
    SCHEDULE_HEADERS.join(","),
    ...schedule.map((entry) =>
      [
        entry.task.taskId,
        escapeCsv(entry.task.title),
        escapeCsv(entry.task.summary),
        entry.task.assigneeId,
        entry.task.status,
        entry.task.priority,
        entry.startDate,
        entry.endDate,
        entry.task.dueDate,
        entry.task.dependsOn.join("|"),
      ].join(","),
    ),
  ];
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function readProjectFile(filePath: string): Promise<Project> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const projectRows = await readCsvRows(filePath, PROJECT_HEADERS, errors, true);
  if (projectRows === null) {
    throw new Error(errors.join("\n"));
  }
  const project = parseProject(filePath, projectRows.rows, errors, warnings);
  for (const warning of warnings) {
    console.log(`WARNING: ${warning}`);
  }
  if (errors.length > 0 || project === null) {
    throw new Error(errors.join("\n"));
  }
  return project;
}

async function readScheduleFile(filePath: string): Promise<ScheduleEntry[]> {
  const errors: string[] = [];
  const scheduleRows = await readCsvRows(filePath, SCHEDULE_HEADERS, errors, true);
  if (scheduleRows === null) {
    throw new Error(errors.join("\n"));
  }

  const entries = scheduleRows.rows
    .map((row, index) => parseScheduleRow(filePath, row, index, errors))
    .filter((entry): entry is ScheduleEntry => entry !== null);

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return entries;
}

function parseScheduleRow(
  filePath: string,
  row: Record<string, string>,
  index: number,
  errors: string[],
): ScheduleEntry | null {
  const lineNo = index + 2;
  const taskId = row.task_id.trim();
  const title = row.title.trim();
  const summary = row.summary.trim();
  const assigneeId = row.assignee_id.trim();
  const status = row.status.trim();
  const priority = row.priority.trim();
  const startDate = parseIsoDate(
    row.start_date.trim(),
    `${filePath}:${lineNo} invalid start_date: ${row.start_date.trim()}`,
    errors,
  );
  const endDate = parseIsoDate(
    row.end_date.trim(),
    `${filePath}:${lineNo} invalid end_date: ${row.end_date.trim()}`,
    errors,
  );
  const dueDate = parseIsoDate(
    row.due_date.trim(),
    `${filePath}:${lineNo} invalid due_date: ${row.due_date.trim()}`,
    errors,
  );

  if (!TASK_ID_PATTERN.test(taskId)) {
    errors.push(`${filePath}:${lineNo} invalid task_id: ${taskId}`);
  }
  if (!ALLOWED_STATUSES.has(status as Status)) {
    errors.push(`${filePath}:${lineNo} invalid status: ${status}`);
  }
  if (!ALLOWED_PRIORITIES.has(priority as Priority)) {
    errors.push(`${filePath}:${lineNo} invalid priority: ${priority}`);
  }
  if (startDate === null || endDate === null || dueDate === null) {
    return null;
  }

  return {
    task: {
      taskId,
      title,
      summary,
      assigneeId,
      estimateDays: businessDaysBetween(startDate, endDate),
      dueDate,
      priority: priority as Priority,
      dependsOn: row.depends_on.split("|").map((value) => value.trim()).filter(Boolean),
      status: status as Status,
      rowIndex: index + 1,
    },
    startDate,
    endDate,
  };
}

function businessDaysBetween(startDate: string, endDate: string): number {
  let count = 0;
  let current = startDate;
  while (current <= endDate) {
    const day = toUtcDate(current).getUTCDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    current = addCalendarDays(current, 1);
  }
  return count;
}

function escapeCsv(value: string): string {
  if (!value.includes(",") && !value.includes("\"") && !value.includes("\n")) {
    return value;
  }
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function printValidationSummary(validation: ValidationResult): void {
  for (const error of validation.errors) {
    console.log(`ERROR: ${error}`);
  }
  for (const warning of validation.warnings) {
    console.log(`WARNING: ${warning}`);
  }
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    console.log("Validation passed with no issues.");
  } else if (validation.errors.length === 0) {
    console.log("Validation passed with warnings.");
  } else {
    console.log("Validation failed.");
  }
}

function addCalendarDays(dateString: string, days: number): string {
  const date = toUtcDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function toUtcDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
