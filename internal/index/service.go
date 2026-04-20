package index

import (
	"context"
	"fmt"
	"os"
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
