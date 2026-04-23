package markdown

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var taskLinePattern = regexp.MustCompile(`^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$`)
var inlineFieldPattern = regexp.MustCompile(`\b(due|remind|who)::`)
var bracketFieldPattern = regexp.MustCompile(`\[(due|remind|who|completed):\s*([^\]]*?)\]`)
var remindTagPattern = regexp.MustCompile(`(^|\s)#remind\b`)

type TaskPatch struct {
	Text   *string
	State  *string
	Due    *string
	Remind *string
	Who    *[]string
}

type UpdatedTask struct {
	Line int
	Text string
	Done bool
}

func ApplyTaskPatch(rawMarkdown string, line int, patch TaskPatch) (string, UpdatedTask, error) {
	if line <= 0 {
		return "", UpdatedTask{}, fmt.Errorf("invalid task line %d", line)
	}

	lines := strings.Split(strings.ReplaceAll(rawMarkdown, "\r\n", "\n"), "\n")
	if line > len(lines) {
		return "", UpdatedTask{}, fmt.Errorf("task line %d out of range", line)
	}

	updatedLine, text, done, err := patchTaskLine(lines[line-1], patch)
	if err != nil {
		return "", UpdatedTask{}, err
	}
	lines[line-1] = updatedLine

	return strings.Join(lines, "\n"), UpdatedTask{
		Line: line,
		Text: text,
		Done: done,
	}, nil
}

func patchTaskLine(line string, patch TaskPatch) (string, string, bool, error) {
	matches := taskLinePattern.FindStringSubmatch(line)
	if len(matches) != 5 {
		return "", "", false, fmt.Errorf("line is not a task")
	}

	prefix := matches[1]
	check := matches[2]
	separator := matches[3]
	body := matches[4]

	baseText, fields := splitTaskBody(body)

	if patch.Text != nil {
		baseText, _ = splitTaskBody(strings.TrimSpace(*patch.Text))
	}

	if patch.Due != nil {
		if *patch.Due == "" {
			delete(fields, "due")
		} else {
			fields["due"] = *patch.Due
		}
	}
	if patch.Remind != nil {
		if *patch.Remind == "" {
			delete(fields, "remind")
		} else {
			fields["remind"] = *patch.Remind
		}
	}
	if patch.Who != nil {
		if len(*patch.Who) == 0 {
			delete(fields, "who")
		} else {
			fields["who"] = formatWho(*patch.Who)
		}
	}

	done := strings.EqualFold(check, "x")
	if patch.State != nil {
		switch strings.ToLower(strings.TrimSpace(*patch.State)) {
		case "todo":
			check = " "
			done = false
		case "done":
			check = "x"
			done = true
		default:
			return "", "", false, fmt.Errorf("unsupported task state %q", *patch.State)
		}
	}

	rewrittenBody := strings.TrimSpace(baseText)
	for _, key := range []string{"due", "remind", "who"} {
		if value, ok := fields[key]; ok && strings.TrimSpace(value) != "" {
			if rewrittenBody != "" {
				rewrittenBody += " "
			}
			rewrittenBody += key + ":: " + value
		}
	}

	return prefix + check + separator + rewrittenBody, rewrittenBody, done, nil
}

func splitTaskBody(body string) (string, map[string]string) {
	fields := make(map[string]string)
	baseText := strings.TrimSpace(body)

	matches := inlineFieldPattern.FindAllStringSubmatchIndex(baseText, -1)
	if len(matches) > 0 {
		baseText = strings.TrimSpace(baseText[:matches[0][0]])
		for idx, match := range matches {
			key := strings.ToLower(baseTextValue(body, match[2], match[3]))
			valueStart := match[1]
			valueEnd := len(body)
			if idx+1 < len(matches) {
				valueEnd = matches[idx+1][0]
			}
			value := strings.TrimSpace(body[valueStart:valueEnd])
			fields[key] = value
		}
		return baseText, fields
	}

	baseText = bracketFieldPattern.ReplaceAllStringFunc(baseText, func(match string) string {
		parts := bracketFieldPattern.FindStringSubmatch(match)
		if len(parts) != 3 {
			return match
		}
		key := strings.ToLower(strings.TrimSpace(parts[1]))
		value := strings.Trim(strings.TrimSpace(parts[2]), `"`)
		if key == "who" && value != "" && !strings.HasPrefix(value, "[") {
			value = formatWho(splitWho(value))
		}
		if key != "completed" && value != "" {
			fields[key] = value
		}
		return ""
	})

	baseText = remindTagPattern.ReplaceAllString(baseText, "$1")
	baseText = strings.Join(strings.Fields(baseText), " ")
	return strings.TrimSpace(baseText), fields
}

func baseTextValue(body string, start, end int) string {
	return body[start:end]
}

func splitWho(value string) []string {
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

func formatWho(who []string) string {
	values := make([]string, 0, len(who))
	for _, item := range who {
		trimmed := strings.TrimSpace(item)
		if trimmed != "" {
			values = append(values, strconv.Quote(trimmed))
		}
	}
	return "[" + strings.Join(values, ", ") + "]"
}
