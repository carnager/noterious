package markdown

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

type FrontmatterPatch struct {
	Set    map[string]any
	Remove []string
}

func ApplyFrontmatterPatch(rawMarkdown string, existing map[string]any, patch FrontmatterPatch) (string, error) {
	lines := strings.Split(strings.ReplaceAll(rawMarkdown, "\r\n", "\n"), "\n")
	bodyLines := lines

	if len(lines) > 0 && strings.TrimSpace(lines[0]) == "---" {
		end := -1
		for idx := 1; idx < len(lines); idx++ {
			trimmed := strings.TrimSpace(lines[idx])
			if trimmed == "---" || trimmed == "..." {
				end = idx
				break
			}
		}
		if end != -1 {
			bodyLines = lines[end+1:]
		}
	}

	values := make(map[string]any, len(existing)+len(patch.Set))
	for key, value := range existing {
		values[key] = value
	}
	for _, key := range patch.Remove {
		delete(values, strings.TrimSpace(key))
	}
	for key, value := range patch.Set {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			return "", fmt.Errorf("frontmatter key must not be empty")
		}
		if strings.Contains(trimmedKey, ":") {
			return "", fmt.Errorf("invalid frontmatter key %q", trimmedKey)
		}
		values[trimmedKey] = value
	}

	frontmatterLines, err := renderFrontmatter(values)
	if err != nil {
		return "", err
	}

	if len(frontmatterLines) == 0 {
		return strings.Join(bodyLines, "\n"), nil
	}

	rewritten := append([]string{"---"}, frontmatterLines...)
	rewritten = append(rewritten, "---")
	if len(bodyLines) > 0 {
		rewritten = append(rewritten, bodyLines...)
	}
	return strings.Join(rewritten, "\n"), nil
}

func renderFrontmatter(values map[string]any) ([]string, error) {
	if len(values) == 0 {
		return nil, nil
	}

	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	lines := make([]string, 0, len(keys))
	for _, key := range keys {
		value := values[key]
		rendered, err := renderFrontmatterValue(value)
		if err != nil {
			return nil, fmt.Errorf("render frontmatter %q: %w", key, err)
		}
		if !isFrontmatterList(value) {
			lines = append(lines, key+": "+rendered[0])
			continue
		}
		lines = append(lines, key+":")
		for _, line := range rendered {
			lines = append(lines, "  - "+line)
		}
	}
	return lines, nil
}

func isFrontmatterList(value any) bool {
	switch value.(type) {
	case []string, []any:
		return true
	default:
		return false
	}
}

func renderFrontmatterValue(value any) ([]string, error) {
	switch typed := value.(type) {
	case nil:
		return []string{"null"}, nil
	case string:
		return []string{renderFrontmatterScalar(typed)}, nil
	case bool:
		if typed {
			return []string{"true"}, nil
		}
		return []string{"false"}, nil
	case int:
		return []string{strconv.Itoa(typed)}, nil
	case int8:
		return []string{strconv.FormatInt(int64(typed), 10)}, nil
	case int16:
		return []string{strconv.FormatInt(int64(typed), 10)}, nil
	case int32:
		return []string{strconv.FormatInt(int64(typed), 10)}, nil
	case int64:
		return []string{strconv.FormatInt(typed, 10)}, nil
	case float32:
		return []string{strconv.FormatFloat(float64(typed), 'f', -1, 32)}, nil
	case float64:
		return []string{strconv.FormatFloat(typed, 'f', -1, 64)}, nil
	case []string:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			items = append(items, renderFrontmatterScalar(item))
		}
		return items, nil
	case []any:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			rendered, err := renderFrontmatterValue(item)
			if err != nil {
				return nil, err
			}
			if len(rendered) != 1 {
				return nil, fmt.Errorf("nested frontmatter lists are not supported")
			}
			items = append(items, rendered[0])
		}
		return items, nil
	default:
		return nil, fmt.Errorf("unsupported frontmatter value type %T", value)
	}
}

func renderFrontmatterScalar(value string) string {
	if value == "" {
		return `""`
	}
	if frontmatterNeedsQuotes(value) {
		return strconv.Quote(value)
	}
	return value
}

func frontmatterNeedsQuotes(value string) bool {
	if strings.TrimSpace(value) != value {
		return true
	}
	switch strings.ToLower(value) {
	case "true", "false", "null":
		return true
	}
	for _, char := range value {
		switch {
		case char == ':' || char == '#' || char == '[' || char == ']' || char == '{' || char == '}' || char == ',':
			return true
		case char == '\n' || char == '\r' || char == '\t':
			return true
		}
	}
	if _, err := strconv.ParseInt(value, 10, 64); err == nil {
		return true
	}
	if _, err := strconv.ParseFloat(value, 64); err == nil {
		return true
	}
	return false
}
