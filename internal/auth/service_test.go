package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestEnsureBootstrapWithoutPasswordRequiresSetup(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir(), "", 0)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	result, err := service.EnsureBootstrap(context.Background(), BootstrapConfig{})
	if err != nil {
		t.Fatalf("EnsureBootstrap() error = %v", err)
	}
	if result.Created {
		t.Fatal("EnsureBootstrap() unexpectedly created an account")
	}
	if !result.SetupRequired {
		t.Fatal("SetupRequired = false, want true when no bootstrap password is configured")
	}

	setupRequired, err := service.SetupRequired(context.Background())
	if err != nil {
		t.Fatalf("SetupRequired() error = %v", err)
	}
	if !setupRequired {
		t.Fatal("SetupRequired() = false, want true")
	}
}

func TestCreateInitialAccountCreatesFirstUserAndDisablesSetup(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir(), "", 0)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	user, err := service.CreateInitialAccount(context.Background(), "Owner", "secret-pass")
	if err != nil {
		t.Fatalf("CreateInitialAccount() error = %v", err)
	}
	if user.Username != "owner" {
		t.Fatalf("Username = %q want %q", user.Username, "owner")
	}
	if user.MustChangePassword {
		t.Fatal("MustChangePassword = true, want false")
	}

	setupRequired, err := service.SetupRequired(context.Background())
	if err != nil {
		t.Fatalf("SetupRequired() error = %v", err)
	}
	if setupRequired {
		t.Fatal("SetupRequired() = true after initial account creation, want false")
	}

	if _, err := service.CreateInitialAccount(context.Background(), "other", "secret-pass"); !errors.Is(err, ErrInitialAccountRejected) {
		t.Fatalf("CreateInitialAccount(second) error = %v want ErrInitialAccountRejected", err)
	}
}

func TestLoginAndCurrentUserByToken(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir(), "test_session", time.Hour)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	if _, err := service.EnsureBootstrap(context.Background(), BootstrapConfig{
		Username: "Owner",
		Password: "secret-pass",
	}); err != nil {
		t.Fatalf("EnsureBootstrap() error = %v", err)
	}

	session, err := service.Login(context.Background(), "OWNER", "secret-pass")
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if session.Token == "" {
		t.Fatal("Login() returned empty token")
	}
	if session.User.Username != "owner" {
		t.Fatalf("Username = %q want %q", session.User.Username, "owner")
	}
	if session.User.MustChangePassword {
		t.Fatal("MustChangePassword = true for configured bootstrap password, want false")
	}

	user, err := service.CurrentUserByToken(context.Background(), session.Token)
	if err != nil {
		t.Fatalf("CurrentUserByToken() error = %v", err)
	}
	if user.Username != "owner" {
		t.Fatalf("CurrentUserByToken() username = %q want %q", user.Username, "owner")
	}
	if user.MustChangePassword {
		t.Fatal("CurrentUserByToken().MustChangePassword = true, want false")
	}

	if err := service.Logout(context.Background(), session.Token); err != nil {
		t.Fatalf("Logout() error = %v", err)
	}
	if _, err := service.CurrentUserByToken(context.Background(), session.Token); !errors.Is(err, ErrAuthenticationRequired) {
		t.Fatalf("CurrentUserByToken() error = %v want ErrAuthenticationRequired", err)
	}
}

func TestAuthenticateRequestReadsCookie(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir(), "test_session", time.Hour)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	if _, err := service.EnsureBootstrap(context.Background(), BootstrapConfig{
		Username: "admin",
		Password: "secret-pass",
	}); err != nil {
		t.Fatalf("EnsureBootstrap() error = %v", err)
	}

	session, err := service.Login(context.Background(), "admin", "secret-pass")
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}

	request := httptest.NewRequest("GET", "/api/auth/me", nil)
	request.AddCookie(&http.Cookie{Name: service.CookieName(), Value: session.Token})

	user, token, err := service.AuthenticateRequest(request)
	if err != nil {
		t.Fatalf("AuthenticateRequest() error = %v", err)
	}
	if token != session.Token {
		t.Fatalf("token = %q want %q", token, session.Token)
	}
	if user.Username != "admin" {
		t.Fatalf("Username = %q want %q", user.Username, "admin")
	}
}

func TestChangePasswordClearsLegacyMustChangeRequirement(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir(), "test_session", time.Hour)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	user, err := service.CreateInitialAccount(context.Background(), "admin", "secret-pass")
	if err != nil {
		t.Fatalf("CreateInitialAccount() error = %v", err)
	}
	if _, err := service.db.ExecContext(context.Background(), `
		UPDATE users
		SET must_change_password = 1
		WHERE id = ?;
	`, user.ID); err != nil {
		t.Fatalf("UPDATE users must_change_password error = %v", err)
	}

	session, err := service.Login(context.Background(), "admin", "secret-pass")
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if !session.User.MustChangePassword {
		t.Fatal("MustChangePassword = false, want true before password rotation")
	}

	updatedUser, err := service.ChangePassword(context.Background(), session.User.ID, "secret-pass", "new-secret-pass")
	if err != nil {
		t.Fatalf("ChangePassword() error = %v", err)
	}
	if updatedUser.MustChangePassword {
		t.Fatal("MustChangePassword = true after ChangePassword(), want false")
	}

	if _, err := service.Login(context.Background(), "admin", "secret-pass"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("Login(old password) error = %v, want ErrInvalidCredentials", err)
	}
	newSession, err := service.Login(context.Background(), "admin", "new-secret-pass")
	if err != nil {
		t.Fatalf("Login(new password) error = %v", err)
	}
	if newSession.User.MustChangePassword {
		t.Fatal("MustChangePassword = true after logging in with rotated password, want false")
	}
}

func TestUserSettingsPersistPerUserAndListNotificationTargets(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir(), "test_session", time.Hour)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	user, err := service.CreateInitialAccount(context.Background(), "Ralf", "secret-pass")
	if err != nil {
		t.Fatalf("CreateInitialAccount() error = %v", err)
	}

	updated, err := service.UpdateUserSettings(context.Background(), user.ID, UserSettings{
		Notifications: NotificationSettings{
			NtfyTopicURL: " https://ntfy.sh/ralf ",
			NtfyToken:    " secret-token ",
		},
	})
	if err != nil {
		t.Fatalf("UpdateUserSettings() error = %v", err)
	}
	if updated.Notifications.NtfyTopicURL != "https://ntfy.sh/ralf" || updated.Notifications.NtfyToken != "secret-token" {
		t.Fatalf("updated user settings = %#v", updated)
	}

	loaded, err := service.UserSettings(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("UserSettings() error = %v", err)
	}
	if loaded.Notifications.NtfyTopicURL != "https://ntfy.sh/ralf" || loaded.Notifications.NtfyToken != "secret-token" {
		t.Fatalf("loaded user settings = %#v", loaded)
	}

	targets, err := service.ListNotificationTargets(context.Background())
	if err != nil {
		t.Fatalf("ListNotificationTargets() error = %v", err)
	}
	if len(targets) != 1 {
		t.Fatalf("len(targets) = %d want 1", len(targets))
	}
	if targets[0].Username != "ralf" || targets[0].TopicURL != "https://ntfy.sh/ralf" || targets[0].Token != "secret-token" {
		t.Fatalf("targets[0] = %#v", targets[0])
	}
}

func TestMigrateAddsAccountColumns(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	dbPath := filepath.Join(dataDir, "noterious.db")

	legacyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	if _, err := legacyDB.ExecContext(context.Background(), `
		CREATE TABLE users (
			id INTEGER PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			last_login_at INTEGER
		);
	`); err != nil {
		t.Fatalf("create legacy users table error = %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("Close(legacyDB) error = %v", err)
	}

	migratedService, err := NewService(context.Background(), dataDir, "", 0)
	if err != nil {
		t.Fatalf("NewService(migrate) error = %v", err)
	}
	t.Cleanup(func() {
		_ = migratedService.Close()
	})

	rows, err := migratedService.db.QueryContext(context.Background(), `PRAGMA table_info(users);`)
	if err != nil {
		t.Fatalf("PRAGMA table_info(users) error = %v", err)
	}
	defer rows.Close()

	foundMustChange := false
	foundTopicURL := false
	foundToken := false
	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue any
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			t.Fatalf("Scan(table_info) error = %v", err)
		}
		if name == "must_change_password" {
			foundMustChange = true
		}
		if name == "ntfy_topic_url" {
			foundTopicURL = true
		}
		if name == "ntfy_token" {
			foundToken = true
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("rows.Err() = %v", err)
	}
	if !foundMustChange {
		t.Fatal("users schema missing must_change_password column after migration")
	}
	if !foundTopicURL {
		t.Fatal("users schema missing ntfy_topic_url column after migration")
	}
	if !foundToken {
		t.Fatal("users schema missing ntfy_token column after migration")
	}
}
