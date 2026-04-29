package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/markdown"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/vault"
)

type taskCountsPayload struct {
	Total int `json:"total"`
	Open  int `json:"open"`
	Done  int `json:"done"`
}

type linkCountsPayload struct {
	Outgoing  int `json:"outgoing"`
	Backlinks int `json:"backlinks"`
}

type pageRecordResponse struct {
	Page        string         `json:"page"`
	Title       string         `json:"title"`
	RawMarkdown string         `json:"rawMarkdown"`
	CreatedAt   string         `json:"createdAt"`
	UpdatedAt   string         `json:"updatedAt"`
	Frontmatter map[string]any `json:"frontmatter"`
	Links       []index.Link   `json:"links"`
	Tasks       []index.Task   `json:"tasks"`
}

type derivedPageResponse struct {
	Page        string                 `json:"page"`
	Title       string                 `json:"title"`
	TOC         []index.Heading        `json:"toc"`
	Links       []index.Link           `json:"links"`
	Tasks       []index.Task           `json:"tasks"`
	Backlinks   []index.BacklinkRecord `json:"backlinks"`
	QueryBlocks []index.QueryBlock     `json:"queryBlocks"`
	LinkCounts  linkCountsPayload      `json:"linkCounts"`
	TaskCounts  taskCountsPayload      `json:"taskCounts"`
}

type queryBlocksResponse struct {
	Page        string             `json:"page"`
	QueryBlocks []index.QueryBlock `json:"queryBlocks"`
	Count       int                `json:"count"`
}

type queryBlockResponse struct {
	Page       string           `json:"page"`
	QueryBlock index.QueryBlock `json:"queryBlock"`
}

type backlinksResponse struct {
	Page      string                 `json:"page"`
	Backlinks []index.BacklinkRecord `json:"backlinks"`
}

type pageDeletedResponse struct {
	OK   bool   `json:"ok"`
	Page string `json:"page"`
}

type indexedPageState struct {
	summary *index.PageSummary
	tasks   []index.Task
}

type rewrittenPageState struct {
	path   string
	before indexedPageState
	after  indexedPageState
}

func handlePageRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	handlePageRequestByMethod(w, r, deps, r.Method)
}

func mountPageEndpoints(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("GET /api/pages/", func(w http.ResponseWriter, r *http.Request) {
		handlePageRequestByMethod(w, r, deps, http.MethodGet)
	})
	mux.HandleFunc("PUT /api/pages/", func(w http.ResponseWriter, r *http.Request) {
		handlePageRequestByMethod(w, r, deps, http.MethodPut)
	})
	mux.HandleFunc("PATCH /api/pages/", func(w http.ResponseWriter, r *http.Request) {
		handlePageRequestByMethod(w, r, deps, http.MethodPatch)
	})
	mux.HandleFunc("DELETE /api/pages/", func(w http.ResponseWriter, r *http.Request) {
		handlePageRequestByMethod(w, r, deps, http.MethodDelete)
	})
	mux.HandleFunc("POST /api/pages/", func(w http.ResponseWriter, r *http.Request) {
		handlePageRequestByMethod(w, r, deps, http.MethodPost)
	})
}

func handlePageRequestByMethod(w http.ResponseWriter, r *http.Request, deps Dependencies, method string) {
	vaultService := currentVault(r.Context(), deps)
	pagePath, subresource, ok := splitPageSubresource(strings.TrimPrefix(r.URL.Path, "/api/pages/"))
	if !ok {
		http.Error(w, "invalid page path", http.StatusBadRequest)
		return
	}

	switch method {
	case http.MethodGet:
		switch subresource {
		case "":
			handlePageGetRequest(w, r, deps, pagePath)
		case "backlinks":
			handlePageBacklinksRequest(w, r, deps, pagePath)
		case "derived":
			handlePageDerivedRequest(w, r, deps, pagePath)
		case "query-blocks":
			handlePageQueryBlocksGet(w, r, deps, pagePath)
		case "frontmatter", "move":
			writeMethodNotAllowed(w, http.MethodPatch)
		default:
			http.NotFound(w, r)
		}
	case http.MethodPut:
		switch subresource {
		case "":
			handlePagePutRequest(w, r, deps, vaultService, pagePath)
		case "backlinks", "derived", "frontmatter", "move", "query-blocks":
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPatch, http.MethodDelete, http.MethodPost)
		default:
			http.NotFound(w, r)
		}
	case http.MethodDelete:
		switch subresource {
		case "":
			handlePageDeleteRequest(w, r, deps, vaultService, pagePath)
		case "backlinks", "derived", "frontmatter", "move", "query-blocks":
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPut, http.MethodPatch, http.MethodPost)
		default:
			http.NotFound(w, r)
		}
	case http.MethodPatch:
		switch subresource {
		case "":
			handlePagePatchRequest(w, r, deps, pagePath)
		case "frontmatter":
			handlePageFrontmatterPatchRequest(w, r, deps, pagePath)
		case "backlinks", "derived", "move", "query-blocks":
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPut, http.MethodDelete, http.MethodPost)
		default:
			http.NotFound(w, r)
		}
	default:
		switch subresource {
		case "move":
			handlePageMoveRequest(w, r, deps, vaultService, pagePath)
		case "query-blocks":
			handlePageQueryBlocksPost(w, r, deps, pagePath)
		case "", "backlinks", "derived", "frontmatter":
			http.NotFound(w, r)
		default:
			http.NotFound(w, r)
		}
	}
}

func handlePageGetRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, pagePath string) {
	pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
	if err != nil {
		writePageError(w, r, err, "failed to load page")
		return
	}
	writeJSON(w, http.StatusOK, pageRecordPayload(pageRecord))
}

func handlePageBacklinksRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, pagePath string) {
	backlinks, err := deps.Index.GetBacklinks(r.Context(), pagePath)
	if err != nil {
		writePageError(w, r, err, "failed to load backlinks")
		return
	}
	writeJSON(w, http.StatusOK, backlinksResponse{
		Page:      pagePath,
		Backlinks: backlinks,
	})
}

func handlePageDerivedRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, pagePath string) {
	if err := refreshPageQueryState(r.Context(), deps, pagePath); err != nil {
		writePageError(w, r, err, "failed to refresh derived query state")
		return
	}
	pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
	if err != nil {
		writePageError(w, r, err, "failed to load derived state")
		return
	}
	backlinks, err := deps.Index.GetBacklinks(r.Context(), pagePath)
	if err != nil {
		writePageError(w, r, err, "failed to load derived state")
		return
	}
	queryBlocks, err := loadFreshEnrichedQueryBlocks(r.Context(), deps, pagePath)
	if err != nil {
		writePageError(w, r, err, "failed to load derived state")
		return
	}
	writeJSON(w, http.StatusOK, derivedPagePayload(pageRecord, backlinks, queryBlocks))
}

func handlePagePutRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, vaultService *vault.Service, pagePath string) {
	var previousTasks []index.Task
	var previousPageSummary *index.PageSummary
	if existingPage, err := deps.Index.GetPage(r.Context(), pagePath); err == nil {
		previousTasks = append(previousTasks, existingPage.Tasks...)
		summary, err := summarizePageRecord(r.Context(), deps.Index, existingPage)
		if err == nil {
			previousPageSummary = &summary
		}
	}
	var request struct {
		RawMarkdown string `json:"rawMarkdown"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if err := vaultService.WritePage(pagePath, []byte(request.RawMarkdown)); err != nil {
		http.Error(w, "failed to write page", http.StatusInternalServerError)
		return
	}
	acknowledgePageChanges(r.Context(), deps, pagePath)
	if deps.History != nil {
		if _, err := deps.History.SaveRevision(pagePath, []byte(request.RawMarkdown)); err != nil {
			http.Error(w, "failed to save page history", http.StatusInternalServerError)
			return
		}
	}
	if err := refreshPageDerivedState(r.Context(), deps, vaultService, pagePath); err != nil {
		http.Error(w, "failed to update page state", http.StatusInternalServerError)
		return
	}
	pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
	if err != nil {
		writePageError(w, r, err, "failed to load page")
		return
	}
	currentPageSummary, err := summarizePageRecord(r.Context(), deps.Index, pageRecord)
	if err != nil {
		http.Error(w, "failed to summarize page", http.StatusInternalServerError)
		return
	}
	PublishInvalidationEvents(r.Context(), deps.Events, deps.Index, deps.Query, pagePath, []query.PageChange{{
		Before: previousPageSummary,
		After:  &currentPageSummary,
	}}, query.DiffTaskChanges(previousTasks, pageRecord.Tasks))
	writeJSON(w, http.StatusOK, pageRecordPayload(pageRecord))
}

func handlePageDeleteRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, vaultService *vault.Service, pagePath string) {
	pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
	if err != nil {
		writePageError(w, r, err, "failed to load page")
		return
	}
	previousTasks := append([]index.Task(nil), pageRecord.Tasks...)
	previousPageSummaryValue, err := summarizePageRecord(r.Context(), deps.Index, pageRecord)
	if err != nil {
		http.Error(w, "failed to summarize page", http.StatusInternalServerError)
		return
	}
	backlinks, err := deps.Index.GetBacklinks(r.Context(), pagePath)
	if err != nil {
		writePageError(w, r, err, "failed to load backlinks")
		return
	}
	dependentPages := collectBacklinkSourcePages(backlinks)
	if deps.History != nil {
		if _, err := deps.History.SaveRevision(pagePath, []byte(pageRecord.RawMarkdown)); err != nil {
			http.Error(w, "failed to save page history", http.StatusInternalServerError)
			return
		}
		if err := deps.History.MoveToTrash(pagePath, []byte(pageRecord.RawMarkdown)); err != nil {
			http.Error(w, "failed to move page to trash", http.StatusInternalServerError)
			return
		}
	}
	if err := vaultService.DeletePage(pagePath); err != nil {
		http.Error(w, "failed to delete page", http.StatusInternalServerError)
		return
	}
	acknowledgePageChanges(r.Context(), deps, pagePath)
	if err := deps.Index.RemovePage(r.Context(), pagePath); err != nil {
		http.Error(w, "failed to remove page from index", http.StatusInternalServerError)
		return
	}
	PublishDeletionEvents(r.Context(), deps.Events, deps.Index, deps.Query, pagePath, dependentPages, []query.PageChange{{
		Before: &previousPageSummaryValue,
		After:  nil,
	}}, query.DiffTaskChanges(previousTasks, nil))
	writeJSON(w, http.StatusOK, pageDeletedResponse{
		OK:   true,
		Page: pagePath,
	})
}

func handlePagePatchRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, pagePath string) {
	patch, ok := decodePagePatchRequest(w, r)
	if !ok {
		return
	}
	pageRecord, err := patchPageFrontmatter(r.Context(), deps, pagePath, patch)
	if err != nil {
		writePageError(w, r, err, "failed to patch page")
		return
	}
	writeJSON(w, http.StatusOK, pageRecordPayload(pageRecord))
}

func handlePageFrontmatterPatchRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, pagePath string) {
	var request struct {
		Set    map[string]any `json:"set"`
		Remove []string       `json:"remove"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	pageRecord, err := patchPageFrontmatter(r.Context(), deps, pagePath, markdown.FrontmatterPatch{
		Set:    request.Set,
		Remove: request.Remove,
	})
	if err != nil {
		writePageError(w, r, err, "failed to patch page")
		return
	}
	writeJSON(w, http.StatusOK, pageRecordPayload(pageRecord))
}

func decodePagePatchRequest(w http.ResponseWriter, r *http.Request) (markdown.FrontmatterPatch, bool) {
	var request struct {
		Title       *string  `json:"title"`
		Tags        []string `json:"tags"`
		Frontmatter *struct {
			Set    map[string]any `json:"set"`
			Remove []string       `json:"remove"`
		} `json:"frontmatter"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return markdown.FrontmatterPatch{}, false
	}
	if request.Frontmatter == nil && request.Title == nil && request.Tags == nil {
		http.Error(w, "unsupported page patch", http.StatusBadRequest)
		return markdown.FrontmatterPatch{}, false
	}

	patch := markdown.FrontmatterPatch{}
	if request.Frontmatter != nil {
		patch.Set = request.Frontmatter.Set
		patch.Remove = request.Frontmatter.Remove
	}
	if request.Title != nil {
		title := strings.TrimSpace(*request.Title)
		if title == "" {
			patch.Remove = append(patch.Remove, "title")
		} else {
			if patch.Set == nil {
				patch.Set = make(map[string]any)
			}
			patch.Set["title"] = title
		}
	}
	if request.Tags != nil {
		tags := make([]string, 0, len(request.Tags))
		for _, tag := range request.Tags {
			trimmed := strings.TrimSpace(tag)
			if trimmed != "" {
				tags = append(tags, trimmed)
			}
		}
		if len(tags) == 0 {
			patch.Remove = append(patch.Remove, "tags")
		} else {
			if patch.Set == nil {
				patch.Set = make(map[string]any)
			}
			patch.Set["tags"] = tags
		}
	}
	return patch, true
}

func handlePageMoveRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, vaultService *vault.Service, pagePath string) {
	var request struct {
		TargetPage string `json:"targetPage"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	targetPage, ok := normalizeAPIPagePath(request.TargetPage)
	if !ok || targetPage == "" {
		http.Error(w, "invalid target page", http.StatusBadRequest)
		return
	}

	pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
	if err != nil {
		writePageError(w, r, err, "failed to load page")
		return
	}
	previousTasks := append([]index.Task(nil), pageRecord.Tasks...)
	previousPageSummaryValue, err := summarizePageRecord(r.Context(), deps.Index, pageRecord)
	if err != nil {
		http.Error(w, "failed to summarize page", http.StatusInternalServerError)
		return
	}
	backlinks, err := deps.Index.GetBacklinks(r.Context(), pagePath)
	if err != nil {
		writePageError(w, r, err, "failed to load backlinks")
		return
	}
	dependentPages := collectBacklinkSourcePages(backlinks)
	if err := vaultService.MovePage(pagePath, targetPage); err != nil {
		http.Error(w, "failed to move page", http.StatusInternalServerError)
		return
	}
	acknowledgePageChanges(r.Context(), deps, pagePath, targetPage)
	if deps.History != nil {
		if err := deps.History.MovePage(pagePath, targetPage); err != nil {
			http.Error(w, "failed to move page history", http.StatusInternalServerError)
			return
		}
	}
	if err := deps.Index.RemovePage(r.Context(), pagePath); err != nil {
		http.Error(w, "failed to remove old page from index", http.StatusInternalServerError)
		return
	}
	if err := refreshPageDerivedState(r.Context(), deps, vaultService, targetPage); err != nil {
		http.Error(w, "failed to update moved page state", http.StatusInternalServerError)
		return
	}
	updatedPage, err := deps.Index.GetPage(r.Context(), targetPage)
	if err != nil {
		writePageError(w, r, err, "failed to load moved page")
		return
	}
	currentPageSummaryValue, err := summarizePageRecord(r.Context(), deps.Index, updatedPage)
	if err != nil {
		http.Error(w, "failed to summarize moved page", http.StatusInternalServerError)
		return
	}
	rewrittenPages, err := rewriteMovedPageLinks(r.Context(), deps, vaultService, pagePath, targetPage)
	if err != nil {
		http.Error(w, "failed to rewrite links to moved page", http.StatusInternalServerError)
		return
	}
	if len(rewrittenPages) > 0 {
		updatedPage, err = deps.Index.GetPage(r.Context(), targetPage)
		if err != nil {
			writePageError(w, r, err, "failed to load moved page")
			return
		}
		currentPageSummaryValue, err = summarizePageRecord(r.Context(), deps.Index, updatedPage)
		if err != nil {
			http.Error(w, "failed to summarize moved page", http.StatusInternalServerError)
			return
		}
	}
	PublishDeletionEvents(r.Context(), deps.Events, deps.Index, deps.Query, pagePath, dependentPages, []query.PageChange{{
		Before: &previousPageSummaryValue,
		After:  nil,
	}}, query.DiffTaskChanges(previousTasks, nil))
	PublishInvalidationEvents(r.Context(), deps.Events, deps.Index, deps.Query, targetPage, []query.PageChange{{
		Before: nil,
		After:  &currentPageSummaryValue,
	}}, query.DiffTaskChanges(nil, updatedPage.Tasks))
	for _, rewrittenPage := range rewrittenPages {
		if rewrittenPage.path == targetPage {
			continue
		}
		PublishInvalidationEvents(r.Context(), deps.Events, deps.Index, deps.Query, rewrittenPage.path, []query.PageChange{{
			Before: rewrittenPage.before.summary,
			After:  rewrittenPage.after.summary,
		}}, query.DiffTaskChanges(rewrittenPage.before.tasks, rewrittenPage.after.tasks))
	}

	writeJSON(w, http.StatusOK, pageRecordPayload(updatedPage))
}

func rewriteMovedPageLinks(ctx context.Context, deps Dependencies, vaultService *vault.Service, fromPage string, toPage string) ([]rewrittenPageState, error) {
	pages, err := vaultService.ScanMarkdownPages(ctx)
	if err != nil {
		return nil, err
	}
	rewritten := make([]rewrittenPageState, 0)
	for _, page := range pages {
		raw, err := vaultService.ReadPage(page.Path)
		if err != nil {
			return nil, err
		}
		nextRaw, changed := markdown.RewritePageLinks(string(raw), page.Path, fromPage, toPage)
		if !changed {
			continue
		}
		before, err := loadIndexedPageState(ctx, deps.Index, page.Path)
		if err != nil {
			return nil, err
		}
		if err := vaultService.WritePage(page.Path, []byte(nextRaw)); err != nil {
			return nil, err
		}
		acknowledgePageChanges(ctx, deps, page.Path)
		if deps.History != nil {
			if _, err := deps.History.SaveRevision(page.Path, []byte(nextRaw)); err != nil {
				return nil, err
			}
		}
		if err := refreshPageDerivedState(ctx, deps, vaultService, page.Path); err != nil {
			return nil, err
		}
		after, err := loadIndexedPageState(ctx, deps.Index, page.Path)
		if err != nil {
			return nil, err
		}
		rewritten = append(rewritten, rewrittenPageState{
			path:   page.Path,
			before: before,
			after:  after,
		})
	}
	return rewritten, nil
}

func loadIndexedPageState(ctx context.Context, indexService *index.Service, pagePath string) (indexedPageState, error) {
	page, err := indexService.GetPage(ctx, pagePath)
	if err != nil {
		if errors.Is(err, index.ErrPageNotFound) {
			return indexedPageState{}, nil
		}
		return indexedPageState{}, err
	}
	summary, err := summarizePageRecord(ctx, indexService, page)
	if err != nil {
		return indexedPageState{}, err
	}
	return indexedPageState{
		summary: &summary,
		tasks:   append([]index.Task(nil), page.Tasks...),
	}, nil
}

func handlePageQueryBlocksGet(w http.ResponseWriter, r *http.Request, deps Dependencies, pagePath string) {
	queryBlockValue, mode, action, isCollection := parseQueryBlockPath(r.URL.Path)
	switch {
	case isCollection && action == "":
		queryBlocks, err := loadFreshEnrichedQueryBlocks(r.Context(), deps, pagePath)
		if err != nil {
			writePageError(w, r, err, "failed to load query blocks")
			return
		}
		writeJSON(w, http.StatusOK, queryBlocksPayload(pagePath, queryBlocks))
	case isCollection && action == "refresh":
		writeMethodNotAllowed(w, http.MethodPost)
	case action == "":
		block, err := loadFreshEnrichedQueryBlockByMode(r.Context(), deps, pagePath, mode, queryBlockValue)
		if err != nil {
			writeQueryBlockError(w, r, err, "failed to load query block")
			return
		}
		writeJSON(w, http.StatusOK, queryBlockPayload(pagePath, block))
	case action == "refresh":
		writeMethodNotAllowed(w, http.MethodPost)
	default:
		http.NotFound(w, r)
	}
}

func handlePageQueryBlocksPost(w http.ResponseWriter, r *http.Request, deps Dependencies, pagePath string) {
	queryBlockValue, mode, action, isCollection := parseQueryBlockPath(r.URL.Path)
	switch {
	case isCollection && action == "refresh":
		if deps.Query == nil {
			http.Error(w, "query service unavailable", http.StatusInternalServerError)
			return
		}
		queryBlocks, err := deps.Query.ForceRefreshPageCache(r.Context(), deps.Index, pagePath)
		if err != nil {
			writePageError(w, r, err, "failed to refresh query blocks")
			return
		}
		if err := markStaleQueryBlocks(r.Context(), deps.Index, queryBlocks); err != nil {
			writePageError(w, r, err, "failed to load refreshed query blocks")
			return
		}
		publishQueryBlockRefreshEvents(deps.Events, pagePath, queryBlocks)
		writeJSON(w, http.StatusOK, queryBlocksPayload(pagePath, queryBlocks))
	case isCollection:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
	case action == "refresh":
		if deps.Query == nil {
			http.Error(w, "query service unavailable", http.StatusInternalServerError)
			return
		}
		block, err := loadEnrichedQueryBlockByMode(r.Context(), deps.Index, pagePath, mode, queryBlockValue)
		if err != nil {
			writeQueryBlockError(w, r, err, "failed to refresh query block")
			return
		}
		if _, err := deps.Query.RefreshPageBlock(r.Context(), deps.Index, pagePath, block.BlockKey); err != nil {
			writeQueryBlockError(w, r, err, "failed to refresh query block")
			return
		}
		block, err = loadEnrichedQueryBlock(r.Context(), deps.Index, pagePath, block.BlockKey)
		if err != nil {
			writeQueryBlockError(w, r, err, "failed to load refreshed query block")
			return
		}
		publishQueryBlockRefreshEvents(deps.Events, pagePath, []index.QueryBlock{block})
		writeJSON(w, http.StatusOK, queryBlockPayload(pagePath, block))
	case action == "":
		writeMethodNotAllowed(w, http.MethodGet)
	default:
		http.NotFound(w, r)
	}
}

func splitPageSubresource(rawPath string) (string, string, bool) {
	trimmed := strings.Trim(strings.TrimSpace(rawPath), "/")
	if trimmed == "" {
		return "", "", false
	}

	parts := strings.Split(trimmed, "/")
	if len(parts) >= 2 && parts[len(parts)-2] == "query-blocks" && parts[len(parts)-1] == "refresh" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-2], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 2 && parts[len(parts)-2] == "query-blocks" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-2], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 3 && parts[len(parts)-3] == "query-blocks" && parts[len(parts)-2] == "id" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-3], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 3 && parts[len(parts)-3] == "query-blocks" && parts[len(parts)-1] == "refresh" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-3], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 4 && parts[len(parts)-4] == "query-blocks" && parts[len(parts)-3] == "id" && parts[len(parts)-1] == "refresh" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-4], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 1 && parts[len(parts)-1] == "query-blocks" {
		pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-1], "/"))
		return pagePath, "query-blocks", ok
	}
	if len(parts) > 1 {
		last := parts[len(parts)-1]
		switch last {
		case "backlinks", "derived", "frontmatter", "move":
			pagePath, ok := normalizeAPIPagePath(strings.Join(parts[:len(parts)-1], "/"))
			return pagePath, last, ok
		}
	}

	pagePath, ok := normalizeAPIPagePath(trimmed)
	return pagePath, "", ok
}

func parseQueryBlockPath(rawPath string) (string, string, string, bool) {
	trimmed := strings.Trim(strings.TrimSpace(strings.TrimPrefix(rawPath, "/api/pages/")), "/")
	if trimmed == "" {
		return "", "", "", false
	}
	parts := strings.Split(trimmed, "/")
	if len(parts) >= 2 && parts[len(parts)-2] == "query-blocks" && parts[len(parts)-1] == "refresh" {
		return "", "", "refresh", true
	}
	if len(parts) >= 2 && parts[len(parts)-1] == "query-blocks" {
		return "", "", "", true
	}
	if len(parts) >= 4 && parts[len(parts)-3] == "query-blocks" && parts[len(parts)-2] == "id" {
		id := strings.TrimSpace(parts[len(parts)-1])
		if id == "" || id == "." || id == "id" || id == "query-blocks" {
			return "", "", "", false
		}
		return id, "id", "", false
	}
	if len(parts) >= 5 && parts[len(parts)-4] == "query-blocks" && parts[len(parts)-3] == "id" && parts[len(parts)-1] == "refresh" {
		id := strings.TrimSpace(parts[len(parts)-2])
		if id == "" || id == "." || id == "id" || id == "query-blocks" {
			return "", "", "", false
		}
		return id, "id", "refresh", false
	}
	if len(parts) < 3 {
		return "", "", "", false
	}
	if parts[len(parts)-2] == "query-blocks" {
		key := strings.TrimSpace(parts[len(parts)-1])
		if key == "" || key == "." || key == "query-blocks" {
			return "", "", "", false
		}
		return key, "key", "", false
	}
	if len(parts) >= 4 && parts[len(parts)-3] == "query-blocks" && parts[len(parts)-1] == "refresh" {
		key := strings.TrimSpace(parts[len(parts)-2])
		if key == "" || key == "." || key == "query-blocks" {
			return "", "", "", false
		}
		return key, "key", "refresh", false
	}
	return "", "", "", false
}

func collectBacklinkSourcePages(backlinks []index.BacklinkRecord) []string {
	seen := make(map[string]struct{}, len(backlinks))
	dependentPages := make([]string, 0, len(backlinks))
	for _, backlink := range backlinks {
		if backlink.SourcePage == "" {
			continue
		}
		if _, ok := seen[backlink.SourcePage]; ok {
			continue
		}
		seen[backlink.SourcePage] = struct{}{}
		dependentPages = append(dependentPages, backlink.SourcePage)
	}
	return dependentPages
}

func pageRecordPayload(pageRecord index.PageRecord) pageRecordResponse {
	return pageRecordResponse{
		Page:        pageRecord.Path,
		Title:       pageRecord.Title,
		RawMarkdown: pageRecord.RawMarkdown,
		CreatedAt:   pageRecord.CreatedAt,
		UpdatedAt:   pageRecord.UpdatedAt,
		Frontmatter: pageRecord.Frontmatter,
		Links:       pageRecord.Links,
		Tasks:       pageRecord.Tasks,
	}
}

func derivedPagePayload(pageRecord index.PageRecord, backlinks []index.BacklinkRecord, queryBlocks []index.QueryBlock) derivedPageResponse {
	openTaskCount, doneTaskCount := countTaskStates(pageRecord.Tasks)
	return derivedPageResponse{
		Page:        pageRecord.Path,
		Title:       pageRecord.Title,
		TOC:         index.ExtractHeadings(pageRecord.RawMarkdown),
		Links:       pageRecord.Links,
		Tasks:       pageRecord.Tasks,
		Backlinks:   backlinks,
		QueryBlocks: queryBlocks,
		LinkCounts: linkCountsPayload{
			Outgoing:  len(pageRecord.Links),
			Backlinks: len(backlinks),
		},
		TaskCounts: taskCountsPayload{
			Total: len(pageRecord.Tasks),
			Open:  openTaskCount,
			Done:  doneTaskCount,
		},
	}
}

func queryBlocksPayload(pagePath string, queryBlocks []index.QueryBlock) queryBlocksResponse {
	return queryBlocksResponse{
		Page:        pagePath,
		QueryBlocks: queryBlocks,
		Count:       len(queryBlocks),
	}
}

func queryBlockPayload(pagePath string, queryBlock index.QueryBlock) queryBlockResponse {
	return queryBlockResponse{
		Page:       pagePath,
		QueryBlock: queryBlock,
	}
}

func publishQueryBlockRefreshEvents(eventBroker *EventBroker, pagePath string, queryBlocks []index.QueryBlock) {
	if eventBroker == nil {
		return
	}
	for _, block := range queryBlocks {
		eventBroker.Publish(Event{
			Type: "query-block.changed",
			Data: queryBlockChangedData(pagePath, block),
		})
	}
	eventBroker.Publish(Event{
		Type: "derived.changed",
		Data: pageEventData{Page: pagePath},
	})
	eventBroker.Publish(Event{
		Type: "query.changed",
		Data: queryChangedData(pagePath, pagePath, queryBlocks),
	})
}

func refreshPageQueryState(ctx context.Context, deps Dependencies, pagePath string) error {
	if deps.Query == nil {
		return nil
	}
	if err := deps.Query.RefreshPageCache(ctx, deps.Index, pagePath); err != nil {
		return fmt.Errorf("refresh page query cache %q: %w", pagePath, err)
	}
	return nil
}

func refreshPageDerivedState(ctx context.Context, deps Dependencies, vaultService *vault.Service, pagePath string) error {
	if err := deps.Index.ReindexPage(ctx, vaultService, pagePath); err != nil {
		return fmt.Errorf("reindex page %q: %w", pagePath, err)
	}
	if err := refreshPageQueryState(ctx, deps, pagePath); err != nil {
		return err
	}
	return nil
}

func patchPageFrontmatter(ctx context.Context, deps Dependencies, pagePath string, patch markdown.FrontmatterPatch) (index.PageRecord, error) {
	vaultService := currentVault(ctx, deps)
	pageRecord, err := deps.Index.GetPage(ctx, pagePath)
	if err != nil {
		return index.PageRecord{}, err
	}
	previousTasks := append([]index.Task(nil), pageRecord.Tasks...)
	previousPageSummaryValue, err := summarizePageRecord(ctx, deps.Index, pageRecord)
	if err != nil {
		return index.PageRecord{}, err
	}
	previousPageSummary := &previousPageSummaryValue

	rawMarkdown, err := vaultService.ReadPage(pagePath)
	if err != nil {
		return index.PageRecord{}, err
	}

	updatedMarkdown, err := markdown.ApplyFrontmatterPatch(string(rawMarkdown), pageRecord.Frontmatter, patch)
	if err != nil {
		return index.PageRecord{}, err
	}

	if err := vaultService.WritePage(pagePath, []byte(updatedMarkdown)); err != nil {
		return index.PageRecord{}, err
	}
	acknowledgePageChanges(ctx, deps, pagePath)
	if deps.History != nil {
		if _, err := deps.History.SaveRevision(pagePath, []byte(updatedMarkdown)); err != nil {
			return index.PageRecord{}, err
		}
	}
	if err := refreshPageDerivedState(ctx, deps, vaultService, pagePath); err != nil {
		return index.PageRecord{}, err
	}

	updatedPage, err := deps.Index.GetPage(ctx, pagePath)
	if err != nil {
		return index.PageRecord{}, err
	}
	currentPageSummaryValue, err := summarizePageRecord(ctx, deps.Index, updatedPage)
	if err != nil {
		return index.PageRecord{}, err
	}
	currentPageSummary := &currentPageSummaryValue
	PublishInvalidationEvents(ctx, deps.Events, deps.Index, deps.Query, pagePath, []query.PageChange{{
		Before: previousPageSummary,
		After:  currentPageSummary,
	}}, query.DiffTaskChanges(previousTasks, updatedPage.Tasks))

	return updatedPage, nil
}

func loadEnrichedQueryBlocks(ctx context.Context, indexService *index.Service, pagePath string) ([]index.QueryBlock, error) {
	queryBlocks, err := indexService.GetQueryBlocks(ctx, pagePath)
	if err != nil {
		return nil, err
	}
	if err := markStaleQueryBlocks(ctx, indexService, queryBlocks); err != nil {
		return nil, err
	}
	return queryBlocks, nil
}

func loadFreshEnrichedQueryBlocks(ctx context.Context, deps Dependencies, pagePath string) ([]index.QueryBlock, error) {
	if err := refreshPageQueryState(ctx, deps, pagePath); err != nil {
		return nil, err
	}
	return loadEnrichedQueryBlocks(ctx, deps.Index, pagePath)
}

func loadEnrichedQueryBlock(ctx context.Context, indexService *index.Service, pagePath string, blockKey string) (index.QueryBlock, error) {
	queryBlocks, err := loadEnrichedQueryBlocks(ctx, indexService, pagePath)
	if err != nil {
		return index.QueryBlock{}, err
	}
	for _, block := range queryBlocks {
		if block.BlockKey == blockKey {
			return block, nil
		}
	}
	return index.QueryBlock{}, query.ErrQueryBlockNotFound
}

func loadFreshEnrichedQueryBlockByMode(ctx context.Context, deps Dependencies, pagePath string, mode string, value string) (index.QueryBlock, error) {
	if err := refreshPageQueryState(ctx, deps, pagePath); err != nil {
		return index.QueryBlock{}, err
	}
	return loadEnrichedQueryBlockByMode(ctx, deps.Index, pagePath, mode, value)
}

func loadEnrichedQueryBlockByMode(ctx context.Context, indexService *index.Service, pagePath string, mode string, value string) (index.QueryBlock, error) {
	queryBlocks, err := loadEnrichedQueryBlocks(ctx, indexService, pagePath)
	if err != nil {
		return index.QueryBlock{}, err
	}
	for _, block := range queryBlocks {
		switch mode {
		case "id":
			if block.ID == value {
				return block, nil
			}
		default:
			if block.BlockKey == value {
				return block, nil
			}
		}
	}
	return index.QueryBlock{}, query.ErrQueryBlockNotFound
}

func markStaleQueryBlocks(ctx context.Context, indexService *index.Service, queryBlocks []index.QueryBlock) error {
	if len(queryBlocks) == 0 {
		return nil
	}

	pages, err := indexService.ListPages(ctx)
	if err != nil {
		return err
	}

	pageUpdates := make(map[string]time.Time, len(pages))
	var latestAny time.Time
	for _, page := range pages {
		updatedAt, err := time.Parse(time.RFC3339Nano, page.UpdatedAt)
		if err != nil {
			continue
		}
		pageUpdates[page.Path] = updatedAt
		if updatedAt.After(latestAny) {
			latestAny = updatedAt
		}
	}

	for idx := range queryBlocks {
		parsed, err := query.Parse(queryBlocks[idx].Source)
		if err == nil && parsed.From != "" {
			queryBlocks[idx].Datasets = []string{parsed.From}
			queryBlocks[idx].MatchPage = queryMatchFieldForDataset(parsed)
		}
		queryBlocks[idx].RowCount, queryBlocks[idx].RenderHint = summarizeQueryBlockResult(queryBlocks[idx])

		metadata := queryBlockFreshness(queryBlocks[idx], pageUpdates, latestAny)
		queryBlocks[idx].Stale = metadata.Stale
		queryBlocks[idx].StalePage = metadata.Page
		queryBlocks[idx].StaleSince = metadata.Since
		queryBlocks[idx].StaleReason = metadata.Reason
	}
	return nil
}

type queryBlockFreshnessMetadata struct {
	Stale  bool
	Page   string
	Since  string
	Reason string
}

func queryBlockFreshness(block index.QueryBlock, pageUpdates map[string]time.Time, latestAny time.Time) queryBlockFreshnessMetadata {
	parsed, err := query.Parse(block.Source)
	if err != nil {
		return queryBlockFreshnessMetadata{}
	}

	cacheUpdatedAt, err := time.Parse(time.RFC3339Nano, block.UpdatedAt)
	if err != nil {
		return queryBlockFreshnessMetadata{
			Stale:  true,
			Reason: "cache-missing-timestamp",
		}
	}

	relevantUpdatedAt, relevantPage, missingScopedPage := relevantQueryUpdatedAt(parsed, pageUpdates, latestAny)
	if missingScopedPage {
		return queryBlockFreshnessMetadata{
			Stale:  true,
			Page:   relevantPage,
			Reason: "missing-scoped-page",
		}
	}
	if relevantUpdatedAt.IsZero() {
		return queryBlockFreshnessMetadata{}
	}
	if !relevantUpdatedAt.After(cacheUpdatedAt) {
		return queryBlockFreshnessMetadata{}
	}

	reason := "dataset-newer-than-cache"
	if relevantPage != "" {
		reason = "page-newer-than-cache"
	}
	return queryBlockFreshnessMetadata{
		Stale:  true,
		Page:   relevantPage,
		Since:  relevantUpdatedAt.UTC().Format(time.RFC3339Nano),
		Reason: reason,
	}
}
