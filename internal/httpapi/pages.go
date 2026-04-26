package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/markdown"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/vault"
	"github.com/carnager/noterious/internal/vaults"
)

func handlePageRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	vaultID := vaults.VaultIDFromContext(r.Context())
	vaultService := currentVault(r.Context(), deps)
	pagePath, subresource, ok := splitPageSubresource(strings.TrimPrefix(r.URL.Path, "/api/pages/"))
	if !ok {
		http.Error(w, "invalid page path", http.StatusBadRequest)
		return
	}

	switch subresource {
	case "":
		switch r.Method {
		case http.MethodGet:
			pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
			if err != nil {
				writePageError(w, r, err, "failed to load page")
				return
			}

			writeJSON(w, http.StatusOK, pageRecordPayload(pageRecord))
		case http.MethodPut:
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
			if deps.History != nil {
				if _, err := deps.History.SaveRevisionForVault(vaultID, pagePath, []byte(request.RawMarkdown)); err != nil {
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
			if deps.OnPageChanged != nil {
				deps.OnPageChanged(pagePath)
			}

			writeJSON(w, http.StatusOK, pageRecordPayload(pageRecord))
		case http.MethodDelete:
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
				if _, err := deps.History.SaveRevisionForVault(vaultID, pagePath, []byte(pageRecord.RawMarkdown)); err != nil {
					http.Error(w, "failed to save page history", http.StatusInternalServerError)
					return
				}
				if err := deps.History.MoveToTrashForVault(vaultID, pagePath, []byte(pageRecord.RawMarkdown)); err != nil {
					http.Error(w, "failed to move page to trash", http.StatusInternalServerError)
					return
				}
			}
			if err := vaultService.DeletePage(pagePath); err != nil {
				http.Error(w, "failed to delete page", http.StatusInternalServerError)
				return
			}
			if err := deps.Index.RemovePage(r.Context(), pagePath); err != nil {
				http.Error(w, "failed to remove page from index", http.StatusInternalServerError)
				return
			}
			PublishDeletionEvents(r.Context(), deps.Events, deps.Index, deps.Query, pagePath, dependentPages, []query.PageChange{{
				Before: &previousPageSummaryValue,
				After:  nil,
			}}, query.DiffTaskChanges(previousTasks, nil))
			if deps.OnPageChanged != nil {
				deps.OnPageChanged(pagePath)
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"ok":   true,
				"page": pagePath,
			})
		case http.MethodPatch:
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
				return
			}
			if request.Frontmatter == nil && request.Title == nil && request.Tags == nil {
				http.Error(w, "unsupported page patch", http.StatusBadRequest)
				return
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

			pageRecord, err := patchPageFrontmatter(r.Context(), deps, pagePath, patch)
			if err != nil {
				writePageError(w, r, err, "failed to patch page")
				return
			}

			writeJSON(w, http.StatusOK, pageRecordPayload(pageRecord))
		default:
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPut, http.MethodPatch, http.MethodDelete)
		}
	case "backlinks":
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}
		backlinks, err := deps.Index.GetBacklinks(r.Context(), pagePath)
		if err != nil {
			writePageError(w, r, err, "failed to load backlinks")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"page":      pagePath,
			"backlinks": backlinks,
		})
	case "frontmatter":
		if r.Method != http.MethodPatch {
			writeMethodNotAllowed(w, http.MethodPatch)
			return
		}

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
	case "move":
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

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
		if deps.History != nil {
			if err := deps.History.MovePageForVault(vaultID, pagePath, targetPage); err != nil {
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
		PublishDeletionEvents(r.Context(), deps.Events, deps.Index, deps.Query, pagePath, dependentPages, []query.PageChange{{
			Before: &previousPageSummaryValue,
			After:  nil,
		}}, query.DiffTaskChanges(previousTasks, nil))
		PublishInvalidationEvents(r.Context(), deps.Events, deps.Index, deps.Query, targetPage, []query.PageChange{{
			Before: nil,
			After:  &currentPageSummaryValue,
		}}, query.DiffTaskChanges(nil, updatedPage.Tasks))
		if deps.OnPageChanged != nil {
			deps.OnPageChanged(pagePath)
			deps.OnPageChanged(targetPage)
		}

		writeJSON(w, http.StatusOK, pageRecordPayload(updatedPage))
	case "derived":
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}
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
	case "query-blocks":
		queryBlockValue, mode, action, isCollection := parseQueryBlockPath(r.URL.Path)

		switch {
		case isCollection && action == "refresh" && r.Method == http.MethodPost:
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
			publishQueryBlockRefreshEvents(deps.Events, vaultID, pagePath, queryBlocks)
			writeJSON(w, http.StatusOK, queryBlocksPayload(pagePath, queryBlocks))
		case isCollection && r.Method == http.MethodGet:
			queryBlocks, err := loadFreshEnrichedQueryBlocks(r.Context(), deps, pagePath)
			if err != nil {
				writePageError(w, r, err, "failed to load query blocks")
				return
			}
			writeJSON(w, http.StatusOK, queryBlocksPayload(pagePath, queryBlocks))
		case isCollection:
			writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
		case action == "" && r.Method == http.MethodGet:
			block, err := loadFreshEnrichedQueryBlockByMode(r.Context(), deps, pagePath, mode, queryBlockValue)
			if err != nil {
				writeQueryBlockError(w, r, err, "failed to load query block")
				return
			}
			writeJSON(w, http.StatusOK, queryBlockPayload(pagePath, block))
		case action == "refresh" && r.Method == http.MethodPost:
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
			publishQueryBlockRefreshEvents(deps.Events, vaultID, pagePath, []index.QueryBlock{block})
			writeJSON(w, http.StatusOK, queryBlockPayload(pagePath, block))
		case action == "":
			writeMethodNotAllowed(w, http.MethodGet)
		case action == "refresh":
			writeMethodNotAllowed(w, http.MethodPost)
		default:
			http.NotFound(w, r)
		}
	default:
		http.NotFound(w, r)
	}
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

func pageRecordPayload(pageRecord index.PageRecord) map[string]any {
	return map[string]any{
		"page":        pageRecord.Path,
		"title":       pageRecord.Title,
		"rawMarkdown": pageRecord.RawMarkdown,
		"createdAt":   pageRecord.CreatedAt,
		"updatedAt":   pageRecord.UpdatedAt,
		"frontmatter": pageRecord.Frontmatter,
		"links":       pageRecord.Links,
		"tasks":       pageRecord.Tasks,
	}
}

func derivedPagePayload(pageRecord index.PageRecord, backlinks []index.BacklinkRecord, queryBlocks []index.QueryBlock) map[string]any {
	return map[string]any{
		"page":        pageRecord.Path,
		"title":       pageRecord.Title,
		"toc":         index.ExtractHeadings(pageRecord.RawMarkdown),
		"links":       pageRecord.Links,
		"tasks":       pageRecord.Tasks,
		"backlinks":   backlinks,
		"queryBlocks": queryBlocks,
		"linkCounts":  map[string]int{"outgoing": len(pageRecord.Links), "backlinks": len(backlinks)},
		"taskCounts":  map[string]int{"total": len(pageRecord.Tasks), "open": countOpenTasks(pageRecord.Tasks), "done": countDoneTasks(pageRecord.Tasks)},
	}
}

func queryBlocksPayload(pagePath string, queryBlocks []index.QueryBlock) map[string]any {
	return map[string]any{
		"page":        pagePath,
		"queryBlocks": queryBlocks,
		"count":       len(queryBlocks),
	}
}

func queryBlockPayload(pagePath string, queryBlock index.QueryBlock) map[string]any {
	return map[string]any{
		"page":       pagePath,
		"queryBlock": queryBlock,
	}
}

func publishQueryBlockRefreshEvents(eventBroker *EventBroker, vaultID int64, pagePath string, queryBlocks []index.QueryBlock) {
	if eventBroker == nil {
		return
	}
	for _, block := range queryBlocks {
		eventBroker.PublishToVault(vaultID, Event{
			Type: "query-block.changed",
			Data: queryBlockChangedData(pagePath, block),
		})
	}
	eventBroker.PublishToVault(vaultID, Event{
		Type: "derived.changed",
		Data: map[string]any{"page": pagePath},
	})
	eventBroker.PublishToVault(vaultID, Event{
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
	vaultID := vaults.VaultIDFromContext(ctx)
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
	if deps.History != nil {
		if _, err := deps.History.SaveRevisionForVault(vaultID, pagePath, []byte(updatedMarkdown)); err != nil {
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
	if deps.OnPageChanged != nil {
		deps.OnPageChanged(pagePath)
	}

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
