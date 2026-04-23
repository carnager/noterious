package vault

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

type Service struct {
	rootPath string
}

func NewService(rootPath string) *Service {
	return &Service{rootPath: filepath.Clean(rootPath)}
}

func (s *Service) RootPath() string {
	return s.rootPath
}

type PageFile struct {
	Path     string
	FullPath string
	ModTime  time.Time
}

func (s *Service) ScanMarkdownPages(ctx context.Context) ([]PageFile, error) {
	pages := make([]PageFile, 0)

	if err := os.MkdirAll(s.rootPath, 0o755); err != nil {
		return nil, fmt.Errorf("create vault root %q: %w", s.rootPath, err)
	}

	err := filepath.WalkDir(s.rootPath, func(fullPath string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}

		name := entry.Name()
		if entry.IsDir() {
			if fullPath == s.rootPath {
				return nil
			}
			if strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}

		if strings.HasPrefix(name, ".") || strings.ToLower(filepath.Ext(name)) != ".md" {
			return nil
		}

		relPath, err := filepath.Rel(s.rootPath, fullPath)
		if err != nil {
			return fmt.Errorf("compute relative path for %q: %w", fullPath, err)
		}

		info, err := entry.Info()
		if err != nil {
			return fmt.Errorf("stat %q: %w", fullPath, err)
		}

		pages = append(pages, PageFile{
			Path:     normalizePagePath(strings.TrimSuffix(filepath.ToSlash(relPath), filepath.Ext(relPath))),
			FullPath: fullPath,
			ModTime:  info.ModTime().UTC(),
		})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("scan vault %q: %w", s.rootPath, err)
	}

	return pages, nil
}

func (s *Service) ReadPage(pagePath string) ([]byte, error) {
	normalized, err := normalizeRequestedPage(pagePath)
	if err != nil {
		return nil, err
	}

	fullPath := filepath.Join(s.rootPath, filepath.FromSlash(normalized)+".md")
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, fmt.Errorf("read page %q: %w", normalized, err)
	}
	return content, nil
}

func (s *Service) WritePage(pagePath string, content []byte) error {
	normalized, err := normalizeRequestedPage(pagePath)
	if err != nil {
		return err
	}

	fullPath := filepath.Join(s.rootPath, filepath.FromSlash(normalized)+".md")
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return fmt.Errorf("create page dir for %q: %w", normalized, err)
	}
	if err := os.WriteFile(fullPath, content, 0o644); err != nil {
		return fmt.Errorf("write page %q: %w", normalized, err)
	}
	return nil
}

func (s *Service) DeletePage(pagePath string) error {
	normalized, err := normalizeRequestedPage(pagePath)
	if err != nil {
		return err
	}

	fullPath := filepath.Join(s.rootPath, filepath.FromSlash(normalized)+".md")
	if err := os.Remove(fullPath); err != nil {
		return fmt.Errorf("delete page %q: %w", normalized, err)
	}
	return nil
}

func (s *Service) MovePage(fromPath string, toPath string) error {
	fromNormalized, err := normalizeRequestedPage(fromPath)
	if err != nil {
		return err
	}
	toNormalized, err := normalizeRequestedPage(toPath)
	if err != nil {
		return err
	}
	if fromNormalized == toNormalized {
		return nil
	}

	fromFullPath := filepath.Join(s.rootPath, filepath.FromSlash(fromNormalized)+".md")
	toFullPath := filepath.Join(s.rootPath, filepath.FromSlash(toNormalized)+".md")
	if err := os.MkdirAll(filepath.Dir(toFullPath), 0o755); err != nil {
		return fmt.Errorf("create page dir for %q: %w", toNormalized, err)
	}
	if _, err := os.Stat(toFullPath); err == nil {
		return fmt.Errorf("target page %q already exists", toNormalized)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat target page %q: %w", toNormalized, err)
	}
	if err := os.Rename(fromFullPath, toFullPath); err != nil {
		return fmt.Errorf("move page %q to %q: %w", fromNormalized, toNormalized, err)
	}
	return nil
}

func (s *Service) StatPage(pagePath string) (PageFile, error) {
	normalized, err := normalizeRequestedPage(pagePath)
	if err != nil {
		return PageFile{}, err
	}

	fullPath := filepath.Join(s.rootPath, filepath.FromSlash(normalized)+".md")
	info, err := os.Stat(fullPath)
	if err != nil {
		return PageFile{}, fmt.Errorf("stat page %q: %w", normalized, err)
	}

	return PageFile{
		Path:     normalized,
		FullPath: fullPath,
		ModTime:  info.ModTime().UTC(),
	}, nil
}

func normalizeRequestedPage(pagePath string) (string, error) {
	normalized := normalizePagePath(pagePath)
	if normalized == "" || normalized == "." || strings.HasPrefix(normalized, "../") || normalized == ".." {
		return "", fmt.Errorf("invalid page path %q", pagePath)
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
