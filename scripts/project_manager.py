#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import Counter, deque
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable, Optional


TASK_HEADERS = [
    "task_id",
    "title",
    "estimate_days",
    "due_date",
    "priority",
    "depends_on",
    "status",
]
PROJECT_HEADERS = ["project_name", "start_date", "parallel_task_limit"]
HOLIDAY_HEADERS = ["date", "name"]
TASK_ID_PATTERN = re.compile(r"^TASK-\d{3}$")
ALLOWED_PRIORITIES = {"低": 1, "中": 2, "高": 3}
ALLOWED_STATUSES = {"未着手", "進行中", "完了"}
MERMAID_STATUS = {"未着手": "", "進行中": "active", "完了": "done"}


@dataclass(frozen=True)
class Task:
    task_id: str
    title: str
    estimate_days: int
    due_date: date
    priority: str
    depends_on: tuple[str, ...]
    status: str
    row_index: int


@dataclass(frozen=True)
class Project:
    project_name: str
    start_date: date
    parallel_task_limit: int


@dataclass(frozen=True)
class ScheduleEntry:
    task: Task
    start_date: date
    end_date: date


@dataclass(frozen=True)
class ValidationResult:
    tasks: list[Task]
    project: Optional[Project]
    holidays: set[date]
    errors: list[str]
    warnings: list[str]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Project planning helper for Codex CLI.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="Validate input CSV files.")
    add_common_input_arguments(validate_parser)

    plan_parser = subparsers.add_parser("plan", help="Generate a schedule and gantt.mmd.")
    add_common_input_arguments(plan_parser)
    plan_parser.add_argument(
        "--output-dir",
        default="output",
        help="Directory to write generated files into. Default: output",
    )
    plan_parser.add_argument(
        "--write-schedule",
        action="store_true",
        help="Also write schedule.csv alongside gantt.mmd.",
    )

    return parser.parse_args(argv)


def add_common_input_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--input-dir",
        default="data",
        help="Directory containing tasks.csv, project.csv and optional holidays.csv. Default: data",
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    input_dir = Path(args.input_dir)
    validation = validate_inputs(input_dir)
    print_validation_summary(validation)

    if args.command == "validate":
        return 1 if validation.errors else 0

    if validation.errors:
        return 1

    assert validation.project is not None
    schedule = build_schedule(validation.tasks, validation.project, validation.holidays)
    due_warnings = build_due_date_warnings(schedule)
    for warning in due_warnings:
        print(f"WARNING: {warning}")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    write_gantt(output_dir / "gantt.mmd", validation.project, schedule)
    print(f"Generated {output_dir / 'gantt.mmd'}")

    if args.write_schedule:
        write_schedule_csv(output_dir / "schedule.csv", schedule)
        print(f"Generated {output_dir / 'schedule.csv'}")

    return 0


def validate_inputs(input_dir: Path) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    tasks_path = input_dir / "tasks.csv"
    project_path = input_dir / "project.csv"
    holidays_path = input_dir / "holidays.csv"

    if not tasks_path.exists():
        errors.append(f"Required file is missing: {tasks_path}")
    if not project_path.exists():
        errors.append(f"Required file is missing: {project_path}")
    if errors:
        return ValidationResult([], None, set(), errors, warnings)

    tasks = parse_tasks(tasks_path, errors, warnings)
    project = parse_project(project_path, errors, warnings)
    holidays = parse_holidays(holidays_path, errors, warnings) if holidays_path.exists() else set()

    if tasks:
        validate_task_dependencies(tasks, errors)

    return ValidationResult(tasks, project, holidays, errors, warnings)


def parse_tasks(path: Path, errors: list[str], warnings: list[str]) -> list[Task]:
    rows = read_csv_rows(path, TASK_HEADERS, errors)
    tasks: list[Task] = []
    seen_ids: set[str] = set()
    title_counter: Counter[str] = Counter()

    for row_index, row in enumerate(rows, start=1):
        task_id = row["task_id"].strip()
        title = row["title"].strip()
        estimate_raw = row["estimate_days"].strip()
        due_raw = row["due_date"].strip()
        priority = row["priority"].strip()
        depends_raw = row["depends_on"].strip()
        status = row["status"].strip()

        if not TASK_ID_PATTERN.fullmatch(task_id):
            errors.append(f"{path}:{row_index + 1} invalid task_id: {task_id}")
        elif task_id in seen_ids:
            errors.append(f"{path}:{row_index + 1} duplicate task_id: {task_id}")
        else:
            seen_ids.add(task_id)

        estimate_days = parse_positive_int(
            estimate_raw, f"{path}:{row_index + 1} invalid estimate_days: {estimate_raw}", errors
        )
        due_date = parse_date_value(due_raw, f"{path}:{row_index + 1} invalid due_date: {due_raw}", errors)

        if priority not in ALLOWED_PRIORITIES:
            errors.append(f"{path}:{row_index + 1} invalid priority: {priority}")
        if status not in ALLOWED_STATUSES:
            errors.append(f"{path}:{row_index + 1} invalid status: {status}")

        depends_on = tuple(value.strip() for value in depends_raw.split("|") if value.strip())
        title_counter[title] += 1

        if (
            TASK_ID_PATTERN.fullmatch(task_id)
            and estimate_days is not None
            and due_date is not None
            and priority in ALLOWED_PRIORITIES
            and status in ALLOWED_STATUSES
        ):
            tasks.append(
                Task(
                    task_id=task_id,
                    title=title,
                    estimate_days=estimate_days,
                    due_date=due_date,
                    priority=priority,
                    depends_on=depends_on,
                    status=status,
                    row_index=row_index,
                )
            )

    for title, count in sorted(title_counter.items()):
        if title and count > 1:
            warnings.append(f"{path} duplicate title: {title}")

    return tasks


def parse_project(path: Path, errors: list[str], warnings: list[str]) -> Optional[Project]:
    rows = read_csv_rows(path, PROJECT_HEADERS, errors)
    if not rows:
        errors.append(f"{path} must contain exactly one data row")
        return None
    if len(rows) > 1:
        warnings.append(f"{path} contains multiple data rows; only the first row will be used")

    row = rows[0]
    start_date = parse_date_value(
        row["start_date"].strip(),
        f"{path}:2 invalid start_date: {row['start_date'].strip()}",
        errors,
    )
    parallel_limit = parse_positive_int(
        row["parallel_task_limit"].strip(),
        f"{path}:2 invalid parallel_task_limit: {row['parallel_task_limit'].strip()}",
        errors,
    )

    if start_date is None or parallel_limit is None:
        return None

    return Project(
        project_name=row["project_name"].strip() or "Project",
        start_date=start_date,
        parallel_task_limit=parallel_limit,
    )


def parse_holidays(path: Path, errors: list[str], warnings: list[str]) -> set[date]:
    rows = read_csv_rows(path, HOLIDAY_HEADERS, errors)
    holidays: set[date] = set()
    seen_dates: Counter[str] = Counter()

    for row_index, row in enumerate(rows, start=1):
        raw_value = row["date"].strip()
        holiday_date = parse_date_value(raw_value, f"{path}:{row_index + 1} invalid date: {raw_value}", errors)
        if holiday_date is not None:
            holidays.add(holiday_date)
            seen_dates[raw_value] += 1

    for raw_value, count in sorted(seen_dates.items()):
        if count > 1:
            warnings.append(f"{path} duplicate holiday date: {raw_value}")

    return holidays


def read_csv_rows(path: Path, expected_headers: list[str], errors: list[str]) -> list[dict[str, str]]:
    try:
        with path.open(newline="", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            actual_headers = reader.fieldnames or []
            if actual_headers != expected_headers:
                errors.append(
                    f"{path} headers must match {','.join(expected_headers)} but got {','.join(actual_headers)}"
                )
                return []
            return list(reader)
    except OSError as exc:
        errors.append(f"Could not read {path}: {exc}")
        return []


def parse_date_value(raw_value: str, error_message: str, errors: list[str]) -> date | None:
    try:
        return datetime.strptime(raw_value, "%Y-%m-%d").date()
    except ValueError:
        errors.append(error_message)
        return None


def parse_positive_int(raw_value: str, error_message: str, errors: list[str]) -> int | None:
    try:
        value = int(raw_value)
    except ValueError:
        errors.append(error_message)
        return None
    if value < 1:
        errors.append(error_message)
        return None
    return value


def validate_task_dependencies(tasks: list[Task], errors: list[str]) -> None:
    task_map = {task.task_id: task for task in tasks}
    indegree = {task.task_id: 0 for task in tasks}
    adjacency: dict[str, list[str]] = {task.task_id: [] for task in tasks}

    for task in tasks:
        for dependency in task.depends_on:
            if dependency not in task_map:
                errors.append(f"tasks.csv dependency references undefined task_id: {task.task_id} -> {dependency}")
                continue
            adjacency[dependency].append(task.task_id)
            indegree[task.task_id] += 1

    queue = deque(task_id for task_id, degree in indegree.items() if degree == 0)
    visited = 0
    while queue:
        current = queue.popleft()
        visited += 1
        for follower in adjacency[current]:
            indegree[follower] -= 1
            if indegree[follower] == 0:
                queue.append(follower)

    if visited != len(tasks):
        errors.append("tasks.csv contains cyclic dependencies")


def build_schedule(tasks: list[Task], project: Project, holidays: set[date]) -> list[ScheduleEntry]:
    scheduled: dict[str, ScheduleEntry] = {}
    ordered_tasks = sorted(tasks, key=task_sort_key)

    while len(scheduled) < len(tasks):
        progress = False
        for task in ordered_tasks:
            if task.task_id in scheduled:
                continue
            if any(dependency not in scheduled for dependency in task.depends_on):
                continue

            earliest = project.start_date
            if task.depends_on:
                dependency_end = max(scheduled[dependency].end_date for dependency in task.depends_on)
                earliest = next_business_day(dependency_end + timedelta(days=1), holidays)

            start_date = find_earliest_start(
                earliest, task.estimate_days, project.parallel_task_limit, scheduled.values(), holidays
            )
            end_date = add_business_days(start_date, task.estimate_days, holidays)
            scheduled[task.task_id] = ScheduleEntry(task=task, start_date=start_date, end_date=end_date)
            progress = True

        if not progress:
            raise RuntimeError("Unable to build a schedule from the provided tasks.")

    return sorted(scheduled.values(), key=lambda entry: (entry.start_date, task_sort_key(entry.task)))


def task_sort_key(task: Task) -> tuple[int, int]:
    return (-ALLOWED_PRIORITIES[task.priority], task.row_index)


def next_business_day(candidate: date, holidays: set[date]) -> date:
    current = candidate
    while not is_business_day(current, holidays):
        current += timedelta(days=1)
    return current


def is_business_day(candidate: date, holidays: set[date]) -> bool:
    return candidate.weekday() < 5 and candidate not in holidays


def add_business_days(start_date: date, estimate_days: int, holidays: set[date]) -> date:
    current = next_business_day(start_date, holidays)
    remaining = estimate_days
    while remaining > 1:
        current += timedelta(days=1)
        current = next_business_day(current, holidays)
        remaining -= 1
    return current


def find_earliest_start(
    earliest: date,
    estimate_days: int,
    parallel_limit: int,
    existing_entries: Iterable[ScheduleEntry],
    holidays: set[date],
) -> date:
    candidate = next_business_day(earliest, holidays)
    entries = list(existing_entries)
    while True:
        end_date = add_business_days(candidate, estimate_days, holidays)
        if respects_parallel_limit(candidate, end_date, parallel_limit, entries, holidays):
            return candidate
        candidate = next_business_day(candidate + timedelta(days=1), holidays)


def respects_parallel_limit(
    start_date: date,
    end_date: date,
    parallel_limit: int,
    existing_entries: list[ScheduleEntry],
    holidays: set[date],
) -> bool:
    current = start_date
    while current <= end_date:
        if is_business_day(current, holidays):
            active_count = 1
            for entry in existing_entries:
                if entry.start_date <= current <= entry.end_date and is_business_day(current, holidays):
                    active_count += 1
            if active_count > parallel_limit:
                return False
        current += timedelta(days=1)
    return True


def build_due_date_warnings(schedule: list[ScheduleEntry]) -> list[str]:
    warnings = []
    for entry in schedule:
        if entry.end_date > entry.task.due_date:
            warnings.append(
                f"Task {entry.task.task_id} ends on {entry.end_date.isoformat()} after due_date {entry.task.due_date.isoformat()}"
            )
    return warnings


def write_gantt(path: Path, project: Project, schedule: list[ScheduleEntry]) -> None:
    lines = [
        "gantt",
        f"    title {project.project_name}",
        "    dateFormat  YYYY-MM-DD",
        "    axisFormat  %Y-%m-%d",
        "    section Tasks",
    ]
    for entry in schedule:
        mermaid_status = MERMAID_STATUS[entry.task.status]
        if mermaid_status:
            line = (
                f"    {entry.task.title} :{mermaid_status}, {entry.task.task_id}, "
                f"{entry.start_date.isoformat()}, {entry.end_date.isoformat()}"
            )
        else:
            line = (
                f"    {entry.task.title} :{entry.task.task_id}, "
                f"{entry.start_date.isoformat()}, {entry.end_date.isoformat()}"
            )
        lines.append(line)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_schedule_csv(path: Path, schedule: list[ScheduleEntry]) -> None:
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(
            ["task_id", "title", "status", "priority", "start_date", "end_date", "due_date", "depends_on"]
        )
        for entry in schedule:
            writer.writerow(
                [
                    entry.task.task_id,
                    entry.task.title,
                    entry.task.status,
                    entry.task.priority,
                    entry.start_date.isoformat(),
                    entry.end_date.isoformat(),
                    entry.task.due_date.isoformat(),
                    "|".join(entry.task.depends_on),
                ]
            )


def print_validation_summary(validation: ValidationResult) -> None:
    if validation.errors:
        for error in validation.errors:
            print(f"ERROR: {error}")
    if validation.warnings:
        for warning in validation.warnings:
            print(f"WARNING: {warning}")
    if not validation.errors and not validation.warnings:
        print("Validation passed with no issues.")
    elif not validation.errors:
        print("Validation passed with warnings.")
    else:
        print("Validation failed.")


if __name__ == "__main__":
    raise SystemExit(main())
