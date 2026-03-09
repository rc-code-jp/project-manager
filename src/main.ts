import mermaid from "mermaid";
import "./style.css";

declare global {
  interface Window {
    __PROJECT_MANAGER_VIEWER__?: {
      projectName: string;
      ganttEndpoint: string;
      ganttFilePath: string;
    };
  }
}

const runtimeConfig = window.__PROJECT_MANAGER_VIEWER__;

if (!runtimeConfig) {
  throw new Error("Viewer configuration is missing.");
}
const viewerConfig = runtimeConfig;

const chartRoot = requiredElement<HTMLDivElement>("chart-root");
const statusBanner = requiredElement<HTMLDivElement>("status-banner");
const viewerMeta = requiredElement<HTMLParagraphElement>("viewer-meta");

viewerMeta.textContent = `${viewerConfig.projectName} | ${viewerConfig.ganttFilePath}`;

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  themeVariables: {
    primaryColor: "#d5e7ff",
    primaryTextColor: "#182033",
    primaryBorderColor: "#2a4a87",
    lineColor: "#355b9a",
    sectionBkgColor: "#eef5ff",
    sectionBkgColor2: "#f8fbff",
    sectionBorderColor: "#aac4ef",
    taskBkgColor: "#89b4ff",
    taskBorderColor: "#2a4a87",
    taskTextColor: "#13203a",
    activeTaskBkgColor: "#ffd38a",
    activeTaskBorderColor: "#9b6512",
    activeTaskTextColor: "#402706",
    doneTaskBkgColor: "#9fd2b7",
    doneTaskBorderColor: "#2f6a4f",
    doneTaskTextColor: "#163627",
    gridColor: "#d7e0ef",
    todayLineColor: "#c05621",
    fontFamily: "IBM Plex Sans JP, BIZ UDPGothic, sans-serif",
  },
});

void renderLatest();

async function renderLatest(): Promise<void> {
  setStatus("Loading latest gantt.mmd ...", "loading");

  try {
    const source = await loadGanttSource();
    const { svg } = await mermaid.render(`gantt-${Date.now()}`, source);
    chartRoot.innerHTML = svg;
    setStatus(`Loaded ${viewerConfig.projectName}`, "ready");
  } catch (error) {
    chartRoot.innerHTML = "";
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "error");
  }
}

async function loadGanttSource(): Promise<string> {
  const response = await fetch(`${viewerConfig.ganttEndpoint}?t=${Date.now()}`, {
    headers: {
      Accept: "text/plain",
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail);
  }

  const source = await response.text();
  if (source.trim() === "") {
    throw new Error("gantt.mmd is empty.");
  }
  return source;
}

function setStatus(message: string, tone: "loading" | "ready" | "error"): void {
  statusBanner.hidden = false;
  statusBanner.dataset.tone = tone;
  statusBanner.textContent = message;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
}
