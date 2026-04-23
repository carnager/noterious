package query

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/carnager/noterious/internal/index"
)

var ErrQueryBlockNotFound = fmt.Errorf("query block not found")

type Service struct{}

type Block struct {
	Source   string `json:"source"`
	Line     int    `json:"line"`
	Key      string `json:"-"`
	GroupKey string `json:"-"`
	Anchor   string `json:"-"`
	ID       string `json:"-"`
}

type ParsedQuery struct {
	From         string        `json:"from"`
	Where        []Filter      `json:"where,omitempty"`
	WhereAny     [][]Filter    `json:"whereAny,omitempty"`
	GroupBy      []string      `json:"groupBy,omitempty"`
	Having       []Filter      `json:"having,omitempty"`
	HavingAny    [][]Filter    `json:"havingAny,omitempty"`
	OrderBy      []OrderField  `json:"orderBy,omitempty"`
	Limit        int           `json:"limit,omitempty"`
	Offset       int           `json:"offset,omitempty"`
	Distinct     bool          `json:"distinct,omitempty"`
	Select       []string      `json:"select,omitempty"`
	SelectFields []SelectField `json:"selectFields,omitempty"`
}

type Filter struct {
	Field string `json:"field"`
	Op    string `json:"op"`
	Value any    `json:"value"`
}

type OrderField struct {
	Field string `json:"field"`
	Desc  bool   `json:"desc,omitempty"`
}

type SelectField struct {
	Field     string `json:"field,omitempty"`
	Alias     string `json:"alias,omitempty"`
	Aggregate string `json:"aggregate,omitempty"`
	Distinct  bool   `json:"distinct,omitempty"`
}

type Result struct {
	Query   ParsedQuery      `json:"query"`
	Columns []string         `json:"columns"`
	Rows    []map[string]any `json:"rows"`
}

type DatasetFieldDescriptor struct {
	Name    string `json:"name"`
	Numeric bool   `json:"numeric,omitempty"`
}

type DatasetDescriptor struct {
	Name   string                   `json:"name"`
	Fields []DatasetFieldDescriptor `json:"fields"`
}

type QueryCapabilities struct {
	Operators  []string `json:"operators"`
	Aggregates []string `json:"aggregates"`
	Clauses    []string `json:"clauses"`
}

type QueryExample struct {
	Name        string `json:"name"`
	Dataset     string `json:"dataset"`
	Description string `json:"description"`
	Query       string `json:"query"`
}

type QuerySchema struct {
	Datasets     []DatasetDescriptor `json:"datasets"`
	Capabilities QueryCapabilities   `json:"capabilities"`
	Examples     []QueryExample      `json:"examples"`
}

type QueryAnalysisFields struct {
	Select  []string `json:"select,omitempty"`
	Where   []string `json:"where,omitempty"`
	GroupBy []string `json:"groupBy,omitempty"`
	Having  []string `json:"having,omitempty"`
	OrderBy []string `json:"orderBy,omitempty"`
}

type QueryAnalysis struct {
	Valid            bool                `json:"valid"`
	Error            string              `json:"error,omitempty"`
	Query            *ParsedQuery        `json:"query,omitempty"`
	Dataset          string              `json:"dataset,omitempty"`
	Fields           QueryAnalysisFields `json:"fields,omitempty"`
	ProjectedColumns []string            `json:"projectedColumns,omitempty"`
	Aggregate        bool                `json:"aggregate,omitempty"`
	Grouped          bool                `json:"grouped,omitempty"`
	Distinct         bool                `json:"distinct,omitempty"`
}

type QuerySuggestion struct {
	Kind  string `json:"kind"`
	Value string `json:"value"`
}

type QuerySuggestionRequest struct {
	Query   string `json:"query,omitempty"`
	Dataset string `json:"dataset,omitempty"`
	Clause  string `json:"clause,omitempty"`
	Prefix  string `json:"prefix,omitempty"`
}

type QuerySuggestionResult struct {
	Dataset     string            `json:"dataset,omitempty"`
	Clause      string            `json:"clause,omitempty"`
	Prefix      string            `json:"prefix,omitempty"`
	Suggestions []QuerySuggestion `json:"suggestions"`
	Count       int               `json:"count"`
}

type QueryClauseSuggestionSet struct {
	Clause      string            `json:"clause"`
	Suggestions []QuerySuggestion `json:"suggestions"`
	Count       int               `json:"count"`
}

type QueryDatasetSuggestionSet struct {
	Dataset string                     `json:"dataset"`
	Clauses []QueryClauseSuggestionSet `json:"clauses"`
}

type QueryEditorBootstrap struct {
	Schema             QuerySchema                 `json:"schema"`
	RootSuggestions    QuerySuggestionResult       `json:"rootSuggestions"`
	ClauseSuggestions  []QueryClauseSuggestionSet  `json:"clauseSuggestions"`
	DatasetSuggestions []QueryDatasetSuggestionSet `json:"datasetSuggestions"`
}

type QueryFormatResult struct {
	Valid     bool         `json:"valid"`
	Error     string       `json:"error,omitempty"`
	Formatted string       `json:"formatted,omitempty"`
	Query     *ParsedQuery `json:"query,omitempty"`
	Fenced    bool         `json:"fenced,omitempty"`
	ID        string       `json:"id,omitempty"`
}

type QueryPlanCounts struct {
	Where   int `json:"where"`
	GroupBy int `json:"groupBy"`
	Having  int `json:"having"`
	OrderBy int `json:"orderBy"`
	Select  int `json:"select"`
}

type QueryPlan struct {
	Valid            bool                `json:"valid"`
	Error            string              `json:"error,omitempty"`
	Query            *ParsedQuery        `json:"query,omitempty"`
	Dataset          string              `json:"dataset,omitempty"`
	Mode             string              `json:"mode,omitempty"`
	Aggregate        bool                `json:"aggregate,omitempty"`
	Grouped          bool                `json:"grouped,omitempty"`
	Distinct         bool                `json:"distinct,omitempty"`
	ProjectedColumns []string            `json:"projectedColumns,omitempty"`
	Fields           QueryAnalysisFields `json:"fields,omitempty"`
	Counts           QueryPlanCounts     `json:"counts,omitempty"`
}

type QueryLintWarning struct {
	Code    string `json:"code"`
	Clause  string `json:"clause"`
	Message string `json:"message"`
}

type QueryLintResult struct {
	Valid    bool               `json:"valid"`
	Error    string             `json:"error,omitempty"`
	Query    *ParsedQuery       `json:"query,omitempty"`
	Dataset  string             `json:"dataset,omitempty"`
	Warnings []QueryLintWarning `json:"warnings,omitempty"`
	Count    int                `json:"count"`
}

type QueryPreviewResult struct {
	Valid     bool             `json:"valid"`
	Error     string           `json:"error,omitempty"`
	Plan      *QueryPlan       `json:"plan,omitempty"`
	Columns   []string         `json:"columns,omitempty"`
	Rows      []map[string]any `json:"rows,omitempty"`
	Count     int              `json:"count"`
	Limit     int              `json:"limit,omitempty"`
	Truncated bool             `json:"truncated,omitempty"`
}

type QueryCountResult struct {
	Valid bool       `json:"valid"`
	Error string     `json:"error,omitempty"`
	Plan  *QueryPlan `json:"plan,omitempty"`
	Count int        `json:"count"`
}

type QueryWorkbenchResult struct {
	Analyze *QueryAnalysis      `json:"analyze,omitempty"`
	Plan    *QueryPlan          `json:"plan,omitempty"`
	Lint    *QueryLintResult    `json:"lint,omitempty"`
	Preview *QueryPreviewResult `json:"preview,omitempty"`
	Count   *QueryCountResult   `json:"count,omitempty"`
}

type TaskChange struct {
	Before *index.Task
	After  *index.Task
}

type PageChange struct {
	Before *index.PageSummary
	After  *index.PageSummary
}

type QueryPageRefresh struct {
	Page   string
	Blocks []index.QueryBlock
}

func NewService() *Service {
	return &Service{}
}

func DescribeDatasets() []DatasetDescriptor {
	names := []string{"tasks", "pages", "links"}
	datasets := make([]DatasetDescriptor, 0, len(names))
	for _, name := range names {
		numeric := numericDatasetFields(name)
		fields := make([]DatasetFieldDescriptor, 0, len(defaultColumns(name)))
		for _, field := range defaultColumns(name) {
			_, isNumeric := numeric[field]
			fields = append(fields, DatasetFieldDescriptor{
				Name:    field,
				Numeric: isNumeric,
			})
		}
		datasets = append(datasets, DatasetDescriptor{
			Name:   name,
			Fields: fields,
		})
	}
	return datasets
}

func DescribeCapabilities() QueryCapabilities {
	return QueryCapabilities{
		Operators: []string{
			"=",
			"!=",
			"contains",
			"not contains",
			"is null",
			"is not null",
			">",
			">=",
			"<",
			"<=",
			"and",
			"or",
			"not",
		},
		Aggregates: []string{
			"count(*)",
			"count(field)",
			"count(distinct field)",
			"min(field)",
			"max(field)",
			"sum(field)",
			"avg(field)",
		},
		Clauses: []string{
			"from",
			"where",
			"select",
			"select distinct",
			"select *",
			"order by",
			"group by",
			"having",
			"limit",
			"offset",
		},
	}
}

var queryValueFunctions = map[string]struct{}{
	"year":            {},
	"month":           {},
	"day":             {},
	"daysUntilAnnual": {},
}

func DescribeExamples() []QueryExample {
	return []QueryExample{
		{
			Name:        "Open Tasks By Due Date",
			Dataset:     "tasks",
			Description: "List unfinished tasks ordered by due date and source page.",
			Query:       "from tasks\nwhere done = false\norder by due, page\nselect ref, page, due",
		},
		{
			Name:        "Tasks Per Page",
			Dataset:     "tasks",
			Description: "Summarize task volume per page with grouped counts.",
			Query:       "from tasks\ngroup by page\norder by total desc, page\nselect page, count(*) as total",
		},
		{
			Name:        "Tagged Pages",
			Dataset:     "pages",
			Description: "Find pages whose tags mention a specific topic.",
			Query:       "from pages\nwhere tags contains \"work\"\norder by path\nselect path, tags",
		},
		{
			Name:        "Busy Pages",
			Dataset:     "pages",
			Description: "List pages with tasks and backlink activity.",
			Query:       "from pages\nwhere taskCount > 0\norder by taskCount desc, path\nselect path, taskCount, backlinkCount",
		},
		{
			Name:        "Upcoming Birthdays",
			Dataset:     "pages",
			Description: "List contact birthdays coming up soon using annual date math.",
			Query:       "from pages\nwhere tags contains \"contact\" and birthday_reminder = true and birthday != \"\" and daysUntilAnnual(birthday) <= 14\norder by daysUntilAnnual(birthday), nachname, vorname\nselect path, nachname, vorname, birthday, daysUntilAnnual(birthday) as daysUntil",
		},
		{
			Name:        "Outgoing Links",
			Dataset:     "links",
			Description: "Inspect outbound links from a specific page.",
			Query:       "from links\nwhere sourcePage = \"notes/alpha\"\norder by line, targetPage\nselect sourcePage, targetPage, kind, line",
		},
	}
}

func DescribeSchema() QuerySchema {
	return QuerySchema{
		Datasets:     DescribeDatasets(),
		Capabilities: DescribeCapabilities(),
		Examples:     DescribeExamples(),
	}
}

func Analyze(source string) QueryAnalysis {
	parsed, err := Parse(source)
	if err != nil {
		return QueryAnalysis{
			Valid: false,
			Error: err.Error(),
		}
	}

	selectFields := effectiveSelectFields(parsed)
	return QueryAnalysis{
		Valid:   true,
		Query:   &parsed,
		Dataset: parsed.From,
		Fields: QueryAnalysisFields{
			Select:  uniqueStrings(selectSourceFields(selectFields)),
			Where:   uniqueFilterFields(allFilters(parsed)),
			GroupBy: uniqueStrings(parsed.GroupBy),
			Having:  uniqueFilterFields(allHavingFilters(parsed)),
			OrderBy: uniqueOrderFields(parsed.OrderBy),
		},
		ProjectedColumns: projectedColumnNames(selectFields),
		Aggregate:        hasAggregateSelect(selectFields),
		Grouped:          len(parsed.GroupBy) > 0,
		Distinct:         parsed.Distinct,
	}
}

func Suggest(request QuerySuggestionRequest) QuerySuggestionResult {
	clause := normalizeSuggestionClause(request.Clause)
	prefix := strings.TrimSpace(request.Prefix)
	dataset := strings.TrimSpace(request.Dataset)

	var parsed ParsedQuery
	if strings.TrimSpace(request.Query) != "" {
		if analyzed := Analyze(request.Query); analyzed.Valid && analyzed.Query != nil {
			parsed = *analyzed.Query
			if dataset == "" {
				dataset = analyzed.Dataset
			}
		}
	}

	suggestions := make([]QuerySuggestion, 0)
	switch clause {
	case "from":
		for _, datasetName := range []string{"tasks", "pages", "links"} {
			suggestions = append(suggestions, QuerySuggestion{Kind: "dataset", Value: datasetName})
		}
	case "select":
		if dataset != "" {
			suggestions = append(suggestions, QuerySuggestion{Kind: "field", Value: "*"})
			for _, field := range defaultColumns(dataset) {
				suggestions = append(suggestions, QuerySuggestion{Kind: "field", Value: field})
			}
		}
		for _, aggregate := range DescribeCapabilities().Aggregates {
			suggestions = append(suggestions, QuerySuggestion{Kind: "aggregate", Value: aggregate})
		}
	case "where":
		if dataset != "" {
			for _, field := range defaultColumns(dataset) {
				suggestions = append(suggestions, QuerySuggestion{Kind: "field", Value: field})
			}
		}
		for _, operator := range DescribeCapabilities().Operators {
			suggestions = append(suggestions, QuerySuggestion{Kind: "operator", Value: operator})
		}
	case "group by":
		if dataset != "" {
			for _, field := range defaultColumns(dataset) {
				suggestions = append(suggestions, QuerySuggestion{Kind: "field", Value: field})
			}
		}
	case "having":
		if len(parsed.GroupBy) > 0 {
			for _, field := range projectedColumnNames(effectiveSelectFields(parsed)) {
				suggestions = append(suggestions, QuerySuggestion{Kind: "field", Value: field})
			}
		}
		for _, operator := range DescribeCapabilities().Operators {
			suggestions = append(suggestions, QuerySuggestion{Kind: "operator", Value: operator})
		}
	case "order by":
		if len(parsed.GroupBy) > 0 {
			for _, field := range projectedColumnNames(effectiveSelectFields(parsed)) {
				suggestions = append(suggestions, QuerySuggestion{Kind: "field", Value: field})
			}
		} else if dataset != "" {
			for _, field := range defaultColumns(dataset) {
				suggestions = append(suggestions, QuerySuggestion{Kind: "field", Value: field})
			}
		}
	default:
		for _, keyword := range DescribeCapabilities().Clauses {
			suggestions = append(suggestions, QuerySuggestion{Kind: "clause", Value: keyword})
		}
	}

	suggestions = filterSuggestionsByPrefix(uniqueSuggestions(suggestions), prefix)
	return QuerySuggestionResult{
		Dataset:     dataset,
		Clause:      clause,
		Prefix:      prefix,
		Suggestions: suggestions,
		Count:       len(suggestions),
	}
}

func DescribeEditor() QueryEditorBootstrap {
	clauseNames := []string{"from", "select", "where", "group by", "having", "order by"}
	clauseSuggestions := make([]QueryClauseSuggestionSet, 0, len(clauseNames))
	for _, clause := range clauseNames {
		result := Suggest(QuerySuggestionRequest{Clause: clause})
		clauseSuggestions = append(clauseSuggestions, QueryClauseSuggestionSet{
			Clause:      clause,
			Suggestions: result.Suggestions,
			Count:       result.Count,
		})
	}

	datasetNames := []string{"tasks", "pages", "links"}
	datasetClauseNames := []string{"select", "where", "group by", "order by"}
	datasetSuggestions := make([]QueryDatasetSuggestionSet, 0, len(datasetNames))
	for _, dataset := range datasetNames {
		clauseSets := make([]QueryClauseSuggestionSet, 0, len(datasetClauseNames))
		for _, clause := range datasetClauseNames {
			result := Suggest(QuerySuggestionRequest{
				Dataset: dataset,
				Clause:  clause,
			})
			clauseSets = append(clauseSets, QueryClauseSuggestionSet{
				Clause:      clause,
				Suggestions: result.Suggestions,
				Count:       result.Count,
			})
		}
		datasetSuggestions = append(datasetSuggestions, QueryDatasetSuggestionSet{
			Dataset: dataset,
			Clauses: clauseSets,
		})
	}

	return QueryEditorBootstrap{
		Schema:             DescribeSchema(),
		RootSuggestions:    Suggest(QuerySuggestionRequest{}),
		ClauseSuggestions:  clauseSuggestions,
		DatasetSuggestions: datasetSuggestions,
	}
}

func Format(source string) QueryFormatResult {
	parsed, err := Parse(source)
	if err != nil {
		return QueryFormatResult{
			Valid: false,
			Error: err.Error(),
		}
	}

	formatted := formatParsedQuery(parsed)
	fenced, id := queryFenceInfo(source)
	if fenced {
		header := "```query"
		if id != "" {
			header += " id=" + id
		}
		formatted = header + "\n" + formatted + "\n```"
	}

	return QueryFormatResult{
		Valid:     true,
		Formatted: formatted,
		Query:     &parsed,
		Fenced:    fenced,
		ID:        id,
	}
}

func Plan(source string) QueryPlan {
	parsed, err := Parse(source)
	if err != nil {
		return QueryPlan{
			Valid: false,
			Error: err.Error(),
		}
	}

	return buildPlan(parsed)
}

func buildPlan(parsed ParsedQuery) QueryPlan {
	selectFields := effectiveSelectFields(parsed)
	mode := "rows"
	if hasAggregateSelect(selectFields) {
		if len(parsed.GroupBy) > 0 {
			mode = "grouped-aggregate"
		} else {
			mode = "aggregate"
		}
	}

	return QueryPlan{
		Valid:   true,
		Query:   &parsed,
		Dataset: parsed.From,
		Mode:    mode,
		Fields: QueryAnalysisFields{
			Select:  uniqueStrings(selectSourceFields(selectFields)),
			Where:   uniqueFilterFields(allFilters(parsed)),
			GroupBy: uniqueStrings(parsed.GroupBy),
			Having:  uniqueFilterFields(allHavingFilters(parsed)),
			OrderBy: uniqueOrderFields(parsed.OrderBy),
		},
		Counts: QueryPlanCounts{
			Where:   len(allFilters(parsed)),
			GroupBy: len(parsed.GroupBy),
			Having:  len(allHavingFilters(parsed)),
			OrderBy: len(parsed.OrderBy),
			Select:  len(selectFields),
		},
		ProjectedColumns: projectedColumnNames(selectFields),
		Aggregate:        hasAggregateSelect(selectFields),
		Grouped:          len(parsed.GroupBy) > 0,
		Distinct:         parsed.Distinct,
	}
}

func Lint(source string) QueryLintResult {
	parsed, err := Parse(source)
	if err != nil {
		return QueryLintResult{
			Valid: false,
			Error: err.Error(),
		}
	}

	warnings := make([]QueryLintWarning, 0)
	if len(parsed.SelectFields) == 0 && len(parsed.Select) == 0 {
		warnings = append(warnings, QueryLintWarning{
			Code:    "implicit-select",
			Clause:  "select",
			Message: "query omits select and will default to all dataset fields",
		})
	}
	warnings = append(warnings, duplicateStringWarnings("select", "duplicate-select-field", "projected field appears more than once", projectedColumnNames(effectiveSelectFields(parsed)))...)
	warnings = append(warnings, duplicateStringWarnings("group by", "duplicate-group-by-field", "group field appears more than once", parsed.GroupBy)...)
	warnings = append(warnings, duplicateStringWarnings("order by", "duplicate-order-by-field", "order field appears more than once", orderFieldNames(parsed.OrderBy))...)
	warnings = append(warnings, duplicateFilterWarnings("where", "duplicate-where-filter", "filter is repeated in where clause", allFilters(parsed))...)
	warnings = append(warnings, duplicateFilterWarnings("having", "duplicate-having-filter", "filter is repeated in having clause", allHavingFilters(parsed))...)

	return QueryLintResult{
		Valid:    true,
		Query:    &parsed,
		Dataset:  parsed.From,
		Warnings: warnings,
		Count:    len(warnings),
	}
}

func Preview(ctx context.Context, indexService *index.Service, source string, limit int) QueryPreviewResult {
	parsed, err := Parse(source)
	if err != nil {
		return QueryPreviewResult{
			Valid: false,
			Error: err.Error(),
		}
	}

	const (
		defaultPreviewLimit = 20
		maxPreviewLimit     = 50
	)
	if limit <= 0 {
		limit = defaultPreviewLimit
	}
	if limit > maxPreviewLimit {
		limit = maxPreviewLimit
	}

	previewQuery := parsed
	canTruncate := previewQuery.Limit == 0 || previewQuery.Limit > limit
	if canTruncate {
		previewQuery.Limit = limit + 1
	}

	result, err := executeParsed(ctx, indexService, previewQuery)
	if err != nil {
		return QueryPreviewResult{
			Valid: false,
			Error: err.Error(),
		}
	}

	truncated := false
	if canTruncate && len(result.Rows) > limit {
		truncated = true
		result.Rows = result.Rows[:limit]
	}

	plan := buildPlan(parsed)
	return QueryPreviewResult{
		Valid:     true,
		Plan:      &plan,
		Columns:   result.Columns,
		Rows:      result.Rows,
		Count:     len(result.Rows),
		Limit:     limit,
		Truncated: truncated,
	}
}

func Count(ctx context.Context, indexService *index.Service, source string) QueryCountResult {
	parsed, err := Parse(source)
	if err != nil {
		return QueryCountResult{
			Valid: false,
			Error: err.Error(),
		}
	}

	result, err := executeParsed(ctx, indexService, parsed)
	if err != nil {
		return QueryCountResult{
			Valid: false,
			Error: err.Error(),
		}
	}

	plan := buildPlan(parsed)
	return QueryCountResult{
		Valid: true,
		Plan:  &plan,
		Count: len(result.Rows),
	}
}

func Workbench(ctx context.Context, indexService *index.Service, source string, previewLimit int) QueryWorkbenchResult {
	analyze := Analyze(source)
	plan := Plan(source)
	lint := Lint(source)
	preview := Preview(ctx, indexService, source, previewLimit)
	count := Count(ctx, indexService, source)

	return QueryWorkbenchResult{
		Analyze: &analyze,
		Plan:    &plan,
		Lint:    &lint,
		Preview: &preview,
		Count:   &count,
	}
}

func (s *Service) RefreshAll(ctx context.Context, indexService *index.Service) error {
	pages, err := indexService.ListPages(ctx)
	if err != nil {
		return err
	}

	for _, page := range pages {
		if err := s.RefreshPageCache(ctx, indexService, page.Path); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) RefreshPageCache(ctx context.Context, indexService *index.Service, pagePath string) error {
	page, err := indexService.GetPage(ctx, pagePath)
	if err != nil {
		return err
	}

	blocks := ExtractBlocks(page.RawMarkdown)
	existing, err := indexService.GetQueryBlocks(ctx, pagePath)
	if err != nil && err != index.ErrPageNotFound {
		return err
	}
	matches, ok := matchExistingQueryBlocks(blocks, existing, false)
	cached := make([]index.QueryBlock, 0, len(blocks))
	updatedAt := time.Now().UTC().Format(time.RFC3339Nano)
	for idx, block := range blocks {
		parsed, parseErr := Parse(block.Source)
		if ok {
			if existingBlock, found := matches[idx]; found && existingBlock.Source == block.Source {
				preserved := existingBlock
				preserved.Source = block.Source
				preserved.Line = block.Line
				preserved.BlockKey = block.Key
				preserved.GroupKey = block.GroupKey
				preserved.Anchor = block.Anchor
				preserved.ID = block.ID
				if parseErr == nil && parsed.From != "" {
					preserved.Datasets = []string{parsed.From}
					preserved.MatchPage = queryMatchPage(parsed)
				}
				cached = append(cached, preserved)
				continue
			}
		}
		result, err := executeQuery(ctx, s, indexService, block.Source, parseErr)
		cached = append(cached, buildCachedQueryBlock(block, parsed, updatedAt, result, err))
	}

	return indexService.ReplaceQueryBlocks(ctx, pagePath, cached)
}

func (s *Service) ForceRefreshPageCache(ctx context.Context, indexService *index.Service, pagePath string) ([]index.QueryBlock, error) {
	page, err := indexService.GetPage(ctx, pagePath)
	if err != nil {
		return nil, err
	}

	blocks := ExtractBlocks(page.RawMarkdown)
	cached := make([]index.QueryBlock, 0, len(blocks))
	updatedAt := time.Now().UTC().Format(time.RFC3339Nano)
	for _, block := range blocks {
		parsed, parseErr := Parse(block.Source)
		result, err := executeQuery(ctx, s, indexService, block.Source, parseErr)
		cached = append(cached, buildCachedQueryBlock(block, parsed, updatedAt, result, err))
	}

	if err := indexService.ReplaceQueryBlocks(ctx, pagePath, cached); err != nil {
		return nil, err
	}
	return cached, nil
}

func (s *Service) RefreshPageBlock(ctx context.Context, indexService *index.Service, pagePath string, blockKey string) (index.QueryBlock, error) {
	page, err := indexService.GetPage(ctx, pagePath)
	if err != nil {
		return index.QueryBlock{}, err
	}

	blocks := ExtractBlocks(page.RawMarkdown)
	existing, err := indexService.GetQueryBlocks(ctx, pagePath)
	if err != nil && err != index.ErrPageNotFound {
		return index.QueryBlock{}, err
	}

	matches, ok := matchExistingQueryBlocks(blocks, existing, false)
	updatedAt := time.Now().UTC().Format(time.RFC3339Nano)
	updatedBlocks := make([]index.QueryBlock, 0, len(blocks))
	var (
		refreshed index.QueryBlock
		found     bool
	)

	for idx, block := range blocks {
		parsed, parseErr := Parse(block.Source)
		if block.Key == blockKey {
			result, err := executeQuery(ctx, s, indexService, block.Source, parseErr)
			refreshed = buildCachedQueryBlock(block, parsed, updatedAt, result, err)
			updatedBlocks = append(updatedBlocks, refreshed)
			found = true
			continue
		}

		if ok {
			if existingBlock, matched := matches[idx]; matched && existingBlock.Source == block.Source {
				preserved := existingBlock
				preserved.Source = block.Source
				preserved.Line = block.Line
				preserved.BlockKey = block.Key
				preserved.GroupKey = block.GroupKey
				preserved.Anchor = block.Anchor
				preserved.ID = block.ID
				if parseErr == nil && parsed.From != "" {
					preserved.Datasets = []string{parsed.From}
					preserved.MatchPage = queryMatchPage(parsed)
				}
				updatedBlocks = append(updatedBlocks, preserved)
				continue
			}
		}

		result, err := executeQuery(ctx, s, indexService, block.Source, parseErr)
		updatedBlocks = append(updatedBlocks, buildCachedQueryBlock(block, parsed, updatedAt, result, err))
	}

	if !found {
		return index.QueryBlock{}, ErrQueryBlockNotFound
	}
	if err := indexService.ReplaceQueryBlocks(ctx, pagePath, updatedBlocks); err != nil {
		return index.QueryBlock{}, err
	}
	return refreshed, nil
}

func buildCachedQueryBlock(block Block, parsed ParsedQuery, updatedAt string, result Result, err error) index.QueryBlock {
	item := index.QueryBlock{
		Source:    block.Source,
		Line:      block.Line,
		BlockKey:  block.Key,
		GroupKey:  block.GroupKey,
		Anchor:    block.Anchor,
		ID:        block.ID,
		UpdatedAt: updatedAt,
	}
	if parsed.From != "" {
		item.Datasets = []string{parsed.From}
		item.MatchPage = queryMatchPage(parsed)
	}
	if err != nil {
		item.Error = err.Error()
	} else {
		item.Result = result
	}
	return item
}

func executeQuery(ctx context.Context, service *Service, indexService *index.Service, source string, parseErr ...error) (Result, error) {
	if len(parseErr) > 0 && parseErr[0] != nil {
		return Result{}, parseErr[0]
	}
	return service.Execute(ctx, indexService, source)
}

func queryMatchPage(parsed ParsedQuery) string {
	targetField := ""
	switch parsed.From {
	case "tasks":
		targetField = "page"
	case "pages":
		targetField = "path"
	case "links":
		targetField = "sourcePage"
	default:
		return ""
	}

	matchPage, _ := queryMatchField(whereGroups(parsed), targetField)
	return matchPage
}

func (s *Service) TaskQueryPagesForChanges(ctx context.Context, indexService *index.Service, pagePath string, changes []TaskChange) ([]string, error) {
	if len(changes) == 0 {
		return nil, nil
	}

	pages, err := indexService.ListQueryPagesByDatasetAndPage(ctx, []string{"tasks"}, pagePath)
	if err != nil {
		return nil, err
	}

	matches := make([]string, 0, len(pages))
	for _, pagePath := range pages {
		page, err := indexService.GetPage(ctx, pagePath)
		if err != nil {
			continue
		}
		if pageHasAffectedTaskQuery(page.RawMarkdown, changes) {
			matches = append(matches, pagePath)
		}
	}
	return matches, nil
}

func (s *Service) RefreshAffectedTaskQueryPages(ctx context.Context, indexService *index.Service, pagePath string, changes []TaskChange) ([]QueryPageRefresh, error) {
	if len(changes) == 0 {
		return nil, nil
	}

	pages, err := indexService.ListQueryPagesByDatasetAndPage(ctx, []string{"tasks"}, pagePath)
	if err != nil {
		return nil, err
	}

	refreshed := make([]QueryPageRefresh, 0, len(pages))
	for _, pagePath := range pages {
		blocks, changed, err := s.refreshPageBlocks(ctx, indexService, pagePath, func(parsed ParsedQuery) bool {
			return parsed.From == "tasks" && taskQueryAffected(parsed, changes)
		})
		if err != nil {
			return nil, err
		}
		if changed {
			refreshed = append(refreshed, QueryPageRefresh{
				Page:   pagePath,
				Blocks: blocks,
			})
		}
	}
	return refreshed, nil
}

func (s *Service) PageQueryPagesForChanges(ctx context.Context, indexService *index.Service, pagePath string, changes []PageChange) ([]string, error) {
	if len(changes) == 0 {
		return nil, nil
	}

	pages, err := indexService.ListQueryPagesByDatasetAndPage(ctx, []string{"pages"}, pagePath)
	if err != nil {
		return nil, err
	}

	matches := make([]string, 0, len(pages))
	for _, pagePath := range pages {
		page, err := indexService.GetPage(ctx, pagePath)
		if err != nil {
			continue
		}
		if pageHasAffectedPageQuery(page.RawMarkdown, changes) {
			matches = append(matches, pagePath)
		}
	}
	return matches, nil
}

func (s *Service) RefreshAffectedPageQueryPages(ctx context.Context, indexService *index.Service, pagePath string, changes []PageChange) ([]QueryPageRefresh, error) {
	if len(changes) == 0 {
		return nil, nil
	}

	pages, err := indexService.ListQueryPagesByDatasetAndPage(ctx, []string{"pages"}, pagePath)
	if err != nil {
		return nil, err
	}

	refreshed := make([]QueryPageRefresh, 0, len(pages))
	for _, pagePath := range pages {
		blocks, changed, err := s.refreshPageBlocks(ctx, indexService, pagePath, func(parsed ParsedQuery) bool {
			return parsed.From == "pages" && pageQueryAffected(parsed, changes)
		})
		if err != nil {
			return nil, err
		}
		if changed {
			refreshed = append(refreshed, QueryPageRefresh{
				Page:   pagePath,
				Blocks: blocks,
			})
		}
	}
	return refreshed, nil
}

func (s *Service) RefreshAffectedLinkQueryPages(ctx context.Context, indexService *index.Service, pagePath string) ([]QueryPageRefresh, error) {
	pages, err := indexService.ListQueryPagesByDatasetAndPage(ctx, []string{"links"}, pagePath)
	if err != nil {
		return nil, err
	}

	refreshed := make([]QueryPageRefresh, 0, len(pages))
	for _, queryPagePath := range pages {
		blocks, changed, err := s.refreshPageBlocks(ctx, indexService, queryPagePath, func(parsed ParsedQuery) bool {
			return parsed.From == "links"
		})
		if err != nil {
			return nil, err
		}
		if changed {
			refreshed = append(refreshed, QueryPageRefresh{
				Page:   queryPagePath,
				Blocks: blocks,
			})
		}
	}
	return refreshed, nil
}

func (s *Service) refreshPageBlocks(ctx context.Context, indexService *index.Service, pagePath string, shouldRefresh func(ParsedQuery) bool) ([]index.QueryBlock, bool, error) {
	page, err := indexService.GetPage(ctx, pagePath)
	if err != nil {
		return nil, false, err
	}

	existing, err := indexService.GetQueryBlocks(ctx, pagePath)
	if err != nil {
		return nil, false, err
	}

	blocks := ExtractBlocks(page.RawMarkdown)
	matches, ok := matchExistingQueryBlocks(blocks, existing, true)
	if !ok {
		if err := s.RefreshPageCache(ctx, indexService, pagePath); err != nil {
			return nil, false, err
		}
		refreshed, err := indexService.GetQueryBlocks(ctx, pagePath)
		if err != nil {
			return nil, false, err
		}
		return refreshed, len(blocks) > 0, nil
	}

	updatedAt := time.Now().UTC().Format(time.RFC3339Nano)
	updatedBlocks := make([]index.QueryBlock, 0, len(blocks))
	refreshedBlocks := make([]index.QueryBlock, 0)
	refreshed := false
	for idx, block := range blocks {
		existingBlock, ok := matches[idx]
		if !ok || existingBlock.Source != block.Source {
			if err := s.RefreshPageCache(ctx, indexService, pagePath); err != nil {
				return nil, false, err
			}
			refreshed, err := indexService.GetQueryBlocks(ctx, pagePath)
			if err != nil {
				return nil, false, err
			}
			return refreshed, len(blocks) > 0, nil
		}

		parsed, parseErr := Parse(block.Source)
		if parseErr == nil && shouldRefresh(parsed) {
			result, err := executeQuery(ctx, s, indexService, block.Source)
			refreshedBlock := buildCachedQueryBlock(block, parsed, updatedAt, result, err)
			updatedBlocks = append(updatedBlocks, refreshedBlock)
			refreshedBlocks = append(refreshedBlocks, refreshedBlock)
			refreshed = true
			continue
		}

		preserved := existingBlock
		preserved.Source = block.Source
		preserved.Line = block.Line
		preserved.BlockKey = block.Key
		preserved.GroupKey = block.GroupKey
		preserved.Anchor = block.Anchor
		preserved.ID = block.ID
		if parseErr == nil && parsed.From != "" {
			preserved.Datasets = []string{parsed.From}
			preserved.MatchPage = queryMatchPage(parsed)
		}
		updatedBlocks = append(updatedBlocks, preserved)
	}

	if !refreshed {
		return nil, false, nil
	}
	if err := indexService.ReplaceQueryBlocks(ctx, pagePath, updatedBlocks); err != nil {
		return nil, false, err
	}
	return refreshedBlocks, true, nil
}

func DiffTaskChanges(before, after []index.Task) []TaskChange {
	beforeByRef := make(map[string]index.Task, len(before))
	for _, task := range before {
		beforeByRef[task.Ref] = task
	}
	afterByRef := make(map[string]index.Task, len(after))
	for _, task := range after {
		afterByRef[task.Ref] = task
	}

	seen := make(map[string]struct{}, len(beforeByRef)+len(afterByRef))
	changes := make([]TaskChange, 0)
	for ref, oldTask := range beforeByRef {
		seen[ref] = struct{}{}
		if newTask, ok := afterByRef[ref]; ok {
			if taskEqual(oldTask, newTask) {
				continue
			}
			oldCopy := oldTask
			newCopy := newTask
			changes = append(changes, TaskChange{Before: &oldCopy, After: &newCopy})
			continue
		}
		oldCopy := oldTask
		changes = append(changes, TaskChange{Before: &oldCopy})
	}
	for ref, newTask := range afterByRef {
		if _, ok := seen[ref]; ok {
			continue
		}
		newCopy := newTask
		changes = append(changes, TaskChange{After: &newCopy})
	}
	return changes
}

func pageHasAffectedTaskQuery(rawMarkdown string, changes []TaskChange) bool {
	for _, block := range ExtractBlocks(rawMarkdown) {
		parsed, err := Parse(block.Source)
		if err != nil || parsed.From != "tasks" {
			continue
		}
		if taskQueryAffected(parsed, changes) {
			return true
		}
	}
	return false
}

func pageHasAffectedPageQuery(rawMarkdown string, changes []PageChange) bool {
	for _, block := range ExtractBlocks(rawMarkdown) {
		parsed, err := Parse(block.Source)
		if err != nil || parsed.From != "pages" {
			continue
		}
		if pageQueryAffected(parsed, changes) {
			return true
		}
	}
	return false
}

func taskQueryAffected(parsed ParsedQuery, changes []TaskChange) bool {
	relevantFields := taskRelevantFields(parsed)
	for _, change := range changes {
		oldRow := taskRow(change.Before)
		newRow := taskRow(change.After)
		oldMatches := oldRow != nil && matchesAny(oldRow, whereGroups(parsed))
		newMatches := newRow != nil && matchesAny(newRow, whereGroups(parsed))

		if oldMatches != newMatches {
			return true
		}
		if oldMatches && newMatches && len(taskChangedFields(change.Before, change.After, relevantFields)) > 0 {
			return true
		}
	}
	return false
}

func pageQueryAffected(parsed ParsedQuery, changes []PageChange) bool {
	relevantFields := pageRelevantFields(parsed)
	for _, change := range changes {
		oldRow := pageRow(change.Before)
		newRow := pageRow(change.After)
		oldMatches := oldRow != nil && matchesAny(oldRow, whereGroups(parsed))
		newMatches := newRow != nil && matchesAny(newRow, whereGroups(parsed))

		if oldMatches != newMatches {
			return true
		}
		if oldMatches && newMatches && len(pageChangedFields(change.Before, change.After, relevantFields)) > 0 {
			return true
		}
	}
	return false
}

func taskRelevantFields(parsed ParsedQuery) map[string]struct{} {
	fields := set()
	for _, field := range selectedSourceFields(parsed, "tasks") {
		fields[field] = struct{}{}
	}
	for _, field := range parsed.GroupBy {
		for _, source := range expressionSourceFields(field) {
			fields[source] = struct{}{}
		}
	}
	for _, filter := range allFilters(parsed) {
		for _, source := range expressionSourceFields(filter.Field) {
			fields[source] = struct{}{}
		}
	}
	for _, order := range parsed.OrderBy {
		for _, source := range expressionSourceFields(order.Field) {
			fields[source] = struct{}{}
		}
	}
	return fields
}

func pageRelevantFields(parsed ParsedQuery) map[string]struct{} {
	fields := set()
	for _, field := range selectedSourceFields(parsed, "pages") {
		fields[field] = struct{}{}
	}
	for _, field := range parsed.GroupBy {
		for _, source := range expressionSourceFields(field) {
			fields[source] = struct{}{}
		}
	}
	for _, filter := range allFilters(parsed) {
		for _, source := range expressionSourceFields(filter.Field) {
			fields[source] = struct{}{}
		}
	}
	for _, order := range parsed.OrderBy {
		for _, source := range expressionSourceFields(order.Field) {
			fields[source] = struct{}{}
		}
	}
	return fields
}

func taskChangedFields(before, after *index.Task, relevant map[string]struct{}) []string {
	changed := make([]string, 0)
	add := func(field string, different bool) {
		if !different {
			return
		}
		if _, ok := relevant[field]; ok {
			changed = append(changed, field)
		}
	}

	if before == nil || after == nil {
		for field := range relevant {
			changed = append(changed, field)
		}
		sort.Strings(changed)
		return changed
	}

	add("ref", before.Ref != after.Ref)
	add("page", before.Page != after.Page)
	add("line", before.Line != after.Line)
	add("text", before.Text != after.Text)
	add("state", before.State != after.State)
	add("done", before.Done != after.Done)
	add("due", derefString(before.Due) != derefString(after.Due))
	add("remind", derefString(before.Remind) != derefString(after.Remind))
	add("who", !stringSliceEqual(before.Who, after.Who))
	sort.Strings(changed)
	return changed
}

func pageChangedFields(before, after *index.PageSummary, relevant map[string]struct{}) []string {
	changed := make([]string, 0)
	builtInFields := builtInPageFieldSet()
	add := func(field string, different bool) {
		if !different {
			return
		}
		if _, ok := relevant[field]; ok {
			changed = append(changed, field)
		}
	}

	if before == nil || after == nil {
		for field := range relevant {
			changed = append(changed, field)
		}
		sort.Strings(changed)
		return changed
	}

	add("path", before.Path != after.Path)
	add("title", before.Title != after.Title)
	add("tags", !stringSliceEqual(before.Tags, after.Tags))
	add("outgoingLinkCount", before.OutgoingLinkCount != after.OutgoingLinkCount)
	add("backlinkCount", before.BacklinkCount != after.BacklinkCount)
	add("taskCount", before.TaskCount != after.TaskCount)
	add("openTaskCount", before.OpenTaskCount != after.OpenTaskCount)
	add("doneTaskCount", before.DoneTaskCount != after.DoneTaskCount)
	add("queryBlockCount", before.QueryBlockCount != after.QueryBlockCount)
	add("createdAt", before.CreatedAt != after.CreatedAt)
	add("updatedAt", before.UpdatedAt != after.UpdatedAt)
	for field := range relevant {
		if _, ok := builtInFields[field]; ok {
			continue
		}
		if !frontmatterValuesEqual(frontmatterFieldValue(before, field), frontmatterFieldValue(after, field)) {
			changed = append(changed, field)
		}
	}
	sort.Strings(changed)
	return changed
}

func taskRow(task *index.Task) map[string]any {
	if task == nil {
		return nil
	}
	return map[string]any{
		"ref":    task.Ref,
		"page":   task.Page,
		"line":   int64(task.Line),
		"text":   task.Text,
		"state":  task.State,
		"done":   task.Done,
		"due":    derefString(task.Due),
		"remind": derefString(task.Remind),
		"who":    append([]string(nil), task.Who...),
	}
}

func pageRow(page *index.PageSummary) map[string]any {
	if page == nil {
		return nil
	}
	row := map[string]any{
		"path":              page.Path,
		"title":             page.Title,
		"tags":              append([]string(nil), page.Tags...),
		"outgoingLinkCount": int64(page.OutgoingLinkCount),
		"backlinkCount":     int64(page.BacklinkCount),
		"taskCount":         int64(page.TaskCount),
		"openTaskCount":     int64(page.OpenTaskCount),
		"doneTaskCount":     int64(page.DoneTaskCount),
		"queryBlockCount":   int64(page.QueryBlockCount),
		"createdAt":         page.CreatedAt,
		"updatedAt":         page.UpdatedAt,
	}
	for key, value := range page.Frontmatter {
		if _, ok := row[key]; ok {
			continue
		}
		row[key] = cloneQueryValue(value)
	}
	return row
}

func frontmatterFieldValue(page *index.PageSummary, field string) any {
	if page == nil || page.Frontmatter == nil {
		return nil
	}
	return page.Frontmatter[field]
}

func frontmatterValuesEqual(left, right any) bool {
	return distinctValueKey(cloneQueryValue(left)) == distinctValueKey(cloneQueryValue(right))
}

func cloneQueryValue(value any) any {
	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		items := make([]any, len(typed))
		for idx, item := range typed {
			items[idx] = cloneQueryValue(item)
		}
		return items
	case map[string]any:
		items := make(map[string]any, len(typed))
		for key, item := range typed {
			items[key] = cloneQueryValue(item)
		}
		return items
	default:
		return typed
	}
}

func taskEqual(left, right index.Task) bool {
	return left.Ref == right.Ref &&
		left.Page == right.Page &&
		left.Line == right.Line &&
		left.Text == right.Text &&
		left.State == right.State &&
		left.Done == right.Done &&
		derefString(left.Due) == derefString(right.Due) &&
		derefString(left.Remind) == derefString(right.Remind) &&
		stringSliceEqual(left.Who, right.Who)
}

func stringSliceEqual(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for idx := range left {
		if left[idx] != right[idx] {
			return false
		}
	}
	return true
}

func (s *Service) Execute(ctx context.Context, indexService *index.Service, source string) (Result, error) {
	parsed, err := Parse(source)
	if err != nil {
		return Result{}, err
	}

	return executeParsed(ctx, indexService, parsed)
}

func executeParsed(ctx context.Context, indexService *index.Service, parsed ParsedQuery) (Result, error) {
	rows, err := loadDataset(ctx, indexService, parsed.From)
	if err != nil {
		return Result{}, err
	}

	filtered := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if matchesAny(row, whereGroups(parsed)) {
			filtered = append(filtered, row)
		}
	}

	selectFields := effectiveSelectFields(parsed)
	if hasAggregateSelect(selectFields) {
		if len(parsed.GroupBy) > 0 {
			return executeGroupedAggregateResult(parsed, selectFields, filtered), nil
		}
		return executeAggregateResult(parsed, selectFields, filtered), nil
	}

	sortRows(filtered, parsed.OrderBy)
	columns := projectedColumnNames(selectFields)

	projected := make([]map[string]any, 0, len(filtered))
	for _, row := range filtered {
		item := make(map[string]any, len(selectFields)+1)
		if parsed.From == "pages" {
			if pagePath, ok := row["path"]; ok {
				item["__pagePath"] = pagePath
			}
		} else if parsed.From == "tasks" {
			if pagePath, ok := row["page"]; ok {
				item["__pagePath"] = pagePath
			}
			if pageLine, ok := row["line"]; ok {
				item["__pageLine"] = pageLine
			}
			if taskRef, ok := row["ref"]; ok {
				item["__taskRef"] = taskRef
			}
		}
		for _, field := range selectFields {
			key := field.Field
			if field.Alias != "" {
				key = field.Alias
			}
			item[key] = rowValue(row, field.Field)
		}
		projected = append(projected, item)
	}
	if parsed.Distinct {
		projected = distinctProjectedRows(projected, columns)
	}
	if parsed.Offset > 0 {
		if parsed.Offset >= len(projected) {
			projected = projected[:0]
		} else {
			projected = projected[parsed.Offset:]
		}
	}
	if parsed.Limit > 0 && len(projected) > parsed.Limit {
		projected = projected[:parsed.Limit]
	}

	return Result{
		Query:   parsed,
		Columns: columns,
		Rows:    projected,
	}, nil
}

func Parse(source string) (ParsedQuery, error) {
	body, err := extractQueryBody(source)
	if err != nil {
		return ParsedQuery{}, err
	}

	lines := strings.Split(body, "\n")
	query := ParsedQuery{}

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		lower := strings.ToLower(line)
		switch {
		case strings.HasPrefix(lower, "from "):
			if query.From != "" {
				return ParsedQuery{}, fmt.Errorf("query may only contain one from clause")
			}
			query.From = strings.TrimSpace(line[len("from "):])
		case strings.HasPrefix(lower, "where "):
			groups, err := parseWhereClause(strings.TrimSpace(line[len("where "):]))
			if err != nil {
				return ParsedQuery{}, err
			}
			query.WhereAny = combineWhereGroups(query.WhereAny, groups)
		case strings.HasPrefix(lower, "group by "):
			groupFields := parseCSV(strings.TrimSpace(line[len("group by "):]))
			query.GroupBy = append(query.GroupBy, groupFields...)
		case strings.HasPrefix(lower, "having "):
			groups, err := parseWhereClause(strings.TrimSpace(line[len("having "):]))
			if err != nil {
				return ParsedQuery{}, err
			}
			query.HavingAny = combineWhereGroups(query.HavingAny, groups)
		case strings.HasPrefix(lower, "order by "):
			orderFields, err := parseOrderBy(strings.TrimSpace(line[len("order by "):]))
			if err != nil {
				return ParsedQuery{}, err
			}
			query.OrderBy = append(query.OrderBy, orderFields...)
		case strings.HasPrefix(lower, "limit "):
			if query.Limit > 0 {
				return ParsedQuery{}, fmt.Errorf("query may only contain one limit clause")
			}
			limit, err := parseLimit(strings.TrimSpace(line[len("limit "):]))
			if err != nil {
				return ParsedQuery{}, err
			}
			query.Limit = limit
		case strings.HasPrefix(lower, "offset "):
			if query.Offset > 0 {
				return ParsedQuery{}, fmt.Errorf("query may only contain one offset clause")
			}
			offset, err := parseOffset(strings.TrimSpace(line[len("offset "):]))
			if err != nil {
				return ParsedQuery{}, err
			}
			query.Offset = offset
		case strings.HasPrefix(lower, "select "):
			if len(query.Select) > 0 {
				return ParsedQuery{}, fmt.Errorf("query may only contain one select clause")
			}
			selectDistinct := false
			selectRaw := strings.TrimSpace(line[len("select "):])
			if len(selectRaw) > len("distinct ") && strings.EqualFold(selectRaw[:len("distinct ")], "distinct ") {
				selectDistinct = true
				selectRaw = strings.TrimSpace(selectRaw[len("distinct "):])
			}
			selectFields, err := parseSelectFields(selectRaw)
			if err != nil {
				return ParsedQuery{}, err
			}
			query.Distinct = selectDistinct
			query.SelectFields = selectFields
			query.Select = selectSourceFields(selectFields)
		default:
			return ParsedQuery{}, fmt.Errorf("unsupported query clause %q", line)
		}
	}

	if query.From == "" {
		return ParsedQuery{}, fmt.Errorf("query must include a from clause")
	}
	query.SelectFields = expandSelectFields(query.SelectFields, query.From)
	query.Select = selectSourceFields(query.SelectFields)
	if len(query.WhereAny) == 1 {
		query.Where = append(query.Where, query.WhereAny[0]...)
		query.WhereAny = nil
	} else if len(query.WhereAny) > 1 {
		query.Where = flattenWhereGroups(query.WhereAny)
	}
	query.HavingAny = havingGroups(query)
	if len(query.HavingAny) == 1 {
		query.Having = append(query.Having[:0], query.HavingAny[0]...)
		query.HavingAny = nil
	} else if len(query.HavingAny) > 1 {
		query.Having = flattenWhereGroups(query.HavingAny)
	}
	query.OrderBy = resolveOrderByAliases(query.OrderBy, query.SelectFields, len(query.GroupBy) > 0)
	if len(query.GroupBy) > 0 {
		query.HavingAny = resolveHavingAliases(havingGroups(query), query.SelectFields)
		if len(query.HavingAny) == 1 {
			query.Having = append(query.Having[:0], query.HavingAny[0]...)
			query.HavingAny = nil
		} else if len(query.HavingAny) > 1 {
			query.Having = flattenWhereGroups(query.HavingAny)
		} else {
			query.Having = nil
		}
	}
	if err := validateQuery(query); err != nil {
		return ParsedQuery{}, err
	}

	return query, nil
}

func parseLimit(raw string) (int, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, fmt.Errorf("limit must not be empty")
	}
	limit, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("invalid limit %q", raw)
	}
	if limit < 0 {
		return 0, fmt.Errorf("invalid limit %q", raw)
	}
	return limit, nil
}

func parseOffset(raw string) (int, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, fmt.Errorf("offset must not be empty")
	}
	offset, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("invalid offset %q", raw)
	}
	if offset < 0 {
		return 0, fmt.Errorf("invalid offset %q", raw)
	}
	return offset, nil
}

func parseGroupKey(row map[string]any, fields []string) string {
	parts := make([]string, 0, len(fields))
	for _, field := range fields {
		parts = append(parts, fmt.Sprintf("%#v", rowValue(row, field)))
	}
	return strings.Join(parts, "\x00")
}

func resolveOrderByAliases(orderFields []OrderField, selectFields []SelectField, grouped bool) []OrderField {
	if len(orderFields) == 0 || len(selectFields) == 0 {
		return orderFields
	}

	resolved := make([]OrderField, 0, len(orderFields))
	for _, field := range orderFields {
		field.Field = resolveProjectedReference(field.Field, selectFields, grouped)
		resolved = append(resolved, field)
	}
	return resolved
}

func resolveHavingAliases(groups [][]Filter, selectFields []SelectField) [][]Filter {
	if len(groups) == 0 || len(selectFields) == 0 {
		return groups
	}

	resolved := make([][]Filter, 0, len(groups))
	for _, group := range groups {
		next := make([]Filter, 0, len(group))
		for _, filter := range group {
			filter.Field = resolveProjectedReference(filter.Field, selectFields, true)
			next = append(next, filter)
		}
		resolved = append(resolved, next)
	}
	return resolved
}

func resolveProjectedReference(name string, selectFields []SelectField, grouped bool) string {
	name = normalizeProjectedReference(name)
	for _, field := range selectFields {
		if field.Alias != "" && strings.EqualFold(name, field.Alias) {
			if grouped || field.Aggregate != "" {
				return field.Alias
			}
			return field.Field
		}
		if field.Aggregate != "" {
			if grouped && strings.EqualFold(name, aggregateColumnName(field)) {
				return projectedColumnName(field)
			}
			continue
		}
		if strings.EqualFold(name, field.Field) {
			if grouped {
				return projectedColumnName(field)
			}
			return field.Field
		}
	}
	return name
}

func normalizeProjectedReference(name string) string {
	name = strings.TrimSpace(name)
	if field, ok := parseAggregateField(name); ok {
		return aggregateColumnName(field)
	}
	return name
}

func ExtractBlocks(source string) []Block {
	lines := strings.Split(strings.ReplaceAll(source, "\r\n", "\n"), "\n")
	blocks := make([]Block, 0)

	for idx := 0; idx < len(lines); idx++ {
		meta, ok := parseQueryFence(lines[idx])
		if !ok {
			continue
		}

		end := -1
		for next := idx + 1; next < len(lines); next++ {
			if strings.TrimSpace(lines[next]) == "```" {
				end = next
				break
			}
		}
		if end == -1 {
			break
		}

		blocks = append(blocks, Block{
			Source: strings.Join(lines[idx:end+1], "\n"),
			Line:   idx + 1,
			ID:     meta.ID,
		})
		idx = end
	}

	assignBlockKeys(lines, blocks)
	return blocks
}

func assignBlockKeys(lines []string, blocks []Block) {
	for idx := range blocks {
		if blocks[idx].ID != "" {
			blocks[idx].GroupKey = stableBlockGroupKey("id=" + blocks[idx].ID)
			blocks[idx].Anchor = "id=" + blocks[idx].ID
			blocks[idx].Key = stableBlockKey(blocks[idx].GroupKey, blocks[idx].Anchor)
			continue
		}
		groupFingerprint := blockGroupFingerprint(lines, blocks[idx])
		blocks[idx].GroupKey = stableBlockGroupKey(groupFingerprint)
		blocks[idx].Anchor = blockAnchor(lines, blocks[idx])
		blocks[idx].Key = stableBlockKey(blocks[idx].GroupKey, blocks[idx].Anchor)
	}
}

func stableBlockKey(groupKey string, anchor string) string {
	sum := sha1.Sum([]byte(fmt.Sprintf("%s\x00%s", groupKey, anchor)))
	return hex.EncodeToString(sum[:])
}

func stableBlockGroupKey(fingerprint string) string {
	sum := sha1.Sum([]byte(fingerprint))
	return hex.EncodeToString(sum[:])
}

func blockGroupFingerprint(lines []string, block Block) string {
	start := block.Line - 1

	return strings.Join([]string{
		strings.TrimSpace(block.Source),
		"heading=" + currentHeadingPath(lines, start),
	}, "\x00")
}

func blockAnchor(lines []string, block Block) string {
	start := block.Line - 2
	return nearestSectionAnchor(lines, start)
}

func currentHeadingPath(lines []string, upto int) string {
	stack := make([]string, 0, 4)
	for idx := 0; idx < upto && idx < len(lines); idx++ {
		level, title, ok := headingLine(lines[idx])
		if !ok {
			continue
		}
		if level <= 0 {
			continue
		}
		if level-1 < len(stack) {
			stack = append(stack[:level-1], title)
			continue
		}
		for len(stack) < level-1 {
			stack = append(stack, "")
		}
		stack = append(stack, title)
	}
	return strings.Join(stack, " > ")
}

func headingLine(line string) (int, string, bool) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return 0, "", false
	}
	level := 0
	for level < len(trimmed) && trimmed[level] == '#' {
		level++
	}
	if level == 0 || level >= len(trimmed) || trimmed[level] != ' ' {
		return 0, "", false
	}
	return level, strings.TrimSpace(trimmed[level+1:]), true
}

type queryFence struct {
	ID string
}

func parseQueryFence(line string) (queryFence, bool) {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(strings.ToLower(trimmed), "```query") {
		return queryFence{}, false
	}
	if len(trimmed) > len("```query") {
		next := trimmed[len("```query")]
		if next != ' ' && next != '\t' {
			return queryFence{}, false
		}
	}

	meta := queryFence{}
	for _, field := range strings.Fields(trimmed[len("```query"):]) {
		key, value, ok := strings.Cut(field, "=")
		if !ok {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(key), "id") {
			meta.ID = strings.Trim(strings.TrimSpace(value), `"'`)
		}
	}
	return meta, true
}

func nearestSectionAnchor(lines []string, start int) string {
	inFence := false
	for idx := start; idx >= 0 && idx < len(lines); idx-- {
		trimmed := strings.TrimSpace(lines[idx])
		if strings.HasPrefix(trimmed, "```") {
			inFence = !inFence
			continue
		}
		if inFence || trimmed == "" {
			continue
		}
		if _, _, ok := headingLine(trimmed); ok {
			break
		}
		return trimmed
	}
	return ""
}

func matchExistingQueryBlocks(blocks []Block, existing []index.QueryBlock, requireFull bool) (map[int]index.QueryBlock, bool) {
	if requireFull && len(existing) != len(blocks) {
		return nil, false
	}

	matches := make(map[int]index.QueryBlock, len(blocks))
	usedExisting := make([]bool, len(existing))

	existingByKey := make(map[string]int, len(existing))
	for idx, block := range existing {
		if block.BlockKey == "" {
			continue
		}
		existingByKey[block.BlockKey] = idx
	}

	unmatchedByGroup := make(map[string][]int)
	for idx, block := range blocks {
		if existingIdx, ok := existingByKey[block.Key]; ok {
			existingBlock := existing[existingIdx]
			if !usedExisting[existingIdx] && existingBlock.Source == block.Source {
				matches[idx] = existingBlock
				usedExisting[existingIdx] = true
				continue
			}
		}
		unmatchedByGroup[block.GroupKey] = append(unmatchedByGroup[block.GroupKey], idx)
	}

	existingByGroup := make(map[string][]int)
	for idx, block := range existing {
		if usedExisting[idx] {
			continue
		}
		existingByGroup[block.GroupKey] = append(existingByGroup[block.GroupKey], idx)
	}

	for groupKey, currentIndexes := range unmatchedByGroup {
		existingIndexes := existingByGroup[groupKey]
		if requireFull && len(existingIndexes) != len(currentIndexes) {
			return nil, false
		}

		existingByAnchor := make(map[string][]int)
		for _, existingIdx := range existingIndexes {
			existingByAnchor[existing[existingIdx].Anchor] = append(existingByAnchor[existing[existingIdx].Anchor], existingIdx)
		}

		remainingCurrent := make([]int, 0, len(currentIndexes))
		for _, currentIdx := range currentIndexes {
			anchor := blocks[currentIdx].Anchor
			if anchor == "" {
				remainingCurrent = append(remainingCurrent, currentIdx)
				continue
			}
			candidates := existingByAnchor[anchor]
			if len(candidates) != 1 {
				remainingCurrent = append(remainingCurrent, currentIdx)
				continue
			}
			existingIdx := candidates[0]
			if usedExisting[existingIdx] || existing[existingIdx].Source != blocks[currentIdx].Source {
				remainingCurrent = append(remainingCurrent, currentIdx)
				continue
			}
			matches[currentIdx] = existing[existingIdx]
			usedExisting[existingIdx] = true
			delete(existingByAnchor, anchor)
		}

		remainingExisting := make([]int, 0, len(existingIndexes))
		for _, existingIdx := range existingIndexes {
			if !usedExisting[existingIdx] {
				remainingExisting = append(remainingExisting, existingIdx)
			}
		}

		if requireFull && len(remainingCurrent) != len(remainingExisting) {
			return nil, false
		}
		if len(remainingCurrent) == 1 && len(remainingExisting) == 1 {
			currentIdx := remainingCurrent[0]
			existingIdx := remainingExisting[0]
			if existing[existingIdx].Source != blocks[currentIdx].Source {
				return nil, false
			}
			matches[currentIdx] = existing[existingIdx]
			usedExisting[existingIdx] = true
			continue
		}
		if requireFull && (len(remainingCurrent) > 0 || len(remainingExisting) > 0) {
			return nil, false
		}
	}

	if requireFull {
		for idx := range existing {
			if !usedExisting[idx] {
				return nil, false
			}
		}
	}

	return matches, true
}

func extractQueryBody(source string) (string, error) {
	trimmed := strings.TrimSpace(source)
	if trimmed == "" {
		return "", fmt.Errorf("query must not be empty")
	}
	if !strings.Contains(trimmed, "```") {
		return trimmed, nil
	}

	lines := strings.Split(trimmed, "\n")
	for idx := 0; idx < len(lines); idx++ {
		if _, ok := parseQueryFence(lines[idx]); ok {
			end := -1
			for next := idx + 1; next < len(lines); next++ {
				if strings.TrimSpace(lines[next]) == "```" {
					end = next
					break
				}
			}
			if end == -1 {
				return "", fmt.Errorf("unterminated query block")
			}
			return strings.Join(lines[idx+1:end], "\n"), nil
		}
	}

	return trimmed, nil
}

func parseWhereClause(raw string) ([][]Filter, error) {
	tokens, err := tokenizeWhereClause(raw)
	if err != nil {
		return nil, err
	}
	parser := whereParser{tokens: tokens}
	groups, err := parser.parseExpression(false)
	if err != nil {
		return nil, err
	}
	if parser.hasNext() {
		return nil, fmt.Errorf("unexpected token %q", parser.peek().Raw)
	}
	return groups, nil
}

func parseSingleFilter(tokens []whereToken) (Filter, error) {
	if len(tokens) < 2 {
		return Filter{}, fmt.Errorf("invalid where clause %q", joinWhereTokens(tokens))
	}

	field := strings.TrimSpace(tokens[0].Raw)
	if field == "" {
		return Filter{}, fmt.Errorf("invalid where clause %q", joinWhereTokens(tokens))
	}

	if len(tokens) >= 4 &&
		tokens[1].kind == whereTokenWord &&
		strings.EqualFold(tokens[1].Raw, "is") &&
		tokens[2].kind == whereTokenWord &&
		strings.EqualFold(tokens[2].Raw, "not") &&
		tokens[3].kind == whereTokenWord &&
		strings.EqualFold(tokens[3].Raw, "null") &&
		len(tokens) == 4 {
		return Filter{Field: field, Op: "is not null", Value: nil}, nil
	}
	if len(tokens) >= 3 &&
		tokens[1].kind == whereTokenWord &&
		strings.EqualFold(tokens[1].Raw, "is") &&
		tokens[2].kind == whereTokenWord &&
		strings.EqualFold(tokens[2].Raw, "null") &&
		len(tokens) == 3 {
		return Filter{Field: field, Op: "is null", Value: nil}, nil
	}
	if len(tokens) >= 3 &&
		tokens[1].kind == whereTokenWord &&
		strings.EqualFold(tokens[1].Raw, "contains") &&
		len(tokens) == 3 {
		return Filter{Field: field, Op: "contains", Value: parseLiteral(tokens[2].Raw)}, nil
	}
	if len(tokens) == 3 && tokens[1].kind == whereTokenOperator {
		switch tokens[1].Raw {
		case "!=", ">=", "<=", ">", "<", "=":
			return Filter{Field: field, Op: tokens[1].Raw, Value: parseLiteral(tokens[2].Raw)}, nil
		}
	}

	return Filter{}, fmt.Errorf("invalid where clause %q", joinWhereTokens(tokens))
}

func negateFilter(filter Filter) (Filter, error) {
	switch filter.Op {
	case "=":
		filter.Op = "!="
	case "!=":
		filter.Op = "="
	case "is null":
		filter.Op = "is not null"
	case "is not null":
		filter.Op = "is null"
	case "contains":
		filter.Op = "not contains"
	case "not contains":
		filter.Op = "contains"
	case ">":
		filter.Op = "<="
	case ">=":
		filter.Op = "<"
	case "<":
		filter.Op = ">="
	case "<=":
		filter.Op = ">"
	default:
		return Filter{}, fmt.Errorf("unsupported negated filter %q", filter.Op)
	}
	return filter, nil
}

type whereTokenKind int

const (
	whereTokenWord whereTokenKind = iota
	whereTokenOperator
	whereTokenLParen
	whereTokenRParen
)

type whereToken struct {
	kind whereTokenKind
	Raw  string
}

type whereParser struct {
	tokens []whereToken
	pos    int
}

func (p *whereParser) parseExpression(negated bool) ([][]Filter, error) {
	return p.parseOr(negated)
}

func (p *whereParser) parseOr(negated bool) ([][]Filter, error) {
	left, err := p.parseAnd(negated)
	if err != nil {
		return nil, err
	}
	for p.matchWord("or") {
		right, err := p.parseAnd(negated)
		if err != nil {
			return nil, err
		}
		if negated {
			left = combineWhereGroups(left, right)
		} else {
			left = append(left, right...)
		}
	}
	return left, nil
}

func (p *whereParser) parseAnd(negated bool) ([][]Filter, error) {
	left, err := p.parseUnary(negated)
	if err != nil {
		return nil, err
	}
	for p.matchWord("and") {
		right, err := p.parseUnary(negated)
		if err != nil {
			return nil, err
		}
		if negated {
			left = append(left, right...)
		} else {
			left = combineWhereGroups(left, right)
		}
	}
	return left, nil
}

func (p *whereParser) parseUnary(negated bool) ([][]Filter, error) {
	for p.matchWord("not") {
		negated = !negated
	}
	return p.parsePrimary(negated)
}

func (p *whereParser) parsePrimary(negated bool) ([][]Filter, error) {
	if !p.hasNext() {
		return nil, fmt.Errorf("unexpected end of where clause")
	}
	if p.matchKind(whereTokenLParen) {
		expr, err := p.parseExpression(negated)
		if err != nil {
			return nil, err
		}
		if !p.matchKind(whereTokenRParen) {
			return nil, fmt.Errorf("missing closing parenthesis in where clause")
		}
		return expr, nil
	}

	filter, err := p.parseFilter()
	if err != nil {
		return nil, err
	}
	if negated {
		filter, err = negateFilter(filter)
		if err != nil {
			return nil, err
		}
	}
	return [][]Filter{{filter}}, nil
}

func (p *whereParser) parseFilter() (Filter, error) {
	start := p.pos
	for p.hasNext() {
		token := p.peek()
		if token.kind == whereTokenRParen {
			break
		}
		if token.kind == whereTokenWord && (strings.EqualFold(token.Raw, "and") || strings.EqualFold(token.Raw, "or")) {
			break
		}
		p.pos++
	}
	return parseSingleFilter(p.tokens[start:p.pos])
}

func (p *whereParser) hasNext() bool {
	return p.pos < len(p.tokens)
}

func (p *whereParser) peek() whereToken {
	return p.tokens[p.pos]
}

func (p *whereParser) matchKind(kind whereTokenKind) bool {
	if !p.hasNext() || p.tokens[p.pos].kind != kind {
		return false
	}
	p.pos++
	return true
}

func (p *whereParser) matchWord(word string) bool {
	if !p.hasNext() {
		return false
	}
	token := p.tokens[p.pos]
	if token.kind != whereTokenWord || !strings.EqualFold(token.Raw, word) {
		return false
	}
	p.pos++
	return true
}

func tokenizeWhereClause(raw string) ([]whereToken, error) {
	tokens := make([]whereToken, 0)
	for idx := 0; idx < len(raw); {
		if token, next, ok := scanAggregateWhereToken(raw, idx); ok {
			tokens = append(tokens, whereToken{kind: whereTokenWord, Raw: token})
			idx = next
			continue
		}
		if token, next, ok := scanFunctionWhereToken(raw, idx); ok {
			tokens = append(tokens, whereToken{kind: whereTokenWord, Raw: token})
			idx = next
			continue
		}
		switch {
		case isSpace(raw[idx]):
			idx++
		case raw[idx] == '(':
			tokens = append(tokens, whereToken{kind: whereTokenLParen, Raw: "("})
			idx++
		case raw[idx] == ')':
			tokens = append(tokens, whereToken{kind: whereTokenRParen, Raw: ")"})
			idx++
		case idx+1 < len(raw) && (raw[idx:idx+2] == "!=" || raw[idx:idx+2] == ">=" || raw[idx:idx+2] == "<="):
			tokens = append(tokens, whereToken{kind: whereTokenOperator, Raw: raw[idx : idx+2]})
			idx += 2
		case raw[idx] == '=' || raw[idx] == '>' || raw[idx] == '<':
			tokens = append(tokens, whereToken{kind: whereTokenOperator, Raw: raw[idx : idx+1]})
			idx++
		case raw[idx] == '"' || raw[idx] == '\'':
			start := idx
			quote := raw[idx]
			idx++
			for idx < len(raw) {
				if raw[idx] == '\\' && idx+1 < len(raw) {
					idx += 2
					continue
				}
				if raw[idx] == quote {
					idx++
					break
				}
				idx++
			}
			if idx > len(raw) || raw[idx-1] != quote {
				return nil, fmt.Errorf("unterminated quoted string in where clause")
			}
			tokens = append(tokens, whereToken{kind: whereTokenWord, Raw: raw[start:idx]})
		default:
			start := idx
			for idx < len(raw) &&
				!isSpace(raw[idx]) &&
				raw[idx] != '(' &&
				raw[idx] != ')' &&
				raw[idx] != '=' &&
				raw[idx] != '>' &&
				raw[idx] != '<' &&
				raw[idx] != '!' {
				idx++
			}
			tokens = append(tokens, whereToken{kind: whereTokenWord, Raw: raw[start:idx]})
		}
	}
	return tokens, nil
}

func scanFunctionWhereToken(raw string, start int) (string, int, bool) {
	if start >= len(raw) {
		return "", start, false
	}
	if !(raw[start] == '_' || (raw[start] >= 'A' && raw[start] <= 'Z') || (raw[start] >= 'a' && raw[start] <= 'z')) {
		return "", start, false
	}
	idx := start
	for idx < len(raw) {
		ch := raw[idx]
		if ch == '_' || ch == '-' || (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') {
			idx++
			continue
		}
		break
	}
	if idx >= len(raw) || raw[idx] != '(' || idx == start {
		return "", start, false
	}
	depth := 0
	for end := idx; end < len(raw); end++ {
		switch raw[end] {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				token := raw[start : end+1]
				if _, ok := parseValueFunction(token); ok {
					return token, end + 1, true
				}
				return "", start, false
			}
		}
	}
	return "", start, false
}

func scanAggregateWhereToken(raw string, start int) (string, int, bool) {
	if start >= len(raw) {
		return "", start, false
	}
	if !hasAggregatePrefix(raw[start:]) {
		return "", start, false
	}

	for end := start + 1; end <= len(raw); end++ {
		if raw[end-1] != ')' {
			continue
		}
		field, ok := parseAggregateField(raw[start:end])
		if !ok {
			continue
		}
		return aggregateColumnName(field), end, true
	}
	return "", start, false
}

func hasAggregatePrefix(raw string) bool {
	for _, prefix := range []string{"count", "min", "max", "sum", "avg"} {
		if len(raw) >= len(prefix) && strings.EqualFold(raw[:len(prefix)], prefix) {
			return true
		}
	}
	return false
}

func joinWhereTokens(tokens []whereToken) string {
	parts := make([]string, 0, len(tokens))
	for _, token := range tokens {
		parts = append(parts, token.Raw)
	}
	return strings.Join(parts, " ")
}

func isSpace(ch byte) bool {
	return ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r'
}

func parseOrderBy(raw string) ([]OrderField, error) {
	parts := parseCSV(raw)
	fields := make([]OrderField, 0, len(parts))
	for _, part := range parts {
		chunks := strings.Fields(part)
		if len(chunks) == 0 {
			continue
		}
		field := OrderField{Field: chunks[0]}
		if len(chunks) > 1 {
			switch strings.ToLower(chunks[1]) {
			case "asc":
			case "desc":
				field.Desc = true
			default:
				return nil, fmt.Errorf("invalid order direction %q", chunks[1])
			}
		}
		fields = append(fields, field)
	}
	return fields, nil
}

func parseSelectFields(raw string) ([]SelectField, error) {
	parts := parseCSV(raw)
	fields := make([]SelectField, 0, len(parts))
	for _, part := range parts {
		lower := strings.ToLower(part)
		if idx := strings.Index(lower, " as "); idx >= 0 {
			field := strings.TrimSpace(part[:idx])
			alias := strings.TrimSpace(part[idx+len(" as "):])
			if field == "" || alias == "" {
				return nil, fmt.Errorf("invalid select field %q", part)
			}
			if field == "*" {
				return nil, fmt.Errorf("select * does not support aliases")
			}
			selectField, err := parseSelectField(field)
			if err != nil {
				return nil, err
			}
			selectField.Alias = alias
			fields = append(fields, selectField)
			continue
		}
		selectField, err := parseSelectField(strings.TrimSpace(part))
		if err != nil {
			return nil, err
		}
		fields = append(fields, selectField)
	}
	return fields, nil
}

func parseSelectField(raw string) (SelectField, error) {
	field := strings.TrimSpace(raw)
	if field == "" {
		return SelectField{}, fmt.Errorf("invalid select field %q", raw)
	}
	if field == "*" {
		return SelectField{Field: "*"}, nil
	}
	if aggregateField, ok := parseAggregateField(field); ok {
		return aggregateField, nil
	}
	return SelectField{Field: field}, nil
}

func parseAggregateField(raw string) (SelectField, bool) {
	field := strings.TrimSpace(raw)
	for _, aggregate := range []string{"count", "min", "max", "sum", "avg"} {
		if len(field) < len(aggregate)+2 || !strings.EqualFold(field[:len(aggregate)], aggregate) {
			continue
		}
		rest := strings.TrimSpace(field[len(aggregate):])
		if !strings.HasPrefix(rest, "(") || !strings.HasSuffix(rest, ")") {
			continue
		}
		target := strings.TrimSpace(rest[1 : len(rest)-1])
		switch aggregate {
		case "count":
			if target == "*" {
				return SelectField{Aggregate: "count"}, true
			}
			if len(target) > len("distinct ") && strings.EqualFold(target[:len("distinct ")], "distinct ") {
				distinctTarget := strings.TrimSpace(target[len("distinct "):])
				if distinctTarget != "" && distinctTarget != "*" {
					return SelectField{Field: distinctTarget, Aggregate: "count", Distinct: true}, true
				}
			}
			if target != "" {
				return SelectField{Field: target, Aggregate: "count"}, true
			}
		case "min", "max", "sum", "avg":
			if target != "" && target != "*" {
				return SelectField{Field: target, Aggregate: aggregate}, true
			}
		}
	}
	return SelectField{}, false
}

func parseCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value != "" {
			values = append(values, value)
		}
	}
	return values
}

type valueFunction struct {
	Name string
	Arg  string
}

func parseValueFunction(raw string) (valueFunction, bool) {
	field := strings.TrimSpace(raw)
	open := strings.IndexByte(field, '(')
	if open <= 0 || !strings.HasSuffix(field, ")") {
		return valueFunction{}, false
	}
	name := strings.TrimSpace(field[:open])
	arg := strings.TrimSpace(field[open+1 : len(field)-1])
	if name == "" || arg == "" || strings.Contains(arg, ",") {
		return valueFunction{}, false
	}
	return valueFunction{Name: name, Arg: arg}, true
}

func expressionSourceFields(field string) []string {
	if fn, ok := parseValueFunction(field); ok {
		return expressionSourceFields(fn.Arg)
	}
	return []string{field}
}

func selectSourceFields(fields []SelectField) []string {
	items := make([]string, 0, len(fields))
	for _, field := range fields {
		if field.Field == "" {
			continue
		}
		items = append(items, expressionSourceFields(field.Field)...)
	}
	return uniqueStrings(items)
}

func projectedColumnNames(fields []SelectField) []string {
	items := make([]string, 0, len(fields))
	for _, field := range fields {
		if field.Alias != "" {
			items = append(items, field.Alias)
			continue
		}
		if field.Aggregate != "" {
			items = append(items, aggregateColumnName(field))
			continue
		}
		items = append(items, field.Field)
	}
	return items
}

func parseLiteral(raw string) any {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
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

func validateQuery(query ParsedQuery) error {
	fields, ok := datasetFields(query.From)
	if !ok {
		return fmt.Errorf("unsupported dataset %q", query.From)
	}

	if (len(query.Having) > 0 || len(query.HavingAny) > 0) && len(query.GroupBy) == 0 {
		return fmt.Errorf("having currently requires group by")
	}
	for _, field := range query.GroupBy {
		if !queryFieldSupported(query.From, fields, field) {
			return fmt.Errorf("unsupported group field %q for dataset %q", field, query.From)
		}
	}
	for _, filter := range allFilters(query) {
		if !queryFieldSupported(query.From, fields, filter.Field) {
			return fmt.Errorf("unsupported field %q for dataset %q", filter.Field, query.From)
		}
	}
	if len(query.GroupBy) == 0 {
		for _, field := range query.OrderBy {
			if !queryFieldSupported(query.From, fields, field.Field) {
				return fmt.Errorf("unsupported order field %q for dataset %q", field.Field, query.From)
			}
		}
	}
	selectFields := effectiveSelectFields(query)
	for _, field := range selectFields {
		if field.Field == "*" {
			return fmt.Errorf("select * must be used on its own")
		}
	}
	if hasAggregateSelect(selectFields) {
		if query.Distinct {
			return fmt.Errorf("select distinct currently does not support aggregate selects")
		}
		if err := validateAggregateSelects(selectFields, query.From, query.GroupBy); err != nil {
			return err
		}
	} else if len(query.GroupBy) > 0 {
		return fmt.Errorf("group by currently requires an aggregate select")
	}
	if len(query.GroupBy) > 0 {
		projected := set(projectedColumnNames(selectFields)...)
		for _, field := range query.OrderBy {
			if _, ok := projected[field.Field]; !ok {
				return fmt.Errorf("unsupported grouped order field %q", field.Field)
			}
		}
		for _, filter := range allHavingFilters(query) {
			if _, ok := projected[filter.Field]; !ok {
				return fmt.Errorf("unsupported having field %q", filter.Field)
			}
		}
	}
	for _, field := range selectFields {
		if field.Aggregate != "" {
			continue
		}
		if !queryFieldSupported(query.From, fields, field.Field) {
			return fmt.Errorf("unsupported select field %q for dataset %q", field.Field, query.From)
		}
	}
	return nil
}

func queryFieldSupported(dataset string, fields map[string]struct{}, field string) bool {
	if function, ok := parseValueFunction(field); ok {
		if _, ok := queryValueFunctions[function.Name]; !ok {
			return false
		}
		return queryFieldSupported(dataset, fields, function.Arg)
	}
	if _, ok := fields[field]; ok {
		return true
	}
	return dataset == "pages" && validDynamicPageField(field)
}

func validDynamicPageField(field string) bool {
	if field == "" {
		return false
	}
	for idx, r := range field {
		if idx == 0 {
			if !(r == '_' || (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z')) {
				return false
			}
			continue
		}
		if !(r == '_' || r == '-' || (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')) {
			return false
		}
	}
	return true
}

func datasetFields(dataset string) (map[string]struct{}, bool) {
	switch dataset {
	case "tasks":
		return set(defaultColumns("tasks")...), true
	case "pages":
		return set(defaultColumns("pages")...), true
	case "links":
		return set(defaultColumns("links")...), true
	default:
		return nil, false
	}
}

func builtInPageFieldSet() map[string]struct{} {
	return set(defaultColumns("pages")...)
}

func numericDatasetFields(dataset string) map[string]struct{} {
	switch dataset {
	case "tasks":
		return set("line")
	case "pages":
		return set()
	case "links":
		return set("line")
	default:
		return nil
	}
}

func defaultColumns(dataset string) []string {
	switch dataset {
	case "tasks":
		return []string{"ref", "page", "line", "text", "state", "done", "due", "remind", "who"}
	case "pages":
		return []string{"path", "title", "tags", "outgoingLinkCount", "backlinkCount", "taskCount", "openTaskCount", "doneTaskCount", "queryBlockCount", "createdAt", "updatedAt"}
	case "links":
		return []string{"sourcePage", "targetPage", "linkText", "kind", "line"}
	default:
		return nil
	}
}

func effectiveSelectFields(query ParsedQuery) []SelectField {
	if len(query.SelectFields) > 0 {
		return expandSelectFields(query.SelectFields, query.From)
	}
	if len(query.Select) > 0 {
		fields := make([]SelectField, 0, len(query.Select))
		for _, field := range query.Select {
			fields = append(fields, SelectField{Field: field})
		}
		return expandSelectFields(fields, query.From)
	}
	fields := make([]SelectField, 0, len(defaultColumns(query.From)))
	for _, field := range defaultColumns(query.From) {
		fields = append(fields, SelectField{Field: field})
	}
	return fields
}

func expandSelectFields(fields []SelectField, dataset string) []SelectField {
	if len(fields) != 1 || fields[0].Field != "*" || fields[0].Aggregate != "" || fields[0].Alias != "" {
		return fields
	}
	expanded := make([]SelectField, 0, len(defaultColumns(dataset)))
	for _, field := range defaultColumns(dataset) {
		expanded = append(expanded, SelectField{Field: field})
	}
	return expanded
}

func hasAggregateSelect(fields []SelectField) bool {
	for _, field := range fields {
		if field.Aggregate != "" {
			return true
		}
	}
	return false
}

func validateAggregateSelects(fields []SelectField, dataset string, groupBy []string) error {
	aggregateCount := 0
	groupSet := set(groupBy...)
	for _, field := range fields {
		if field.Aggregate != "" {
			aggregateCount++
			if err := validateAggregateField(field, dataset); err != nil {
				return err
			}
			continue
		}
		if len(groupBy) == 0 {
			return fmt.Errorf("aggregate selects currently require only aggregate expressions")
		}
		if _, ok := groupSet[field.Field]; !ok {
			return fmt.Errorf("grouped selects must include only grouped fields and aggregate expressions")
		}
	}
	if len(groupBy) == 0 && aggregateCount == 0 {
		return fmt.Errorf("aggregate selects currently require at least one aggregate expression")
	}
	if len(groupBy) > 0 && aggregateCount == 0 {
		return fmt.Errorf("group by currently requires at least one aggregate select")
	}
	return nil
}

func validateAggregateField(field SelectField, dataset string) error {
	switch field.Aggregate {
	case "count", "min", "max":
		return nil
	case "sum", "avg":
		if _, ok := numericDatasetFields(dataset)[field.Field]; !ok {
			return fmt.Errorf("aggregate %q requires a numeric field", field.Aggregate)
		}
		return nil
	default:
		return fmt.Errorf("unsupported aggregate %q", field.Aggregate)
	}
}

func executeAggregateResult(parsed ParsedQuery, fields []SelectField, rows []map[string]any) Result {
	columns := projectedColumnNames(fields)
	item := make(map[string]any, len(fields))
	for idx, field := range fields {
		key := columns[idx]
		switch field.Aggregate {
		case "count":
			item[key] = aggregateCount(rows, field.Field, field.Distinct)
		case "min":
			item[key] = aggregateExtrema(rows, field.Field, false)
		case "max":
			item[key] = aggregateExtrema(rows, field.Field, true)
		case "sum":
			item[key] = aggregateSum(rows, field.Field)
		case "avg":
			item[key] = aggregateAvg(rows, field.Field)
		}
	}
	return Result{
		Query:   parsed,
		Columns: columns,
		Rows:    []map[string]any{item},
	}
}

func executeGroupedAggregateResult(parsed ParsedQuery, fields []SelectField, rows []map[string]any) Result {
	columns := projectedColumnNames(fields)
	groupRows := make(map[string][]map[string]any)

	for _, row := range rows {
		key := parseGroupKey(row, parsed.GroupBy)
		groupRows[key] = append(groupRows[key], row)
	}

	grouped := make([]map[string]any, 0, len(groupRows))
	for _, rows := range groupRows {
		first := rows[0]
		item := make(map[string]any, len(fields))
		for _, field := range fields {
			key := projectedColumnName(field)
			if field.Aggregate != "" {
				item[key] = aggregateValue(rows, field)
				continue
			}
			item[key] = first[field.Field]
		}
		grouped = append(grouped, item)
	}

	if len(havingGroups(parsed)) > 0 {
		filtered := make([]map[string]any, 0, len(grouped))
		for _, row := range grouped {
			if matchesAny(row, havingGroups(parsed)) {
				filtered = append(filtered, row)
			}
		}
		grouped = filtered
	}

	sortRows(grouped, parsed.OrderBy)
	if parsed.Offset > 0 {
		if parsed.Offset >= len(grouped) {
			grouped = grouped[:0]
		} else {
			grouped = grouped[parsed.Offset:]
		}
	}
	if parsed.Limit > 0 && len(grouped) > parsed.Limit {
		grouped = grouped[:parsed.Limit]
	}

	return Result{
		Query:   parsed,
		Columns: columns,
		Rows:    grouped,
	}
}

func aggregateValue(rows []map[string]any, field SelectField) any {
	switch field.Aggregate {
	case "count":
		return aggregateCount(rows, field.Field, field.Distinct)
	case "min":
		return aggregateExtrema(rows, field.Field, false)
	case "max":
		return aggregateExtrema(rows, field.Field, true)
	case "sum":
		return aggregateSum(rows, field.Field)
	case "avg":
		return aggregateAvg(rows, field.Field)
	default:
		return nil
	}
}

func aggregateColumnName(field SelectField) string {
	switch field.Aggregate {
	case "count":
		if field.Field == "" {
			return "count"
		}
		if field.Distinct {
			return fmt.Sprintf("count(distinct %s)", field.Field)
		}
		return fmt.Sprintf("count(%s)", field.Field)
	case "min", "max", "sum", "avg":
		return fmt.Sprintf("%s(%s)", field.Aggregate, field.Field)
	default:
		return field.Field
	}
}

func projectedColumnName(field SelectField) string {
	if field.Alias != "" {
		return field.Alias
	}
	if field.Aggregate != "" {
		return aggregateColumnName(field)
	}
	return field.Field
}

func groupAggregateKey(field SelectField) string {
	return "__aggregate__" + aggregateColumnName(field)
}

func aggregateExtrema(rows []map[string]any, field string, wantMax bool) any {
	if len(rows) == 0 {
		return nil
	}

	var (
		best    any
		hasBest bool
	)
	for _, row := range rows {
		value := rowValue(row, field)
		if value == nil {
			continue
		}
		if !hasBest {
			best = value
			hasBest = true
			continue
		}
		cmp := compareValues(value, best)
		if (wantMax && cmp > 0) || (!wantMax && cmp < 0) {
			best = value
		}
	}
	if !hasBest {
		return nil
	}
	return best
}

func aggregateSum(rows []map[string]any, field string) any {
	var total float64
	for _, row := range rows {
		switch value := rowValue(row, field).(type) {
		case int:
			total += float64(value)
		case int64:
			total += float64(value)
		case float64:
			total += value
		case float32:
			total += float64(value)
		}
	}
	if total == float64(int64(total)) {
		return int64(total)
	}
	return total
}

func aggregateAvg(rows []map[string]any, field string) any {
	var (
		total float64
		count int
	)
	for _, row := range rows {
		switch value := rowValue(row, field).(type) {
		case int:
			total += float64(value)
			count++
		case int64:
			total += float64(value)
			count++
		case float64:
			total += value
			count++
		case float32:
			total += float64(value)
			count++
		}
	}
	if count == 0 {
		return nil
	}
	avg := total / float64(count)
	if avg == float64(int64(avg)) {
		return int64(avg)
	}
	return avg
}

func aggregateCount(rows []map[string]any, field string, distinct bool) int {
	if field == "" {
		return len(rows)
	}
	if distinct {
		seen := make(map[string]struct{}, len(rows))
		for _, row := range rows {
			value := rowValue(row, field)
			if value == nil {
				continue
			}
			seen[distinctValueKey(value)] = struct{}{}
		}
		return len(seen)
	}
	count := 0
	for _, row := range rows {
		if rowValue(row, field) != nil {
			count++
		}
	}
	return count
}

func distinctValueKey(value any) string {
	return fmt.Sprintf("%T:%#v", value, value)
}

func distinctProjectedRows(rows []map[string]any, columns []string) []map[string]any {
	seen := make(map[string]struct{}, len(rows))
	distinct := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		parts := make([]string, 0, len(columns))
		for _, column := range columns {
			parts = append(parts, distinctValueKey(row[column]))
		}
		key := strings.Join(parts, "\x00")
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		distinct = append(distinct, row)
	}
	return distinct
}

func selectedSourceFields(query ParsedQuery, dataset string) []string {
	if len(query.SelectFields) > 0 {
		return selectSourceFields(expandSelectFields(query.SelectFields, dataset))
	}
	if len(query.Select) > 0 {
		return selectSourceFields(expandSelectFields(effectiveSelectFields(query), dataset))
	}
	return defaultColumns(dataset)
}

func set(values ...string) map[string]struct{} {
	items := make(map[string]struct{}, len(values))
	for _, value := range values {
		items[value] = struct{}{}
	}
	return items
}

func uniqueStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	unique := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		unique = append(unique, value)
	}
	return unique
}

func uniqueFilterFields(filters []Filter) []string {
	fields := make([]string, 0, len(filters))
	for _, filter := range filters {
		fields = append(fields, filter.Field)
	}
	return uniqueStrings(fields)
}

func uniqueOrderFields(fields []OrderField) []string {
	names := make([]string, 0, len(fields))
	for _, field := range fields {
		names = append(names, field.Field)
	}
	return uniqueStrings(names)
}

func normalizeSuggestionClause(clause string) string {
	value := strings.ToLower(strings.TrimSpace(clause))
	switch value {
	case "from", "where", "select", "group by", "having", "order by":
		return value
	default:
		return value
	}
}

func uniqueSuggestions(suggestions []QuerySuggestion) []QuerySuggestion {
	if len(suggestions) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(suggestions))
	unique := make([]QuerySuggestion, 0, len(suggestions))
	for _, suggestion := range suggestions {
		key := suggestion.Kind + "\x00" + suggestion.Value
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		unique = append(unique, suggestion)
	}
	return unique
}

func filterSuggestionsByPrefix(suggestions []QuerySuggestion, prefix string) []QuerySuggestion {
	if prefix == "" {
		return suggestions
	}
	filtered := make([]QuerySuggestion, 0, len(suggestions))
	for _, suggestion := range suggestions {
		if strings.HasPrefix(strings.ToLower(suggestion.Value), strings.ToLower(prefix)) {
			filtered = append(filtered, suggestion)
		}
	}
	return filtered
}

func formatParsedQuery(query ParsedQuery) string {
	lines := []string{"from " + query.From}
	if groups := whereGroups(query); len(groups) > 0 {
		lines = append(lines, "where "+formatFilterGroups(groups))
	}
	if len(query.GroupBy) > 0 {
		lines = append(lines, "group by "+strings.Join(query.GroupBy, ", "))
	}
	if groups := havingGroups(query); len(groups) > 0 {
		lines = append(lines, "having "+formatFilterGroups(groups))
	}
	if len(query.OrderBy) > 0 {
		lines = append(lines, "order by "+formatOrderFields(query.OrderBy))
	}
	if query.Limit > 0 {
		lines = append(lines, fmt.Sprintf("limit %d", query.Limit))
	}
	if query.Offset > 0 {
		lines = append(lines, fmt.Sprintf("offset %d", query.Offset))
	}

	selectLine := "select "
	if query.Distinct {
		selectLine += "distinct "
	}
	selectLine += formatSelectFields(effectiveSelectFields(query))
	lines = append(lines, selectLine)
	return strings.Join(lines, "\n")
}

func formatSelectFields(fields []SelectField) string {
	parts := make([]string, 0, len(fields))
	for _, field := range fields {
		if field.Field == "*" && field.Aggregate == "" {
			parts = append(parts, "*")
			continue
		}

		part := ""
		if field.Aggregate != "" {
			if field.Aggregate == "count" && field.Field == "" {
				part = "count(*)"
			} else if field.Distinct {
				part = fmt.Sprintf("%s(distinct %s)", field.Aggregate, field.Field)
			} else {
				part = fmt.Sprintf("%s(%s)", field.Aggregate, field.Field)
			}
		} else {
			part = field.Field
		}
		if field.Alias != "" {
			part += " as " + field.Alias
		}
		parts = append(parts, part)
	}
	return strings.Join(parts, ", ")
}

func formatOrderFields(fields []OrderField) string {
	parts := make([]string, 0, len(fields))
	for _, field := range fields {
		part := field.Field
		if field.Desc {
			part += " desc"
		}
		parts = append(parts, part)
	}
	return strings.Join(parts, ", ")
}

func formatFilterGroups(groups [][]Filter) string {
	if len(groups) == 0 {
		return ""
	}
	parts := make([]string, 0, len(groups))
	for _, group := range groups {
		if len(group) == 0 {
			continue
		}
		groupParts := make([]string, 0, len(group))
		for _, filter := range group {
			groupParts = append(groupParts, formatFilter(filter))
		}
		groupExpr := strings.Join(groupParts, " and ")
		if len(groups) > 1 && len(group) > 1 {
			groupExpr = "(" + groupExpr + ")"
		}
		parts = append(parts, groupExpr)
	}
	return strings.Join(parts, " or ")
}

func formatFilter(filter Filter) string {
	switch filter.Op {
	case "is null", "is not null":
		return filter.Field + " " + filter.Op
	default:
		return filter.Field + " " + filter.Op + " " + formatFilterValue(filter.Value)
	}
}

func formatFilterValue(value any) string {
	switch v := value.(type) {
	case string:
		if v == "true" || v == "false" || isNumericString(v) {
			return v
		}
		return strconv.Quote(v)
	case bool:
		if v {
			return "true"
		}
		return "false"
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	default:
		return fmt.Sprint(v)
	}
}

func isNumericString(value string) bool {
	if value == "" {
		return false
	}
	if _, err := strconv.ParseFloat(value, 64); err == nil {
		return true
	}
	return false
}

func queryFenceInfo(source string) (bool, string) {
	trimmed := strings.TrimSpace(source)
	if !strings.Contains(trimmed, "```") {
		return false, ""
	}
	lines := strings.Split(trimmed, "\n")
	for _, line := range lines {
		if meta, ok := parseQueryFence(line); ok {
			return true, meta.ID
		}
	}
	return false, ""
}

func duplicateStringWarnings(clause string, code string, message string, values []string) []QueryLintWarning {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	warnings := make([]QueryLintWarning, 0)
	for _, value := range values {
		key := strings.ToLower(value)
		if _, ok := seen[key]; ok {
			warnings = append(warnings, QueryLintWarning{
				Code:    code,
				Clause:  clause,
				Message: fmt.Sprintf("%s: %s", message, value),
			})
			continue
		}
		seen[key] = struct{}{}
	}
	return warnings
}

func duplicateFilterWarnings(clause string, code string, message string, filters []Filter) []QueryLintWarning {
	if len(filters) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(filters))
	warnings := make([]QueryLintWarning, 0)
	for _, filter := range filters {
		key := filter.Field + "\x00" + filter.Op + "\x00" + distinctValueKey(filter.Value)
		if _, ok := seen[key]; ok {
			warnings = append(warnings, QueryLintWarning{
				Code:    code,
				Clause:  clause,
				Message: fmt.Sprintf("%s: %s", message, formatFilter(filter)),
			})
			continue
		}
		seen[key] = struct{}{}
	}
	return warnings
}

func orderFieldNames(fields []OrderField) []string {
	names := make([]string, 0, len(fields))
	for _, field := range fields {
		names = append(names, field.Field)
	}
	return names
}

func loadDataset(ctx context.Context, indexService *index.Service, dataset string) ([]map[string]any, error) {
	switch dataset {
	case "tasks":
		tasks, err := indexService.ListTasks(ctx)
		if err != nil {
			return nil, err
		}
		rows := make([]map[string]any, 0, len(tasks))
		for _, task := range tasks {
			rows = append(rows, map[string]any{
				"ref":    task.Ref,
				"page":   task.Page,
				"line":   int64(task.Line),
				"text":   task.Text,
				"state":  task.State,
				"done":   task.Done,
				"due":    derefString(task.Due),
				"remind": derefString(task.Remind),
				"who":    append([]string(nil), task.Who...),
			})
		}
		return rows, nil
	case "pages":
		pages, err := indexService.ListPages(ctx)
		if err != nil {
			return nil, err
		}
		rows := make([]map[string]any, 0, len(pages))
		for _, page := range pages {
			pageCopy := page
			rows = append(rows, pageRow(&pageCopy))
		}
		return rows, nil
	case "links":
		links, err := indexService.ListLinks(ctx)
		if err != nil {
			return nil, err
		}
		rows := make([]map[string]any, 0, len(links))
		for _, link := range links {
			rows = append(rows, map[string]any{
				"sourcePage": link.SourcePage,
				"targetPage": link.TargetPage,
				"linkText":   link.LinkText,
				"kind":       link.Kind,
				"line":       int64(link.Line),
			})
		}
		return rows, nil
	default:
		return nil, fmt.Errorf("unsupported dataset %q", dataset)
	}
}

func derefString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func matchesAll(row map[string]any, filters []Filter) bool {
	for _, filter := range filters {
		if !matchesFilter(rowValue(row, filter.Field), filter) {
			return false
		}
	}
	return true
}

func matchesAny(row map[string]any, groups [][]Filter) bool {
	if len(groups) == 0 {
		return true
	}
	for _, group := range groups {
		if matchesAll(row, group) {
			return true
		}
	}
	return false
}

func matchesFilter(left any, filter Filter) bool {
	switch filter.Op {
	case "=":
		return matches(left, filter.Value)
	case "!=":
		return !matches(left, filter.Value)
	case "is null":
		return left == nil
	case "is not null":
		return left != nil
	case "contains":
		return contains(left, filter.Value)
	case "not contains":
		return !contains(left, filter.Value)
	case ">", ">=", "<", "<=":
		if left == nil || filter.Value == nil {
			return false
		}
		cmp := compareValues(left, filter.Value)
		switch filter.Op {
		case ">":
			return cmp > 0
		case ">=":
			return cmp >= 0
		case "<":
			return cmp < 0
		case "<=":
			return cmp <= 0
		}
		return false
	default:
		return false
	}
}

func rowValue(row map[string]any, field string) any {
	if fn, ok := parseValueFunction(field); ok {
		return evaluateValueFunction(fn, row)
	}
	return row[field]
}

func evaluateValueFunction(fn valueFunction, row map[string]any) any {
	value := rowValue(row, fn.Arg)
	switch strings.ToLower(fn.Name) {
	case "year":
		if t, ok := parseQueryTime(value); ok {
			return int64(t.Year())
		}
	case "month":
		if t, ok := parseQueryTime(value); ok {
			return int64(t.Month())
		}
	case "day":
		if t, ok := parseQueryTime(value); ok {
			return int64(t.Day())
		}
	case "daysuntilannual":
		if t, ok := parseQueryTime(value); ok {
			return int64(daysUntilAnnual(t, time.Now().In(time.Local)))
		}
	}
	return nil
}

func parseQueryTime(value any) (time.Time, bool) {
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "" || text == "<nil>" {
		return time.Time{}, false
	}
	layouts := []string{
		"2006-01-02",
		"2006-01-02 15:04",
		time.RFC3339,
		time.RFC3339Nano,
	}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, text); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

func daysUntilAnnual(target time.Time, today time.Time) int {
	location := today.Location()
	next := time.Date(today.Year(), target.Month(), target.Day(), 0, 0, 0, 0, location)
	current := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, location)
	if next.Before(current) {
		next = next.AddDate(1, 0, 0)
	}
	return int(next.Sub(current).Hours() / 24)
}

func matches(left any, right any) bool {
	switch value := left.(type) {
	case []string:
		rightText, ok := right.(string)
		if !ok {
			return false
		}
		for _, item := range value {
			if item == rightText {
				return true
			}
		}
		return false
	case []any:
		for _, item := range value {
			if matches(item, right) {
				return true
			}
		}
		return false
	case int:
		return compareValues(value, right) == 0
	case int64:
		return compareValues(value, right) == 0
	case float64:
		return compareValues(value, right) == 0
	case bool:
		rightBool, ok := right.(bool)
		return ok && value == rightBool
	case nil:
		return right == nil
	default:
		return fmt.Sprint(left) == fmt.Sprint(right)
	}
}

func contains(left any, right any) bool {
	needle := strings.ToLower(strings.TrimSpace(fmt.Sprint(right)))
	if needle == "" {
		return false
	}

	switch value := left.(type) {
	case []string:
		for _, item := range value {
			if strings.Contains(strings.ToLower(item), needle) {
				return true
			}
		}
		return false
	case []any:
		for _, item := range value {
			if contains(item, right) || matches(item, right) {
				return true
			}
		}
		return false
	case nil:
		return false
	default:
		return strings.Contains(strings.ToLower(fmt.Sprint(left)), needle)
	}
}

func sortRows(rows []map[string]any, orderFields []OrderField) {
	if len(orderFields) == 0 {
		return
	}

	sort.SliceStable(rows, func(i, j int) bool {
		left := rows[i]
		right := rows[j]

		for _, field := range orderFields {
			cmp := compareValues(rowValue(left, field.Field), rowValue(right, field.Field))
			if cmp == 0 {
				continue
			}
			if field.Desc {
				return cmp > 0
			}
			return cmp < 0
		}
		return false
	})
}

func compareValues(left any, right any) int {
	if left == nil && right == nil {
		return 0
	}
	if left == nil {
		return 1
	}
	if right == nil {
		return -1
	}

	switch l := left.(type) {
	case string:
		r := fmt.Sprint(right)
		switch {
		case l < r:
			return -1
		case l > r:
			return 1
		default:
			return 0
		}
	case bool:
		r, ok := right.(bool)
		if !ok {
			return compareValues(fmt.Sprint(left), fmt.Sprint(right))
		}
		switch {
		case l == r:
			return 0
		case !l && r:
			return -1
		default:
			return 1
		}
	case int:
		return compareFloats(float64(l), numericValue(right))
	case int64:
		return compareFloats(float64(l), numericValue(right))
	case float64:
		return compareFloats(l, numericValue(right))
	case []string:
		return compareValues(strings.Join(l, ","), stringifySlice(right))
	default:
		return compareValues(fmt.Sprint(left), fmt.Sprint(right))
	}
}

func numericValue(value any) float64 {
	switch n := value.(type) {
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case float64:
		return n
	case float32:
		return float64(n)
	default:
		parsed, _ := strconv.ParseFloat(fmt.Sprint(value), 64)
		return parsed
	}
}

func compareFloats(left, right float64) int {
	switch {
	case left < right:
		return -1
	case left > right:
		return 1
	default:
		return 0
	}
}

func stringifySlice(value any) string {
	switch items := value.(type) {
	case []string:
		return strings.Join(items, ",")
	default:
		return fmt.Sprint(value)
	}
}

func whereGroups(query ParsedQuery) [][]Filter {
	if len(query.WhereAny) > 0 {
		return query.WhereAny
	}
	if len(query.Where) > 0 {
		return [][]Filter{query.Where}
	}
	return nil
}

func havingGroups(query ParsedQuery) [][]Filter {
	if len(query.HavingAny) > 0 {
		return query.HavingAny
	}
	if len(query.Having) > 0 {
		return [][]Filter{query.Having}
	}
	return nil
}

func allFilters(query ParsedQuery) []Filter {
	if len(query.WhereAny) > 0 {
		return flattenWhereGroups(query.WhereAny)
	}
	return query.Where
}

func allHavingFilters(query ParsedQuery) []Filter {
	if len(query.HavingAny) > 0 {
		return flattenWhereGroups(query.HavingAny)
	}
	return query.Having
}

func flattenWhereGroups(groups [][]Filter) []Filter {
	total := 0
	for _, group := range groups {
		total += len(group)
	}
	flat := make([]Filter, 0, total)
	for _, group := range groups {
		flat = append(flat, group...)
	}
	return flat
}

func combineWhereGroups(existing [][]Filter, incoming [][]Filter) [][]Filter {
	switch {
	case len(incoming) == 0:
		return existing
	case len(existing) == 0:
		return cloneWhereGroups(incoming)
	}

	combined := make([][]Filter, 0, len(existing)*len(incoming))
	for _, left := range existing {
		for _, right := range incoming {
			group := append(append(make([]Filter, 0, len(left)+len(right)), left...), right...)
			combined = append(combined, group)
		}
	}
	return combined
}

func cloneWhereGroups(groups [][]Filter) [][]Filter {
	cloned := make([][]Filter, 0, len(groups))
	for _, group := range groups {
		cloned = append(cloned, append([]Filter(nil), group...))
	}
	return cloned
}

func queryMatchField(groups [][]Filter, field string) (string, bool) {
	if len(groups) == 0 {
		return "", false
	}

	match := ""
	for _, group := range groups {
		groupMatch := ""
		for _, filter := range group {
			if filter.Op != "=" || filter.Field != field {
				continue
			}
			value, ok := filter.Value.(string)
			if !ok {
				continue
			}
			groupMatch = strings.TrimSpace(value)
			break
		}
		if groupMatch == "" {
			return "", false
		}
		if match == "" {
			match = groupMatch
			continue
		}
		if match != groupMatch {
			return "", false
		}
	}
	return match, match != ""
}
