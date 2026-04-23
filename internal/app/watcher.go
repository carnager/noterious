package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/carnager/noterious/internal/httpapi"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/vault"
)

type VaultWatcher struct {
	vault  *vault.Service
	index  *index.Service
	query  *query.Service
	events *httpapi.EventBroker

	mu    sync.Mutex
	known map[string]time.Time
}

func NewVaultWatcher(ctx context.Context, vaultService *vault.Service, indexService *index.Service, queryService *query.Service, eventBroker *httpapi.EventBroker) (*VaultWatcher, error) {
	pageFiles, err := vaultService.ScanMarkdownPages(ctx)
	if err != nil {
		return nil, err
	}

	known := make(map[string]time.Time, len(pageFiles))
	for _, pageFile := range pageFiles {
		known[pageFile.Path] = pageFile.ModTime
	}

	return &VaultWatcher{
		vault:  vaultService,
		index:  indexService,
		query:  queryService,
		events: eventBroker,
		known:  known,
	}, nil
}

func (w *VaultWatcher) Run(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		return
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.Poll(ctx); err != nil {
				fmt.Fprintf(os.Stderr, "vault watcher poll failed: %v\n", err)
			}
		}
	}
}

func (w *VaultWatcher) Acknowledge(pagePath string) {
	if w == nil {
		return
	}

	pageFile, err := w.vault.StatPage(pagePath)
	if err != nil {
		return
	}

	w.mu.Lock()
	w.known[pageFile.Path] = pageFile.ModTime
	w.mu.Unlock()
}

func (w *VaultWatcher) Poll(ctx context.Context) error {
	if w == nil {
		return nil
	}

	pageFiles, err := w.vault.ScanMarkdownPages(ctx)
	if err != nil {
		return err
	}

	current := make(map[string]time.Time, len(pageFiles))
	changed := make([]string, 0)
	deleted := make([]string, 0)

	w.mu.Lock()
	for _, pageFile := range pageFiles {
		current[pageFile.Path] = pageFile.ModTime
		if knownModTime, ok := w.known[pageFile.Path]; !ok || !knownModTime.Equal(pageFile.ModTime) {
			changed = append(changed, pageFile.Path)
		}
	}
	for pagePath := range w.known {
		if _, ok := current[pagePath]; !ok {
			deleted = append(deleted, pagePath)
		}
	}
	w.mu.Unlock()

	sort.Strings(changed)
	sort.Strings(deleted)

	for _, pagePath := range deleted {
		var previousTasks []index.Task
		var previousPageSummary *index.PageSummary
		if pageRecord, err := w.index.GetPage(ctx, pagePath); err == nil {
			previousTasks = append(previousTasks, pageRecord.Tasks...)
			summary, err := summarizeWatcherPageRecord(ctx, w.index, pageRecord)
			if err == nil {
				previousPageSummary = &summary
			}
		}
		backlinks, err := w.index.GetBacklinks(ctx, pagePath)
		dependentPages := make([]string, 0, len(backlinks))
		if err == nil {
			for _, backlink := range backlinks {
				dependentPages = append(dependentPages, backlink.SourcePage)
			}
		}

		if err := w.index.RemovePage(ctx, pagePath); err != nil && !errors.Is(err, index.ErrPageNotFound) {
			return fmt.Errorf("remove deleted page %q: %w", pagePath, err)
		}
		httpapi.PublishDeletionEvents(ctx, w.events, w.index, w.query, pagePath, dependentPages, []query.PageChange{{
			Before: previousPageSummary,
		}}, query.DiffTaskChanges(previousTasks, nil))
	}

	for _, pagePath := range changed {
		var previousTasks []index.Task
		var previousPageSummary *index.PageSummary
		if pageRecord, err := w.index.GetPage(ctx, pagePath); err == nil {
			previousTasks = append(previousTasks, pageRecord.Tasks...)
			summary, err := summarizeWatcherPageRecord(ctx, w.index, pageRecord)
			if err == nil {
				previousPageSummary = &summary
			}
		}
		if err := w.index.ReindexPage(ctx, w.vault, pagePath); err != nil {
			return fmt.Errorf("reindex changed page %q: %w", pagePath, err)
		}
		if w.query != nil {
			if err := w.query.RefreshPageCache(ctx, w.index, pagePath); err != nil {
				return fmt.Errorf("refresh query cache for %q: %w", pagePath, err)
			}
		}
		updatedPage, err := w.index.GetPage(ctx, pagePath)
		if err != nil {
			return fmt.Errorf("load reindexed page %q: %w", pagePath, err)
		}
		updatedPageSummary, err := summarizeWatcherPageRecord(ctx, w.index, updatedPage)
		if err != nil {
			return fmt.Errorf("summarize reindexed page %q: %w", pagePath, err)
		}
		httpapi.PublishInvalidationEvents(ctx, w.events, w.index, w.query, pagePath, []query.PageChange{{
			Before: previousPageSummary,
			After:  &updatedPageSummary,
		}}, query.DiffTaskChanges(previousTasks, updatedPage.Tasks))
	}

	w.mu.Lock()
	w.known = current
	w.mu.Unlock()

	return nil
}

func pageFrontmatterStringList(value any) []string {
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
	default:
		return nil
	}
}

func summarizeWatcherPageRecord(ctx context.Context, indexService *index.Service, pageRecord index.PageRecord) (index.PageSummary, error) {
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
		Tags:              pageFrontmatterStringList(pageRecord.Frontmatter["tags"]),
		OutgoingLinkCount: len(pageRecord.Links),
		BacklinkCount:     len(backlinks),
		TaskCount:         len(pageRecord.Tasks),
		OpenTaskCount:     countOpenWatcherTasks(pageRecord.Tasks),
		DoneTaskCount:     countDoneWatcherTasks(pageRecord.Tasks),
		QueryBlockCount:   len(queryBlocks),
		CreatedAt:         pageRecord.CreatedAt,
		UpdatedAt:         pageRecord.UpdatedAt,
	}, nil
}

func countOpenWatcherTasks(tasks []index.Task) int {
	count := 0
	for _, task := range tasks {
		if !task.Done {
			count++
		}
	}
	return count
}

func countDoneWatcherTasks(tasks []index.Task) int {
	count := 0
	for _, task := range tasks {
		if task.Done {
			count++
		}
	}
	return count
}
