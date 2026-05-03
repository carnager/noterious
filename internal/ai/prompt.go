package ai

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/carnager/noterious/internal/query"
)

// Curated from docs/query-language.md so the copilot stays grounded in the
// server's actual query language without needing live vault data.
const queryLanguageExcerpt = `
Noterious query language summary:
- Queries are clause-based and line-oriented.
- Start with: from tasks | from pages | from links
- Common clauses: where, select, order by, group by, having, limit, offset
- Boolean filters use and / or / not.
- Operators: =, !=, contains, not contains, is null, is not null, >, >=, <, <=
- Strings should be quoted when needed, for example "work" or "notes/alpha".
- contains is case-insensitive. On list fields like tags or who it matches any element.
- Aggregates allowed in select: count(*), count(field), count(distinct field), min(field), max(field), sum(field), avg(field)
- When using group by, selected non-aggregate fields must match grouping semantics.
- Use order by for sorting, including aggregate aliases when they are valid.
- Useful date helpers include year(field), month(field), day(field), daysUntilAnnual(field).
`

type modelQueryDraft struct {
	Query       string
	Explanation string
	Assumptions []string
}

func buildInitialMessages(request QueryCopilotRequest) ([]chatMessage, error) {
	schema := query.DescribeSchema()
	schemaJSON, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode query schema: %w", err)
	}

	userPrompt := strings.TrimSpace(strings.Join([]string{
		"User intent:",
		strings.TrimSpace(request.Intent),
		"",
		"Current query draft (may be empty):",
		strings.TrimSpace(request.CurrentQuery),
		"",
		"Noterious query docs excerpt:",
		strings.TrimSpace(queryLanguageExcerpt),
		"",
		"Live query schema/capabilities/examples:",
		string(schemaJSON),
		"",
		"Return one JSON object only with keys: query, explanation, assumptions.",
		"- query must be a plain Noterious query string, not fenced markdown.",
		"- explanation must briefly explain why the query answers the intent.",
		"- assumptions must be an array of short strings and may be empty.",
		"- Do not invent datasets or fields outside the schema.",
		"- Do not use note content, preview rows, vault data, or saved query content.",
	}, "\n"))

	return []chatMessage{
		{
			Role: "system",
			Content: "You are the Noterious Query Copilot. " +
				"Generate only valid Noterious queries and return JSON only.",
		},
		{
			Role:    "user",
			Content: userPrompt,
		},
	}, nil
}

func buildRepairMessages(request QueryCopilotRequest, previous modelQueryDraft, validationErrors string) ([]chatMessage, error) {
	initial, err := buildInitialMessages(request)
	if err != nil {
		return nil, err
	}
	initial = append(initial, chatMessage{
		Role: "user",
		Content: strings.TrimSpace(strings.Join([]string{
			"Repair the previous draft using only the validator feedback below.",
			"",
			"Previous generated query:",
			previous.Query,
			"",
			"Validator feedback:",
			strings.TrimSpace(validationErrors),
			"",
			"Return a corrected JSON object with query, explanation, assumptions only.",
		}, "\n")),
	})
	return initial, nil
}

func decodeModelQueryDraft(raw string) (modelQueryDraft, error) {
	candidates := extractJSONCandidates(raw)
	var lastErr error
	for _, candidate := range candidates {
		draft, err := decodeModelQueryDraftCandidate(candidate)
		if err == nil {
			return draft, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("no JSON object found in model output")
	}
	return modelQueryDraft{}, lastErr
}

func extractJSONCandidates(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	candidates := []string{trimmed}

	if strings.HasPrefix(trimmed, "```") {
		lines := strings.Split(trimmed, "\n")
		if len(lines) >= 3 {
			fenced := strings.Join(lines[1:len(lines)-1], "\n")
			candidates = append(candidates, strings.TrimSpace(fenced))
		}
	}

	first := strings.Index(trimmed, "{")
	last := strings.LastIndex(trimmed, "}")
	if first >= 0 && last > first {
		candidates = append(candidates, strings.TrimSpace(trimmed[first:last+1]))
	}
	return uniqueCandidates(candidates)
}

func uniqueCandidates(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	unique := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		unique = append(unique, value)
	}
	return unique
}

func decodeModelQueryDraftCandidate(candidate string) (modelQueryDraft, error) {
	var payload map[string]any
	if err := json.Unmarshal([]byte(candidate), &payload); err != nil {
		return modelQueryDraft{}, fmt.Errorf("decode model JSON: %w", err)
	}

	draft := modelQueryDraft{
		Query:       strings.TrimSpace(stringValue(payload["query"])),
		Explanation: strings.TrimSpace(stringValue(payload["explanation"])),
		Assumptions: stringSliceValue(payload["assumptions"]),
	}
	if draft.Query == "" {
		return modelQueryDraft{}, fmt.Errorf("model response did not include a query")
	}
	return draft, nil
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return ""
	}
}

func stringSliceValue(value any) []string {
	switch typed := value.(type) {
	case []any:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
				items = append(items, strings.TrimSpace(text))
			}
		}
		return items
	case string:
		if strings.TrimSpace(typed) == "" {
			return nil
		}
		return []string{strings.TrimSpace(typed)}
	default:
		return nil
	}
}
