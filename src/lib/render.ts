import type { ScoreOptions, ScoredRow } from "./aa";
import { CALCS, MODES, SORT_KEYS, scoreOptionsToSearchParams } from "./aa";
import type { FetchRun, ModelSummary, TimelineResult } from "./db";

const DEFAULT_THEME = "midnight";
const THEMES = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "slate", label: "Slate" },
  { value: "midnight", label: "Midnight" },
  { value: "nord", label: "Nord" },
  { value: "dracula", label: "Dracula" },
  { value: "synthwave", label: "Synthwave" },
  { value: "cyberpunk", label: "Cyberpunk" },
  { value: "forest", label: "Forest" },
  { value: "emerald", label: "Emerald" },
  { value: "ocean", label: "Ocean" },
  { value: "sky", label: "Sky" },
  { value: "rose", label: "Rose" },
  { value: "sunset", label: "Sunset" },
  { value: "amber", label: "Amber" },
  { value: "grape", label: "Grape" },
  { value: "mono", label: "Mono" },
  { value: "coffee", label: "Coffee" },
  { value: "solarized", label: "Solarized" },
  { value: "high-contrast", label: "High Contrast" },
] as const;
const THEME_VALUES = THEMES.map((theme) => theme.value);

const HELP = {
  theme: "Switch the UI color palette. Your selection is saved in this browser.",
  run: "Choose a stored fetch snapshot. Leave as latest to use the newest successful hourly run.",
  mode: "The quality dimension used for ranking: combined averages AA intelligence, coding, and agentic scores when available.",
  calc: "How the final score is computed: raw ignores cost, sub subtracts a logarithmic cost penalty, and div divides quality by cost^power.",
  sort: "Column used to rank the comparison table and historic #1 winner timeline.",
  frontier:
    "Show only models on the Pareto frontier for the selected quality mode: no cheaper model has a higher selected quality score.",
  costWeight:
    "For sub scoring, quality points subtracted for each 10x increase above the cost floor.",
  costFloor:
    "Minimum benchmark cost used in cost-adjusted formulas. Costs below this are treated as this value.",
  costPower:
    "For div scoring, exponent applied to benchmark cost. Use 0.5 for sqrt(cost), 0 to ignore cost.",
  limit: "Maximum number of rows shown in the comparison table.",
  winner: "Tracks the top-ranked model for each successful snapshot using the current filters.",
} as const;

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Artificial Aggregator</title>
  ${renderThemeInitScript()}
  <style>${CSS}</style>
</head>
<body>
  <header>
    <nav>
      <a class="brand" href="/">Artificial Aggregator</a>
      <a href="/runs">Runs</a>
      <a href="/history">Model timelines</a>
      <a href="/api/runs">API</a>
      ${renderThemeSelect()}
    </nav>
  </header>
  <main>${body}</main>
  <footer class="site-footer">created by <a href="https://sonercir.it" target="_blank" rel="noopener noreferrer">sonercir.it</a></footer>
  ${renderThemeControlScript()}
  ${renderTooltipScript()}
</body>
</html>`;
}

export function renderHome(input: {
  run: FetchRun | null;
  runs: FetchRun[];
  rows: ScoredRow[];
  options: ScoreOptions;
  selectedRunId: number | null;
  topQualityModel: ScoredRow | null;
  effectiveSortBy: string;
  winnerTimeline: Array<ScoredRow<TimelineResult>>;
}): string {
  const {
    run,
    runs,
    rows,
    options,
    selectedRunId,
    topQualityModel,
    effectiveSortBy,
    winnerTimeline,
  } = input;
  const visibleRows = rows.slice(0, options.limit);

  const intro = run
    ? `<p class="muted">Snapshot ${link(`/runs/${run.id}`, `#${run.id}`)} fetched ${formatDateTime(run.completed_at ?? run.started_at)} · ${formatBytes(run.html_bytes)} raw HTML · ${run.result_count} models</p>`
    : `<p class="notice">No successful fetch runs yet. Apply migrations, then wait for the hourly cron or trigger <code>POST /admin/fetch</code>.</p>`;

  return layout(
    "Scores",
    `<section class="hero">
      <h1>AA score/cost comparison</h1>
      ${intro}
    </section>
    ${renderScoreForm(options, runs, selectedRunId)}
    ${topQualityModel ? `<p class="muted">Top quality model in this view: <strong>${escapeHtml(topQualityModel.name)}</strong> (${fmt(topQualityModel.quality, 1)} pts, ${formatMoney(topQualityModel.totalCost)}) · sorted by <strong>${escapeHtml(effectiveSortBy)}</strong></p>` : ""}
    ${run ? renderWinnerTimeline(winnerTimeline, options, effectiveSortBy) : ""}
    ${run ? renderScoresTable(visibleRows, options) : ""}`,
  );
}

export function renderRuns(runs: FetchRun[]): string {
  const rows = runs
    .map(
      (run) => `<tr>
        <td>${link(`/runs/${run.id}`, `#${run.id}`)}</td>
        <td><span class="status ${escapeHtml(run.status)}">${escapeHtml(run.status)}</span></td>
        <td>${formatDateTime(run.started_at)}</td>
        <td>${formatDateTime(run.completed_at)}</td>
        <td class="num">${run.duration_ms == null ? "-" : `${run.duration_ms}ms`}</td>
        <td class="num">${run.http_status ?? "-"}</td>
        <td class="num">${run.result_count}</td>
        <td class="num">${formatBytes(run.html_bytes)}</td>
        <td>${run.html_sha256 ? `<code title="${escapeHtml(run.html_sha256)}">${escapeHtml(run.html_sha256.slice(0, 12))}</code>` : "-"}</td>
        <td>${run.status === "success" ? link(`/runs/${run.id}/raw`, "raw HTML") : escapeHtml(run.error ?? "")}</td>
      </tr>`,
    )
    .join("");

  return layout(
    "Runs",
    `<section class="hero"><h1>Fetch runs</h1><p class="muted">Every hourly execution stores compressed raw HTML chunks and normalized model results.</p></section>
    <div class="table-wrap"><table>
      <thead><tr>${thTip("Run", "Fetch execution id.")}${thTip("Status", "Current outcome of the fetch execution.")}${thTip("Started", "When this fetch execution started.")}${thTip("Completed", "When this fetch execution finished.")}${thTip("Duration", "Total execution time.", "num")}${thTip("HTTP", "HTTP status returned by the source page.", "num")}${thTip("Models", "Number of normalized model results stored.", "num")}${thTip("HTML", "Raw HTML snapshot size before gzip compression.", "num")}${thTip("SHA-256", "Hash of the exact raw HTML snapshot.")}${thTip("Raw/Error", "Download raw HTML for successful runs, or view the error for failed runs.")}</tr></thead>
      <tbody>${rows || `<tr><td colspan="10" class="empty">No runs yet.</td></tr>`}</tbody>
    </table></div>`,
  );
}

export function renderRunDetail(input: {
  run: FetchRun;
  rows: ScoredRow[];
  options: ScoreOptions;
  topQualityModel: ScoredRow | null;
}): string {
  const { run, rows, options, topQualityModel } = input;
  const params = scoreOptionsToSearchParams(options);
  params.set("run", String(run.id));

  return layout(
    `Run #${run.id}`,
    `<section class="hero">
      <h1>Run #${run.id}</h1>
      <p class="muted">${escapeHtml(run.status)} · fetched ${formatDateTime(run.completed_at ?? run.started_at)} · ${formatBytes(run.html_bytes)} raw HTML · ${run.result_count} models</p>
      <p>${link(`/?${params.toString()}`, "Open this run in comparison view")} · ${link(`/runs/${run.id}/raw`, "Download raw HTML")} · ${link(`/api/runs/${run.id}/results`, "JSON results")}</p>
      ${run.error ? `<p class="notice danger">${escapeHtml(run.error)}</p>` : ""}
    </section>
    ${topQualityModel ? `<p class="muted">Top quality: <strong>${escapeHtml(topQualityModel.name)}</strong> (${fmt(topQualityModel.quality, 1)} pts)</p>` : ""}
    ${renderScoresTable(rows.slice(0, options.limit), options)}`,
  );
}

export function renderHistory(models: ModelSummary[]): string {
  const rows = models
    .map(
      (model) => `<tr>
        <td>${link(`/models/${encodeURIComponent(model.model_key)}`, model.name)}</td>
        <td><code>${escapeHtml(model.model_key)}</code></td>
        <td class="num">${model.samples}</td>
        <td>${formatDateTime(model.latest_at)}</td>
      </tr>`,
    )
    .join("");

  return layout(
    "Model timelines",
    `<section class="hero"><h1>Historic model timelines</h1><p class="muted">Choose a model to inspect score, quality, and cost across all successful hourly snapshots.</p></section>
    <div class="table-wrap"><table>
      <thead><tr>${thTip("Model", "Model name. Click to open its historic timeline.")}${thTip("Key", "Stable model key used to join results across snapshots.")}${thTip("Samples", "Number of successful snapshots containing this model.", "num")}${thTip("Latest sample", "Most recent successful snapshot containing this model.")}</tr></thead>
      <tbody>${rows || `<tr><td colspan="4" class="empty">No model results yet.</td></tr>`}</tbody>
    </table></div>`,
  );
}

export function renderModelTimeline(input: {
  modelKey: string;
  timeline: Array<ScoredRow<TimelineResult>>;
  options: ScoreOptions;
}): string {
  const { modelKey, timeline, options } = input;
  const latest = timeline[timeline.length - 1];
  const title = latest?.name ?? modelKey;

  const scoreDigits = options.calc === "div" ? 4 : 1;
  const scoreChart = renderLineChart({
    rows: timeline,
    title: "Score over time",
    value: (row) => row.calculated,
    color: "#3b82f6",
    format: (value) => fmt(value, scoreDigits),
    roundDigits: scoreDigits,
  });
  const costChart = renderLineChart({
    rows: timeline,
    title: "Cost over time",
    value: (row) => row.totalCost,
    color: "#ef4444",
    format: formatMoney,
  });

  const tableRows = timeline
    .slice()
    .reverse()
    .map(
      (row) => `<tr>
        <td>${link(`/runs/${row.runId}`, `#${row.runId}`)}</td>
        <td>${formatDateTime(row.runCompletedAt ?? row.runStartedAt)}</td>
        <td class="num">${fmt(row.calculated, options.calc === "div" ? 4 : 1)}</td>
        <td class="num">${fmt(row.quality, 1)}</td>
        <td class="num">${formatMoney(row.totalCost)}</td>
        <td class="num">${fmt(row.intelligence, 1)}</td>
        <td class="num">${fmt(row.coding, 1)}</td>
        <td class="num">${fmt(row.agentic, 1)}</td>
        <td class="num">${row.mmmu == null ? "-" : fmt(row.mmmu * 100, 1)}</td>
      </tr>`,
    )
    .join("");

  return layout(
    `${title} timeline`,
    `<section class="hero">
      <h1>${escapeHtml(title)}</h1>
      <p class="muted"><code>${escapeHtml(modelKey)}</code> · ${timeline.length} samples · ${escapeHtml(options.mode)} / ${escapeHtml(options.calc)}</p>
      ${renderTimelineForm(options)}
    </section>
    <section class="charts">${scoreChart}${costChart}</section>
    <div class="table-wrap"><table>
      <thead><tr>${thTip("Run", "Fetch execution id for this sample.")}${thTip("Fetched", "When this sample was fetched.")}${thTip("Score", "Final calculated score for the selected mode and cost formula.", "num")}${thTip("Quality", "Selected quality metric before cost adjustment.", "num")}${thTip("Cost", "AA intelligence-index benchmark cost in dollars.", "num")}${thTip("Intel", "Artificial Analysis intelligence index.", "num")}${thTip("Code", "Artificial Analysis coding index.", "num")}${thTip("Agent", "Artificial Analysis agentic index when available.", "num")}${thTip("MMMU%", "MMMU Pro score as a percentage when available.", "num")}</tr></thead>
      <tbody>${tableRows || `<tr><td colspan="9" class="empty">No timeline samples for this model.</td></tr>`}</tbody>
    </table></div>`,
  );
}

export function renderErrorPage(title: string, message: string): string {
  return layout(
    title,
    `<section class="hero"><h1>${escapeHtml(title)}</h1><p class="notice danger">${escapeHtml(message)}</p></section>`,
  );
}

function renderThemeSelect(): string {
  const options = THEMES.map(
    (theme) => `<option value="${escapeAttr(theme.value)}">${escapeHtml(theme.label)}</option>`,
  ).join("");

  return `<label class="theme-picker">${labelWithTip("Theme", HELP.theme)}<select id="theme-select" aria-label="Theme">${options}</select></label>`;
}

function renderThemeInitScript(): string {
  return `<script>
(() => {
  const themes = ${JSON.stringify(THEME_VALUES)};
  const fallback = ${JSON.stringify(DEFAULT_THEME)};
  try {
    const stored = localStorage.getItem("aa-theme");
    const theme = themes.includes(stored) ? stored : fallback;
    document.documentElement.dataset.theme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = fallback;
  }
})();
</script>`;
}

function renderThemeControlScript(): string {
  return `<script>
(() => {
  const themes = ${JSON.stringify(THEME_VALUES)};
  const fallback = ${JSON.stringify(DEFAULT_THEME)};
  const select = document.getElementById("theme-select");
  if (!(select instanceof HTMLSelectElement)) return;

  const getTheme = () => {
    try {
      const stored = localStorage.getItem("aa-theme");
      return themes.includes(stored) ? stored : fallback;
    } catch (_) {
      return fallback;
    }
  };

  const applyTheme = (theme) => {
    const next = themes.includes(theme) ? theme : fallback;
    document.documentElement.dataset.theme = next;
    select.value = next;
    try {
      localStorage.setItem("aa-theme", next);
    } catch (_) {}
  };

  applyTheme(getTheme());
  select.addEventListener("change", () => applyTheme(select.value));
})();
</script>`;
}

function renderTooltipScript(): string {
  return `<script>
(() => {
  const triggers = Array.from(document.querySelectorAll(".tooltip[data-tip], .chart-entry[data-tip]"));
  if (triggers.length === 0) return;

  const bubble = document.createElement("div");
  bubble.className = "floating-tooltip";
  bubble.setAttribute("role", "tooltip");
  bubble.hidden = true;
  document.body.appendChild(bubble);

  let active = null;

  const position = () => {
    if (!active) return;

    const rect = active.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const margin = 8;
    const gap = 10;
    let left = rect.left + rect.width / 2 - bubbleRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - bubbleRect.width - margin));

    let top = rect.top - bubbleRect.height - gap;
    let placement = "above";
    if (top < margin) {
      top = rect.bottom + gap;
      placement = "below";
    }

    bubble.dataset.placement = placement;
    bubble.style.left = left + "px";
    bubble.style.top = top + "px";
    bubble.style.setProperty("--arrow-left", rect.left + rect.width / 2 - left + "px");
  };

  const show = (target) => {
    const text = target.getAttribute("data-tip");
    if (!text) return;

    active = target;
    bubble.textContent = text;
    bubble.hidden = false;
    bubble.classList.remove("visible");
    position();
    requestAnimationFrame(() => bubble.classList.add("visible"));
  };

  const hide = () => {
    active = null;
    bubble.classList.remove("visible");
    window.setTimeout(() => {
      if (!active) bubble.hidden = true;
    }, 120);
  };

  for (const trigger of triggers) {
    trigger.addEventListener("mouseenter", () => show(trigger));
    trigger.addEventListener("focus", () => show(trigger));
    trigger.addEventListener("mouseleave", hide);
    trigger.addEventListener("blur", hide);
    trigger.addEventListener("mousemove", position);
  }

  window.addEventListener("scroll", position, true);
  window.addEventListener("resize", position);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
})();
</script>`;
}

function renderScoreForm(
  options: ScoreOptions,
  runs: FetchRun[],
  selectedRunId: number | null,
): string {
  const runControl = `<label>${labelWithTip("Run", HELP.run)}
      <select name="run">
        <option value="">Latest successful</option>
        ${runs
          .map(
            (run) =>
              `<option value="${run.id}" ${selectedRunId === run.id ? "selected" : ""}>#${run.id} · ${escapeHtml(run.status)} · ${formatDateTime(run.completed_at ?? run.started_at)}</option>`,
          )
          .join("")}
      </select>
    </label>`;

  return `<form class="controls controls-categorized" method="get" action="/">
    ${controlGroup("Snapshot", "Pick the stored fetch snapshot to compare.", runControl)}
    ${controlGroup(
      "Scoring",
      "Choose the quality benchmark and final score formula.",
      `${selectControl("mode", "Mode", MODES, options.mode, HELP.mode)}${selectControl("calc", "Calc", CALCS, options.calc, HELP.calc)}`,
    )}
    ${controlGroup("Cost adjustment", "Tune formulas that account for benchmark cost.", costControls(options))}
    ${controlGroup(
      "Result set",
      "Control table filtering, ordering, and row count.",
      `${selectControl("sort", "Sort", SORT_KEYS, options.sort, HELP.sort)}${frontierFilterControl(options)}${limitControl(options)}`,
    )}
    <div class="controls-actions"><button type="submit">Update</button></div>
  </form>`;
}

function renderTimelineForm(options: ScoreOptions): string {
  return `<form class="controls controls-categorized compact" method="get">
    ${controlGroup(
      "Scoring",
      "Choose the quality benchmark and final score formula for this model.",
      `${selectControl("mode", "Mode", MODES, options.mode, HELP.mode)}${selectControl("calc", "Calc", CALCS, options.calc, HELP.calc)}`,
    )}
    ${controlGroup("Cost adjustment", "Tune formulas that account for benchmark cost.", costControls(options))}
    <div class="controls-actions"><button type="submit">Update</button></div>
  </form>`;
}

function controlGroup(title: string, description: string, body: string): string {
  return `<fieldset class="control-group">
    <legend>${escapeHtml(title)}</legend>
    <p class="control-group-description">${escapeHtml(description)}</p>
    <div class="control-group-grid">${body}</div>
  </fieldset>`;
}

function costControls(options: ScoreOptions): string {
  return `<label>${labelWithTip("Cost weight", HELP.costWeight)}<input type="number" step="0.1" name="costWeight" value="${escapeAttr(options.costWeight)}" /></label>
    <label>${labelWithTip("Cost floor", HELP.costFloor)}<input type="number" step="0.000001" name="costFloor" value="${escapeAttr(options.costFloor)}" /></label>
    <label>${labelWithTip("Cost power", HELP.costPower)}<input type="number" step="0.1" name="costPower" value="${escapeAttr(options.costPower)}" /></label>`;
}

function limitControl(options: ScoreOptions): string {
  return `<label>${labelWithTip("Limit", HELP.limit)}<input type="number" min="1" max="10000" name="limit" value="${escapeAttr(options.limit)}" /></label>`;
}

function renderWinnerTimeline(
  winners: Array<ScoredRow<TimelineResult>>,
  options: ScoreOptions,
  effectiveSortBy: string,
): string {
  if (winners.length === 0) {
    return `<section class="winner-panel"><h2>${headingWithTip("Historic #1 winner", HELP.winner)}</h2><p class="empty">No historic winner data for these filters yet.</p></section>`;
  }

  const latest = winners[winners.length - 1];
  const scoreDigits = options.calc === "div" ? 4 : 1;
  const scoreFormat = (value: number | null | undefined) => fmt(value, scoreDigits);
  const chartScore = (row: ScoredRow<TimelineResult>) =>
    roundForDisplay(row.calculated, scoreDigits);
  const values = winners
    .map(chartScore)
    .filter((value): value is number => Number.isFinite(value));
  const width = 960;
  const height = 280;
  const pad = 58;
  const minX = Math.min(
    ...winners.map((row) => Date.parse(row.runCompletedAt ?? row.runStartedAt)),
  );
  const maxX = Math.max(
    ...winners.map((row) => Date.parse(row.runCompletedAt ?? row.runStartedAt)),
  );
  let minY = Math.min(...values);
  let maxY = Math.max(...values);
  ({ minY, maxY } = chartYDomain({ minY, maxY, yFormat: scoreFormat }));

  const scaleX = (date: string | null) => {
    const x = Date.parse(date ?? winners[0].runStartedAt);
    const t = maxX === minX ? 0.5 : (x - minX) / (maxX - minX);
    return pad + t * (width - pad * 2);
  };
  const scaleY = (value: number) => {
    const t = (value - minY) / (maxY - minY);
    return height - pad - t * (height - pad * 2);
  };

  const points = winners
    .map(
      (row) =>
        `${scaleX(row.runCompletedAt ?? row.runStartedAt).toFixed(1)},${scaleY(chartScore(row)).toFixed(1)}`,
    )
    .join(" ");
  const changes = winners.filter(
    (row, index) => index === 0 || row.modelKey !== winners[index - 1].modelKey,
  );
  const labels = changes
    .slice(-10)
    .map((row) => {
      const x = scaleX(row.runCompletedAt ?? row.runStartedAt);
      const y = scaleY(chartScore(row));
      return `<text class="winner-label" x="${x.toFixed(1)}" y="${Math.max(16, y - 10).toFixed(1)}">${escapeHtml(truncate(row.name, 22))}</text>`;
    })
    .join("");
  const circles = winners
    .map((row) => {
      const x = scaleX(row.runCompletedAt ?? row.runStartedAt).toFixed(1);
      const y = scaleY(chartScore(row)).toFixed(1);
      const fetched = formatDateTime(row.runCompletedAt ?? row.runStartedAt);
      const score = scoreFormat(row.calculated);
      const tip = `Run #${row.runId} · ${row.name} · X: ${fetched} · Y: ${score}`;
      return `<circle class="chart-entry" cx="${x}" cy="${y}" r="4" tabindex="0" aria-label="${escapeAttr(tip)}" data-tip="${escapeAttr(tip)}" />`;
    })
    .join("");
  const axes = renderChartAxes({
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    pad,
    yFormat: scoreFormat,
  });
  const changeChips = changes
    .slice(-12)
    .reverse()
    .map(
      (
        row,
      ) => `<a class="winner-chip" href="/models/${encodeURIComponent(row.modelKey)}?${scoreOptionsToSearchParams(options).toString()}">
        <strong>${escapeHtml(row.name)}</strong>
        <span>${formatDateTime(row.runCompletedAt ?? row.runStartedAt)} · ${scoreFormat(row.calculated)}</span>
      </a>`,
    )
    .join("");
  const recentRows = winners
    .slice(-8)
    .reverse()
    .map(
      (row) => `<tr>
        <td>${link(`/runs/${row.runId}`, `#${row.runId}`)}</td>
        <td>${formatDateTime(row.runCompletedAt ?? row.runStartedAt)}</td>
        <td>${link(`/models/${encodeURIComponent(row.modelKey)}?${scoreOptionsToSearchParams(options).toString()}`, row.name)}</td>
        <td class="num">${scoreFormat(row.calculated)}</td>
        <td class="num">${fmt(row.quality, 1)}</td>
        <td class="num">${formatMoney(row.totalCost)}</td>
      </tr>`,
    )
    .join("");

  return `<section class="winner-panel">
    <div class="winner-head">
      <div>
        <h2>${headingWithTip("Historic #1 winner", HELP.winner)}</h2>
        <p class="muted">Top row for each successful snapshot using the current mode/calc/cost settings and <strong>${escapeHtml(effectiveSortBy)}</strong> sort.</p>
      </div>
      <div class="winner-latest">
        <span>Latest #1</span>
        ${link(`/models/${encodeURIComponent(latest.modelKey)}?${scoreOptionsToSearchParams(options).toString()}`, latest.name)}
        <strong>${scoreFormat(latest.calculated)}</strong>
      </div>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Historic number one winner score timeline">
      ${axes}
      <polyline class="winner-line" points="${points}" />
      <g class="winner-dots">${circles}</g>
      ${labels}
    </svg>
    <div class="winner-grid">
      <div>
        <h3>Recent winner changes</h3>
        <div class="winner-chips">${changeChips}</div>
      </div>
      <div class="table-wrap compact-table"><table>
        <thead><tr>${thTip("Run", "Fetch execution id for this winner.")}${thTip("Fetched", "When this winning snapshot was fetched.")}${thTip("Winner", "Top-ranked model for that snapshot.")}${thTip("Score", "Winner's final calculated score.", "num")}${thTip("Qual", "Winner's selected quality metric before cost adjustment.", "num")}${thTip("Cost", "Winner's benchmark cost in dollars.", "num")}</tr></thead>
        <tbody>${recentRows}</tbody>
      </table></div>
    </div>
  </section>`;
}

function renderScoresTable(rows: ScoredRow[], options: ScoreOptions): string {
  const params = scoreOptionsToSearchParams(options);
  const tableRows = rows
    .map((row, index) => {
      const timelineUrl = `/models/${encodeURIComponent(row.modelKey)}?${params.toString()}`;
      return `<tr class="${row.frontier ? "frontier" : ""}">
        <td class="num">${index + 1}</td>
        <td class="center">${row.frontier ? '<span title="Pareto frontier">✓</span>' : ""}</td>
        <td>${link(timelineUrl, row.name)}<br><small>${escapeHtml(row.creatorName ?? "")}</small></td>
        <td>${escapeHtml(row.releaseDate ?? "-")}</td>
        <td class="num">${formatMoney(row.totalCost)}</td>
        <td class="num">${fmt(row.costPerQuality, 2)}</td>
        <td class="num">${fmt(row.quality, 1)}</td>
        <td class="num">${fmtDelta(row.deltaTop)}</td>
        <td class="num">${fmt(row.intelligence, 1)}</td>
        <td class="num">${fmt(row.coding, 1)}</td>
        <td class="num">${fmt(row.agentic, 1)}</td>
        <td class="num">${fmt(row.costPenalty, 1)}</td>
        <td class="num strong">${fmt(row.calculated, options.calc === "div" ? 4 : 1)}</td>
      </tr>`;
    })
    .join("");

  return `<div class="table-wrap score-table-wrap"><table class="score-table">
    <colgroup>
      <col class="rank-col">
      <col class="pareto-col">
      <col class="model-col">
      <col class="released-col">
      <col class="cost-col">
      <col class="cost-quality-col">
      <col class="quality-col">
      <col class="delta-col">
      <col class="metric-col">
      <col class="metric-col">
      <col class="metric-col">
      <col class="penalty-col">
      <col class="score-col">
    </colgroup>
    <thead><tr>${thTip("#", "Rank after applying the selected sort.", "num")}${thTip("Pareto", "On the Pareto frontier: no cheaper model has a higher selected quality score.", "center")}${thTip("Model", "Model name. Click to open its historic timeline.")}${thTip("Released", "Model release date reported by Artificial Analysis.")}${thTip("Cost$", "AA intelligence-index benchmark cost in dollars. Lower is cheaper.", "num")}${thTip("$/Q", "Dollars per selected quality point. Lower is better.", "num")}${thTip("Qual", "Selected quality metric before cost adjustment.", "num")}${thTip("ΔTop", "Quality gap versus the top-quality model in this run.", "num")}${thTip("Intel", "Artificial Analysis intelligence index.", "num")}${thTip("Code", "Artificial Analysis coding index.", "num")}${thTip("Agent", "Artificial Analysis agentic index when available.", "num")}${thTip("Pen", "Cost penalty subtracted in sub scoring. Zero for raw/div scoring display still shows the computed penalty.", "num")}${thTip("Score", "Final calculated score for the selected mode and cost formula.", "num")}</tr></thead>
    <tbody>${tableRows || `<tr><td colspan="13" class="empty">No scored rows for these options.</td></tr>`}</tbody>
  </table></div>`;
}

function renderLineChart(input: {
  rows: Array<ScoredRow<TimelineResult>>;
  title: string;
  value: (row: ScoredRow<TimelineResult>) => number | null;
  color: string;
  format?: (value: number | null) => string;
  roundDigits?: number;
}): string {
  const { rows, title, value, color, format = (v) => fmt(v, 1), roundDigits } = input;
  const chartValue = (row: ScoredRow<TimelineResult>) => {
    const v = value(row);
    return v == null || !Number.isFinite(v)
      ? null
      : roundDigits == null
        ? v
        : roundForDisplay(v, roundDigits);
  };
  const values = rows.map(chartValue).filter((v): v is number => v != null);

  if (rows.length === 0 || values.length === 0) {
    return `<article class="chart"><h2>${escapeHtml(title)}</h2><p class="empty">No chart data.</p></article>`;
  }

  const width = 760;
  const height = 240;
  const pad = 54;
  const minX = Math.min(...rows.map((row) => Date.parse(row.runCompletedAt ?? row.runStartedAt)));
  const maxX = Math.max(...rows.map((row) => Date.parse(row.runCompletedAt ?? row.runStartedAt)));
  let minY = Math.min(...values);
  let maxY = Math.max(...values);
  ({ minY, maxY } = chartYDomain({ minY, maxY, yFormat: format }));

  const scaleX = (date: string | null) => {
    const x = Date.parse(date ?? rows[0].runStartedAt);
    const t = maxX === minX ? 0.5 : (x - minX) / (maxX - minX);
    return pad + t * (width - pad * 2);
  };
  const scaleY = (v: number) => {
    const t = (v - minY) / (maxY - minY);
    return height - pad - t * (height - pad * 2);
  };

  const points = rows
    .map((row) => {
      const v = chartValue(row);
      return v == null
        ? null
        : `${scaleX(row.runCompletedAt ?? row.runStartedAt).toFixed(1)},${scaleY(v).toFixed(1)}`;
    })
    .filter((point): point is string => point != null)
    .join(" ");

  const metricLabel = title.replace(/ over time$/i, "");
  const circles = rows
    .map((row) => {
      const v = chartValue(row);
      if (v == null) return "";
      const x = scaleX(row.runCompletedAt ?? row.runStartedAt).toFixed(1);
      const y = scaleY(v).toFixed(1);
      const fetched = formatDateTime(row.runCompletedAt ?? row.runStartedAt);
      const formattedValue = format(v);
      const tip = `Run #${row.runId} · ${metricLabel} · X: ${fetched} · Y: ${formattedValue}`;
      return `<circle class="chart-entry" cx="${x}" cy="${y}" r="3" tabindex="0" aria-label="${escapeAttr(tip)}" data-tip="${escapeAttr(tip)}" />`;
    })
    .join("");
  const axes = renderChartAxes({
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    pad,
    yFormat: format,
  });

  return `<article class="chart">
    <h2>${escapeHtml(title)}</h2>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(title)}">
      ${axes}
      <polyline points="${points}" style="stroke:${color}" />
      <g style="fill:${color}">${circles}</g>
    </svg>
  </article>`;
}

function renderChartAxes(input: {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  pad: number;
  yFormat: (value: number) => string;
  xTickCount?: number;
  yTickCount?: number;
}): string {
  const {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    pad,
    yFormat,
    xTickCount = 5,
    yTickCount = 5,
  } = input;
  const plotLeft = pad;
  const plotRight = width - pad;
  const plotTop = pad;
  const plotBottom = height - pad;
  const scaleX = (x: number) => {
    const t = maxX === minX ? 0.5 : (x - minX) / (maxX - minX);
    return plotLeft + t * (plotRight - plotLeft);
  };
  const scaleY = (value: number) => {
    const t = (value - minY) / (maxY - minY);
    return plotBottom - t * (plotBottom - plotTop);
  };
  const xTicks = tickValues(minX, maxX, xTickCount);
  const yTicks = tickValues(minY, maxY, yTickCount);
  const xGrids = xTicks
    .map((tick) => {
      const x = scaleX(tick).toFixed(1);
      return `<line class="axis-grid" x1="${x}" y1="${plotTop}" x2="${x}" y2="${plotBottom}" />`;
    })
    .join("");
  const yGrids = yTicks
    .map((tick) => {
      const y = scaleY(tick).toFixed(1);
      return `<line class="axis-grid" x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}" />`;
    })
    .join("");
  const xLabels = xTicks
    .map((tick) => {
      const x = scaleX(tick).toFixed(1);
      return `<text class="axis-value x-axis-value" x="${x}" y="${plotBottom + 20}" text-anchor="middle">${escapeHtml(formatAxisDateTick(tick, minX, maxX))}</text>`;
    })
    .join("");
  const yLabels = yTicks
    .map((tick) => {
      const y = scaleY(tick);
      return `<text class="axis-value y-axis-value" x="${plotLeft - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(yFormat(tick))}</text>`;
    })
    .join("");

  return `<g class="axis-grid-lines">${yGrids}${xGrids}</g>
      <line class="axis-line" x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" />
      <line class="axis-line" x1="${plotLeft}" y1="${plotTop}" x2="${plotLeft}" y2="${plotBottom}" />
      <g class="axis-values">${yLabels}${xLabels}</g>`;
}

function chartYDomain(input: {
  minY: number;
  maxY: number;
  yFormat: (value: number) => string;
  yTickCount?: number;
}): { minY: number; maxY: number } {
  let { minY, maxY } = input;
  const { yFormat, yTickCount = 5 } = input;

  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return { minY, maxY };
  if (minY > maxY) [minY, maxY] = [maxY, minY];

  const center = (minY + maxY) / 2;
  let halfRange = (maxY - minY) / 2;

  if (halfRange === 0) {
    halfRange = Math.max(Math.abs(center) * 0.01, 0.01);
  } else {
    halfRange = Math.max(halfRange, Math.max(Math.abs(center) * 1e-6, 1e-9));
  }

  let low = center - halfRange;
  let high = center + halfRange;

  for (let index = 0; index < 32; index++) {
    if (!hasDuplicateTickLabels(low, high, yFormat, yTickCount)) {
      return { minY: low, maxY: high };
    }

    halfRange *= 2;
    low = center - halfRange;
    high = center + halfRange;
  }

  return { minY: low, maxY: high };
}

function hasDuplicateTickLabels(
  minY: number,
  maxY: number,
  yFormat: (value: number) => string,
  yTickCount: number,
): boolean {
  const labels = tickValues(minY, maxY, yTickCount).map(yFormat);
  return new Set(labels).size !== labels.length;
}

function roundForDisplay(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;

  const safeDigits = Math.min(100, Math.max(0, Math.floor(digits)));
  return Number(value.toFixed(safeDigits));
}

function tickValues(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (count <= 1 || min === max) return [min];

  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function formatAxisDateTick(value: number, min: number, max: number): string {
  if (!Number.isFinite(value)) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const iso = date.toISOString();
  const span = Math.abs(max - min);
  const day = 24 * 60 * 60 * 1000;

  if (span <= day) return iso.slice(11, 16);
  if (span <= 32 * day) return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
  if (span <= 370 * day) return iso.slice(5, 10);
  return iso.slice(0, 10);
}

function frontierFilterControl(options: ScoreOptions): string {
  return `<label>${labelWithTip("Pareto", HELP.frontier)}
    <select name="frontier">
      <option value="0" ${options.frontierOnly ? "" : "selected"}>All models</option>
      <option value="1" ${options.frontierOnly ? "selected" : ""}>Frontier only</option>
    </select>
  </label>`;
}

function selectControl<T extends readonly string[]>(
  name: string,
  label: string,
  values: T,
  selected: T[number],
  help?: string,
): string {
  return `<label>${labelWithTip(label, help)}
    <select name="${escapeAttr(name)}">
      ${values
        .map(
          (value) =>
            `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`,
        )
        .join("")}
    </select>
  </label>`;
}

function labelWithTip(label: string, help?: string): string {
  return `<span class="label-row">${escapeHtml(label)}${help ? tip(help) : ""}</span>`;
}

function headingWithTip(label: string, help: string): string {
  return `<span class="heading-row">${escapeHtml(label)}${tip(help)}</span>`;
}

function thTip(label: string, help: string, className = ""): string {
  const classAttr = className
    ? ` class="${escapeAttr(`${className} has-custom-tip`)}"`
    : ` class="has-custom-tip"`;
  return `<th${classAttr}><span class="th-label">${escapeHtml(label)}${tip(help)}</span></th>`;
}

function tip(help: string): string {
  return `<span class="tooltip" tabindex="0" aria-label="${escapeAttr(help)}" data-tip="${escapeAttr(help)}">?</span>`;
}

function link(href: string, label: string): string {
  return `<a href="${escapeAttr(href)}">${escapeHtml(label)}</a>`;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function fmt(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "-" : value.toFixed(digits);
}

function fmtDelta(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value >= -0.005 ? "0.0" : value.toFixed(1);
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (value >= 100) return `$${value.toFixed(0)}`;
  if (value >= 10) return `$${value.toFixed(1)}`;
  return `$${value.toFixed(2)}`;
}

function formatBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

const CSS = `
:root, [data-theme="midnight"] { color-scheme: dark; --bg: #0b1020; --panel: #111827; --panel-2: #172033; --text: #e5e7eb; --muted: #9ca3af; --line: #263244; --link: #93c5fd; --good: #22c55e; --bad: #ef4444; --warn: #f59e0b; --accent: #2563eb; --accent-text: #ffffff; --header-bg: rgba(11, 16, 32, .9); --hover: rgba(255, 255, 255, .025); --code-bg: rgba(255, 255, 255, .06); }
[data-theme="dark"] { color-scheme: dark; --bg: #050505; --panel: #111111; --panel-2: #1f1f1f; --text: #f5f5f5; --muted: #a3a3a3; --line: #2f2f2f; --link: #60a5fa; --good: #22c55e; --bad: #f87171; --warn: #fbbf24; --accent: #3b82f6; --accent-text: #ffffff; --header-bg: rgba(5, 5, 5, .9); --hover: rgba(255, 255, 255, .04); --code-bg: rgba(255, 255, 255, .08); }
[data-theme="light"] { color-scheme: light; --bg: #f8fafc; --panel: #ffffff; --panel-2: #f1f5f9; --text: #0f172a; --muted: #64748b; --line: #e2e8f0; --link: #2563eb; --good: #16a34a; --bad: #dc2626; --warn: #d97706; --accent: #2563eb; --accent-text: #ffffff; --header-bg: rgba(248, 250, 252, .9); --hover: rgba(15, 23, 42, .035); --code-bg: rgba(15, 23, 42, .06); }
[data-theme="slate"] { color-scheme: dark; --bg: #0f172a; --panel: #1e293b; --panel-2: #334155; --text: #f8fafc; --muted: #cbd5e1; --line: #475569; --link: #7dd3fc; --good: #34d399; --bad: #fb7185; --warn: #fbbf24; --accent: #0ea5e9; --accent-text: #ffffff; --header-bg: rgba(15, 23, 42, .9); --hover: rgba(255, 255, 255, .04); --code-bg: rgba(255, 255, 255, .08); }
[data-theme="nord"] { color-scheme: dark; --bg: #2e3440; --panel: #3b4252; --panel-2: #434c5e; --text: #eceff4; --muted: #d8dee9; --line: #4c566a; --link: #88c0d0; --good: #a3be8c; --bad: #bf616a; --warn: #ebcb8b; --accent: #5e81ac; --accent-text: #ffffff; --header-bg: rgba(46, 52, 64, .9); --hover: rgba(236, 239, 244, .05); --code-bg: rgba(236, 239, 244, .08); }
[data-theme="dracula"] { color-scheme: dark; --bg: #282a36; --panel: #343746; --panel-2: #44475a; --text: #f8f8f2; --muted: #bd93f9; --line: #55586b; --link: #8be9fd; --good: #50fa7b; --bad: #ff5555; --warn: #f1fa8c; --accent: #bd93f9; --accent-text: #1f1f28; --header-bg: rgba(40, 42, 54, .9); --hover: rgba(248, 248, 242, .05); --code-bg: rgba(248, 248, 242, .08); }
[data-theme="synthwave"] { color-scheme: dark; --bg: #1a103d; --panel: #24164f; --panel-2: #33206f; --text: #fff7ff; --muted: #f0abfc; --line: #6236a0; --link: #67e8f9; --good: #5eead4; --bad: #fb7185; --warn: #facc15; --accent: #e879f9; --accent-text: #210b2c; --header-bg: rgba(26, 16, 61, .9); --hover: rgba(232, 121, 249, .08); --code-bg: rgba(232, 121, 249, .12); }
[data-theme="cyberpunk"] { color-scheme: dark; --bg: #070014; --panel: #120026; --panel-2: #220044; --text: #fef08a; --muted: #22d3ee; --line: #7e22ce; --link: #00f5ff; --good: #39ff14; --bad: #ff2d95; --warn: #fef08a; --accent: #ff2d95; --accent-text: #070014; --header-bg: rgba(7, 0, 20, .92); --hover: rgba(255, 45, 149, .08); --code-bg: rgba(0, 245, 255, .12); }
[data-theme="forest"] { color-scheme: dark; --bg: #081c15; --panel: #10281f; --panel-2: #1b4332; --text: #d8f3dc; --muted: #95d5b2; --line: #2d6a4f; --link: #74c69d; --good: #52b788; --bad: #f87171; --warn: #f4d35e; --accent: #40916c; --accent-text: #ffffff; --header-bg: rgba(8, 28, 21, .9); --hover: rgba(216, 243, 220, .04); --code-bg: rgba(216, 243, 220, .08); }
[data-theme="emerald"] { color-scheme: light; --bg: #ecfdf5; --panel: #ffffff; --panel-2: #d1fae5; --text: #064e3b; --muted: #047857; --line: #a7f3d0; --link: #047857; --good: #059669; --bad: #dc2626; --warn: #b45309; --accent: #10b981; --accent-text: #052e2b; --header-bg: rgba(236, 253, 245, .9); --hover: rgba(6, 78, 59, .04); --code-bg: rgba(6, 78, 59, .07); }
[data-theme="ocean"] { color-scheme: dark; --bg: #061826; --panel: #0b2a3d; --panel-2: #123b54; --text: #e0f2fe; --muted: #7dd3fc; --line: #155e75; --link: #38bdf8; --good: #2dd4bf; --bad: #fb7185; --warn: #fbbf24; --accent: #0284c7; --accent-text: #ffffff; --header-bg: rgba(6, 24, 38, .9); --hover: rgba(224, 242, 254, .05); --code-bg: rgba(224, 242, 254, .08); }
[data-theme="sky"] { color-scheme: light; --bg: #eff6ff; --panel: #ffffff; --panel-2: #dbeafe; --text: #082f49; --muted: #0369a1; --line: #bfdbfe; --link: #0284c7; --good: #059669; --bad: #e11d48; --warn: #ca8a04; --accent: #0ea5e9; --accent-text: #ffffff; --header-bg: rgba(239, 246, 255, .9); --hover: rgba(8, 47, 73, .04); --code-bg: rgba(8, 47, 73, .07); }
[data-theme="rose"] { color-scheme: light; --bg: #fff1f2; --panel: #ffffff; --panel-2: #ffe4e6; --text: #4c0519; --muted: #be123c; --line: #fecdd3; --link: #e11d48; --good: #16a34a; --bad: #dc2626; --warn: #d97706; --accent: #f43f5e; --accent-text: #ffffff; --header-bg: rgba(255, 241, 242, .9); --hover: rgba(76, 5, 25, .04); --code-bg: rgba(76, 5, 25, .07); }
[data-theme="sunset"] { color-scheme: dark; --bg: #2a1005; --panel: #3b1a08; --panel-2: #5b2a0a; --text: #ffedd5; --muted: #fdba74; --line: #9a3412; --link: #fb923c; --good: #84cc16; --bad: #f43f5e; --warn: #facc15; --accent: #f97316; --accent-text: #1f0a02; --header-bg: rgba(42, 16, 5, .9); --hover: rgba(255, 237, 213, .05); --code-bg: rgba(255, 237, 213, .08); }
[data-theme="amber"] { color-scheme: light; --bg: #fffbeb; --panel: #ffffff; --panel-2: #fef3c7; --text: #451a03; --muted: #92400e; --line: #fde68a; --link: #b45309; --good: #15803d; --bad: #b91c1c; --warn: #d97706; --accent: #f59e0b; --accent-text: #451a03; --header-bg: rgba(255, 251, 235, .9); --hover: rgba(69, 26, 3, .04); --code-bg: rgba(69, 26, 3, .07); }
[data-theme="grape"] { color-scheme: dark; --bg: #16051f; --panel: #24102f; --panel-2: #3b1a4a; --text: #fae8ff; --muted: #d8b4fe; --line: #6b21a8; --link: #c084fc; --good: #86efac; --bad: #fb7185; --warn: #fde047; --accent: #a855f7; --accent-text: #ffffff; --header-bg: rgba(22, 5, 31, .9); --hover: rgba(250, 232, 255, .05); --code-bg: rgba(250, 232, 255, .08); }
[data-theme="mono"] { color-scheme: light; --bg: #f5f5f5; --panel: #ffffff; --panel-2: #e5e5e5; --text: #171717; --muted: #525252; --line: #d4d4d4; --link: #262626; --good: #404040; --bad: #737373; --warn: #525252; --accent: #171717; --accent-text: #ffffff; --header-bg: rgba(245, 245, 245, .92); --hover: rgba(23, 23, 23, .04); --code-bg: rgba(23, 23, 23, .07); }
[data-theme="coffee"] { color-scheme: dark; --bg: #1c130d; --panel: #2a1c13; --panel-2: #3c2a1e; --text: #f5e6d3; --muted: #c9a27e; --line: #654321; --link: #d6a05d; --good: #9ccc65; --bad: #ef9a9a; --warn: #ffcc80; --accent: #a16207; --accent-text: #fff7ed; --header-bg: rgba(28, 19, 13, .9); --hover: rgba(245, 230, 211, .05); --code-bg: rgba(245, 230, 211, .08); }
[data-theme="solarized"] { color-scheme: light; --bg: #fdf6e3; --panel: #eee8d5; --panel-2: #e6dec3; --text: #073642; --muted: #657b83; --line: #d6cfb7; --link: #268bd2; --good: #859900; --bad: #dc322f; --warn: #b58900; --accent: #268bd2; --accent-text: #ffffff; --header-bg: rgba(253, 246, 227, .9); --hover: rgba(7, 54, 66, .04); --code-bg: rgba(7, 54, 66, .07); }
[data-theme="high-contrast"] { color-scheme: dark; --bg: #000000; --panel: #000000; --panel-2: #121212; --text: #ffffff; --muted: #ffffff; --line: #ffffff; --link: #00ffff; --good: #00ff00; --bad: #ff4040; --warn: #ffff00; --accent: #ffff00; --accent-text: #000000; --header-bg: rgba(0, 0, 0, .95); --hover: rgba(255, 255, 255, .12); --code-bg: rgba(255, 255, 255, .16); }
* { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: var(--bg); color: var(--text); }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
header { position: sticky; top: 0; z-index: 2; background: var(--header-bg); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
nav { max-width: 1280px; margin: 0 auto; padding: 14px 20px; display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
.brand { font-weight: 800; color: var(--text); }
.theme-picker { margin-left: auto; min-width: 170px; max-width: 220px; }
.theme-picker span { color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
.theme-picker select { padding: 7px 9px; }
main { max-width: 1280px; margin: 0 auto; padding: 24px 20px 96px; }
.site-footer { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2; padding: 10px 20px; border-top: 1px solid var(--line); background: var(--header-bg); backdrop-filter: blur(10px); color: var(--muted); text-align: center; font-size: .85rem; }
.site-footer a { font-weight: 700; }
h1 { font-size: clamp(2rem, 5vw, 4rem); line-height: 1; margin: 0 0 12px; letter-spacing: -0.04em; }
h2 { margin: 0 0 12px; }
.hero { margin-bottom: 24px; }
.muted { color: var(--muted); }
.notice { padding: 12px 14px; border: 1px solid var(--line); background: var(--panel); border-radius: 12px; }
.danger { border-color: rgba(239,68,68,.4); color: #fecaca; }
.controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; padding: 16px; margin: 18px 0 24px; background: var(--panel); border: 1px solid var(--line); border-radius: 16px; }
.controls.compact { grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); }
.controls.controls-categorized { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; align-items: stretch; }
.control-group { min-width: 0; min-inline-size: 0; margin: 0; padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel-2); }
.control-group legend { padding: 0 6px; color: var(--text); font-weight: 800; }
.control-group-description { margin: 2px 0 12px; color: var(--muted); font-size: .82rem; line-height: 1.35; }
.control-group-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 12px; }
.control-group select, .control-group input { background: var(--panel); }
.controls-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; }
.controls-actions button { width: min(220px, 100%); }
label { display: grid; gap: 6px; color: var(--muted); font-size: .9rem; }
.label-row, .heading-row, .th-label { display: inline-flex; gap: .35rem; align-items: center; min-width: 0; }
.th-label { white-space: nowrap; }
.tooltip { display: inline-flex; align-items: center; justify-content: center; width: 1.05rem; height: 1.05rem; flex: 0 0 auto; border: 1px solid var(--line); border-radius: 999px; background: var(--panel-2); color: var(--muted); font-size: .72rem; font-weight: 800; line-height: 1; cursor: help; text-transform: none; letter-spacing: normal; }
.tooltip:hover, .tooltip:focus-visible { color: var(--text); border-color: var(--accent); outline: none; }
.floating-tooltip { position: fixed; z-index: 9999; max-width: min(320px, calc(100vw - 16px)); padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); color: var(--text); box-shadow: 0 12px 30px rgba(0, 0, 0, .28); opacity: 0; pointer-events: none; transform: translateY(4px); transition: opacity .12s ease, transform .12s ease; white-space: normal; text-align: left; text-transform: none; letter-spacing: normal; font-size: .82rem; font-weight: 500; line-height: 1.35; }
.floating-tooltip.visible { opacity: 1; transform: translateY(0); }
.floating-tooltip::after { content: ""; position: absolute; left: var(--arrow-left, 50%); width: 8px; height: 8px; background: var(--panel-2); border: 1px solid var(--line); transform: translateX(-50%) rotate(45deg); }
.floating-tooltip[data-placement="above"]::after { top: calc(100% - 4px); border-left: 0; border-top: 0; }
.floating-tooltip[data-placement="below"]::after { bottom: calc(100% - 4px); border-right: 0; border-bottom: 0; }
select, input, button { width: 100%; border: 1px solid var(--line); background: var(--panel-2); color: var(--text); border-radius: 10px; padding: 9px 10px; }
button { cursor: pointer; background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 700; align-self: end; }
.table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); }
table { width: 100%; border-collapse: collapse; min-width: 980px; }
th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
th { position: sticky; top: 0; z-index: 1; background: var(--panel); color: var(--muted); font-size: .82rem; text-transform: uppercase; letter-spacing: .04em; }
th.num .th-label { justify-content: flex-end; width: 100%; }
th.center .th-label { justify-content: center; width: 100%; }
.score-table { min-width: 0; table-layout: fixed; font-size: .95rem; }
.score-table th, .score-table td { padding: 8px 8px; overflow-wrap: anywhere; }
.score-table th { font-size: .72rem; letter-spacing: .035em; }
.score-table .th-label { max-width: 100%; gap: .25rem; }
.score-table .tooltip { width: .95rem; height: .95rem; font-size: .64rem; }
.score-table .rank-col { width: 4%; }
.score-table .pareto-col { width: 6.5%; }
.score-table .model-col { width: 17.5%; }
.score-table .released-col { width: 9.5%; }
.score-table .cost-quality-col, .score-table .quality-col, .score-table .delta-col, .score-table .score-col { width: 6.5%; }
.score-table .cost-col { width: 7%; }
.score-table .metric-col { width: 6%; }
.score-table .penalty-col { width: 5.5%; }
tr:hover td { background: var(--hover); }
tr.frontier td:first-child { border-left: 3px solid var(--good); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.center { text-align: center; }
.strong { font-weight: 800; }
.empty { text-align: center; color: var(--muted); padding: 32px; }
small { color: var(--muted); }
code { background: var(--code-bg); padding: 2px 5px; border-radius: 6px; }
.status { padding: 3px 8px; border-radius: 999px; font-size: .8rem; font-weight: 700; }
.status.success { background: rgba(34,197,94,.15); color: #86efac; }
.status.error { background: rgba(239,68,68,.15); color: #fecaca; }
.status.running { background: rgba(245,158,11,.15); color: #fde68a; }
.winner-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 16px; margin: 20px 0; }
.winner-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.winner-head h2, .winner-panel h3 { margin: 0 0 8px; }
.winner-latest { display: grid; gap: 4px; min-width: 180px; padding: 12px; background: var(--panel-2); border-radius: 12px; }
.winner-latest span { color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
.winner-line { stroke: var(--good); }
.winner-dots { fill: var(--good); }
.winner-label { fill: var(--text); font-size: 11px; paint-order: stroke; stroke: var(--panel); stroke-width: 4px; stroke-linejoin: round; }
.winner-grid { display: grid; grid-template-columns: minmax(220px, .8fr) minmax(360px, 1.2fr); gap: 16px; align-items: start; }
.winner-chips { display: grid; gap: 8px; }
.winner-chip { display: grid; gap: 2px; padding: 10px 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; }
.winner-chip span { color: var(--muted); font-size: .85rem; }
.compact-table table { min-width: 620px; }
.charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 20px; }
.chart { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 16px; }
svg { width: 100%; height: auto; overflow: visible; }
svg line { stroke: var(--line); }
svg .axis-grid { opacity: .32; }
svg .axis-line { opacity: .9; }
svg .axis-value { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
svg .chart-entry { cursor: help; }
svg .chart-entry:hover, svg .chart-entry:focus-visible { stroke: var(--text); stroke-width: 2px; outline: none; }
svg polyline { fill: none; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
svg text { fill: var(--muted); font-size: 12px; }
@media (max-width: 760px) { .theme-picker { margin-left: 0; } .winner-grid { grid-template-columns: 1fr; } }
`;
