package markdown

import (
	"net/url"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

var wikiLinkRewritePattern = regexp.MustCompile(`\[\[([^\]|#]+)(#[^\]|]+)?(\|[^\]]+)?\]\]`)
var markdownLinkRewritePattern = regexp.MustCompile(`\[([^\]]+)\]\(([^)#]+?)(#[^)]+)?\)`)
var documentWikiLinkRewritePattern = regexp.MustCompile(`(!?)\[\[([^\]|#]+)(#[^\]|]+)?(\|[^\]]+)?\]\]`)
var documentMarkdownLinkRewritePattern = regexp.MustCompile(`(!?)\[([^\]]*)\]\(([^)#]+?)(#[^)]+)?\)`)

func RewritePageLinks(rawMarkdown string, sourcePage string, fromPage string, toPage string) (string, bool) {
	sourceNormalized := normalizePagePath(sourcePage)
	fromNormalized := normalizePagePath(fromPage)
	toNormalized := normalizePagePath(toPage)
	if sourceNormalized == "" || fromNormalized == "" || toNormalized == "" || fromNormalized == toNormalized {
		return rawMarkdown, false
	}

	changed := false
	rewritten := wikiLinkRewritePattern.ReplaceAllStringFunc(rawMarkdown, func(match string) string {
		parts := wikiLinkRewritePattern.FindStringSubmatch(match)
		if len(parts) != 4 {
			return match
		}
		rawTarget := normalizePagePath(parts[1])
		if rawTarget != fromNormalized && !matchesScopedWikiTarget(sourceNormalized, rawTarget, fromNormalized) {
			return match
		}
		changed = true
		return "[[" + rewriteWikiTarget(sourceNormalized, rawTarget, fromNormalized, toNormalized) + parts[2] + parts[3] + "]]"
	})

	rewritten = markdownLinkRewritePattern.ReplaceAllStringFunc(rewritten, func(match string) string {
		parts := markdownLinkRewritePattern.FindStringSubmatch(match)
		if len(parts) != 4 {
			return match
		}
		target := strings.TrimSpace(parts[2])
		resolved, ok := resolveMarkdownPageTarget(sourceNormalized, target)
		if !ok || resolved != fromNormalized {
			return match
		}
		changed = true
		includeExt := strings.HasSuffix(strings.ToLower(target), ".md")
		nextTarget := relativeMarkdownPageTarget(sourceNormalized, toNormalized, includeExt)
		return "[" + parts[1] + "](" + nextTarget + parts[3] + ")"
	})

	return rewritten, changed
}

func RewriteDocumentLinks(rawMarkdown string, sourcePage string, fromDocument string, toDocument string) (string, bool) {
	sourceNormalized := normalizePagePath(sourcePage)
	fromNormalized := normalizeDocumentPath(fromDocument)
	toNormalized := normalizeDocumentPath(toDocument)
	if sourceNormalized == "" || fromNormalized == "" || toNormalized == "" || fromNormalized == toNormalized {
		return rawMarkdown, false
	}

	changed := false
	rewritten := documentWikiLinkRewritePattern.ReplaceAllStringFunc(rawMarkdown, func(match string) string {
		parts := documentWikiLinkRewritePattern.FindStringSubmatch(match)
		if len(parts) != 5 {
			return match
		}
		resolved, ok := resolveMarkdownDocumentTarget(sourceNormalized, parts[2])
		if !ok || resolved != fromNormalized {
			return match
		}
		changed = true
		nextTarget := relativeMarkdownDocumentTarget(sourceNormalized, toNormalized)
		return parts[1] + "[[" + nextTarget + parts[3] + parts[4] + "]]"
	})

	rewritten = documentMarkdownLinkRewritePattern.ReplaceAllStringFunc(rewritten, func(match string) string {
		parts := documentMarkdownLinkRewritePattern.FindStringSubmatch(match)
		if len(parts) != 5 {
			return match
		}
		resolved, ok := resolveMarkdownDocumentTarget(sourceNormalized, parts[3])
		if !ok || resolved != fromNormalized {
			return match
		}
		changed = true
		nextTarget := markdownDocumentTarget(relativeMarkdownDocumentTarget(sourceNormalized, toNormalized), parts[4])
		return parts[1] + "[" + parts[2] + "](" + nextTarget + ")"
	})

	return rewritten, changed
}

func normalizePagePath(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	trimmed = strings.ReplaceAll(trimmed, "\\", "/")
	trimmed = strings.TrimSuffix(trimmed, ".md")
	trimmed = path.Clean(trimmed)
	trimmed = strings.TrimPrefix(trimmed, "./")
	trimmed = strings.TrimPrefix(trimmed, "/")
	if trimmed == "." || trimmed == "" || trimmed == ".." || strings.HasPrefix(trimmed, "../") {
		return ""
	}
	return trimmed
}

func resolveMarkdownPageTarget(sourcePage string, target string) (string, bool) {
	trimmed := strings.TrimSpace(target)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") || strings.Contains(trimmed, "://") || strings.HasPrefix(strings.ToLower(trimmed), "mailto:") {
		return "", false
	}
	baseDir := pageDirectory(sourcePage)
	raw := trimmed
	if baseDir != "" {
		raw = baseDir + "/" + trimmed
	}
	resolved := normalizePagePath(raw)
	if resolved == "" {
		return "", false
	}
	return resolved, true
}

func normalizeDocumentPath(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	trimmed = strings.ReplaceAll(trimmed, "\\", "/")
	trimmed = path.Clean(trimmed)
	trimmed = strings.TrimPrefix(trimmed, "./")
	trimmed = strings.TrimPrefix(trimmed, "/")
	if trimmed == "." || trimmed == "" || trimmed == ".." || strings.HasPrefix(trimmed, "../") {
		return ""
	}
	return trimmed
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

func markdownDocumentTarget(raw string, suffix string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	combined := trimmed + suffix
	if strings.ContainsAny(trimmed, " ()") {
		combined = strings.ReplaceAll(combined, "<", "%3C")
		combined = strings.ReplaceAll(combined, ">", "%3E")
		return "<" + combined + ">"
	}
	return combined
}

func resolveMarkdownDocumentTarget(sourcePage string, target string) (string, bool) {
	trimmed := normalizeMarkdownDocumentTarget(target)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") || strings.Contains(trimmed, "://") || strings.HasPrefix(strings.ToLower(trimmed), "mailto:") {
		return "", false
	}
	baseDir := pageDirectory(sourcePage)
	raw := trimmed
	if baseDir != "" {
		raw = baseDir + "/" + trimmed
	}
	resolved := normalizeDocumentPath(raw)
	if resolved == "" {
		return "", false
	}
	return resolved, true
}

func relativeMarkdownDocumentTarget(sourcePage string, targetDocument string) string {
	baseDir := pageDirectory(sourcePage)
	target := normalizeDocumentPath(targetDocument)
	from := "."
	if baseDir != "" {
		from = baseDir
	}
	relative, err := filepath.Rel(filepath.FromSlash(from), filepath.FromSlash(target))
	if err != nil {
		return target
	}
	return filepath.ToSlash(relative)
}

func relativeMarkdownPageTarget(sourcePage string, targetPage string, includeExt bool) string {
	baseDir := pageDirectory(sourcePage)
	target := normalizePagePath(targetPage)
	if includeExt {
		target += ".md"
	}
	from := "."
	if baseDir != "" {
		from = baseDir
	}
	relative, err := filepath.Rel(filepath.FromSlash(from), filepath.FromSlash(target))
	if err != nil {
		return target
	}
	return filepath.ToSlash(relative)
}

func pageDirectory(pagePath string) string {
	normalized := normalizePagePath(pagePath)
	if normalized == "" {
		return ""
	}
	dir := path.Dir(normalized)
	if dir == "." {
		return ""
	}
	return dir
}

func matchesScopedWikiTarget(sourcePage string, rawTarget string, fullTarget string) bool {
	if rawTarget == "" || fullTarget == "" || !strings.Contains(rawTarget, "/") {
		return false
	}
	scopePrefix := topLevelPrefix(sourcePage)
	if scopePrefix == "" {
		return false
	}
	return normalizePagePath(scopePrefix+"/"+rawTarget) == fullTarget
}

func rewriteWikiTarget(sourcePage string, rawTarget string, fromPage string, toPage string) string {
	if rawTarget == fromPage {
		return toPage
	}
	if matchesScopedWikiTarget(sourcePage, rawTarget, fromPage) {
		scopePrefix := topLevelPrefix(sourcePage)
		if strings.HasPrefix(toPage, scopePrefix+"/") {
			return strings.TrimPrefix(toPage, scopePrefix+"/")
		}
	}
	return toPage
}

func topLevelPrefix(pagePath string) string {
	normalized := normalizePagePath(pagePath)
	if normalized == "" {
		return ""
	}
	parts := strings.Split(normalized, "/")
	if len(parts) < 2 {
		return ""
	}
	return parts[0]
}
