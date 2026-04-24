package app

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/documents"
	"github.com/carnager/noterious/internal/httpapi"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/notify"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/vault"
)

type App struct {
	cfg      config.Config
	index    *index.Service
	store    *settings.Store
	server   *http.Server
	watcher  *VaultWatcher
	notifier *notify.Service
}

func New(cfg config.Config) (*App, error) {
	settingsStore, err := settings.NewStore(cfg.DataDir, settings.DefaultSettingsFromConfig(cfg))
	if err != nil {
		return nil, fmt.Errorf("init settings: %w", err)
	}
	appliedSettings := settingsStore.Settings()
	cfg.VaultPath = appliedSettings.Workspace.VaultPath
	cfg.HomePage = appliedSettings.Workspace.HomePage
	cfg.NtfyTopicURL = appliedSettings.Notifications.NtfyTopicURL
	cfg.NtfyToken = appliedSettings.Notifications.NtfyToken
	if parsed, err := time.ParseDuration(appliedSettings.Notifications.NtfyInterval); err == nil {
		cfg.NtfyInterval = parsed
	}
	settingsStore.SetAppliedRuntime(appliedSettings)

	vaultService := vault.NewService(cfg.VaultPath)
	indexService := index.NewService(cfg.DataDir)
	queryService := query.NewService()
	documentService, err := documents.NewService(cfg.VaultPath)
	if err != nil {
		return nil, fmt.Errorf("init document store: %w", err)
	}
	eventBroker := httpapi.NewEventBroker()
	notifier, err := notify.NewService(cfg.DataDir, indexService, cfg.NtfyTopicURL, cfg.NtfyToken)
	if err != nil {
		return nil, fmt.Errorf("init notifier: %w", err)
	}

	if err := indexService.Open(context.Background()); err != nil {
		return nil, fmt.Errorf("open index: %w", err)
	}
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		_ = indexService.Close()
		return nil, fmt.Errorf("rebuild index from vault: %w", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		_ = indexService.Close()
		return nil, fmt.Errorf("refresh query caches: %w", err)
	}
	watcher, err := NewVaultWatcher(context.Background(), vaultService, indexService, queryService, eventBroker)
	if err != nil {
		_ = indexService.Close()
		return nil, fmt.Errorf("init vault watcher: %w", err)
	}

	router := httpapi.NewRouter(httpapi.Dependencies{
		Config:        cfg,
		Settings:      settingsStore,
		Documents:     documentService,
		Vault:         vaultService,
		Index:         indexService,
		Query:         queryService,
		Events:        eventBroker,
		OnPageChanged: watcher.Acknowledge,
	})

	return &App{
		cfg:      cfg,
		index:    indexService,
		store:    settingsStore,
		watcher:  watcher,
		notifier: notifier,
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

	if a.watcher != nil && a.cfg.WatchInterval > 0 {
		go a.watcher.Run(ctx, a.cfg.WatchInterval)
	}
	if a.notifier != nil && a.cfg.NtfyInterval > 0 {
		go a.notifier.Run(ctx, a.cfg.NtfyInterval)
	}

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
