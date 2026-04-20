package app

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/httpapi"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/vault"
)

type App struct {
	cfg    config.Config
	index  *index.Service
	server *http.Server
}

func New(cfg config.Config) (*App, error) {
	vaultService := vault.NewService(cfg.VaultPath)
	indexService := index.NewService(cfg.DataDir)
	queryService := query.NewService()

	if err := indexService.Open(context.Background()); err != nil {
		return nil, fmt.Errorf("open index: %w", err)
	}

	router := httpapi.NewRouter(httpapi.Dependencies{
		Config: cfg,
		Vault:  vaultService,
		Index:  indexService,
		Query:  queryService,
	})

	return &App{
		cfg:   cfg,
		index: indexService,
		server: &http.Server{
			Addr:              cfg.ListenAddr,
			Handler:           router,
			ReadHeaderTimeout: 5 * time.Second,
		},
	}, nil
}

func (a *App) Run(ctx context.Context) error {
	defer func() {
		_ = a.index.Close()
	}()
	errCh := make(chan error, 1)

	go func() {
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- fmt.Errorf("listen: %w", err)
		}
		close(errCh)
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := a.server.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return nil
	case err := <-errCh:
		return err
	}
}
