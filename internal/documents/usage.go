package documents

import (
	"context"
	"fmt"
	"net/url"
	"path"
	"regexp"
	"slices"
	"strings"

	"github.com/carnager/noterious/internal/vault"
)

var markdownDocumentLinkPattern = regexp.MustCompile(`!?\[[^\]]*\]\(([^)#]+?)(?:#[^)]+)?\)`)

type Usage struct {
	ReferenceCount int      `json:"referenceCount"`
	ReferencedBy   []string `json:"referencedBy,omitempty"`
}

func CollectUsage(ctx context.Context, vaultService *vault.Service, documentPaths []string) (map[string]Usage, error) {
	usage := make(map[string]Usage, len(documentPaths))
	if vaultService == nil || len(documentPaths) == 0 {
		return usage, nil
	}

	known := make(map[string]struct{}, len(documentPaths))
	for _, documentPath := range documentPaths {
		normalized, err := normalizeDocumentPath(documentPath)
		if err != nil {
			continue
		}
		known[normalized] = struct{}{}
		usage[normalized] = Usage{}
	}
	if len(known) == 0 {
		return usage, nil
	}

	pages, err := vaultService.ScanMarkdownPages(ctx)
	if err != nil {
		return nil, fmt.Errorf("scan markdown pages for document usage: %w", err)
	}

	for _, page := range pages {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		rawMarkdown, err := vaultService.ReadPage(page.Path)
		if err != nil {
			return nil, fmt.Errorf("read page %q for document usage: %w", page.Path, err)
		}
		referenced := extractReferencedDocuments(page.Path, string(rawMarkdown))
		referencedByPage := make(map[string]struct{})
		for _, target := range referenced {
			if _, ok := known[target]; !ok {
				continue
			}
			current := usage[target]
			current.ReferenceCount++
			if _, seen := referencedByPage[target]; !seen {
				current.ReferencedBy = append(current.ReferencedBy, page.Path)
				referencedByPage[target] = struct{}{}
			}
			usage[target] = current
		}
	}

	for documentPath, current := range usage {
		slices.Sort(current.ReferencedBy)
		usage[documentPath] = current
	}
	return usage, nil
}

func extractReferencedDocuments(currentPagePath string, rawMarkdown string) []string {
	body := markdownBody(rawMarkdown)
	lines := strings.Split(body, "\n")
	resolved := make([]string, 0)
	inFence := false
	fenceMarker := ""
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if marker := markdownFenceMarker(trimmed); marker != "" {
			if inFence && marker == fenceMarker {
				inFence = false
				fenceMarker = ""
			} else if !inFence {
				inFence = true
				fenceMarker = marker
			}
			continue
		}
		if inFence {
			continue
		}
		matches := markdownDocumentLinkPattern.FindAllStringSubmatch(line, -1)
		for _, match := range matches {
			if len(match) < 2 {
				continue
			}
			target := resolveDocumentTarget(currentPagePath, match[1])
			if target == "" {
				continue
			}
			resolved = append(resolved, target)
		}
	}
	return resolved
}

func markdownFenceMarker(line string) string {
	if strings.HasPrefix(line, "```") {
		return "```"
	}
	if strings.HasPrefix(line, "~~~") {
		return "~~~"
	}
	return ""
}

func markdownBody(rawMarkdown string) string {
	source := strings.ReplaceAll(rawMarkdown, "\r\n", "\n")
	if !strings.HasPrefix(source, "---\n") {
		return source
	}
	if closing := strings.Index(source[4:], "\n---\n"); closing >= 0 {
		return source[closing+9:]
	}
	if closing := strings.Index(source[4:], "\n...\n"); closing >= 0 {
		return source[closing+9:]
	}
	return source
}

func resolveDocumentTarget(currentPagePath string, linkTarget string) string {
	target := normalizeMarkdownDocumentTarget(linkTarget)
	if target == "" || strings.HasPrefix(target, "#") || strings.Contains(target, "://") || strings.HasPrefix(strings.ToLower(target), "mailto:") {
		return ""
	}
	baseDir, err := documentDirForPage(currentPagePath)
	if err != nil {
		return ""
	}
	rawParts := target
	if baseDir != "" {
		rawParts = baseDir + "/" + target
	}
	resolved := make([]string, 0)
	for _, part := range strings.Split(strings.ReplaceAll(rawParts, "\\", "/"), "/") {
		part = strings.TrimSpace(part)
		if part == "" || part == "." {
			continue
		}
		if part == ".." {
			if len(resolved) > 0 {
				resolved = resolved[:len(resolved)-1]
			}
			continue
		}
		resolved = append(resolved, part)
	}
	if len(resolved) == 0 {
		return ""
	}
	normalized, err := normalizeDocumentPath(path.Join(resolved...))
	if err != nil {
		return ""
	}
	return normalized
}

func decodeMarkdownPathSegments(raw string) string {
	if !strings.Contains(raw, "%") {
		return raw
	}
	parts := strings.Split(raw, "/")
	for index, part := range parts {
		decoded, err := url.PathUnescape(part)
		if err != nil {
			continue
		}
		parts[index] = decoded
	}
	return strings.Join(parts, "/")
}

func normalizeMarkdownDocumentTarget(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if strings.HasPrefix(trimmed, "<") && strings.HasSuffix(trimmed, ">") && len(trimmed) >= 2 {
		trimmed = strings.TrimSpace(trimmed[1 : len(trimmed)-1])
	}
	if suffix := strings.IndexAny(trimmed, "?#"); suffix >= 0 {
		trimmed = trimmed[:suffix]
	}
	if strings.HasPrefix(trimmed, "<") && strings.HasSuffix(trimmed, ">") && len(trimmed) >= 2 {
		trimmed = strings.TrimSpace(trimmed[1 : len(trimmed)-1])
	}
	return decodeMarkdownPathSegments(trimmed)
}
