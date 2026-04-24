package documents

import (
	"context"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"time"
	"unicode"
)

type Document struct {
	ID          string `json:"id"`
	Path        string `json:"path"`
	Name        string `json:"name"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	CreatedAt   string `json:"createdAt"`
}

type Service struct {
	rootPath string
}

func NewService(rootPath string) (*Service, error) {
	if err := os.MkdirAll(rootPath, 0o755); err != nil {
		return nil, fmt.Errorf("create vault root %q: %w", rootPath, err)
	}
	return &Service{rootPath: filepath.Clean(rootPath)}, nil
}

func (s *Service) List(_ context.Context, query string) ([]Document, error) {
	target := strings.ToLower(strings.TrimSpace(query))
	documents := make([]Document, 0)

	err := filepath.WalkDir(s.rootPath, func(fullPath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if fullPath == s.rootPath {
			return nil
		}

		name := entry.Name()
		if entry.IsDir() {
			if strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(name, ".") || strings.EqualFold(filepath.Ext(name), ".md") {
			return nil
		}

		relPath, err := filepath.Rel(s.rootPath, fullPath)
		if err != nil {
			return fmt.Errorf("compute relative document path for %q: %w", fullPath, err)
		}
		documentPath := strings.TrimPrefix(filepath.ToSlash(relPath), "/")
		haystack := strings.ToLower(documentPath + " " + name)
		if target != "" && !strings.Contains(haystack, target) {
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			return fmt.Errorf("stat document %q: %w", fullPath, err)
		}
		documents = append(documents, documentFromPath(documentPath, info))
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("scan documents: %w", err)
	}

	sortDocuments(documents)
	return documents, nil
}

func (s *Service) Get(documentPath string) (Document, string, error) {
	normalized, err := normalizeDocumentPath(documentPath)
	if err != nil {
		return Document{}, "", err
	}

	fullPath := filepath.Join(s.rootPath, filepath.FromSlash(normalized))
	info, err := os.Stat(fullPath)
	if err != nil {
		return Document{}, "", fmt.Errorf("stat document %q: %w", normalized, err)
	}
	return documentFromPath(normalized, info), fullPath, nil
}

func (s *Service) Create(_ context.Context, pagePath string, name string, contentType string, input io.Reader) (Document, error) {
	baseName := sanitizeDocumentName(name)
	if baseName == "" {
		return Document{}, fmt.Errorf("document name is required")
	}

	data, err := io.ReadAll(input)
	if err != nil {
		return Document{}, fmt.Errorf("read upload: %w", err)
	}
	if len(data) == 0 {
		return Document{}, fmt.Errorf("document is empty")
	}

	dirPath, err := documentDirForPage(pagePath)
	if err != nil {
		return Document{}, err
	}
	documentPath, err := s.availableDocumentPath(dirPath, baseName)
	if err != nil {
		return Document{}, err
	}

	fullPath := filepath.Join(s.rootPath, filepath.FromSlash(documentPath))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return Document{}, fmt.Errorf("create document dir: %w", err)
	}
	if err := os.WriteFile(fullPath, data, 0o644); err != nil {
		return Document{}, fmt.Errorf("write document file: %w", err)
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		return Document{}, fmt.Errorf("stat document %q: %w", documentPath, err)
	}
	document := documentFromPath(documentPath, info)
	if strings.TrimSpace(contentType) != "" {
		document.ContentType = strings.TrimSpace(contentType)
	} else if detected := http.DetectContentType(data); strings.TrimSpace(detected) != "" {
		document.ContentType = detected
	}
	return document, nil
}

func (s *Service) DownloadURL(document Document) string {
	return "/api/documents/download?path=" + url.QueryEscape(document.Path)
}

func (s *Service) availableDocumentPath(dirPath string, name string) (string, error) {
	extension := path.Ext(name)
	base := strings.TrimSuffix(name, extension)
	candidate := joinDocumentPath(dirPath, name)
	if _, err := os.Stat(filepath.Join(s.rootPath, filepath.FromSlash(candidate))); os.IsNotExist(err) {
		return candidate, nil
	} else if err != nil {
		return "", fmt.Errorf("stat upload target %q: %w", candidate, err)
	}

	for index := 2; index < 1000; index += 1 {
		nextName := fmt.Sprintf("%s-%d%s", base, index, extension)
		candidate = joinDocumentPath(dirPath, nextName)
		if _, err := os.Stat(filepath.Join(s.rootPath, filepath.FromSlash(candidate))); os.IsNotExist(err) {
			return candidate, nil
		} else if err != nil {
			return "", fmt.Errorf("stat upload target %q: %w", candidate, err)
		}
	}
	return "", fmt.Errorf("could not allocate unique document path for %q", name)
}

func documentDirForPage(pagePath string) (string, error) {
	normalized := normalizePagePath(pagePath)
	if normalized == "" {
		return "", nil
	}
	if normalized == "." || normalized == ".." || strings.HasPrefix(normalized, "../") {
		return "", fmt.Errorf("invalid page path %q", pagePath)
	}
	dir := path.Dir(normalized)
	if dir == "." {
		return "", nil
	}
	return dir, nil
}

func documentFromPath(documentPath string, info os.FileInfo) Document {
	contentType := mime.TypeByExtension(strings.ToLower(path.Ext(documentPath)))
	if strings.TrimSpace(contentType) == "" {
		contentType = "application/octet-stream"
	}
	return Document{
		ID:          documentPath,
		Path:        documentPath,
		Name:        path.Base(documentPath),
		ContentType: contentType,
		Size:        info.Size(),
		CreatedAt:   info.ModTime().UTC().Format(time.RFC3339),
	}
}

func sortDocuments(documents []Document) {
	slices.SortFunc(documents, func(left, right Document) int {
		if compare := strings.Compare(right.CreatedAt, left.CreatedAt); compare != 0 {
			return compare
		}
		return strings.Compare(left.Path, right.Path)
	})
}

func sanitizeDocumentName(value string) string {
	name := path.Base(strings.TrimSpace(strings.ReplaceAll(value, "\\", "/")))
	name = strings.ReplaceAll(name, "\x00", "")
	name = strings.TrimSpace(name)
	if name == "." || name == "" {
		return ""
	}
	extension := path.Ext(name)
	base := strings.TrimSuffix(name, extension)
	base = strings.TrimSpace(base)
	base = strings.Map(func(r rune) rune {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r):
			return unicode.ToLower(r)
		case r == '.', r == '_', r == '-':
			return r
		case unicode.IsSpace(r):
			return '-'
		default:
			return '-'
		}
	}, base)
	base = strings.Trim(base, ".-_")
	base = collapseDashes(base)
	if base == "" {
		base = "document"
	}

	extBase := strings.TrimPrefix(extension, ".")
	extBase = strings.Map(func(r rune) rune {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r):
			return unicode.ToLower(r)
		default:
			return -1
		}
	}, extBase)
	if extBase == "" {
		return base
	}
	return base + "." + extBase
}

func collapseDashes(value string) string {
	var builder strings.Builder
	lastDash := false
	for _, r := range value {
		if r == '-' {
			if lastDash {
				continue
			}
			lastDash = true
			builder.WriteRune(r)
			continue
		}
		lastDash = false
		builder.WriteRune(r)
	}
	return builder.String()
}

func joinDocumentPath(dirPath string, name string) string {
	if dirPath == "" {
		return name
	}
	return path.Join(dirPath, name)
}

func normalizeDocumentPath(documentPath string) (string, error) {
	normalized := path.Clean(strings.TrimSpace(strings.ReplaceAll(documentPath, "\\", "/")))
	normalized = strings.TrimPrefix(normalized, "/")
	if normalized == "" || normalized == "." || normalized == ".." || strings.HasPrefix(normalized, "../") {
		return "", fmt.Errorf("invalid document path %q", documentPath)
	}
	return normalized, nil
}

func normalizePagePath(pagePath string) string {
	normalized := path.Clean(strings.TrimSpace(strings.TrimSuffix(strings.ReplaceAll(pagePath, "\\", "/"), ".md")))
	if normalized == "." {
		return ""
	}
	return strings.TrimPrefix(normalized, "/")
}

func ContentDisposition(name string) string {
	return mime.FormatMediaType("attachment", map[string]string{"filename": sanitizeDocumentName(name)})
}
