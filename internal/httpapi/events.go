package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"

	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
)

type Event struct {
	Type string `json:"type"`
	Data any    `json:"data,omitempty"`
}

type pageEventData struct {
	Page string `json:"page"`
}

type queryBlockChangedPayload struct {
	Page       string   `json:"page"`
	Key        string   `json:"key"`
	ID         string   `json:"id,omitempty"`
	Datasets   []string `json:"datasets,omitempty"`
	MatchPage  string   `json:"matchPage,omitempty"`
	RowCount   int      `json:"rowCount"`
	RenderHint string   `json:"renderHint"`
	UpdatedAt  string   `json:"updatedAt"`
	Stale      bool     `json:"stale"`
	Error      string   `json:"error,omitempty"`
}

type queryChangedPayload struct {
	Page        string                     `json:"page"`
	TriggerPage string                     `json:"triggerPage"`
	BlockCount  int                        `json:"blockCount"`
	Blocks      []queryBlockChangedPayload `json:"blocks"`
	Key         string                     `json:"key,omitempty"`
	ID          string                     `json:"id,omitempty"`
}

type eventSubscriber struct {
	ch     chan Event
	closed bool
}

type EventBroker struct {
	mu          sync.Mutex
	subscribers map[*eventSubscriber]struct{}
	closed      bool
	dropped     uint64
}

func NewEventBroker() *EventBroker {
	return &EventBroker{
		subscribers: make(map[*eventSubscriber]struct{}),
	}
}

func (b *EventBroker) Publish(event Event) {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return
	}

	dropped := 0
	for subscriber := range b.subscribers {
		if subscriber.closed {
			continue
		}
		select {
		case subscriber.ch <- event:
		default:
			dropped++
		}
	}
	if dropped > 0 {
		b.dropped += uint64(dropped)
		totalDropped := b.dropped
		b.mu.Unlock()
		if totalDropped == uint64(dropped) || totalDropped%100 == 0 {
			slog.Warn("event broker dropped events", "event_type", event.Type, "dropped_now", dropped, "dropped_total", totalDropped)
		}
		return
	}
	b.mu.Unlock()
}

func (b *EventBroker) Subscribe() (<-chan Event, func()) {
	subscriber := &eventSubscriber{
		ch: make(chan Event, 16),
	}

	b.mu.Lock()
	if b.closed {
		close(subscriber.ch)
		b.mu.Unlock()
		return subscriber.ch, func() {}
	}
	b.subscribers[subscriber] = struct{}{}
	b.mu.Unlock()

	cancel := func() {
		b.mu.Lock()
		b.closeSubscriberLocked(subscriber)
		b.mu.Unlock()
	}

	return subscriber.ch, cancel
}

func (b *EventBroker) Close() {
	if b == nil {
		return
	}

	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return
	}
	b.closed = true

	subscribers := b.subscribers
	b.subscribers = make(map[*eventSubscriber]struct{})
	b.mu.Unlock()

	for subscriber := range subscribers {
		b.closeSubscriber(subscriber)
	}
}

func (b *EventBroker) DroppedEvents() uint64 {
	if b == nil {
		return 0
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.dropped
}

func (b *EventBroker) closeSubscriber(subscriber *eventSubscriber) {
	b.mu.Lock()
	b.closeSubscriberLocked(subscriber)
	b.mu.Unlock()
}

func (b *EventBroker) closeSubscriberLocked(subscriber *eventSubscriber) {
	if subscriber == nil || subscriber.closed {
		return
	}
	delete(b.subscribers, subscriber)
	subscriber.closed = true
	close(subscriber.ch)
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
		Data: pageEventData{Page: pagePath},
	})
	broker.Publish(Event{
		Type: "derived.changed",
		Data: pageEventData{Page: pagePath},
	})

	if indexService == nil {
		return
	}

	candidates, err := refreshAffectedQueryPages(ctx, indexService, queryService, pagePath, pageChanges, taskChanges)
	if err != nil {
		return
	}
	publishQueryPageRefreshEvents(broker, candidates, pagePath, nil)
}

func PublishDeletionEvents(ctx context.Context, broker *EventBroker, indexService *index.Service, queryService *query.Service, pagePath string, dependentPages []string, pageChanges []query.PageChange, taskChanges []query.TaskChange) {
	if broker == nil {
		return
	}

	broker.Publish(Event{
		Type: "page.deleted",
		Data: pageEventData{Page: pagePath},
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
			Data: pageEventData{Page: dependentPage},
		})
	}

	candidates, err := refreshAffectedQueryPages(ctx, indexService, queryService, pagePath, pageChanges, taskChanges)
	if err != nil {
		return
	}
	publishQueryPageRefreshEvents(broker, candidates, pagePath, seen)
}

func refreshAffectedQueryPages(ctx context.Context, indexService *index.Service, queryService *query.Service, pagePath string, pageChanges []query.PageChange, taskChanges []query.TaskChange) ([]query.QueryPageRefresh, error) {
	if indexService == nil || queryService == nil {
		return nil, nil
	}

	pageCandidates := []query.QueryPageRefresh(nil)
	taskCandidates := []query.QueryPageRefresh(nil)
	linkCandidates := []query.QueryPageRefresh(nil)
	var err error
	pageCandidates, err = queryService.RefreshAffectedPageQueryPages(ctx, indexService, pagePath, pageChanges)
	if err != nil {
		return nil, err
	}
	taskCandidates, err = queryService.RefreshAffectedTaskQueryPages(ctx, indexService, pagePath, taskChanges)
	if err != nil {
		return nil, err
	}
	linkCandidates, err = queryService.RefreshAffectedLinkQueryPages(ctx, indexService, pagePath)
	if err != nil {
		return nil, err
	}
	return mergeQueryPageRefreshes(pageCandidates, taskCandidates, linkCandidates), nil
}

func publishQueryPageRefreshEvents(broker *EventBroker, candidates []query.QueryPageRefresh, triggerPage string, seenDerived map[string]struct{}) {
	for _, dependentPage := range candidates {
		for _, block := range dependentPage.Blocks {
			broker.Publish(Event{
				Type: "query-block.changed",
				Data: queryBlockChangedData(dependentPage.Page, block),
			})
		}

		if seenDerived != nil {
			if _, ok := seenDerived[dependentPage.Page]; !ok {
				seenDerived[dependentPage.Page] = struct{}{}
				broker.Publish(Event{
					Type: "derived.changed",
					Data: pageEventData{Page: dependentPage.Page},
				})
			}
		} else if dependentPage.Page != triggerPage {
			broker.Publish(Event{
				Type: "derived.changed",
				Data: pageEventData{Page: dependentPage.Page},
			})
		}

		broker.Publish(Event{
			Type: "query.changed",
			Data: queryChangedData(dependentPage.Page, triggerPage, dependentPage.Blocks),
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

func queryBlockChangedData(page string, block index.QueryBlock) queryBlockChangedPayload {
	rowCount, renderHint := summarizeQueryBlockResult(block)
	data := queryBlockChangedPayload{
		Page:       page,
		Key:        block.BlockKey,
		ID:         block.ID,
		Datasets:   block.Datasets,
		MatchPage:  block.MatchPage,
		RowCount:   rowCount,
		RenderHint: renderHint,
		UpdatedAt:  block.UpdatedAt,
		Stale:      false,
	}
	if block.Error != "" {
		data.Error = block.Error
	}
	return data
}

func queryChangedData(page string, triggerPage string, blocks []index.QueryBlock) queryChangedPayload {
	data := queryChangedPayload{
		Page:        page,
		TriggerPage: triggerPage,
		BlockCount:  len(blocks),
		Blocks:      make([]queryBlockChangedPayload, 0, len(blocks)),
	}
	for _, block := range blocks {
		data.Blocks = append(data.Blocks, queryBlockChangedData(page, block))
	}
	if len(blocks) == 1 {
		data.Key = blocks[0].BlockKey
		data.ID = blocks[0].ID
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
