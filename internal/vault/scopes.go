package vault

import (
	"errors"
	"fmt"
	"hash/fnv"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func DiscoverTopLevel(vaultRoot string) ([]Vault, error) {
	rootPath := filepath.Clean(strings.TrimSpace(vaultRoot))
	if rootPath == "" {
		return nil, ErrVaultRootRequired
	}
	info, err := os.Stat(rootPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Vault{}, nil
		}
		return nil, fmt.Errorf("inspect vault root: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("vault root is not a directory")
	}

	entries, err := os.ReadDir(rootPath)
	if err != nil {
		return nil, fmt.Errorf("read vault root: %w", err)
	}

	discovered := make([]Vault, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := strings.TrimSpace(entry.Name())
		if name == "" || strings.HasPrefix(name, ".") {
			continue
		}
		vaultPath := filepath.Join(rootPath, entry.Name())
		info, err := entry.Info()
		if err != nil {
			return nil, fmt.Errorf("stat top-level folder %q: %w", entry.Name(), err)
		}
		modTime := info.ModTime().UTC()
		discovered = append(discovered, Vault{
			ID:        topLevelScopeID(vaultPath),
			Key:       topLevelVaultKey(name),
			Name:      name,
			VaultPath: filepath.Clean(vaultPath),
			HomePage:  "",
			CreatedAt: modTime,
			UpdatedAt: modTime,
		})
	}

	sort.Slice(discovered, func(i int, j int) bool {
		leftName := strings.ToLower(strings.TrimSpace(discovered[i].Name))
		rightName := strings.ToLower(strings.TrimSpace(discovered[j].Name))
		if leftName == rightName {
			return discovered[i].VaultPath < discovered[j].VaultPath
		}
		return leftName < rightName
	})
	return discovered, nil
}

func CreateTopLevel(vaultRoot string, name string, homePage string) (Vault, error) {
	normalizedName, _, err := normalizeTopLevelVaultIdentity(name)
	if err != nil {
		return Vault{}, err
	}
	vaultPath, err := TopLevelVaultPath(vaultRoot, normalizedName)
	if err != nil {
		return Vault{}, err
	}
	if _, err := os.Stat(vaultPath); err == nil {
		return Vault{}, fmt.Errorf("%w: %s", ErrVaultAlreadyExists, vaultPath)
	} else if !errors.Is(err, os.ErrNotExist) {
		return Vault{}, fmt.Errorf("check vault directory: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(vaultPath), 0o755); err != nil {
		return Vault{}, fmt.Errorf("create vault parent directory: %w", err)
	}
	if err := os.Mkdir(vaultPath, 0o755); err != nil {
		if errors.Is(err, os.ErrExist) {
			return Vault{}, fmt.Errorf("%w: %s", ErrVaultAlreadyExists, vaultPath)
		}
		return Vault{}, fmt.Errorf("create vault directory: %w", err)
	}
	now := time.Now().UTC()
	return Vault{
		ID:        topLevelScopeID(vaultPath),
		Key:       topLevelVaultKey(normalizedName),
		Name:      normalizedName,
		VaultPath: filepath.Clean(vaultPath),
		HomePage:  strings.TrimSpace(homePage),
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func RenameTopLevel(vaultRoot string, current Vault, name string) (Vault, error) {
	normalizedName, _, err := normalizeTopLevelVaultIdentity(name)
	if err != nil {
		return Vault{}, err
	}
	vaultPath, err := TopLevelVaultPath(vaultRoot, normalizedName)
	if err != nil {
		return Vault{}, err
	}
	if err := moveVaultDir(current.VaultPath, vaultPath); err != nil {
		return Vault{}, err
	}
	updatedAt := time.Now().UTC()
	current.ID = topLevelScopeID(vaultPath)
	current.Key = topLevelVaultKey(normalizedName)
	current.Name = normalizedName
	current.VaultPath = filepath.Clean(vaultPath)
	current.UpdatedAt = updatedAt
	return current, nil
}

func FindTopLevelByID(vaultRoot string, vaultID int64) (Vault, error) {
	discovered, err := DiscoverTopLevel(vaultRoot)
	if err != nil {
		return Vault{}, err
	}
	for _, discoveredVault := range discovered {
		if discoveredVault.ID == vaultID {
			return discoveredVault, nil
		}
	}
	return Vault{}, ErrVaultNotFound
}

func TopLevelVaultPath(vaultRoot string, name string) (string, error) {
	rootPath := filepath.Clean(strings.TrimSpace(vaultRoot))
	if rootPath == "" {
		return "", ErrVaultRootRequired
	}
	normalizedName, _, err := normalizeTopLevelVaultIdentity(name)
	if err != nil {
		return "", err
	}
	slug, ok := normalizeVaultSlug(normalizedName)
	if !ok {
		return "", fmt.Errorf("%w: vault name must include at least one letter or number", ErrInvalidVaultName)
	}
	return filepath.Join(rootPath, slug), nil
}

func moveVaultDir(currentPath string, nextPath string) error {
	currentPath = filepath.Clean(strings.TrimSpace(currentPath))
	nextPath = filepath.Clean(strings.TrimSpace(nextPath))
	if currentPath == "" || nextPath == "" {
		return ErrVaultRootRequired
	}
	if currentPath == nextPath {
		return nil
	}
	if _, err := os.Stat(currentPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("%w: %s", ErrVaultNotFound, currentPath)
		}
		return fmt.Errorf("check current vault folder: %w", err)
	}
	if _, err := os.Stat(nextPath); err == nil {
		return fmt.Errorf("%w: %s", ErrVaultAlreadyExists, nextPath)
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("check target vault folder: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(nextPath), 0o755); err != nil {
		return fmt.Errorf("create target vault parent dir: %w", err)
	}
	if err := os.Rename(currentPath, nextPath); err != nil {
		return fmt.Errorf("move vault folder: %w", err)
	}
	return nil
}

func normalizeTopLevelVaultIdentity(name string) (string, string, error) {
	normalizedName := strings.TrimSpace(name)
	if normalizedName == "" {
		return "", "", ErrVaultNameRequired
	}
	_, ok := normalizeVaultSlug(normalizedName)
	if !ok {
		return "", "", fmt.Errorf("%w: vault name must include at least one letter or number", ErrInvalidVaultName)
	}
	return normalizedName, topLevelVaultKey(normalizedName), nil
}

func normalizeVaultSlug(value string) (string, bool) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" {
		return "", false
	}
	var builder strings.Builder
	lastDash := false
	for _, r := range normalized {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
			lastDash = false
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
			lastDash = false
		default:
			if builder.Len() > 0 && !lastDash {
				builder.WriteByte('-')
				lastDash = true
			}
		}
	}
	slug := strings.Trim(builder.String(), "-")
	return slug, slug != ""
}

func topLevelVaultKey(name string) string {
	slug, ok := normalizeVaultSlug(name)
	if !ok {
		return "root__vault"
	}
	return "root__" + slug
}

func topLevelScopeID(vaultPath string) int64 {
	hasher := fnv.New64a()
	_, _ = hasher.Write([]byte(strings.ToLower(filepath.Clean(vaultPath))))
	id := int64(hasher.Sum64() & math.MaxInt64)
	if id == 0 {
		return 1
	}
	return id
}
