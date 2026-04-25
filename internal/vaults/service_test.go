package vaults

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureRuntimeRootCreatesAndUpdatesVault(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	created, err := service.EnsureRuntimeRoot(context.Background(), RuntimeRootConfig{
		VaultPath: "/srv/vault-a",
		HomePage:  "index",
	})
	if err != nil {
		t.Fatalf("EnsureRuntimeRoot(create) error = %v", err)
	}
	if created.ID == 0 {
		t.Fatal("created vault id = 0")
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

	updated, err := service.EnsureRuntimeRoot(context.Background(), RuntimeRootConfig{
		VaultPath: "/srv/vault-b",
		HomePage:  "notes/home",
	})
	if err != nil {
		t.Fatalf("EnsureRuntimeRoot(update) error = %v", err)
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

	current, err := service.RuntimeRoot(context.Background())
	if err != nil {
		t.Fatalf("RuntimeRoot() error = %v", err)
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

func TestEnsureUserRootVaultAssignsOwner(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	rootDir := t.TempDir()
	rootVault, membership, err := service.EnsureUserRootVault(context.Background(), rootDir, 7, "alex")
	if err != nil {
		t.Fatalf("EnsureUserRootVault() error = %v", err)
	}
	if rootVault.OwnerUserID != 7 {
		t.Fatalf("vault.OwnerUserID = %d want 7", rootVault.OwnerUserID)
	}
	if membership.UserID != 7 || membership.Role != RoleOwner {
		t.Fatalf("membership = %#v", membership)
	}
	owned, ownedMembership, err := service.OwnedVaultForUser(context.Background(), 7, rootVault.ID)
	if err != nil {
		t.Fatalf("OwnedVaultForUser() error = %v", err)
	}
	if owned.ID != rootVault.ID || ownedMembership.UserID != 7 {
		t.Fatalf("owned = %#v membership = %#v", owned, ownedMembership)
	}
}

func TestCreateListAndUpdateVault(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	if _, err := service.EnsureRuntimeRoot(context.Background(), RuntimeRootConfig{
		VaultPath: "/srv/default",
		HomePage:  "index",
	}); err != nil {
		t.Fatalf("EnsureRuntimeRoot() error = %v", err)
	}

	created, err := service.Create(context.Background(), CreateConfig{
		Key:       "team_alpha",
		Name:      "Team Alpha",
		VaultPath: "/srv/team-alpha",
		HomePage:  "dashboards/home",
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if created.ID == 0 || created.Key != "team_alpha" {
		t.Fatalf("created vault = %#v", created)
	}

	vaultList, err := service.List(context.Background())
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(vaultList) != 2 {
		t.Fatalf("len(List()) = %d want 2", len(vaultList))
	}

	updated, err := service.Update(context.Background(), created.ID, UpdateConfig{
		Name:      "Team Alpha Renamed",
		VaultPath: "/srv/team-alpha-renamed",
		HomePage:  "notes/start",
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if updated.Name != "Team Alpha Renamed" || updated.VaultPath != "/srv/team-alpha-renamed" || updated.HomePage != "notes/start" {
		t.Fatalf("updated vault = %#v", updated)
	}

	reloaded, err := service.GetByID(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if reloaded.Name != updated.Name || reloaded.VaultPath != updated.VaultPath || reloaded.HomePage != updated.HomePage {
		t.Fatalf("reloaded vault = %#v want %#v", reloaded, updated)
	}
}

func TestUpdateRejectsConfiguredVault(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	configuredVault, err := service.EnsureRuntimeRoot(context.Background(), RuntimeRootConfig{
		VaultPath: "/srv/default",
		HomePage:  "index",
	})
	if err != nil {
		t.Fatalf("EnsureRuntimeRoot() error = %v", err)
	}

	if _, err := service.Update(context.Background(), configuredVault.ID, UpdateConfig{
		Name:      "Changed",
		VaultPath: "/srv/changed",
		HomePage:  "notes/home",
	}); err == nil {
		t.Fatal("Update(configured vault) unexpectedly succeeded")
	}
}

func TestListOwnedByUserAndOwnedVaultForUser(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	teamVault, err := service.CreatePersonal(context.Background(), PersonalCreateConfig{
		VaultRoot: t.TempDir(),
		UserID:    7,
		Username:  "alex",
		Name:      "Team Alpha",
		HomePage:  "notes/start",
	})
	if err != nil {
		t.Fatalf("CreatePersonal() error = %v", err)
	}
	ownedVaults, err := service.ListOwnedByUser(context.Background(), 7)
	if err != nil {
		t.Fatalf("ListOwnedByUser() error = %v", err)
	}
	if len(ownedVaults) != 1 {
		t.Fatalf("len(ListOwnedByUser()) = %d want 1", len(ownedVaults))
	}
	if ownedVaults[0].ID != teamVault.ID {
		t.Fatalf("ListOwnedByUser()[0].ID = %d want %d", ownedVaults[0].ID, teamVault.ID)
	}
	resolvedVault, resolvedMembership, err := service.OwnedVaultForUser(context.Background(), 7, teamVault.ID)
	if err != nil {
		t.Fatalf("OwnedVaultForUser() error = %v", err)
	}
	if resolvedVault.ID != teamVault.ID || resolvedMembership.Role != RoleOwner {
		t.Fatalf("OwnedVaultForUser() = %#v %#v", resolvedVault, resolvedMembership)
	}
	if _, _, err := service.OwnedVaultForUser(context.Background(), 8, teamVault.ID); err != ErrVaultMembershipRequired {
		t.Fatalf("OwnedVaultForUser(unowned) error = %v want %v", err, ErrVaultMembershipRequired)
	}
}

func TestCreatePersonalBuildsVaultPath(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	rootDir := t.TempDir()
	createdVault, err := service.CreatePersonal(context.Background(), PersonalCreateConfig{
		VaultRoot: rootDir,
		UserID:    7,
		Username:  "ralf",
		Name:      "Work",
		HomePage:  "notes/home",
	})
	if err != nil {
		t.Fatalf("CreatePersonal() error = %v", err)
	}
	expectedVaultPath := filepath.Join(rootDir, "ralf", "work")
	if createdVault.VaultPath != expectedVaultPath {
		t.Fatalf("vault.VaultPath = %q want %q", createdVault.VaultPath, expectedVaultPath)
	}
	if _, err := os.Stat(expectedVaultPath); err != nil {
		t.Fatalf("Stat(%q) error = %v", expectedVaultPath, err)
	}
}

func TestCreatePersonalAllowsSameVaultNameAcrossUsers(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	rootDir := t.TempDir()
	firstVault, err := service.CreatePersonal(context.Background(), PersonalCreateConfig{
		VaultRoot: rootDir,
		UserID:    7,
		Username:  "alex",
		Name:      "Work",
	})
	if err != nil {
		t.Fatalf("CreatePersonal(alex) error = %v", err)
	}
	secondVault, err := service.CreatePersonal(context.Background(), PersonalCreateConfig{
		VaultRoot: rootDir,
		UserID:    8,
		Username:  "sam",
		Name:      "Work",
	})
	if err != nil {
		t.Fatalf("CreatePersonal(sam) error = %v", err)
	}
	if firstVault.Key == secondVault.Key {
		t.Fatalf("vault keys should be internal and unique per user: %q", firstVault.Key)
	}
	if firstVault.VaultPath != filepath.Join(rootDir, "alex", "work") {
		t.Fatalf("first vault path = %q", firstVault.VaultPath)
	}
	if secondVault.VaultPath != filepath.Join(rootDir, "sam", "work") {
		t.Fatalf("second vault path = %q", secondVault.VaultPath)
	}
}

func TestUpdatePersonalRenamesVaultFolder(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	rootDir := t.TempDir()
	createdVault, err := service.CreatePersonal(context.Background(), PersonalCreateConfig{
		VaultRoot: rootDir,
		UserID:    7,
		Username:  "alex",
		Name:      "Work",
	})
	if err != nil {
		t.Fatalf("CreatePersonal() error = %v", err)
	}
	sourcePath := filepath.Join(createdVault.VaultPath, "notes.md")
	if err := os.WriteFile(sourcePath, []byte("# work\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	updated, err := service.UpdatePersonal(context.Background(), createdVault.ID, PersonalUpdateConfig{
		VaultRoot: rootDir,
		Username:  "alex",
		Name:      "Private",
	})
	if err != nil {
		t.Fatalf("UpdatePersonal() error = %v", err)
	}
	expectedVaultPath := filepath.Join(rootDir, "alex", "private")
	if updated.VaultPath != expectedVaultPath {
		t.Fatalf("updated.VaultPath = %q want %q", updated.VaultPath, expectedVaultPath)
	}
	if _, err := os.Stat(filepath.Join(expectedVaultPath, "notes.md")); err != nil {
		t.Fatalf("renamed vault file missing: %v", err)
	}
	if _, err := os.Stat(createdVault.VaultPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("old vault path still exists: %v", err)
	}
}

func TestListDiscoveredPersonalCreatesVaultRecordsFromFolders(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	rootDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(rootDir, "alex", "work"), 0o755); err != nil {
		t.Fatalf("MkdirAll(work) error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(rootDir, "alex", "private"), 0o755); err != nil {
		t.Fatalf("MkdirAll(private) error = %v", err)
	}

	discovered, err := service.ListDiscoveredPersonal(context.Background(), rootDir, 7, "alex")
	if err != nil {
		t.Fatalf("ListDiscoveredPersonal() error = %v", err)
	}
	if len(discovered) != 2 {
		t.Fatalf("len(discovered) = %d want 2", len(discovered))
	}
	if discovered[0].VaultPath != filepath.Join(rootDir, "alex", "private") || discovered[1].VaultPath != filepath.Join(rootDir, "alex", "work") {
		t.Fatalf("discovered = %#v", discovered)
	}
	for _, discoveredVault := range discovered {
		if _, _, err := service.OwnedVaultForUser(context.Background(), 7, discoveredVault.ID); err != nil {
			t.Fatalf("OwnedVaultForUser(%d) error = %v", discoveredVault.ID, err)
		}
	}
}

func TestEnsureUserRootVaultUsesExistingCasePreservedFolder(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	rootDir := t.TempDir()
	existingRoot := filepath.Join(rootDir, "Rasi")
	if err := os.MkdirAll(existingRoot, 0o755); err != nil {
		t.Fatalf("MkdirAll(existingRoot) error = %v", err)
	}

	rootVault, membership, err := service.EnsureUserRootVault(context.Background(), rootDir, 7, "rasi")
	if err != nil {
		t.Fatalf("EnsureUserRootVault() error = %v", err)
	}
	if rootVault.VaultPath != existingRoot {
		t.Fatalf("vault.VaultPath = %q want %q", rootVault.VaultPath, existingRoot)
	}
	if membership.Role != RoleOwner || membership.UserID != 7 {
		t.Fatalf("membership = %#v", membership)
	}
}

func TestListDiscoveredPersonalAdoptsCaseChangedOwnedVaultPath(t *testing.T) {
	t.Parallel()

	service, err := NewService(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	t.Cleanup(func() {
		_ = service.Close()
	})

	rootDir := t.TempDir()
	actualRoot := filepath.Join(rootDir, "Rasi")
	actualWork := filepath.Join(actualRoot, "Work")
	if err := os.MkdirAll(actualWork, 0o755); err != nil {
		t.Fatalf("MkdirAll(actualWork) error = %v", err)
	}

	staleVault, err := service.Create(context.Background(), CreateConfig{
		Key:       filesystemVaultKey("rasi", "Work"),
		Name:      "Work",
		VaultPath: filepath.Join(rootDir, "rasi", "Work"),
		HomePage:  "",
	})
	if err != nil {
		t.Fatalf("Create(stale vault) error = %v", err)
	}
	discovered, err := service.ListDiscoveredPersonal(context.Background(), rootDir, 7, "rasi")
	if err != nil {
		t.Fatalf("ListDiscoveredPersonal() error = %v", err)
	}
	if len(discovered) != 1 {
		t.Fatalf("len(discovered) = %d want 1", len(discovered))
	}
	if discovered[0].ID != staleVault.ID {
		t.Fatalf("discovered[0].ID = %d want %d", discovered[0].ID, staleVault.ID)
	}
	if discovered[0].VaultPath != actualWork {
		t.Fatalf("discovered[0].VaultPath = %q want %q", discovered[0].VaultPath, actualWork)
	}
}
