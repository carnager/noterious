package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestEnsureBootstrapCreatesDefaultAdmin(t *testing.T) {
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
	if !result.Created {
		t.Fatal("EnsureBootstrap() did not create bootstrap user")
	}
	if result.Username != "admin" {
		t.Fatalf("Username = %q want %q", result.Username, "admin")
	}
	if result.GeneratedPassword == "" {
		t.Fatal("GeneratedPassword = empty, want generated password")
	}

	second, err := service.EnsureBootstrap(context.Background(), BootstrapConfig{})
	if err != nil {
		t.Fatalf("EnsureBootstrap(second) error = %v", err)
	}
	if second.Created {
		t.Fatal("second bootstrap unexpectedly created another user")
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

	user, err := service.CurrentUserByToken(context.Background(), session.Token)
	if err != nil {
		t.Fatalf("CurrentUserByToken() error = %v", err)
	}
	if user.Username != "owner" {
		t.Fatalf("CurrentUserByToken() username = %q want %q", user.Username, "owner")
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
