package index

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/carnager/noterious/internal/vault"
)

type Service struct {
	dataDir string
	mu      sync.Mutex
	store   *SQLiteStore
}

func NewService(dataDir string) *Service {
	return &Service{
		dataDir: dataDir,
	}
}

func (s *Service) DataDir() string {
	return s.dataDir
}

func (s *Service) Open(ctx context.Context) error {
	if err := os.MkdirAll(s.dataDir, 0o755); err != nil {
		return fmt.Errorf("create data dir: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(s.dataDir, "index"), 0o755); err != nil {
		return fmt.Errorf("create index data dir: %w", err)
	}
	return nil
}

func (s *Service) Close() error {
	s.mu.Lock()
	store := s.store
	s.store = nil
	s.mu.Unlock()

	if store == nil {
		return nil
	}
	return store.Close()
}

func (s *Service) DatabasePath() string {
	return filepath.Join(s.dataDir, "index", "default.db")
}

func (s *Service) DatabasePathForVault(vaultID int64) string {
	return s.DatabasePath()
}

func (s *Service) RebuildFromVault(ctx context.Context, vaultService *vault.Service) error {
	pageFiles, err := vaultService.ScanMarkdownPages(ctx)
	if err != nil {
		return err
	}

	documents := make([]Document, 0, len(pageFiles))
	for _, pageFile := range pageFiles {
		rawMarkdown, err := vaultService.ReadPage(pageFile.Path)
		if err != nil {
			return err
		}

		document, err := ParseDocument(pageFile, rawMarkdown)
		if err != nil {
			return err
		}
		documents = append(documents, document)
	}

	store, err := s.storeForContext(ctx)
	if err != nil {
		return err
	}
	if err := store.ReplaceAll(ctx, documents); err != nil {
		return err
	}
	return nil
}

func (s *Service) ReindexPage(ctx context.Context, vaultService *vault.Service, pagePath string) error {
	pageFile, err := vaultService.StatPage(pagePath)
	if err != nil {
		return err
	}

	rawMarkdown, err := vaultService.ReadPage(pageFile.Path)
	if err != nil {
		return err
	}

	document, err := ParseDocument(pageFile, rawMarkdown)
	if err != nil {
		return err
	}

	store, err := s.storeForContext(ctx)
	if err != nil {
		return err
	}
	return store.ReplacePage(ctx, document)
}

func (s *Service) RemovePage(ctx context.Context, pagePath string) error {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return err
	}
	return store.RemovePage(ctx, pagePath)
}

func (s *Service) GetPage(ctx context.Context, pagePath string) (PageRecord, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return PageRecord{}, err
	}
	return store.GetPage(ctx, pagePath)
}

func (s *Service) GetBacklinks(ctx context.Context, pagePath string) ([]BacklinkRecord, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return nil, err
	}
	return store.GetBacklinks(ctx, pagePath)
}

func (s *Service) ListTasks(ctx context.Context) ([]Task, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return nil, err
	}
	tasks, err := store.ListTasks(ctx)
	if err != nil {
		return nil, err
	}
	return filterTasksByScopePrefix(tasks, vault.ScopePrefixFromContext(ctx)), nil
}

func (s *Service) GetTask(ctx context.Context, ref string) (Task, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return Task{}, err
	}
	return store.GetTask(ctx, ref)
}

func (s *Service) ListPages(ctx context.Context) ([]PageSummary, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return nil, err
	}
	pages, err := store.ListPages(ctx)
	if err != nil {
		return nil, err
	}
	return filterPagesByScopePrefix(pages, vault.ScopePrefixFromContext(ctx)), nil
}

func (s *Service) ListLinks(ctx context.Context) ([]Link, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return nil, err
	}
	links, err := store.ListLinks(ctx)
	if err != nil {
		return nil, err
	}
	return filterLinksByScopePrefix(links, vault.ScopePrefixFromContext(ctx)), nil
}

func (s *Service) ListSavedQueries(ctx context.Context) ([]SavedQuery, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return nil, err
	}
	return store.ListSavedQueries(ctx)
}

func (s *Service) GetSavedQuery(ctx context.Context, name string) (SavedQuery, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return SavedQuery{}, err
	}
	return store.GetSavedQuery(ctx, name)
}

func (s *Service) PutSavedQuery(ctx context.Context, query SavedQuery) (SavedQuery, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return SavedQuery{}, err
	}
	return store.PutSavedQuery(ctx, query)
}

func (s *Service) DeleteSavedQuery(ctx context.Context, name string) error {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return err
	}
	return store.DeleteSavedQuery(ctx, name)
}

func (s *Service) ReplaceQueryBlocks(ctx context.Context, pagePath string, blocks []QueryBlock) error {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return err
	}
	return store.ReplaceQueryBlocks(ctx, pagePath, blocks)
}

func (s *Service) GetQueryBlocks(ctx context.Context, pagePath string) ([]QueryBlock, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return nil, err
	}
	return store.GetQueryBlocks(ctx, pagePath)
}

func (s *Service) ListQueryPagesByDataset(ctx context.Context, datasets []string) ([]string, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return nil, err
	}
	return store.ListQueryPagesByDataset(ctx, datasets)
}

func (s *Service) ListQueryPagesByDatasetAndPage(ctx context.Context, datasets []string, pagePath string) ([]string, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return nil, err
	}
	return store.ListQueryPagesByDatasetAndPage(ctx, datasets, pagePath)
}

func (s *Service) storeForContext(ctx context.Context) (*SQLiteStore, error) {
	s.mu.Lock()
	if s.store != nil {
		store := s.store
		s.mu.Unlock()
		return store, nil
	}
	s.mu.Unlock()

	dbPath := s.DatabasePath()
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, fmt.Errorf("create index dir: %w", err)
	}
	if _, err := os.Stat(dbPath); err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("stat index db: %w", err)
	}

	store, err := OpenSQLitePath(ctx, dbPath)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	if existing := s.store; existing != nil {
		s.mu.Unlock()
		_ = store.Close()
		return existing, nil
	}
	s.store = store
	s.mu.Unlock()
	return store, nil
}

func hasScopePrefix(pagePath string, prefix string) bool {
	normalizedPrefix := strings.Trim(strings.TrimSpace(prefix), "/")
	if normalizedPrefix == "" {
		return true
	}
	normalizedPath := strings.Trim(strings.TrimSpace(pagePath), "/")
	return normalizedPath == normalizedPrefix || strings.HasPrefix(normalizedPath, normalizedPrefix+"/")
}

func filterPagesByScopePrefix(pages []PageSummary, prefix string) []PageSummary {
	if strings.TrimSpace(prefix) == "" {
		return pages
	}
	filtered := make([]PageSummary, 0, len(pages))
	for _, page := range pages {
		if hasScopePrefix(page.Path, prefix) {
			filtered = append(filtered, page)
		}
	}
	return filtered
}

func filterTasksByScopePrefix(tasks []Task, prefix string) []Task {
	if strings.TrimSpace(prefix) == "" {
		return tasks
	}
	filtered := make([]Task, 0, len(tasks))
	for _, task := range tasks {
		if hasScopePrefix(task.Page, prefix) {
			filtered = append(filtered, task)
		}
	}
	return filtered
}

func filterLinksByScopePrefix(links []Link, prefix string) []Link {
	if strings.TrimSpace(prefix) == "" {
		return links
	}
	filtered := make([]Link, 0, len(links))
	for _, link := range links {
		if hasScopePrefix(link.SourcePage, prefix) || hasScopePrefix(link.TargetPage, prefix) {
			filtered = append(filtered, link)
		}
	}
	return filtered
}
