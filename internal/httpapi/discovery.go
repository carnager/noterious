package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/carnager/noterious/internal/index"
)

type pageCountsResponse struct {
	OutgoingLinks int `json:"outgoingLinks"`
	Backlinks     int `json:"backlinks"`
	Tasks         int `json:"tasks"`
	OpenTasks     int `json:"openTasks"`
	DoneTasks     int `json:"doneTasks"`
	QueryBlocks   int `json:"queryBlocks"`
}

type pageListItemResponse struct {
	Path      string             `json:"path"`
	Title     string             `json:"title"`
	CreatedAt string             `json:"createdAt"`
	UpdatedAt string             `json:"updatedAt"`
	Tags      []string           `json:"tags"`
	Counts    pageCountsResponse `json:"counts"`
}

type pageListResponse struct {
	Query string                 `json:"query"`
	Tag   string                 `json:"tag"`
	Pages []pageListItemResponse `json:"pages"`
	Count int                    `json:"count"`
}

type searchCountsResponse struct {
	Pages   int `json:"pages"`
	Tasks   int `json:"tasks"`
	Queries int `json:"queries"`
	Total   int `json:"total"`
}

type pageSearchResultResponse struct {
	Path    string `json:"path"`
	Title   string `json:"title"`
	Match   string `json:"match"`
	Line    int    `json:"line"`
	Snippet string `json:"snippet"`
}

type taskSearchResultResponse struct {
	Ref     string `json:"ref"`
	Page    string `json:"page"`
	Line    int    `json:"line"`
	Text    string `json:"text"`
	Done    bool   `json:"done"`
	Snippet string `json:"snippet"`
}

type savedQuerySearchResultResponse struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Folder      string `json:"folder"`
	Match       string `json:"match"`
	Snippet     string `json:"snippet"`
}

type searchResponse struct {
	Query   string                           `json:"query"`
	Pages   []pageSearchResultResponse       `json:"pages"`
	Tasks   []taskSearchResultResponse       `json:"tasks"`
	Queries []savedQuerySearchResultResponse `json:"queries"`
	Counts  searchCountsResponse             `json:"counts"`
}

type linkSummaryResponse struct {
	Total     int `json:"total"`
	Wikilink  int `json:"wikilink"`
	Markdown  int `json:"markdown"`
	OtherKind int `json:"otherKind"`
}

type linksResponse struct {
	Query      string              `json:"query"`
	SourcePage string              `json:"sourcePage"`
	TargetPage string              `json:"targetPage"`
	Kind       string              `json:"kind"`
	Links      []index.Link        `json:"links"`
	Count      int                 `json:"count"`
	Summary    linkSummaryResponse `json:"summary"`
}

func mountDiscoveryEndpoints(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("GET /api/pages", func(w http.ResponseWriter, r *http.Request) {
		handlePagesListRequest(w, r, deps)
	})

	mux.HandleFunc("GET /api/search", func(w http.ResponseWriter, r *http.Request) {
		handleSearchRequest(w, r, deps)
	})

	mux.HandleFunc("GET /api/links", func(w http.ResponseWriter, r *http.Request) {
		handleLinksRequest(w, r, deps)
	})
}

func handlePagesListRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
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

	writeJSON(w, http.StatusOK, pageListResponse{
		Query: queryText,
		Tag:   tagFilter,
		Pages: summaries,
		Count: len(summaries),
	})
}

func handleSearchRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	queryText := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := 12
	if queryText == "" {
		writeJSON(w, http.StatusOK, emptySearchResponse())
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

	writeJSON(w, http.StatusOK, linksResponse{
		Query:      queryText,
		SourcePage: sourcePage,
		TargetPage: targetPage,
		Kind:       kind,
		Links:      links,
		Count:      len(links),
		Summary:    summarizeLinks(links),
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

func summarizeLinks(links []index.Link) linkSummaryResponse {
	summary := linkSummaryResponse{
		Total: len(links),
	}
	for _, link := range links {
		switch strings.ToLower(strings.TrimSpace(link.Kind)) {
		case "wikilink":
			summary.Wikilink++
		case "markdown":
			summary.Markdown++
		default:
			summary.OtherKind++
		}
	}
	return summary
}

func buildPageListSummaries(pages []index.PageSummary) ([]pageListItemResponse, error) {
	summaries := make([]pageListItemResponse, 0, len(pages))
	for _, page := range pages {
		summaries = append(summaries, pageListItemResponse{
			Path:      page.Path,
			Title:     page.Title,
			CreatedAt: page.CreatedAt,
			UpdatedAt: page.UpdatedAt,
			Tags:      append([]string(nil), page.Tags...),
			Counts: pageCountsResponse{
				OutgoingLinks: page.OutgoingLinkCount,
				Backlinks:     page.BacklinkCount,
				Tasks:         page.TaskCount,
				OpenTasks:     page.OpenTaskCount,
				DoneTasks:     page.DoneTaskCount,
				QueryBlocks:   page.QueryBlockCount,
			},
		})
	}
	return summaries, nil
}

func filterPageListByTag(pages []pageListItemResponse, tag string) []pageListItemResponse {
	needle := strings.ToLower(strings.TrimSpace(tag))
	if needle == "" {
		return pages
	}

	filtered := make([]pageListItemResponse, 0, len(pages))
	for _, page := range pages {
		for _, item := range page.Tags {
			if strings.EqualFold(strings.TrimSpace(item), needle) {
				filtered = append(filtered, page)
				break
			}
		}
	}
	return filtered
}

func emptySearchResponse() searchResponse {
	return searchResponse{
		Query:   "",
		Pages:   []pageSearchResultResponse{},
		Tasks:   []taskSearchResultResponse{},
		Queries: []savedQuerySearchResultResponse{},
		Counts:  searchCountsResponse{},
	}
}

func performGlobalSearch(ctx context.Context, indexService *index.Service, queryText string, limit int) (searchResponse, error) {
	needle := strings.ToLower(strings.TrimSpace(queryText))
	if needle == "" {
		return emptySearchResponse(), nil
	}
	if limit <= 0 {
		limit = 12
	}

	pageSummaries, err := indexService.ListPages(ctx)
	if err != nil {
		return searchResponse{}, err
	}
	pageResults := make([]pageSearchResultResponse, 0, limit)
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
			pageResults = append(pageResults, *result)
		}
	}

	tasks, err := indexService.ListTasks(ctx)
	if err != nil {
		return searchResponse{}, err
	}
	taskResults := make([]taskSearchResultResponse, 0, limit)
	for _, task := range tasks {
		if len(taskResults) >= limit {
			break
		}
		if result := searchTaskRecord(task, needle); result != nil {
			taskResults = append(taskResults, *result)
		}
	}

	savedQueries, err := indexService.ListSavedQueries(ctx)
	if err != nil {
		return searchResponse{}, err
	}
	queryResults := make([]savedQuerySearchResultResponse, 0, limit)
	for _, savedQuery := range savedQueries {
		if len(queryResults) >= limit {
			break
		}
		if result := searchSavedQueryRecord(savedQuery, needle); result != nil {
			queryResults = append(queryResults, *result)
		}
	}

	return searchResponse{
		Query:   queryText,
		Pages:   pageResults,
		Tasks:   taskResults,
		Queries: queryResults,
		Counts: searchCountsResponse{
			Pages:   len(pageResults),
			Tasks:   len(taskResults),
			Queries: len(queryResults),
			Total:   len(pageResults) + len(taskResults) + len(queryResults),
		},
	}, nil
}

func searchPageRecord(page index.PageRecord, needle string) *pageSearchResultResponse {
	pathValue := page.Path
	titleValue := page.Title
	if strings.Contains(strings.ToLower(pathValue), needle) {
		return &pageSearchResultResponse{Path: page.Path, Title: page.Title, Match: "path", Line: 1, Snippet: page.Path}
	}
	if strings.Contains(strings.ToLower(titleValue), needle) {
		line := findFirstMatchingLine(page.RawMarkdown, titleValue)
		if line <= 0 {
			line = 1
		}
		return &pageSearchResultResponse{Path: page.Path, Title: page.Title, Match: "title", Line: line, Snippet: page.Title}
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
			return &pageSearchResultResponse{
				Path:    page.Path,
				Title:   page.Title,
				Match:   "frontmatter:" + key,
				Line:    line,
				Snippet: key + ": " + clipSnippet(text, 80),
			}
		}
	}

	if snippet := extractSearchSnippet(page.RawMarkdown, needle, 96); snippet != "" {
		line := findFirstMatchingLine(page.RawMarkdown, needle)
		if line <= 0 {
			line = 1
		}
		return &pageSearchResultResponse{Path: page.Path, Title: page.Title, Match: "content", Line: line, Snippet: snippet}
	}
	return nil
}

func searchTaskRecord(task index.Task, needle string) *taskSearchResultResponse {
	candidates := []string{
		task.Ref,
		task.Page,
		task.Text,
		strings.Join(task.Who, ", "),
	}
	for _, candidate := range candidates {
		if strings.Contains(strings.ToLower(candidate), needle) {
			return &taskSearchResultResponse{
				Ref:     task.Ref,
				Page:    task.Page,
				Line:    task.Line,
				Text:    task.Text,
				Done:    task.Done,
				Snippet: clipSnippet(candidate, 96),
			}
		}
	}
	return nil
}

func searchSavedQueryRecord(savedQuery index.SavedQuery, needle string) *savedQuerySearchResultResponse {
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
			return &savedQuerySearchResultResponse{
				Name:        savedQuery.Name,
				Title:       savedQuery.Title,
				Description: savedQuery.Description,
				Folder:      savedQuery.Folder,
				Match:       candidate.match,
				Snippet:     clipSnippet(candidate.text, 96),
			}
		}
	}
	for _, tag := range savedQuery.Tags {
		if strings.Contains(strings.ToLower(tag), needle) {
			return &savedQuerySearchResultResponse{
				Name:        savedQuery.Name,
				Title:       savedQuery.Title,
				Description: savedQuery.Description,
				Folder:      savedQuery.Folder,
				Match:       "tag",
				Snippet:     tag,
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
	openTaskCount, doneTaskCount := countTaskStates(pageRecord.Tasks)
	return index.PageSummary{
		Path:              pageRecord.Path,
		Title:             pageRecord.Title,
		Tags:              frontmatterStringList(pageRecord.Frontmatter["tags"]),
		Frontmatter:       pageRecord.Frontmatter,
		OutgoingLinkCount: len(pageRecord.Links),
		BacklinkCount:     len(backlinks),
		TaskCount:         len(pageRecord.Tasks),
		OpenTaskCount:     openTaskCount,
		DoneTaskCount:     doneTaskCount,
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
