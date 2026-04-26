package index

import (
	"encoding/json"
	"fmt"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/carnager/noterious/internal/vault"
)

var (
	taskLinePattern        = regexp.MustCompile(`^\s*[-*]\s+\[([ xX])\]\s+(.*)$`)
	wikiLinkPattern        = regexp.MustCompile(`\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]`)
	markdownLinkPattern    = regexp.MustCompile(`\[([^\]]+)\]\(([^)#]+?)(?:#[^)]+)?\)`)
	inlineFieldKeyPattern  = regexp.MustCompile(`\b([A-Za-z][A-Za-z0-9_-]*)::`)
	inlineTaskFieldPattern = regexp.MustCompile(`\b(due|remind|who|completed)::`)
	bracketFieldPattern    = regexp.MustCompile(`\[(due|remind|who|completed):\s*([^\]]*?)\]`)
	remindTagPattern       = regexp.MustCompile(`(^|\s)#remind\b`)
	markdownHeadingPattern = regexp.MustCompile(`^\s{0,3}#{1,6}\s+(.+?)\s*$`)
)

type Document struct {
	Path        string
	Title       string
	RawMarkdown string
	CreatedAt   string
	UpdatedAt   string
	Frontmatter []FrontmatterField
	Links       []Link
	Tasks       []Task
}

type FrontmatterField struct {
	Key       string
	ValueJSON string
}

type Link struct {
	VaultID    int64  `json:"vaultId,omitempty"`
	SourcePage string `json:"sourcePage"`
	TargetPage string `json:"targetPage"`
	LinkText   string `json:"linkText"`
	Kind       string `json:"kind"`
	Line       int    `json:"line"`
}

type Task struct {
	VaultID int64    `json:"vaultId,omitempty"`
	Ref     string   `json:"ref"`
	Page    string   `json:"page"`
	Line    int      `json:"line"`
	Text    string   `json:"text"`
	State   string   `json:"state"`
	Done    bool     `json:"done"`
	Due     *string  `json:"due,omitempty"`
	Remind  *string  `json:"remind,omitempty"`
	Who     []string `json:"who,omitempty"`
}

type Heading struct {
	Level  int    `json:"level"`
	Text   string `json:"text"`
	Anchor string `json:"anchor"`
	Line   int    `json:"line"`
}

func ParseDocument(page vault.PageFile, raw []byte) (Document, error) {
	rawMarkdown := strings.ReplaceAll(string(raw), "\r\n", "\n")
	lines := strings.Split(rawMarkdown, "\n")

	frontmatter, bodyStartLine, bodyLines, err := parseFrontmatter(lines)
	if err != nil {
		return Document{}, fmt.Errorf("parse frontmatter for %q: %w", page.Path, err)
	}

	title := inferTitle(bodyLines, page.Path)

	document := Document{
		Path:        page.Path,
		Title:       title,
		RawMarkdown: rawMarkdown,
		CreatedAt:   page.ModTime.Format(time.RFC3339),
		UpdatedAt:   page.ModTime.Format(time.RFC3339),
		Frontmatter: frontmatter,
		Links:       extractLinks(page.Path, bodyLines, bodyStartLine),
		Tasks:       extractTasks(page.Path, bodyLines, bodyStartLine),
	}

	return document, nil
}

func ExtractHeadings(rawMarkdown string) []Heading {
	lines := strings.Split(strings.ReplaceAll(rawMarkdown, "\r\n", "\n"), "\n")
	_, bodyStartLine, bodyLines, err := parseFrontmatter(lines)
	if err != nil {
		return nil
	}

	headings := make([]Heading, 0)
	anchorCounts := make(map[string]int)
	for idx, line := range bodyLines {
		matches := markdownHeadingPattern.FindStringSubmatch(line)
		if len(matches) != 2 {
			continue
		}

		text := strings.TrimSpace(matches[1])
		if text == "" {
			continue
		}

		level := headingLevel(line)
		baseAnchor := slugifyHeading(text)
		if baseAnchor == "" {
			baseAnchor = fmt.Sprintf("section-%d", bodyStartLine+idx+1)
		}

		anchor := baseAnchor
		if count := anchorCounts[baseAnchor]; count > 0 {
			anchor = fmt.Sprintf("%s-%d", baseAnchor, count+1)
		}
		anchorCounts[baseAnchor]++

		headings = append(headings, Heading{
			Level:  level,
			Text:   text,
			Anchor: anchor,
			Line:   bodyStartLine + idx + 1,
		})
	}

	return headings
}

func parseFrontmatter(lines []string) ([]FrontmatterField, int, []string, error) {
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return nil, 0, lines, nil
	}

	end := -1
	for idx := 1; idx < len(lines); idx++ {
		if trimmed := strings.TrimSpace(lines[idx]); trimmed == "---" || trimmed == "..." {
			end = idx
			break
		}
	}
	if end == -1 {
		return nil, 0, lines, nil
	}

	fields, err := parseFrontmatterFields(lines[1:end])
	if err != nil {
		return nil, 0, nil, err
	}
	return fields, end + 1, lines[end+1:], nil
}

func parseFrontmatterFields(lines []string) ([]FrontmatterField, error) {
	fields := make([]FrontmatterField, 0)

	for idx := 0; idx < len(lines); idx++ {
		line := strings.TrimRight(lines[idx], " \t")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		if key == "" {
			continue
		}

		valuePart := strings.TrimSpace(parts[1])
		var value any

		if valuePart != "" {
			value = parseScalarValue(valuePart)
		} else {
			blockLines := make([]string, 0)
			for idx+1 < len(lines) {
				next := lines[idx+1]
				if strings.TrimSpace(next) == "" {
					blockLines = append(blockLines, "")
					idx++
					continue
				}
				if !hasIndent(next) && !strings.HasPrefix(strings.TrimSpace(next), "- ") {
					break
				}
				blockLines = append(blockLines, strings.TrimLeft(next, " \t"))
				idx++
			}
			value = parseBlockValue(blockLines)
		}

		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, fmt.Errorf("encode frontmatter field %q: %w", key, err)
		}

		fields = append(fields, FrontmatterField{
			Key:       key,
			ValueJSON: string(encoded),
		})
	}

	return fields, nil
}

func hasIndent(line string) bool {
	return strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t")
}

func parseBlockValue(lines []string) any {
	if len(lines) == 0 {
		return ""
	}

	isList := true
	values := make([]any, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if !strings.HasPrefix(trimmed, "- ") {
			isList = false
			break
		}
		values = append(values, parseScalarValue(strings.TrimSpace(strings.TrimPrefix(trimmed, "- "))))
	}
	if isList {
		return values
	}

	joined := strings.TrimSpace(strings.Join(lines, "\n"))
	if joined == "" {
		return ""
	}
	return joined
}

func parseScalarValue(raw string) any {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}

	if strings.HasPrefix(value, "[") && strings.HasSuffix(value, "]") {
		inner := strings.TrimSpace(value[1 : len(value)-1])
		if inner == "" {
			return []any{}
		}

		parts := strings.Split(inner, ",")
		items := make([]any, 0, len(parts))
		for _, part := range parts {
			items = append(items, parseScalarValue(part))
		}
		return items
	}

	if unquoted, err := strconv.Unquote(value); err == nil {
		return unquoted
	}

	switch strings.ToLower(value) {
	case "true":
		return true
	case "false":
		return false
	case "null":
		return nil
	}

	if i, err := strconv.ParseInt(value, 10, 64); err == nil {
		return i
	}
	if f, err := strconv.ParseFloat(value, 64); err == nil {
		return f
	}

	return value
}

func inferTitle(lines []string, pagePath string) string {
	base := path.Base(pagePath)
	if base == "." || base == "/" || base == "" {
		return pagePath
	}
	return base
}

func headingLevel(line string) int {
	level := 0
	for _, r := range strings.TrimLeft(line, " \t") {
		if r != '#' {
			break
		}
		level++
	}
	if level == 0 {
		return 1
	}
	return level
}

func slugifyHeading(text string) string {
	var builder strings.Builder
	lastDash := false

	for _, r := range strings.ToLower(text) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			builder.WriteRune(r)
			lastDash = false
		case r == ' ' || r == '-' || r == '_' || r == '/':
			if builder.Len() > 0 && !lastDash {
				builder.WriteByte('-')
				lastDash = true
			}
		}
	}

	slug := strings.Trim(builder.String(), "-")
	return slug
}

func extractLinks(pagePath string, bodyLines []string, bodyStartLine int) []Link {
	links := make([]Link, 0)

	for idx, line := range bodyLines {
		lineNo := bodyStartLine + idx + 1

		for _, match := range wikiLinkPattern.FindAllStringSubmatch(line, -1) {
			target := normalizeLinkedPage(match[1])
			if target == "" {
				continue
			}

			linkText := strings.TrimSpace(match[2])
			if linkText == "" {
				linkText = path.Base(target)
			}

			links = append(links, Link{
				SourcePage: pagePath,
				TargetPage: target,
				LinkText:   linkText,
				Kind:       "wikilink",
				Line:       lineNo,
			})
		}

		for _, match := range markdownLinkPattern.FindAllStringSubmatch(line, -1) {
			target := normalizeLinkedPage(match[2])
			if target == "" {
				continue
			}

			links = append(links, Link{
				SourcePage: pagePath,
				TargetPage: target,
				LinkText:   strings.TrimSpace(match[1]),
				Kind:       "markdown",
				Line:       lineNo,
			})
		}
	}

	return links
}

func normalizeLinkedPage(target string) string {
	trimmed := strings.TrimSpace(target)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") || strings.Contains(trimmed, "://") || strings.HasPrefix(trimmed, "mailto:") {
		return ""
	}

	if hashIndex := strings.Index(trimmed, "#"); hashIndex >= 0 {
		trimmed = trimmed[:hashIndex]
	}

	trimmed = strings.TrimSuffix(trimmed, ".md")
	trimmed = path.Clean(strings.ReplaceAll(trimmed, "\\", "/"))
	trimmed = strings.TrimPrefix(trimmed, "./")
	trimmed = strings.TrimPrefix(trimmed, "/")
	if trimmed == "." || trimmed == "" || strings.HasPrefix(trimmed, "../") || trimmed == ".." {
		return ""
	}
	return trimmed
}

func extractTasks(pagePath string, bodyLines []string, bodyStartLine int) []Task {
	tasks := make([]Task, 0)

	for idx, line := range bodyLines {
		matches := taskLinePattern.FindStringSubmatch(line)
		if len(matches) != 3 {
			continue
		}

		lineNo := bodyStartLine + idx + 1
		text := strings.TrimSpace(matches[2])
		done := strings.EqualFold(matches[1], "x")
		state := "todo"
		if done {
			state = "done"
		}

		baseText, fields := splitTaskBody(text)
		task := Task{
			Ref:   fmt.Sprintf("%s:%d", pagePath, lineNo),
			Page:  pagePath,
			Line:  lineNo,
			Text:  baseText,
			State: state,
			Done:  done,
			Who:   make([]string, 0),
		}
		if due, ok := fields["due"]; ok && due != "" {
			task.Due = &due
		}
		if remind, ok := fields["remind"]; ok && remind != "" {
			task.Remind = &remind
		}
		if who, ok := fields["who"]; ok && who != "" {
			task.Who = parseWhoValue(who)
		}

		tasks = append(tasks, task)
	}

	return tasks
}

func extractInlineFields(text string) map[string]string {
	fields := make(map[string]string)
	matches := inlineFieldKeyPattern.FindAllStringSubmatchIndex(text, -1)
	for idx, match := range matches {
		if len(match) < 4 {
			continue
		}
		key := strings.ToLower(text[match[2]:match[3]])
		valueStart := match[1]
		valueEnd := len(text)
		if idx+1 < len(matches) {
			valueEnd = matches[idx+1][0]
		}
		fields[key] = strings.TrimSpace(text[valueStart:valueEnd])
	}
	return fields
}

func splitTaskBody(body string) (string, map[string]string) {
	fields := make(map[string]string)
	baseText := strings.TrimSpace(body)

	baseText = bracketFieldPattern.ReplaceAllStringFunc(baseText, func(match string) string {
		parts := bracketFieldPattern.FindStringSubmatch(match)
		if len(parts) != 3 {
			return match
		}
		key := strings.ToLower(strings.TrimSpace(parts[1]))
		value := strings.Trim(strings.TrimSpace(parts[2]), `"`)
		if key == "who" && value != "" && !strings.HasPrefix(value, "[") {
			value = formatWhoValue(splitWhoValue(value))
		}
		if key != "completed" && value != "" {
			fields[key] = value
		}
		return ""
	})

	matches := inlineTaskFieldPattern.FindAllStringSubmatchIndex(baseText, -1)
	if len(matches) > 0 {
		inlineBody := baseText
		baseText = strings.TrimSpace(inlineBody[:matches[0][0]])
		for idx, match := range matches {
			if len(match) < 4 {
				continue
			}
			key := strings.ToLower(inlineBody[match[2]:match[3]])
			valueStart := match[1]
			valueEnd := len(inlineBody)
			if idx+1 < len(matches) {
				valueEnd = matches[idx+1][0]
			}
			value := strings.TrimSpace(inlineBody[valueStart:valueEnd])
			if value != "" {
				fields[key] = value
			}
		}
	}

	baseText = remindTagPattern.ReplaceAllString(baseText, "$1")
	baseText = strings.Join(strings.Fields(baseText), " ")
	return strings.TrimSpace(baseText), fields
}

func splitWhoValue(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(strings.Trim(part, `"`))
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func formatWhoValue(who []string) string {
	values := make([]string, 0, len(who))
	for _, item := range who {
		trimmed := strings.TrimSpace(item)
		if trimmed != "" {
			values = append(values, strconv.Quote(trimmed))
		}
	}
	return "[" + strings.Join(values, ", ") + "]"
}

func parseWhoValue(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	if strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]") {
		trimmed = strings.TrimSpace(trimmed[1 : len(trimmed)-1])
	}

	parts := strings.Split(trimmed, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.Trim(strings.TrimSpace(part), `"'`)
		if value != "" {
			values = append(values, value)
		}
	}
	return values
}
