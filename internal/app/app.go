package app

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/carnager/noterious/internal/ai"
	"github.com/carnager/noterious/internal/auth"
	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/documents"
	"github.com/carnager/noterious/internal/history"
	"github.com/carnager/noterious/internal/httpapi"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/notify"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/themes"
	"github.com/carnager/noterious/internal/vault"
)

type App struct {
	cfg                    config.Config
	configuredVault        vault.Vault
	auth                   *auth.Service
	ai                     *ai.Service
	themes                 *themes.Service
	index                  *index.Service
	store                  *settings.Store
	events                 *httpapi.EventBroker
	server                 *http.Server
	configuredVaultWatcher *VaultWatcher
	notifier               *notify.Service
}

type cleanupStack struct {
	closers []func()
}

func (s *cleanupStack) Add(fn func()) {
	if fn == nil {
		return
	}
	s.closers = append(s.closers, fn)
}

func (s *cleanupStack) Run() {
	for i := len(s.closers) - 1; i >= 0; i-- {
		s.closers[i]()
	}
}

func New(cfg config.Config) (*App, error) {
	settingsStore, err := settings.NewStore(cfg.DataDir, settings.DefaultSettingsFromConfig(cfg))
	if err != nil {
		return nil, fmt.Errorf("init settings: %w", err)
	}
	cleanup := cleanupStack{}
	success := false
	defer func() {
		if !success {
			cleanup.Run()
		}
	}()
	runtimeSettings := settingsStore.Settings()
	if parsed, err := time.ParseDuration(runtimeSettings.Notifications.NtfyInterval); err == nil {
		cfg.NtfyInterval = parsed
	}

	configuredVault := vault.Vault{
		ID:        vault.ConfiguredVaultID,
		Key:       "default",
		Name:      "Configured Vault",
		VaultPath: cfg.VaultPath,
	}
	runtimeSettings.Vault.VaultPath = configuredVault.VaultPath
	settingsStore.SetAppliedRuntime(runtimeSettings)

	authService, err := auth.NewService(context.Background(), cfg.DataDir, cfg.AuthCookieName, cfg.AuthSessionTTL)
	if err != nil {
		return nil, fmt.Errorf("init auth store: %w", err)
	}
	cleanup.Add(func() {
		_ = authService.Close()
	})
	bootstrap, err := authService.EnsureBootstrap(context.Background(), auth.BootstrapConfig{
		Username: cfg.AuthBootstrapUsername,
		Password: cfg.AuthBootstrapPassword,
	})
	if err != nil {
		return nil, fmt.Errorf("bootstrap auth: %w", err)
	}
	aiService, err := ai.NewService(cfg.DataDir)
	if err != nil {
		return nil, fmt.Errorf("init ai store: %w", err)
	}
	vaultService := vault.NewService(cfg.VaultPath)
	themeService, err := themes.NewService(cfg.DataDir)
	if err != nil {
		return nil, fmt.Errorf("init theme store: %w", err)
	}
	indexService := index.NewService(cfg.DataDir)
	cleanup.Add(func() {
		_ = indexService.Close()
	})
	queryService := query.NewService()
	documentService, err := documents.NewService(cfg.VaultPath)
	if err != nil {
		return nil, fmt.Errorf("init document store: %w", err)
	}
	historyService, err := history.NewService(cfg.DataDir)
	if err != nil {
		return nil, fmt.Errorf("init history store: %w", err)
	}
	eventBroker := httpapi.NewEventBroker()
	notifier, err := notify.NewService(cfg.DataDir, indexService, authService)
	if err != nil {
		return nil, fmt.Errorf("init notifier: %w", err)
	}

	if err := indexService.Open(context.Background()); err != nil {
		return nil, fmt.Errorf("open index: %w", err)
	}
	configuredVaultWatcher, err := NewVaultWatcher(context.Background(), configuredVault, vaultService, indexService, queryService, eventBroker)
	if err != nil {
		return nil, fmt.Errorf("init vault watcher: %w", err)
	}

	router := httpapi.NewRouter(httpapi.Dependencies{
		Config:        cfg,
		Settings:      settingsStore,
		Documents:     documentService,
		History:       historyService,
		Themes:        themeService,
		Vault:         vaultService,
		Index:         indexService,
		Query:         queryService,
		AI:            aiService,
		Events:        eventBroker,
		Auth:          authService,
		OnPageChanged: configuredVaultWatcher.Acknowledge,
	})
	router = withHTTPLogging(router)

	if bootstrap.Created {
		slog.Info("bootstrapped auth account", "username", bootstrap.Username)
	} else if bootstrap.SetupRequired {
		slog.Info("initial auth setup required")
	}

	app := &App{
		cfg:                    cfg,
		configuredVault:        configuredVault,
		auth:                   authService,
		ai:                     aiService,
		themes:                 themeService,
		index:                  indexService,
		store:                  settingsStore,
		events:                 eventBroker,
		configuredVaultWatcher: configuredVaultWatcher,
		notifier:               notifier,
		server: &http.Server{
			Addr:              cfg.ListenAddr,
			Handler:           router,
			ReadHeaderTimeout: 5 * time.Second,
		},
	}
	success = true
	return app, nil
}

func (a *App) Run(ctx context.Context) error {
	defer func() {
		_ = a.auth.Close()
		_ = a.index.Close()
	}()
	errCh := make(chan error, 1)

	slog.Info("starting noterious server",
		"listen_addr", a.cfg.ListenAddr,
		"default_vault_path", a.cfg.VaultPath,
		"data_dir", a.cfg.DataDir,
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

	configuredVaultCtx := vault.WithVault(ctx, a.configuredVault)
	if a.configuredVaultWatcher != nil && a.cfg.WatchInterval > 0 {
		slog.Info("configured vault watcher started",
			"interval", a.cfg.WatchInterval.String(),
			"vault_path", a.configuredVault.VaultPath,
		)
		go a.configuredVaultWatcher.Run(configuredVaultCtx, a.cfg.WatchInterval)
	}
	if a.notifier != nil && a.cfg.NtfyInterval > 0 {
		slog.Info("ntfy notifier started",
			"interval", a.cfg.NtfyInterval.String(),
			"enabled", a.notifier.Enabled(),
			"vault_path", a.configuredVault.VaultPath,
		)
		go a.notifier.Run(configuredVaultCtx, a.cfg.NtfyInterval)
	}

	select {
	case <-ctx.Done():
		slog.Info("shutting down noterious server")
		if a.events != nil {
			a.events.Close()
		}
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
