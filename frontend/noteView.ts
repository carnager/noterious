import { escapeHTML, parseFrontmatter, parseQueryFenceOptions, renderInline } from "./markdown";
import { formatMaybeDateValue } from "./datetime";
import type { DerivedPage, PageRecord, QueryBlockRecord, QueryBlockRender, QueryRow, TaskRender } from "./types";
import { pageTitleFromPath } from "./commands";

export function currentPageView(currentPage: PageRecord | null, currentMarkdown: string): PageRecord | null {
  if (!currentPage) {
    return null;
  }

  const liveFrontmatter = parseFrontmatter(currentMarkdown);
  const fallbackPath = currentPage.page || currentPage.path || "";
  const title = currentPage.title || pageTitleFromPath(fallbackPath);

  return Object.assign({}, currentPage, {
    frontmatter: liveFrontmatter,
    title: title || fallbackPath,
  });
}

function queryResultLinkSpec(columns: string[], row: QueryRow | null) {
  if (!Array.isArray(columns) || !row) {
    return null;
  }
  const pagePath = row.path || row.__pagePath;
  if (!pagePath) {
    return null;
  }

  if (columns.indexOf("vorname") !== -1 && columns.indexOf("nachname") !== -1) {
    const first = String(row.vorname || "").trim();
    const last = String(row.nachname || "").trim();
    const label = [first, last].filter(Boolean).join(" ").trim();
    if (label) {
      return {
        mode: "synthetic",
        column: "__page_link__" as string,
        label: "Name",
        text: label,
        hiddenColumns: ["path", "vorname", "nachname"] as string[],
      };
    }
  }

  const directCandidates = ["title", "name", "vorname", "nachname"];
  for (let index = 0; index < directCandidates.length; index += 1) {
    const candidate = directCandidates[index];
    if (columns.indexOf(candidate) !== -1 && row[candidate]) {
      return {
        mode: "column",
        columns: ["title", "name"].indexOf(candidate) !== -1 ? [candidate] : ["nachname", "vorname"].filter(function (field) {
          return columns.indexOf(field) !== -1 && Boolean(row[field]);
        }),
        hiddenColumns: columns.indexOf("path") !== -1 ? ["path"] : [],
      };
    }
  }

  return null;
}

function renderQueryResultCell(column: string, value: unknown): string {
  if (column === "path" && value) {
    const pagePath = String(value);
    return '<button type="button" class="wiki-link" data-page-link="' + escapeHTML(pagePath) + '">' + escapeHTML(pageTitleFromPath(pagePath)) + "</button>";
  }
  const isPhoneLikeColumn = /(^|_)(phone|telefon|tel)(_|$)/i.test(column);
  const splitPhoneLines = function (input: string): string[] {
    return input
      .split(/\r?\n|[;,](?=\s*\+?\d|\s*\(?\d)/)
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);
  };
  if (Array.isArray(value)) {
    const items = (isPhoneLikeColumn ? value.flatMap(function (item) {
      return splitPhoneLines(String(item));
    }) : value.map(function (item) {
      return formatMaybeDateValue(column, String(item));
    })).filter(Boolean);
    if (!items.length) {
      return '<span class="query-result-empty">—</span>';
    }
    return '<div class="query-result-lines">' + items.map(function (item) {
      return '<span class="query-result-line">' + escapeHTML(String(item)) + "</span>";
    }).join("") + "</div>";
  }
  if (isPhoneLikeColumn && typeof value === "string") {
    const lines = splitPhoneLines(value);
    if (lines.length > 1) {
      return '<div class="query-result-lines">' + lines.map(function (line) {
        return '<span class="query-result-line">' + escapeHTML(line) + "</span>";
      }).join("") + "</div>";
    }
  }
  if (value === null || typeof value === "undefined" || value === "") {
    return '<span class="query-result-empty">—</span>';
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return escapeHTML(formatMaybeDateValue(column, String(value)));
}

function queryResultDisplayColumns(columns: string[], rows: QueryRow[]): string[] {
  if (!Array.isArray(columns)) {
    return [];
  }

  const sampleRow = Array.isArray(rows) && rows.length ? rows[0] : null;
  const linkSpec = queryResultLinkSpec(columns, sampleRow);
  if (!linkSpec) {
    return columns.slice();
  }

  if (linkSpec.mode === "synthetic") {
    return [String(linkSpec.column)].concat(columns.filter(function (column) {
      return linkSpec.hiddenColumns.indexOf(column) === -1;
    }));
  }

  return columns.filter(function (column) {
    return linkSpec.hiddenColumns.indexOf(column) === -1;
  });
}

function queryResultColumnLabel(column: string, columns: string[], row: QueryRow | null): string {
  const linkSpec = queryResultLinkSpec(columns, row);
  if (linkSpec && linkSpec.mode === "synthetic" && column === linkSpec.column) {
    return linkSpec.label;
  }
  return column;
}

function renderQueryResultDisplayCell(column: string, row: QueryRow | null, columns: string[]): string {
  const linkSpec = queryResultLinkSpec(columns, row);
  const pagePathValue = row ? (row.path || row.__pagePath) : "";
  const pageLineValue = row ? row.__pageLine : "";
  if (linkSpec && pagePathValue) {
    const pagePath = String(pagePathValue);
    if (linkSpec.mode === "synthetic" && column === linkSpec.column) {
      return '<button type="button" class="wiki-link query-cell-link" data-page-link="' + escapeHTML(pagePath) + '">' + escapeHTML(linkSpec.text) + "</button>";
    }
    if (linkSpec.mode === "column" && Array.isArray(linkSpec.columns) && linkSpec.columns.indexOf(column) !== -1) {
      return '<button type="button" class="wiki-link query-cell-link" data-page-link="' + escapeHTML(pagePath) + '">' + escapeHTML(String(row?.[column])) + "</button>";
    }
  }
  if ((column === "text" || (column === "task" && row && row.__taskRef)) && pagePathValue) {
    const pagePath = String(pagePathValue);
    const lineAttr = pageLineValue !== null && typeof pageLineValue !== "undefined"
      ? ' data-page-line="' + escapeHTML(String(pageLineValue)) + '"'
      : "";
    const refValue = row && row.__taskRef ? String(row.__taskRef) : "";
    const refAttr = refValue ? ' data-task-ref="' + escapeHTML(refValue) + '"' : "";
    return '<button type="button" class="wiki-link query-cell-link" data-page-link="' + escapeHTML(pagePath) + '"' + lineAttr + refAttr + '>' +
      escapeHTML(String(row ? row[column] || "" : "")) +
      "</button>";
  }
  return renderQueryResultCell(column, row ? row[column] : undefined);
}

function renderEmbeddedQueryBlock(block: QueryBlockRecord | null): string | null {
  if (!block) {
    return null;
  }
  const options = parseQueryFenceOptions(block.source || "");
  if (block.error) {
    return '<div class="embedded-query embedded-query-error"><small>' + escapeHTML(block.error) + "</small></div>";
  }

  const columns = Array.isArray(block.result?.columns) ? block.result.columns : [];
  const rows = Array.isArray(block.result?.rows) ? block.result.rows : [];
  const displayColumns = queryResultDisplayColumns(columns, rows);

  if (!rows.length) {
    return '<div class="embedded-query embedded-query-empty"><small>' + escapeHTML(options.empty || "No results.") + "</small></div>";
  }

  if (displayColumns.length === 1) {
    return '<div class="embedded-query embedded-query-list"><ul>' +
      rows.map(function (row) {
        return "<li>" + renderQueryResultDisplayCell(displayColumns[0], row, columns) + "</li>";
      }).join("") +
      "</ul></div>";
  }

  return '<div class="embedded-query embedded-query-table"><table><thead><tr>' +
    displayColumns.map(function (column) {
      return "<th>" + escapeHTML(queryResultColumnLabel(column, columns, rows[0] || null)) + "</th>";
    }).join("") +
    "</tr></thead><tbody>" +
    rows.map(function (row) {
      return "<tr>" + displayColumns.map(function (column) {
        return "<td>" + renderQueryResultDisplayCell(column, row, columns) + "</td>";
      }).join("") + "</tr>";
    }).join("") +
    "</tbody></table></div>";
}

export function renderedQueryBlocksForEditor(derived: DerivedPage | null): QueryBlockRender[] {
  if (!derived || !Array.isArray(derived.queryBlocks)) {
    return [];
  }
  return derived.queryBlocks.map(function (block) {
    return {
      source: block.source || "",
      html: renderEmbeddedQueryBlock(block) || '<div class="embedded-query embedded-query-empty"><small>No results.</small></div>',
    };
  });
}

export function renderedTasksForEditor(page: PageRecord | null): TaskRender[] {
  if (!page || !Array.isArray(page.tasks)) {
    return [];
  }
  return page.tasks.map(function (task) {
    return {
      line: task.line,
      ref: task.ref || "",
      text: task.text || "",
      done: Boolean(task.done),
      due: task.due || "",
      remind: task.remind || "",
      who: Array.isArray(task.who) ? task.who.slice() : [],
    };
  });
}
