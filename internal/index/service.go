package index

import (
	"context"
	"fmt"
	"os"

	"github.com/carnager/noterious/internal/vault"
)

type Service struct {
	dataDir string
	store   *SQLiteStore
}

func NewService(dataDir string) *Service {
	return &Service{dataDir: dataDir}
}

func (s *Service) DataDir() string {
	return s.dataDir
}

func (s *Service) Open(ctx context.Context) error {
	if err := os.MkdirAll(s.dataDir, 0o755); err != nil {
		return fmt.Errorf("create data dir: %w", err)
	}

	store, err := OpenSQLite(ctx, s.dataDir)
	if err != nil {
		return err
	}
	s.store = store
	return nil
}

func (s *Service) Close() error {
	if s.store == nil {
		return nil
	}
	return s.store.Close()
}

func (s *Service) DatabasePath() string {
	if s.store == nil {
		return ""
	}
	return s.store.Path()
}

func (s *Service) RebuildFromVault(ctx context.Context, vaultService *vault.Service) error {
	if s.store == nil {
		return fmt.Errorf("index store is not open")
	}

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

	if err := s.store.ReplaceAll(ctx, documents); err != nil {
		return err
	}
	return nil
}

func (s *Service) ReindexPage(ctx context.Context, vaultService *vault.Service, pagePath string) error {
	if s.store == nil {
		return fmt.Errorf("index store is not open")
	}

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

	return s.store.ReplacePage(ctx, document)
}

func (s *Service) RemovePage(ctx context.Context, pagePath string) error {
	if s.store == nil {
		return fmt.Errorf("index store is not open")
	}
	return s.store.RemovePage(ctx, pagePath)
}

func (s *Service) GetPage(ctx context.Context, pagePath string) (PageRecord, error) {
	if s.store == nil {
		return PageRecord{}, fmt.Errorf("index store is not open")
	}
	return s.store.GetPage(ctx, pagePath)
}

func (s *Service) GetBacklinks(ctx context.Context, pagePath string) ([]BacklinkRecord, error) {
	if s.store == nil {
		return nil, fmt.Errorf("index store is not open")
	}
	return s.store.GetBacklinks(ctx, pagePath)
}

func (s *Service) ListTasks(ctx context.Context) ([]Task, error) {
	if s.store == nil {
		return nil, fmt.Errorf("index store is not open")
	}
	return s.store.ListTasks(ctx)
}

func (s *Service) GetTask(ctx context.Context, ref string) (Task, error) {
	if s.store == nil {
		return Task{}, fmt.Errorf("index store is not open")
	}
	return s.store.GetTask(ctx, ref)
}

func (s *Service) ListPages(ctx context.Context) ([]PageSummary, error) {
	if s.store == nil {
		return nil, fmt.Errorf("index store is not open")
	}
	return s.store.ListPages(ctx)
}

func (s *Service) ListLinks(ctx context.Context) ([]Link, error) {
	if s.store == nil {
		return nil, fmt.Errorf("index store is not open")
	}
	return s.store.ListLinks(ctx)
}

func (s *Service) ListSavedQueries(ctx context.Context) ([]SavedQuery, error) {
	if s.store == nil {
		return nil, fmt.Errorf("index store is not open")
	}
	return s.store.ListSavedQueries(ctx)
}

func (s *Service) GetSavedQuery(ctx context.Context, name string) (SavedQuery, error) {
	if s.store == nil {
		return SavedQuery{}, fmt.Errorf("index store is not open")
	}
	return s.store.GetSavedQuery(ctx, name)
}

func (s *Service) PutSavedQuery(ctx context.Context, query SavedQuery) (SavedQuery, error) {
	if s.store == nil {
		return SavedQuery{}, fmt.Errorf("index store is not open")
	}
	return s.store.PutSavedQuery(ctx, query)
}

func (s *Service) DeleteSavedQuery(ctx context.Context, name string) error {
	if s.store == nil {
		return fmt.Errorf("index store is not open")
	}
	return s.store.DeleteSavedQuery(ctx, name)
}

func (s *Service) ReplaceQueryBlocks(ctx context.Context, pagePath string, blocks []QueryBlock) error {
	if s.store == nil {
		return fmt.Errorf("index store is not open")
	}
	return s.store.ReplaceQueryBlocks(ctx, pagePath, blocks)
}

func (s *Service) GetQueryBlocks(ctx context.Context, pagePath string) ([]QueryBlock, error) {
	if s.store == nil {
		return nil, fmt.Errorf("index store is not open")
	}
	return s.store.GetQueryBlocks(ctx, pagePath)
}

func (s *Service) ListQueryPagesByDataset(ctx context.Context, datasets []string) ([]string, error) {
	if s.store == nil {
		return nil, fmt.Errorf("index store is not open")
	}
	return s.store.ListQueryPagesByDataset(ctx, datasets)
}

func (s *Service) ListQueryPagesByDatasetAndPage(ctx context.Context, datasets []string, pagePath string) ([]string, error) {
	if s.store == nil {
		return nil, fmt.Errorf("index store is not open")
	}
	return s.store.ListQueryPagesByDatasetAndPage(ctx, datasets, pagePath)
}
