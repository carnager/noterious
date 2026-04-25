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
	"github.com/carnager/noterious/internal/workspaces"
)

type App struct {
	cfg        config.Config
	workspace  workspaces.Workspace
	auth       *auth.Service
	workspaces *workspaces.Service
	index      *index.Service
	store      *settings.Store
	server     *http.Server
	watcher    *VaultWatcher
	notifier   *notify.Service
}

func New(cfg config.Config) (*App, error) {
	settingsStore, err := settings.NewStore(cfg.DataDir, settings.DefaultSettingsFromConfig(cfg))
	if err != nil {
		return nil, fmt.Errorf("init settings: %w", err)
	}
	appliedSettings := settingsStore.Settings()
	cfg.NtfyTopicURL = appliedSettings.Notifications.NtfyTopicURL
	cfg.NtfyToken = appliedSettings.Notifications.NtfyToken
	if parsed, err := time.ParseDuration(appliedSettings.Notifications.NtfyInterval); err == nil {
		cfg.NtfyInterval = parsed
	}

	workspaceService, err := workspaces.NewService(context.Background(), cfg.DataDir)
	if err != nil {
		return nil, fmt.Errorf("init workspace store: %w", err)
	}
	currentWorkspace, err := workspaceService.EnsureDefault(context.Background(), workspaces.DefaultConfig{
		VaultPath: appliedSettings.Workspace.VaultPath,
		HomePage:  appliedSettings.Workspace.HomePage,
	})
	if err != nil {
		_ = workspaceService.Close()
		return nil, fmt.Errorf("ensure default workspace: %w", err)
	}
	cfg.VaultPath = currentWorkspace.VaultPath
	cfg.HomePage = currentWorkspace.HomePage
	appliedSettings.Workspace.VaultPath = currentWorkspace.VaultPath
	appliedSettings.Workspace.HomePage = currentWorkspace.HomePage
	settingsStore.SetAppliedRuntime(appliedSettings)

	authService, err := auth.NewService(context.Background(), cfg.DataDir, cfg.AuthCookieName, cfg.AuthSessionTTL)
	if err != nil {
		_ = workspaceService.Close()
		return nil, fmt.Errorf("init auth store: %w", err)
	}
	bootstrap, err := authService.EnsureBootstrap(context.Background(), auth.BootstrapConfig{
		Username: cfg.AuthBootstrapUsername,
		Password: cfg.AuthBootstrapPassword,
	})
	if err != nil {
		_ = workspaceService.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("bootstrap auth: %w", err)
	}

	vaultService := vault.NewService(cfg.VaultPath)
	workspaceCtx := workspaces.WithWorkspace(context.Background(), currentWorkspace)
	indexService := index.NewService(cfg.DataDir)
	queryService := query.NewService()
	documentService, err := documents.NewService(cfg.VaultPath)
	if err != nil {
		_ = workspaceService.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("init document store: %w", err)
	}
	historyService, err := history.NewService(cfg.DataDir)
	if err != nil {
		_ = workspaceService.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("init history store: %w", err)
	}
	if err := historyService.AdoptLegacyWorkspace(currentWorkspace.ID); err != nil {
		_ = workspaceService.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("migrate history into workspace: %w", err)
	}
	eventBroker := httpapi.NewEventBroker()
	notifier, err := notify.NewService(cfg.DataDir, indexService, cfg.NtfyTopicURL, cfg.NtfyToken)
	if err != nil {
		_ = workspaceService.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("init notifier: %w", err)
	}

	if err := indexService.Open(context.Background()); err != nil {
		_ = workspaceService.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("open index: %w", err)
	}
	if err := indexService.RebuildFromVault(workspaceCtx, vaultService); err != nil {
		_ = workspaceService.Close()
		_ = authService.Close()
		_ = indexService.Close()
		return nil, fmt.Errorf("rebuild index from vault: %w", err)
	}
	if err := queryService.RefreshAll(workspaceCtx, indexService); err != nil {
		_ = workspaceService.Close()
		_ = authService.Close()
		_ = indexService.Close()
		return nil, fmt.Errorf("refresh query caches: %w", err)
	}
	watcher, err := NewVaultWatcher(workspaceCtx, currentWorkspace, vaultService, indexService, queryService, eventBroker)
	if err != nil {
		_ = workspaceService.Close()
		_ = authService.Close()
		_ = indexService.Close()
		return nil, fmt.Errorf("init vault watcher: %w", err)
	}

	router := httpapi.NewRouter(httpapi.Dependencies{
		Config:        cfg,
		Settings:      settingsStore,
		Documents:     documentService,
		History:       historyService,
		Workspaces:    workspaceService,
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
		cfg:        cfg,
		workspace:  currentWorkspace,
		auth:       authService,
		workspaces: workspaceService,
		index:      indexService,
		store:      settingsStore,
		watcher:    watcher,
		notifier:   notifier,
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
		_ = a.workspaces.Close()
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

	workspaceCtx := workspaces.WithWorkspace(ctx, a.workspace)
	if a.watcher != nil && a.cfg.WatchInterval > 0 {
		slog.Info("vault watcher started", "interval", a.cfg.WatchInterval.String())
		go a.watcher.Run(workspaceCtx, a.cfg.WatchInterval)
	}
	if a.notifier != nil && a.cfg.NtfyInterval > 0 {
		slog.Info("ntfy notifier started",
			"interval", a.cfg.NtfyInterval.String(),
			"enabled", a.notifier.Enabled(),
		)
		go a.notifier.Run(workspaceCtx, a.cfg.NtfyInterval)
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
