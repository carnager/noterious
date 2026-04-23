package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
)

type Event struct {
	Type string `json:"type"`
	Data any    `json:"data,omitempty"`
}

type EventBroker struct {
	mu          sync.Mutex
	subscribers map[chan Event]struct{}
}

func NewEventBroker() *EventBroker {
	return &EventBroker{
		subscribers: make(map[chan Event]struct{}),
	}
}

func (b *EventBroker) Publish(event Event) {
	b.mu.Lock()
	defer b.mu.Unlock()

	for subscriber := range b.subscribers {
		select {
		case subscriber <- event:
		default:
		}
	}
}

func (b *EventBroker) Subscribe() (<-chan Event, func()) {
	ch := make(chan Event, 16)

	b.mu.Lock()
	b.subscribers[ch] = struct{}{}
	b.mu.Unlock()

	cancel := func() {
		b.mu.Lock()
		if _, ok := b.subscribers[ch]; ok {
			delete(b.subscribers, ch)
			close(ch)
		}
		b.mu.Unlock()
	}

	return ch, cancel
}

func serveEvents(w http.ResponseWriter, r *http.Request, broker *EventBroker) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	events, unsubscribe := broker.Subscribe()
	defer unsubscribe()

	if _, err := fmt.Fprint(w, ": connected\n\n"); err != nil {
		return
	}
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := writeSSE(w, event); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func writeSSE(w http.ResponseWriter, event Event) error {
	payload, err := json.Marshal(event.Data)
	if err != nil {
		return err
	}

	if _, err := fmt.Fprintf(w, "event: %s\n", event.Type); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
		return err
	}
	return nil
}

func PublishInvalidationEvents(ctx context.Context, broker *EventBroker, indexService *index.Service, queryService *query.Service, pagePath string, pageChanges []query.PageChange, taskChanges []query.TaskChange) {
	if broker == nil {
		return
	}
	broker.Publish(Event{
		Type: "page.changed",
		Data: map[string]any{"page": pagePath},
	})
	broker.Publish(Event{
		Type: "derived.changed",
		Data: map[string]any{"page": pagePath},
	})

	if indexService == nil {
		return
	}

	pageCandidates := []query.QueryPageRefresh(nil)
	taskCandidates := []query.QueryPageRefresh(nil)
	linkCandidates := []query.QueryPageRefresh(nil)
	var err error
	if queryService != nil {
		pageCandidates, err = queryService.RefreshAffectedPageQueryPages(ctx, indexService, pagePath, pageChanges)
		if err != nil {
			return
		}
		taskCandidates, err = queryService.RefreshAffectedTaskQueryPages(ctx, indexService, pagePath, taskChanges)
		if err != nil {
			return
		}
		linkCandidates, err = queryService.RefreshAffectedLinkQueryPages(ctx, indexService, pagePath)
		if err != nil {
			return
		}
	}
	candidates := mergeQueryPageRefreshes(pageCandidates, taskCandidates, linkCandidates)

	for _, candidate := range candidates {
		for _, block := range candidate.Blocks {
			broker.Publish(Event{
				Type: "query-block.changed",
				Data: queryBlockChangedData(candidate.Page, block),
			})
		}

		if candidate.Page != pagePath {
			broker.Publish(Event{
				Type: "derived.changed",
				Data: map[string]any{"page": candidate.Page},
			})
		}

		broker.Publish(Event{
			Type: "query.changed",
			Data: queryChangedData(candidate.Page, pagePath, candidate.Blocks),
		})
	}
}

func PublishDeletionEvents(ctx context.Context, broker *EventBroker, indexService *index.Service, queryService *query.Service, pagePath string, dependentPages []string, pageChanges []query.PageChange, taskChanges []query.TaskChange) {
	if broker == nil {
		return
	}

	broker.Publish(Event{
		Type: "page.deleted",
		Data: map[string]any{"page": pagePath},
	})

	if indexService == nil {
		return
	}

	seen := make(map[string]struct{}, len(dependentPages))
	for _, dependentPage := range dependentPages {
		if dependentPage == "" {
			continue
		}
		if _, ok := seen[dependentPage]; ok {
			continue
		}
		seen[dependentPage] = struct{}{}

		broker.Publish(Event{
			Type: "derived.changed",
			Data: map[string]any{"page": dependentPage},
		})
	}

	pageCandidates := []query.QueryPageRefresh(nil)
	taskCandidates := []query.QueryPageRefresh(nil)
	linkCandidates := []query.QueryPageRefresh(nil)
	var err error
	if queryService != nil {
		pageCandidates, err = queryService.RefreshAffectedPageQueryPages(ctx, indexService, pagePath, pageChanges)
		if err != nil {
			return
		}
		taskCandidates, err = queryService.RefreshAffectedTaskQueryPages(ctx, indexService, pagePath, taskChanges)
		if err != nil {
			return
		}
		linkCandidates, err = queryService.RefreshAffectedLinkQueryPages(ctx, indexService, pagePath)
		if err != nil {
			return
		}
	}
	candidates := mergeQueryPageRefreshes(pageCandidates, taskCandidates, linkCandidates)

	for _, dependentPage := range candidates {
		for _, block := range dependentPage.Blocks {
			broker.Publish(Event{
				Type: "query-block.changed",
				Data: queryBlockChangedData(dependentPage.Page, block),
			})
		}

		if _, ok := seen[dependentPage.Page]; !ok {
			seen[dependentPage.Page] = struct{}{}
			broker.Publish(Event{
				Type: "derived.changed",
				Data: map[string]any{"page": dependentPage.Page},
			})
		}

		broker.Publish(Event{
			Type: "query.changed",
			Data: queryChangedData(dependentPage.Page, pagePath, dependentPage.Blocks),
		})
	}
}

func mergePages(groups ...[]string) []string {
	seen := make(map[string]struct{})
	pages := make([]string, 0)
	for _, group := range groups {
		for _, page := range group {
			if page == "" {
				continue
			}
			if _, ok := seen[page]; ok {
				continue
			}
			seen[page] = struct{}{}
			pages = append(pages, page)
		}
	}
	return pages
}

func queryBlockChangedData(page string, block index.QueryBlock) map[string]any {
	rowCount, renderHint := summarizeQueryBlockResult(block)
	data := map[string]any{
		"page":       page,
		"key":        block.BlockKey,
		"id":         block.ID,
		"datasets":   block.Datasets,
		"matchPage":  block.MatchPage,
		"rowCount":   rowCount,
		"renderHint": renderHint,
		"updatedAt":  block.UpdatedAt,
		"stale":      false,
	}
	if block.Error != "" {
		data["error"] = block.Error
	}
	return data
}

func queryChangedData(page string, triggerPage string, blocks []index.QueryBlock) map[string]any {
	data := map[string]any{
		"page":        page,
		"triggerPage": triggerPage,
		"blockCount":  len(blocks),
		"blocks":      make([]map[string]any, 0, len(blocks)),
	}
	for _, block := range blocks {
		data["blocks"] = append(data["blocks"].([]map[string]any), queryBlockChangedData(page, block))
	}
	if len(blocks) == 1 {
		data["key"] = blocks[0].BlockKey
		data["id"] = blocks[0].ID
	}
	return data
}

func mergeQueryPageRefreshes(groups ...[]query.QueryPageRefresh) []query.QueryPageRefresh {
	byPage := make(map[string]*query.QueryPageRefresh)
	order := make([]string, 0)
	for _, group := range groups {
		for _, item := range group {
			if item.Page == "" {
				continue
			}
			entry, ok := byPage[item.Page]
			if !ok {
				copyItem := query.QueryPageRefresh{
					Page:   item.Page,
					Blocks: make([]index.QueryBlock, 0, len(item.Blocks)),
				}
				byPage[item.Page] = &copyItem
				order = append(order, item.Page)
				entry = &copyItem
			}
			seenBlocks := make(map[string]struct{}, len(entry.Blocks))
			for _, block := range entry.Blocks {
				seenBlocks[block.BlockKey] = struct{}{}
			}
			for _, block := range item.Blocks {
				if _, seen := seenBlocks[block.BlockKey]; seen {
					continue
				}
				entry.Blocks = append(entry.Blocks, block)
				seenBlocks[block.BlockKey] = struct{}{}
			}
		}
	}

	merged := make([]query.QueryPageRefresh, 0, len(order))
	for _, page := range order {
		if item := byPage[page]; item != nil {
			merged = append(merged, *item)
		}
	}
	return merged
}
