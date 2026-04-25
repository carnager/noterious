package app

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/carnager/noterious/internal/auth"
	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/documents"
	"github.com/carnager/noterious/internal/history"
	"github.com/carnager/noterious/internal/httpapi"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/notify"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/vault"
)

type App struct {
	cfg      config.Config
	auth     *auth.Service
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

	authService, err := auth.NewService(context.Background(), cfg.DataDir, cfg.AuthCookieName, cfg.AuthSessionTTL)
	if err != nil {
		return nil, fmt.Errorf("init auth store: %w", err)
	}
	bootstrap, err := authService.EnsureBootstrap(context.Background(), auth.BootstrapConfig{
		Username: cfg.AuthBootstrapUsername,
		Password: cfg.AuthBootstrapPassword,
	})
	if err != nil {
		_ = authService.Close()
		return nil, fmt.Errorf("bootstrap auth: %w", err)
	}

	vaultService := vault.NewService(cfg.VaultPath)
	indexService := index.NewService(cfg.DataDir)
	queryService := query.NewService()
	documentService, err := documents.NewService(cfg.VaultPath)
	if err != nil {
		_ = authService.Close()
		return nil, fmt.Errorf("init document store: %w", err)
	}
	historyService, err := history.NewService(cfg.DataDir)
	if err != nil {
		_ = authService.Close()
		return nil, fmt.Errorf("init history store: %w", err)
	}
	eventBroker := httpapi.NewEventBroker()
	notifier, err := notify.NewService(cfg.DataDir, indexService, cfg.NtfyTopicURL, cfg.NtfyToken)
	if err != nil {
		_ = authService.Close()
		return nil, fmt.Errorf("init notifier: %w", err)
	}

	if err := indexService.Open(context.Background()); err != nil {
		_ = authService.Close()
		return nil, fmt.Errorf("open index: %w", err)
	}
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		_ = authService.Close()
		_ = indexService.Close()
		return nil, fmt.Errorf("rebuild index from vault: %w", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		_ = authService.Close()
		_ = indexService.Close()
		return nil, fmt.Errorf("refresh query caches: %w", err)
	}
	watcher, err := NewVaultWatcher(context.Background(), vaultService, indexService, queryService, eventBroker)
	if err != nil {
		_ = authService.Close()
		_ = indexService.Close()
		return nil, fmt.Errorf("init vault watcher: %w", err)
	}

	router := httpapi.NewRouter(httpapi.Dependencies{
		Config:        cfg,
		Settings:      settingsStore,
		Documents:     documentService,
		History:       historyService,
		Vault:         vaultService,
		Index:         indexService,
		Query:         queryService,
		Events:        eventBroker,
		Auth:          authService,
		OnPageChanged: watcher.Acknowledge,
	})
	router = withHTTPLogging(router)

	if bootstrap.Created {
		if bootstrap.GeneratedPassword != "" {
			slog.Info("bootstrapped auth admin user",
				"username", bootstrap.Username,
				"generated_password", bootstrap.GeneratedPassword,
			)
		} else {
			slog.Info("bootstrapped auth admin user",
				"username", bootstrap.Username,
			)
		}
	}

	return &App{
		cfg:      cfg,
		auth:     authService,
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
		_ = a.auth.Close()
		_ = a.index.Close()
	}()
	errCh := make(chan error, 1)

	slog.Info("starting noterious server",
		"listen_addr", a.cfg.ListenAddr,
		"vault_path", a.cfg.VaultPath,
		"data_dir", a.cfg.DataDir,
		"home_page", a.cfg.HomePage,
		"watch_interval", a.cfg.WatchInterval.String(),
		"ntfy_enabled", a.notifier != nil && a.notifier.Enabled(),
		"ntfy_interval", a.cfg.NtfyInterval.String(),
	)

	go func() {
		slog.Info("http server listening", "listen_addr", a.cfg.ListenAddr)
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- fmt.Errorf("listen: %w", err)
		}
		close(errCh)
	}()

	if a.watcher != nil && a.cfg.WatchInterval > 0 {
		slog.Info("vault watcher started", "interval", a.cfg.WatchInterval.String())
		go a.watcher.Run(ctx, a.cfg.WatchInterval)
	}
	if a.notifier != nil && a.cfg.NtfyInterval > 0 {
		slog.Info("ntfy notifier started",
			"interval", a.cfg.NtfyInterval.String(),
			"enabled", a.notifier.Enabled(),
		)
		go a.notifier.Run(ctx, a.cfg.NtfyInterval)
	}

	select {
	case <-ctx.Done():
		slog.Info("shutting down noterious server")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := a.server.Shutdown(shutdownCtx); err != nil {
			slog.Error("http server shutdown failed", "error", err)
			return err
		}
		slog.Info("noterious server stopped")
		return nil
	case err := <-errCh:
		if err != nil {
			slog.Error("http server exited unexpectedly", "error", err)
		}
		return err
	}
}
