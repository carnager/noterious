package workspaces

import (
	"context"
	"testing"
)

func TestEnsureDefaultCreatesAndUpdatesWorkspace(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	created, err := service.EnsureDefault(context.Background(), DefaultConfig{
		VaultPath: "/srv/vault-a",
		HomePage:  "index",
	})
	if err != nil {
		t.Fatalf("EnsureDefault(create) error = %v", err)
	}
	if created.ID == 0 {
		t.Fatal("created workspace id = 0")
	}
	if created.Key != "default" {
		t.Fatalf("created.Key = %q", created.Key)
	}
	if created.VaultPath != "/srv/vault-a" {
		t.Fatalf("created.VaultPath = %q", created.VaultPath)
	}
	if created.HomePage != "index" {
		t.Fatalf("created.HomePage = %q", created.HomePage)
	}

	updated, err := service.EnsureDefault(context.Background(), DefaultConfig{
		VaultPath: "/srv/vault-b",
		HomePage:  "notes/home",
	})
	if err != nil {
		t.Fatalf("EnsureDefault(update) error = %v", err)
	}
	if updated.ID != created.ID {
		t.Fatalf("updated.ID = %d want %d", updated.ID, created.ID)
	}
	if updated.VaultPath != "/srv/vault-b" {
		t.Fatalf("updated.VaultPath = %q", updated.VaultPath)
	}
	if updated.HomePage != "notes/home" {
		t.Fatalf("updated.HomePage = %q", updated.HomePage)
	}

	current, err := service.Default(context.Background())
	if err != nil {
		t.Fatalf("Default() error = %v", err)
	}
	if current.ID != created.ID {
		t.Fatalf("current.ID = %d want %d", current.ID, created.ID)
	}
	if current.VaultPath != "/srv/vault-b" {
		t.Fatalf("current.VaultPath = %q", current.VaultPath)
	}
	if current.HomePage != "notes/home" {
		t.Fatalf("current.HomePage = %q", current.HomePage)
	}
}
