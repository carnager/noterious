package history

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Service struct {
	historyRoot   string
	revisionsRoot string
	trashRoot     string
}

const revisionCoalesceWindow = time.Minute

type Revision struct {
	ID          string    `json:"id"`
	Page        string    `json:"page"`
	SavedAt     time.Time `json:"savedAt"`
	RawMarkdown string    `json:"rawMarkdown"`
}

type TrashEntry struct {
	Page        string    `json:"page"`
	DeletedAt   time.Time `json:"deletedAt"`
	RawMarkdown string    `json:"rawMarkdown"`
}

func NewService(dataDir string) (*Service, error) {
	root := filepath.Join(dataDir, "history")
	service := &Service{
		historyRoot:   root,
		revisionsRoot: filepath.Join(root, "revisions"),
		trashRoot:     filepath.Join(root, "trash"),
	}
	if err := os.MkdirAll(service.revisionsRoot, 0o755); err != nil {
		return nil, fmt.Errorf("create revisions dir: %w", err)
	}
	if err := os.MkdirAll(service.trashRoot, 0o755); err != nil {
		return nil, fmt.Errorf("create trash dir: %w", err)
	}
	return service, nil
}

func (s *Service) SaveRevision(pagePath string, rawMarkdown []byte) (bool, error) {
	normalized, err := normalizePagePath(pagePath)
	if err != nil {
		return false, err
	}

	revisionDir := s.revisionDir(normalized)
	if err := os.MkdirAll(revisionDir, 0o755); err != nil {
		return false, fmt.Errorf("create revision dir for %q: %w", normalized, err)
	}

	content := string(rawMarkdown)
	latest, err := s.latestRevision(normalized)
	if err != nil {
		return false, err
	}
	if latest != nil && latest.RawMarkdown == content {
		return false, nil
	}

	savedAt := time.Now().UTC()
	if latest != nil && savedAt.Sub(latest.SavedAt) <= revisionCoalesceWindow {
		latest.SavedAt = savedAt
		latest.RawMarkdown = content
		if err := writeJSONFile(filepath.Join(revisionDir, latest.ID+".json"), latest); err != nil {
			return false, fmt.Errorf("update revision for %q: %w", normalized, err)
		}
		return true, nil
	}
	revision := Revision{
		ID:          fmt.Sprintf("%d", savedAt.UnixNano()),
		Page:        normalized,
		SavedAt:     savedAt,
		RawMarkdown: content,
	}
	if err := writeJSONFile(filepath.Join(revisionDir, revision.ID+".json"), revision); err != nil {
		return false, fmt.Errorf("write revision for %q: %w", normalized, err)
	}
	return true, nil
}

func (s *Service) ListRevisions(pagePath string) ([]Revision, error) {
	normalized, err := normalizePagePath(pagePath)
	if err != nil {
		return nil, err
	}
	revisionDir := s.revisionDir(normalized)
	entries, err := os.ReadDir(revisionDir)
	if os.IsNotExist(err) {
		return []Revision{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read revision dir for %q: %w", normalized, err)
	}

	revisions := make([]Revision, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		var revision Revision
		if err := readJSONFile(filepath.Join(revisionDir, entry.Name()), &revision); err != nil {
			return nil, fmt.Errorf("read revision %q: %w", entry.Name(), err)
		}
		revisions = append(revisions, revision)
	}
	sort.Slice(revisions, func(i int, j int) bool {
		return revisions[i].SavedAt.After(revisions[j].SavedAt)
	})
	return revisions, nil
}

func (s *Service) GetRevision(pagePath string, revisionID string) (Revision, error) {
	normalized, err := normalizePagePath(pagePath)
	if err != nil {
		return Revision{}, err
	}
	id := strings.TrimSpace(revisionID)
	if id == "" {
		return Revision{}, fmt.Errorf("invalid revision id")
	}
	var revision Revision
	if err := readJSONFile(filepath.Join(s.revisionDir(normalized), id+".json"), &revision); err != nil {
		return Revision{}, fmt.Errorf("read revision %q for %q: %w", id, normalized, err)
	}
	return revision, nil
}

func (s *Service) MovePage(fromPath string, toPath string) error {
	fromNormalized, err := normalizePagePath(fromPath)
	if err != nil {
		return err
	}
	toNormalized, err := normalizePagePath(toPath)
	if err != nil {
		return err
	}
	if fromNormalized == toNormalized {
		return nil
	}
	if err := s.moveTree(s.revisionDir(fromNormalized), s.revisionDir(toNormalized)); err != nil {
		return fmt.Errorf("move revisions %q to %q: %w", fromNormalized, toNormalized, err)
	}
	if err := s.moveFile(s.trashFile(fromNormalized), s.trashFile(toNormalized)); err != nil {
		return fmt.Errorf("move trash %q to %q: %w", fromNormalized, toNormalized, err)
	}
	return s.rewriteStoredPagePaths(fromNormalized, toNormalized)
}

func (s *Service) MovePrefix(fromPrefix string, toPrefix string) error {
	fromNormalized, err := normalizePrefix(fromPrefix)
	if err != nil {
		return err
	}
	toNormalized, err := normalizePrefix(toPrefix)
	if err != nil {
		return err
	}
	if fromNormalized == toNormalized {
		return nil
	}
	if err := s.moveTree(filepath.Join(s.revisionsRoot, filepath.FromSlash(fromNormalized)), filepath.Join(s.revisionsRoot, filepath.FromSlash(toNormalized))); err != nil {
		return fmt.Errorf("move revision subtree %q to %q: %w", fromNormalized, toNormalized, err)
	}
	if err := s.moveTree(filepath.Join(s.trashRoot, filepath.FromSlash(fromNormalized)), filepath.Join(s.trashRoot, filepath.FromSlash(toNormalized))); err != nil {
		return fmt.Errorf("move trash subtree %q to %q: %w", fromNormalized, toNormalized, err)
	}
	return s.rewriteStoredPrefixPaths(fromNormalized, toNormalized)
}

func (s *Service) DeletePageHistory(pagePath string) error {
	normalized, err := normalizePagePath(pagePath)
	if err != nil {
		return err
	}
	if err := os.RemoveAll(s.revisionDir(normalized)); err != nil {
		return fmt.Errorf("delete revision dir for %q: %w", normalized, err)
	}
	return nil
}

func (s *Service) DeleteHistoryPrefix(prefix string) error {
	normalized, err := normalizePrefix(prefix)
	if err != nil {
		return err
	}
	if err := os.RemoveAll(filepath.Join(s.revisionsRoot, filepath.FromSlash(normalized))); err != nil {
		return fmt.Errorf("delete revision subtree for %q: %w", normalized, err)
	}
	if err := os.RemoveAll(filepath.Join(s.trashRoot, filepath.FromSlash(normalized))); err != nil {
		return fmt.Errorf("delete trash subtree for %q: %w", normalized, err)
	}
	return nil
}

func (s *Service) MoveToTrash(pagePath string, rawMarkdown []byte) error {
	normalized, err := normalizePagePath(pagePath)
	if err != nil {
		return err
	}
	entry := TrashEntry{
		Page:        normalized,
		DeletedAt:   time.Now().UTC(),
		RawMarkdown: string(rawMarkdown),
	}
	trashPath := s.trashFile(normalized)
	if err := os.MkdirAll(filepath.Dir(trashPath), 0o755); err != nil {
		return fmt.Errorf("create trash dir for %q: %w", normalized, err)
	}
	if err := writeJSONFile(trashPath, entry); err != nil {
		return fmt.Errorf("write trash entry for %q: %w", normalized, err)
	}
	return nil
}

func (s *Service) ListTrash() ([]TrashEntry, error) {
	entries := make([]TrashEntry, 0)
	err := filepath.WalkDir(s.trashRoot, func(fullPath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || filepath.Ext(fullPath) != ".json" {
			return nil
		}
		var trashEntry TrashEntry
		if err := readJSONFile(fullPath, &trashEntry); err != nil {
			return err
		}
		entries = append(entries, trashEntry)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walk trash: %w", err)
	}
	sort.Slice(entries, func(i int, j int) bool {
		return entries[i].DeletedAt.After(entries[j].DeletedAt)
	})
	return entries, nil
}

func (s *Service) EmptyTrash() error {
	entries, err := s.ListTrash()
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if err := s.PermanentlyDelete(entry.Page); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) RestoreFromTrash(pagePath string) (TrashEntry, error) {
	normalized, err := normalizePagePath(pagePath)
	if err != nil {
		return TrashEntry{}, err
	}
	trashPath := s.trashFile(normalized)
	var entry TrashEntry
	if err := readJSONFile(trashPath, &entry); err != nil {
		return TrashEntry{}, fmt.Errorf("read trash entry for %q: %w", normalized, err)
	}
	if err := os.Remove(trashPath); err != nil {
		return TrashEntry{}, fmt.Errorf("remove trash entry for %q: %w", normalized, err)
	}
	return entry, nil
}

func (s *Service) PermanentlyDelete(pagePath string) error {
	normalized, err := normalizePagePath(pagePath)
	if err != nil {
		return err
	}
	if err := os.Remove(s.trashFile(normalized)); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete trash entry for %q: %w", normalized, err)
	}
	return s.DeletePageHistory(normalized)
}

func (s *Service) revisionDir(pagePath string) string {
	return filepath.Join(s.revisionsRoot, filepath.FromSlash(pagePath))
}

func (s *Service) trashFile(pagePath string) string {
	return filepath.Join(s.trashRoot, filepath.FromSlash(pagePath)+".json")
}

func (s *Service) latestRevision(pagePath string) (*Revision, error) {
	revisions, err := s.ListRevisions(pagePath)
	if err != nil {
		return nil, err
	}
	if len(revisions) == 0 {
		return nil, nil
	}
	return &revisions[0], nil
}

func (s *Service) moveTree(fromPath string, toPath string) error {
	if _, err := os.Stat(fromPath); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(toPath), 0o755); err != nil {
		return err
	}
	if _, err := os.Stat(toPath); os.IsNotExist(err) {
		return os.Rename(fromPath, toPath)
	} else if err != nil {
		return err
	}
	return filepath.WalkDir(fromPath, func(src string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(fromPath, src)
		if err != nil {
			return err
		}
		dst := filepath.Join(toPath, rel)
		if entry.IsDir() {
			return os.MkdirAll(dst, 0o755)
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		return os.Rename(src, dst)
	})
}

func (s *Service) moveFile(fromPath string, toPath string) error {
	if _, err := os.Stat(fromPath); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(toPath), 0o755); err != nil {
		return err
	}
	return os.Rename(fromPath, toPath)
}

func hasFiles(root string) bool {
	entries, err := os.ReadDir(root)
	if err != nil {
		return false
	}
	return len(entries) > 0
}

func (s *Service) rewriteStoredPagePaths(fromPath string, toPath string) error {
	revisions, err := s.ListRevisions(toPath)
	if err != nil {
		return err
	}
	for _, revision := range revisions {
		if revision.Page != fromPath && revision.Page != toPath {
			continue
		}
		revision.Page = toPath
		if err := writeJSONFile(filepath.Join(s.revisionDir(toPath), revision.ID+".json"), revision); err != nil {
			return err
		}
	}
	trashPath := s.trashFile(toPath)
	if _, err := os.Stat(trashPath); err == nil {
		var entry TrashEntry
		if err := readJSONFile(trashPath, &entry); err != nil {
			return err
		}
		entry.Page = toPath
		if err := writeJSONFile(trashPath, entry); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) rewriteStoredPrefixPaths(fromPrefix string, toPrefix string) error {
	revisionRoot := filepath.Join(s.revisionsRoot, filepath.FromSlash(toPrefix))
	if _, err := os.Stat(revisionRoot); err == nil {
		if err := filepath.WalkDir(revisionRoot, func(fullPath string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() || filepath.Ext(fullPath) != ".json" {
				return nil
			}
			var revision Revision
			if err := readJSONFile(fullPath, &revision); err != nil {
				return err
			}
			revision.Page = remapPrefix(revision.Page, fromPrefix, toPrefix)
			return writeJSONFile(fullPath, revision)
		}); err != nil {
			return err
		}
	}
	trashRoot := filepath.Join(s.trashRoot, filepath.FromSlash(toPrefix))
	if _, err := os.Stat(trashRoot); err == nil {
		if err := filepath.WalkDir(trashRoot, func(fullPath string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() || filepath.Ext(fullPath) != ".json" {
				return nil
			}
			var trashEntry TrashEntry
			if err := readJSONFile(fullPath, &trashEntry); err != nil {
				return err
			}
			trashEntry.Page = remapPrefix(trashEntry.Page, fromPrefix, toPrefix)
			return writeJSONFile(fullPath, trashEntry)
		}); err != nil {
			return err
		}
	}
	return nil
}

func remapPrefix(value string, fromPrefix string, toPrefix string) string {
	if value == fromPrefix {
		return toPrefix
	}
	if strings.HasPrefix(value, fromPrefix+"/") {
		return toPrefix + value[len(fromPrefix):]
	}
	return value
}

func normalizePagePath(pagePath string) (string, error) {
	normalized := path.Clean(strings.TrimSpace(strings.TrimSuffix(strings.ReplaceAll(pagePath, "\\", "/"), ".md")))
	if normalized == "." || normalized == "" || strings.HasPrefix(normalized, "../") || normalized == ".." {
		return "", fmt.Errorf("invalid page path %q", pagePath)
	}
	return strings.TrimPrefix(normalized, "/"), nil
}

func normalizePrefix(prefix string) (string, error) {
	normalized := path.Clean(strings.Trim(strings.TrimSpace(strings.ReplaceAll(prefix, "\\", "/")), "/"))
	if normalized == "." || normalized == "" || strings.HasPrefix(normalized, "../") || normalized == ".." {
		return "", fmt.Errorf("invalid page prefix %q", prefix)
	}
	return strings.TrimPrefix(normalized, "/"), nil
}

func writeJSONFile(path string, value any) error {
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(payload, '\n'), 0o644)
}

func readJSONFile(path string, value any) error {
	payload, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(payload, value)
}
