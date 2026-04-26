package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/carnager/noterious/internal/index"
)

func mountDiscoveryEndpoints(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("/api/pages", func(w http.ResponseWriter, r *http.Request) {
		handlePagesListRequest(w, r, deps)
	})

	mux.HandleFunc("/api/search", func(w http.ResponseWriter, r *http.Request) {
		handleSearchRequest(w, r, deps)
	})

	mux.HandleFunc("/api/links", func(w http.ResponseWriter, r *http.Request) {
		handleLinksRequest(w, r, deps)
	})
}

func handlePagesListRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w, http.MethodGet)
		return
	}

	pages, err := deps.Index.ListPages(r.Context())
	if err != nil {
		http.Error(w, "failed to list pages", http.StatusInternalServerError)
		return
	}

	queryText := strings.TrimSpace(r.URL.Query().Get("q"))
	if queryText != "" {
		pages = filterPageSummaries(pages, queryText)
	}

	summaries, err := buildPageListSummaries(pages)
	if err != nil {
		http.Error(w, "failed to build page summaries", http.StatusInternalServerError)
		return
	}

	tagFilter := strings.TrimSpace(r.URL.Query().Get("tag"))
	if tagFilter != "" {
		summaries = filterPageListByTag(summaries, tagFilter)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"query": queryText,
		"tag":   tagFilter,
		"pages": summaries,
		"count": len(summaries),
	})
}

func handleSearchRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w, http.MethodGet)
		return
	}

	queryText := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := 12
	if queryText == "" {
		writeJSON(w, http.StatusOK, map[string]any{
			"query":   "",
			"pages":   []any{},
			"tasks":   []any{},
			"queries": []any{},
			"counts": map[string]int{
				"pages":   0,
				"tasks":   0,
				"queries": 0,
				"total":   0,
			},
		})
		return
	}

	result, err := performGlobalSearch(r.Context(), deps.Index, queryText, limit)
	if err != nil {
		http.Error(w, "failed to search", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func handleLinksRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w, http.MethodGet)
		return
	}

	links, err := deps.Index.ListLinks(r.Context())
	if err != nil {
		http.Error(w, "failed to list links", http.StatusInternalServerError)
		return
	}

	queryText := strings.TrimSpace(r.URL.Query().Get("q"))
	if queryText != "" {
		links = filterLinks(links, queryText)
	}
	sourcePage := strings.TrimSpace(r.URL.Query().Get("sourcePage"))
	if sourcePage != "" {
		links = filterLinksBySourcePage(links, sourcePage)
	}
	targetPage := strings.TrimSpace(r.URL.Query().Get("targetPage"))
	if targetPage != "" {
		links = filterLinksByTargetPage(links, targetPage)
	}
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	if kind != "" {
		links = filterLinksByKind(links, kind)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"query":      queryText,
		"sourcePage": sourcePage,
		"targetPage": targetPage,
		"kind":       kind,
		"links":      links,
		"count":      len(links),
		"summary":    summarizeLinks(links),
	})
}

func filterPageSummaries(pages []index.PageSummary, queryText string) []index.PageSummary {
	needle := strings.ToLower(strings.TrimSpace(queryText))
	if needle == "" {
		return pages
	}

	filtered := make([]index.PageSummary, 0, len(pages))
	for _, page := range pages {
		if strings.Contains(strings.ToLower(page.Path), needle) || strings.Contains(strings.ToLower(page.Title), needle) {
			filtered = append(filtered, page)
		}
	}
	return filtered
}

func filterLinks(links []index.Link, queryText string) []index.Link {
	needle := strings.ToLower(strings.TrimSpace(queryText))
	if needle == "" {
		return links
	}

	filtered := make([]index.Link, 0, len(links))
	for _, link := range links {
		if strings.Contains(strings.ToLower(link.SourcePage), needle) ||
			strings.Contains(strings.ToLower(link.TargetPage), needle) ||
			strings.Contains(strings.ToLower(link.LinkText), needle) ||
			strings.Contains(strings.ToLower(link.Kind), needle) {
			filtered = append(filtered, link)
		}
	}
	return filtered
}

func filterLinksBySourcePage(links []index.Link, sourcePage string) []index.Link {
	needle := strings.TrimSpace(sourcePage)
	if needle == "" {
		return links
	}

	filtered := make([]index.Link, 0, len(links))
	for _, link := range links {
		if strings.EqualFold(link.SourcePage, needle) {
			filtered = append(filtered, link)
		}
	}
	return filtered
}

func filterLinksByTargetPage(links []index.Link, targetPage string) []index.Link {
	needle := strings.TrimSpace(targetPage)
	if needle == "" {
		return links
	}

	filtered := make([]index.Link, 0, len(links))
	for _, link := range links {
		if strings.EqualFold(link.TargetPage, needle) {
			filtered = append(filtered, link)
		}
	}
	return filtered
}

func filterLinksByKind(links []index.Link, kind string) []index.Link {
	needle := strings.TrimSpace(kind)
	if needle == "" {
		return links
	}

	filtered := make([]index.Link, 0, len(links))
	for _, link := range links {
		if strings.EqualFold(link.Kind, needle) {
			filtered = append(filtered, link)
		}
	}
	return filtered
}

func summarizeLinks(links []index.Link) map[string]int {
	summary := map[string]int{
		"total":     len(links),
		"wikilink":  0,
		"markdown":  0,
		"otherKind": 0,
	}
	for _, link := range links {
		switch strings.ToLower(strings.TrimSpace(link.Kind)) {
		case "wikilink":
			summary["wikilink"]++
		case "markdown":
			summary["markdown"]++
		default:
			summary["otherKind"]++
		}
	}
	return summary
}

func buildPageListSummaries(pages []index.PageSummary) ([]map[string]any, error) {
	summaries := make([]map[string]any, 0, len(pages))
	for _, page := range pages {
		summaries = append(summaries, map[string]any{
			"path":      page.Path,
			"title":     page.Title,
			"createdAt": page.CreatedAt,
			"updatedAt": page.UpdatedAt,
			"tags":      append([]string(nil), page.Tags...),
			"counts": map[string]int{
				"outgoingLinks": page.OutgoingLinkCount,
				"backlinks":     page.BacklinkCount,
				"tasks":         page.TaskCount,
				"openTasks":     page.OpenTaskCount,
				"doneTasks":     page.DoneTaskCount,
				"queryBlocks":   page.QueryBlockCount,
			},
		})
	}
	return summaries, nil
}

func filterPageListByTag(pages []map[string]any, tag string) []map[string]any {
	needle := strings.ToLower(strings.TrimSpace(tag))
	if needle == "" {
		return pages
	}

	filtered := make([]map[string]any, 0, len(pages))
	for _, page := range pages {
		tags, ok := page["tags"].([]string)
		if !ok {
			continue
		}
		for _, item := range tags {
			if strings.EqualFold(strings.TrimSpace(item), needle) {
				filtered = append(filtered, page)
				break
			}
		}
	}
	return filtered
}

func performGlobalSearch(ctx context.Context, indexService *index.Service, queryText string, limit int) (map[string]any, error) {
	needle := strings.ToLower(strings.TrimSpace(queryText))
	if needle == "" {
		return map[string]any{
			"query":   "",
			"pages":   []any{},
			"tasks":   []any{},
			"queries": []any{},
			"counts": map[string]int{
				"pages":   0,
				"tasks":   0,
				"queries": 0,
				"total":   0,
			},
		}, nil
	}
	if limit <= 0 {
		limit = 12
	}

	pageSummaries, err := indexService.ListPages(ctx)
	if err != nil {
		return nil, err
	}
	pageResults := make([]map[string]any, 0, limit)
	for _, summary := range pageSummaries {
		if len(pageResults) >= limit {
			break
		}
		record, err := indexService.GetPage(ctx, summary.Path)
		if err != nil {
			continue
		}
		result := searchPageRecord(record, needle)
		if result != nil {
			pageResults = append(pageResults, result)
		}
	}

	tasks, err := indexService.ListTasks(ctx)
	if err != nil {
		return nil, err
	}
	taskResults := make([]map[string]any, 0, limit)
	for _, task := range tasks {
		if len(taskResults) >= limit {
			break
		}
		if result := searchTaskRecord(task, needle); result != nil {
			taskResults = append(taskResults, result)
		}
	}

	savedQueries, err := indexService.ListSavedQueries(ctx)
	if err != nil {
		return nil, err
	}
	queryResults := make([]map[string]any, 0, limit)
	for _, savedQuery := range savedQueries {
		if len(queryResults) >= limit {
			break
		}
		if result := searchSavedQueryRecord(savedQuery, needle); result != nil {
			queryResults = append(queryResults, result)
		}
	}

	return map[string]any{
		"query":   queryText,
		"pages":   pageResults,
		"tasks":   taskResults,
		"queries": queryResults,
		"counts": map[string]int{
			"pages":   len(pageResults),
			"tasks":   len(taskResults),
			"queries": len(queryResults),
			"total":   len(pageResults) + len(taskResults) + len(queryResults),
		},
	}, nil
}

func searchPageRecord(page index.PageRecord, needle string) map[string]any {
	pathValue := page.Path
	titleValue := page.Title
	if strings.Contains(strings.ToLower(pathValue), needle) {
		return map[string]any{
			"path":    page.Path,
			"title":   page.Title,
			"match":   "path",
			"line":    1,
			"snippet": page.Path,
		}
	}
	if strings.Contains(strings.ToLower(titleValue), needle) {
		line := findFirstMatchingLine(page.RawMarkdown, titleValue)
		if line <= 0 {
			line = 1
		}
		return map[string]any{
			"path":    page.Path,
			"title":   page.Title,
			"match":   "title",
			"line":    line,
			"snippet": page.Title,
		}
	}

	for key, value := range page.Frontmatter {
		text := displayFrontmatterSearchValue(value)
		if strings.Contains(strings.ToLower(text), needle) {
			line := findFirstMatchingLine(page.RawMarkdown, key+": "+text)
			if line <= 0 {
				line = findFirstMatchingLine(page.RawMarkdown, key+":")
			}
			if line <= 0 {
				line = findFirstMatchingLine(page.RawMarkdown, text)
			}
			if line <= 0 {
				line = 1
			}
			return map[string]any{
				"path":    page.Path,
				"title":   page.Title,
				"match":   "frontmatter:" + key,
				"line":    line,
				"snippet": key + ": " + clipSnippet(text, 80),
			}
		}
	}

	if snippet := extractSearchSnippet(page.RawMarkdown, needle, 96); snippet != "" {
		line := findFirstMatchingLine(page.RawMarkdown, needle)
		if line <= 0 {
			line = 1
		}
		return map[string]any{
			"path":    page.Path,
			"title":   page.Title,
			"match":   "content",
			"line":    line,
			"snippet": snippet,
		}
	}
	return nil
}

func searchTaskRecord(task index.Task, needle string) map[string]any {
	candidates := []string{
		task.Ref,
		task.Page,
		task.Text,
		strings.Join(task.Who, ", "),
	}
	for _, candidate := range candidates {
		if strings.Contains(strings.ToLower(candidate), needle) {
			return map[string]any{
				"ref":     task.Ref,
				"page":    task.Page,
				"line":    task.Line,
				"text":    task.Text,
				"done":    task.Done,
				"snippet": clipSnippet(candidate, 96),
			}
		}
	}
	return nil
}

func searchSavedQueryRecord(savedQuery index.SavedQuery, needle string) map[string]any {
	candidates := []struct {
		match string
		text  string
	}{
		{match: "name", text: savedQuery.Name},
		{match: "title", text: savedQuery.Title},
		{match: "description", text: savedQuery.Description},
		{match: "folder", text: savedQuery.Folder},
		{match: "query", text: savedQuery.Query},
	}
	for _, candidate := range candidates {
		if strings.Contains(strings.ToLower(candidate.text), needle) {
			return map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"match":       candidate.match,
				"snippet":     clipSnippet(candidate.text, 96),
			}
		}
	}
	for _, tag := range savedQuery.Tags {
		if strings.Contains(strings.ToLower(tag), needle) {
			return map[string]any{
				"name":        savedQuery.Name,
				"title":       savedQuery.Title,
				"description": savedQuery.Description,
				"folder":      savedQuery.Folder,
				"match":       "tag",
				"snippet":     tag,
			}
		}
	}
	return nil
}

func displayFrontmatterSearchValue(value any) string {
	switch typed := value.(type) {
	case []string:
		return strings.Join(typed, ", ")
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			parts = append(parts, displayFrontmatterSearchValue(item))
		}
		return strings.Join(parts, ", ")
	case string:
		return typed
	case bool:
		if typed {
			return "true"
		}
		return "false"
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}

func extractSearchSnippet(raw string, needle string, width int) string {
	body := strings.ReplaceAll(raw, "\r\n", "\n")
	lower := strings.ToLower(body)
	index := strings.Index(lower, needle)
	if index < 0 {
		return ""
	}
	start := index - width/2
	if start < 0 {
		start = 0
	}
	end := index + len(needle) + width/2
	if end > len(body) {
		end = len(body)
	}
	return clipSnippet(strings.ReplaceAll(body[start:end], "\n", " "), width)
}

func findFirstMatchingLine(raw string, needle string) int {
	if strings.TrimSpace(needle) == "" {
		return 0
	}
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	lowerNeedle := strings.ToLower(needle)
	for idx, line := range lines {
		if strings.Contains(strings.ToLower(line), lowerNeedle) {
			return idx + 1
		}
	}
	return 0
}

func clipSnippet(text string, width int) string {
	normalized := strings.Join(strings.Fields(strings.TrimSpace(text)), " ")
	if width <= 0 || len(normalized) <= width {
		return normalized
	}
	return normalized[:width-1] + "..."
}

func summarizePageRecord(ctx context.Context, indexService *index.Service, pageRecord index.PageRecord) (index.PageSummary, error) {
	backlinks, err := indexService.GetBacklinks(ctx, pageRecord.Path)
	if err != nil && !errors.Is(err, index.ErrPageNotFound) {
		return index.PageSummary{}, err
	}
	queryBlocks, err := indexService.GetQueryBlocks(ctx, pageRecord.Path)
	if err != nil && !errors.Is(err, index.ErrPageNotFound) {
		return index.PageSummary{}, err
	}
	return index.PageSummary{
		Path:              pageRecord.Path,
		Title:             pageRecord.Title,
		Tags:              frontmatterStringList(pageRecord.Frontmatter["tags"]),
		Frontmatter:       pageRecord.Frontmatter,
		OutgoingLinkCount: len(pageRecord.Links),
		BacklinkCount:     len(backlinks),
		TaskCount:         len(pageRecord.Tasks),
		OpenTaskCount:     countOpenTasks(pageRecord.Tasks),
		DoneTaskCount:     countDoneTasks(pageRecord.Tasks),
		QueryBlockCount:   len(queryBlocks),
		CreatedAt:         pageRecord.CreatedAt,
		UpdatedAt:         pageRecord.UpdatedAt,
	}, nil
}

func frontmatterStringList(value any) []string {
	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			text, ok := item.(string)
			if ok && strings.TrimSpace(text) != "" {
				items = append(items, text)
			}
		}
		return items
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil
		}
		return []string{trimmed}
	default:
		return nil
	}
}
