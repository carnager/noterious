package index

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/carnager/noterious/internal/vault"
	"github.com/carnager/noterious/internal/workspaces"
)

type Service struct {
	dataDir string
	mu      sync.Mutex
	stores  map[int64]*SQLiteStore
}

func NewService(dataDir string) *Service {
	return &Service{
		dataDir: dataDir,
		stores:  make(map[int64]*SQLiteStore),
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
	stores := make([]*SQLiteStore, 0, len(s.stores))
	for _, store := range s.stores {
		stores = append(stores, store)
	}
	s.stores = make(map[int64]*SQLiteStore)
	s.mu.Unlock()

	var closeErr error
	for _, store := range stores {
		if err := store.Close(); err != nil && closeErr == nil {
			closeErr = err
		}
	}
	return closeErr
}

func (s *Service) DatabasePath() string {
	return s.DatabasePathForWorkspace(workspaces.LegacyWorkspaceID)
}

func (s *Service) DatabasePathForWorkspace(workspaceID int64) string {
	if workspaceID <= 0 {
		return filepath.Join(s.dataDir, "noterious.db")
	}
	return filepath.Join(s.dataDir, "index", fmt.Sprintf("workspace-%d.db", workspaceID))
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
	record, err := store.GetPage(ctx, pagePath)
	if err != nil {
		return PageRecord{}, err
	}
	record.WorkspaceID = workspaces.WorkspaceIDFromContext(ctx)
	return record, nil
}

func (s *Service) GetBacklinks(ctx context.Context, pagePath string) ([]BacklinkRecord, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return nil, err
	}
	backlinks, err := store.GetBacklinks(ctx, pagePath)
	if err != nil {
		return nil, err
	}
	workspaceID := workspaces.WorkspaceIDFromContext(ctx)
	for idx := range backlinks {
		backlinks[idx].WorkspaceID = workspaceID
	}
	return backlinks, nil
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
	workspaceID := workspaces.WorkspaceIDFromContext(ctx)
	for idx := range tasks {
		tasks[idx].WorkspaceID = workspaceID
	}
	return tasks, nil
}

func (s *Service) GetTask(ctx context.Context, ref string) (Task, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return Task{}, err
	}
	task, err := store.GetTask(ctx, ref)
	if err != nil {
		return Task{}, err
	}
	task.WorkspaceID = workspaces.WorkspaceIDFromContext(ctx)
	return task, nil
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
	workspaceID := workspaces.WorkspaceIDFromContext(ctx)
	for idx := range pages {
		pages[idx].WorkspaceID = workspaceID
	}
	return pages, nil
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
	workspaceID := workspaces.WorkspaceIDFromContext(ctx)
	for idx := range links {
		links[idx].WorkspaceID = workspaceID
	}
	return links, nil
}

func (s *Service) ListSavedQueries(ctx context.Context) ([]SavedQuery, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return nil, err
	}
	queries, err := store.ListSavedQueries(ctx)
	if err != nil {
		return nil, err
	}
	workspaceID := workspaces.WorkspaceIDFromContext(ctx)
	for idx := range queries {
		queries[idx].WorkspaceID = workspaceID
	}
	return queries, nil
}

func (s *Service) GetSavedQuery(ctx context.Context, name string) (SavedQuery, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return SavedQuery{}, err
	}
	query, err := store.GetSavedQuery(ctx, name)
	if err != nil {
		return SavedQuery{}, err
	}
	query.WorkspaceID = workspaces.WorkspaceIDFromContext(ctx)
	return query, nil
}

func (s *Service) PutSavedQuery(ctx context.Context, query SavedQuery) (SavedQuery, error) {
	store, err := s.storeForContext(ctx)
	if err != nil {
		return SavedQuery{}, err
	}
	saved, err := store.PutSavedQuery(ctx, query)
	if err != nil {
		return SavedQuery{}, err
	}
	saved.WorkspaceID = workspaces.WorkspaceIDFromContext(ctx)
	return saved, nil
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
	blocks, err := store.GetQueryBlocks(ctx, pagePath)
	if err != nil {
		return nil, err
	}
	workspaceID := workspaces.WorkspaceIDFromContext(ctx)
	for idx := range blocks {
		blocks[idx].WorkspaceID = workspaceID
	}
	return blocks, nil
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
	return s.storeForWorkspace(ctx, workspaces.WorkspaceIDFromContext(ctx))
}

func (s *Service) storeForWorkspace(ctx context.Context, workspaceID int64) (*SQLiteStore, error) {
	s.mu.Lock()
	if store := s.stores[workspaceID]; store != nil {
		s.mu.Unlock()
		return store, nil
	}
	s.mu.Unlock()

	dbPath := s.DatabasePathForWorkspace(workspaceID)
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, fmt.Errorf("create index workspace dir: %w", err)
	}
	targetMissing := true
	if _, err := os.Stat(dbPath); err == nil {
		targetMissing = false
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("stat workspace index db: %w", err)
	}

	store, err := OpenSQLitePath(ctx, dbPath)
	if err != nil {
		return nil, err
	}
	if workspaceID > workspaces.LegacyWorkspaceID && targetMissing {
		if err := cloneLegacyWorkspaceData(ctx, store, filepath.Join(s.dataDir, "noterious.db")); err != nil {
			_ = store.Close()
			return nil, err
		}
	}

	s.mu.Lock()
	if existing := s.stores[workspaceID]; existing != nil {
		s.mu.Unlock()
		_ = store.Close()
		return existing, nil
	}
	s.stores[workspaceID] = store
	s.mu.Unlock()
	return store, nil
}

func cloneLegacyWorkspaceData(ctx context.Context, store *SQLiteStore, legacyPath string) error {
	if store == nil || store.db == nil {
		return nil
	}
	if _, err := os.Stat(legacyPath); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return fmt.Errorf("stat legacy index db: %w", err)
	}
	if legacyPath == store.Path() {
		return nil
	}

	legacy, err := OpenSQLitePath(ctx, legacyPath)
	if err != nil {
		return nil
	}
	defer func() {
		_ = legacy.Close()
	}()

	documents, err := legacy.listDocuments(ctx)
	if err != nil {
		return err
	}
	if len(documents) > 0 {
		if err := store.ReplaceAll(ctx, documents); err != nil {
			return err
		}
	}

	savedQueries, err := legacy.ListSavedQueries(ctx)
	if err != nil {
		return nil
	}
	for _, savedQuery := range savedQueries {
		if _, err := store.PutSavedQuery(ctx, savedQuery); err != nil {
			return fmt.Errorf("migrate saved query %q: %w", savedQuery.Name, err)
		}
	}
	return nil
}
