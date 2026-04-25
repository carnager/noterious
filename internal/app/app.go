package app

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
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
	"github.com/carnager/noterious/internal/vaults"
)

type App struct {
	cfg                    config.Config
	configuredVault        vaults.Vault
	auth                   *auth.Service
	vaults                 *vaults.Service
	index                  *index.Service
	store                  *settings.Store
	events                 *httpapi.EventBroker
	server                 *http.Server
	configuredVaultWatcher *VaultWatcher
	notifier               *notify.Service
}

func New(cfg config.Config) (*App, error) {
	settingsStore, err := settings.NewStore(cfg.DataDir, settings.DefaultSettingsFromConfig(cfg))
	if err != nil {
		return nil, fmt.Errorf("init settings: %w", err)
	}
	runtimeSettings := settingsStore.Settings()
	if parsed, err := time.ParseDuration(runtimeSettings.Notifications.NtfyInterval); err == nil {
		cfg.NtfyInterval = parsed
	}

	vaultRegistry, err := vaults.NewService(context.Background(), cfg.DataDir)
	if err != nil {
		return nil, fmt.Errorf("init vault store: %w", err)
	}
	configuredVault, err := vaultRegistry.EnsureRuntimeRoot(context.Background(), vaults.RuntimeRootConfig{
		VaultPath: cfg.VaultPath,
		HomePage:  cfg.HomePage,
	})
	if err != nil {
		_ = vaultRegistry.Close()
		return nil, fmt.Errorf("ensure configured vault: %w", err)
	}
	cfg.HomePage = configuredVault.HomePage
	runtimeSettings.Vault.VaultPath = configuredVault.VaultPath
	runtimeSettings.Vault.HomePage = configuredVault.HomePage
	settingsStore.SetAppliedRuntime(runtimeSettings)

	authService, err := auth.NewService(context.Background(), cfg.DataDir, cfg.AuthCookieName, cfg.AuthSessionTTL)
	if err != nil {
		_ = vaultRegistry.Close()
		return nil, fmt.Errorf("init auth store: %w", err)
	}
	bootstrap, err := authService.EnsureBootstrap(context.Background(), auth.BootstrapConfig{
		Username: cfg.AuthBootstrapUsername,
		Password: cfg.AuthBootstrapPassword,
	})
	if err != nil {
		_ = vaultRegistry.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("bootstrap auth: %w", err)
	}
	users, err := authService.ListUsers(context.Background())
	if err != nil {
		_ = vaultRegistry.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("list users for vault bootstrap: %w", err)
	}
	for _, user := range users {
		if strings.TrimSpace(user.Username) == "" {
			continue
		}
		if _, _, err := vaultRegistry.EnsureUserRootVault(context.Background(), cfg.VaultPath, user.ID, user.Username); err != nil {
			_ = vaultRegistry.Close()
			_ = authService.Close()
			return nil, fmt.Errorf("ensure user root vault for %s: %w", user.Username, err)
		}
	}

	vaultService := vault.NewService(cfg.VaultPath)
	indexService := index.NewService(cfg.DataDir)
	queryService := query.NewService()
	documentService, err := documents.NewService(cfg.VaultPath)
	if err != nil {
		_ = vaultRegistry.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("init document store: %w", err)
	}
	historyService, err := history.NewService(cfg.DataDir)
	if err != nil {
		_ = vaultRegistry.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("init history store: %w", err)
	}
	if err := historyService.AdoptDefaultVaultHistory(configuredVault.ID); err != nil {
		_ = vaultRegistry.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("migrate history into vault: %w", err)
	}
	eventBroker := httpapi.NewEventBroker()
	notifier, err := notify.NewService(cfg.DataDir, indexService, authService)
	if err != nil {
		_ = vaultRegistry.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("init notifier: %w", err)
	}

	if err := indexService.Open(context.Background()); err != nil {
		_ = vaultRegistry.Close()
		_ = authService.Close()
		return nil, fmt.Errorf("open index: %w", err)
	}
	configuredVaultWatcher, err := NewVaultWatcher(context.Background(), configuredVault, vaultService, indexService, queryService, eventBroker)
	if err != nil {
		_ = vaultRegistry.Close()
		_ = authService.Close()
		_ = indexService.Close()
		return nil, fmt.Errorf("init vault watcher: %w", err)
	}

	router := httpapi.NewRouter(httpapi.Dependencies{
		Config:        cfg,
		Settings:      settingsStore,
		Documents:     documentService,
		History:       historyService,
		Vaults:        vaultRegistry,
		Vault:         vaultService,
		Index:         indexService,
		Query:         queryService,
		Events:        eventBroker,
		Auth:          authService,
		OnPageChanged: configuredVaultWatcher.Acknowledge,
	})
	router = withHTTPLogging(router)

	if bootstrap.Created {
		slog.Info("bootstrapped auth admin user", "username", bootstrap.Username)
	} else if bootstrap.SetupRequired {
		slog.Info("initial auth setup required")
	}

	return &App{
		cfg:                    cfg,
		configuredVault:        configuredVault,
		auth:                   authService,
		vaults:                 vaultRegistry,
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
	}, nil
}

func (a *App) Run(ctx context.Context) error {
	defer func() {
		_ = a.auth.Close()
		_ = a.vaults.Close()
		_ = a.index.Close()
	}()
	errCh := make(chan error, 1)

	slog.Info("starting noterious server",
		"listen_addr", a.cfg.ListenAddr,
		"default_vault_path", a.cfg.VaultPath,
		"data_dir", a.cfg.DataDir,
		"default_home_page", a.cfg.HomePage,
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

	configuredVaultCtx := vaults.WithVault(ctx, a.configuredVault)
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
