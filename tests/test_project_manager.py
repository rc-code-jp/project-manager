import csv
import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import Optional


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "project_manager.py"


class ProjectManagerTests(unittest.TestCase):
    def run_cli(self, *args: str, cwd: Optional[Path] = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", str(SCRIPT), *args],
            cwd=cwd or REPO_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def write_csv(self, path: Path, rows: list[list[str]]) -> None:
        with path.open("w", newline="", encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerows(rows)

    def test_validate_passes_for_template_data(self) -> None:
        result = self.run_cli("validate", "--input-dir", "template")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Validation passed with no issues.", result.stdout)

    def test_validate_fails_for_cyclic_dependency(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            self.write_csv(
                tmp_path / "tasks.csv",
                [
                    ["task_id", "title", "estimate_days", "due_date", "priority", "depends_on", "status"],
                    ["TASK-001", "A", "1", "2026-03-10", "高", "TASK-002", "未着手"],
                    ["TASK-002", "B", "1", "2026-03-11", "中", "TASK-001", "未着手"],
                ],
            )
            self.write_csv(
                tmp_path / "project.csv",
                [["project_name", "start_date", "parallel_task_limit"], ["Test", "2026-03-10", "1"]],
            )
            result = self.run_cli("validate", "--input-dir", str(tmp_path))

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("cyclic dependencies", result.stdout)

    def test_plan_generates_gantt_and_schedule(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            input_dir = tmp_path / "data"
            output_dir = tmp_path / "output"
            input_dir.mkdir()
            self.write_csv(
                input_dir / "tasks.csv",
                [
                    ["task_id", "title", "estimate_days", "due_date", "priority", "depends_on", "status"],
                    ["TASK-001", "Design", "2", "2026-03-12", "高", "", "完了"],
                    ["TASK-002", "Build", "2", "2026-03-14", "中", "TASK-001", "進行中"],
                ],
            )
            self.write_csv(
                input_dir / "project.csv",
                [["project_name", "start_date", "parallel_task_limit"], ["Test", "2026-03-10", "1"]],
            )

            result = self.run_cli(
                "plan",
                "--input-dir",
                str(input_dir),
                "--output-dir",
                str(output_dir),
                "--write-schedule",
            )

            gantt_content = (output_dir / "gantt.mmd").read_text(encoding="utf-8")
            schedule_content = (output_dir / "schedule.csv").read_text(encoding="utf-8")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Design :TASK-001, done, 2026-03-10, 2026-03-11", gantt_content)
        self.assertIn("Build :TASK-002, active, 2026-03-12, 2026-03-13", gantt_content)
        self.assertIn("TASK-002,Build,進行中,中,2026-03-12,2026-03-13,2026-03-14,TASK-001", schedule_content)


if __name__ == "__main__":
    unittest.main()
