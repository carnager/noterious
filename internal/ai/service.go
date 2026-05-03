package ai

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
)

var (
	ErrAIUnavailable    = errors.New("ai query copilot is unavailable")
	ErrAIDisabled       = errors.New("ai query copilot is disabled")
	ErrAIUnconfigured   = errors.New("ai query copilot is not configured")
	ErrAIEmptyIntent    = errors.New("intent is required")
	ErrAINoIndex        = errors.New("query index unavailable")
	defaultPreviewLimit = 10
)

type QueryCopilotRequest struct {
	Intent       string `json:"intent"`
	CurrentQuery string `json:"currentQuery,omitempty"`
	PreviewLimit int    `json:"previewLimit,omitempty"`
}

type QueryCopilotResponse struct {
	Query          string                     `json:"query"`
	FormattedQuery string                     `json:"formattedQuery,omitempty"`
	Explanation    string                     `json:"explanation,omitempty"`
	Assumptions    []string                   `json:"assumptions,omitempty"`
	Attempts       int                        `json:"attempts"`
	Repaired       bool                       `json:"repaired"`
	Valid          bool                       `json:"valid"`
	Analyze        query.QueryAnalysis        `json:"analyze"`
	Lint           query.QueryLintResult      `json:"lint"`
	Workbench      query.QueryWorkbenchResult `json:"workbench"`
	Error          string                     `json:"error,omitempty"`
}

type Service struct {
	store  *Store
	client *openAICompatibleClient
}

func NewService(dataDir string) (*Service, error) {
	store, err := NewStore(dataDir, DefaultSettings())
	if err != nil {
		return nil, err
	}
	return &Service{
		store:  store,
		client: newOpenAICompatibleClient(),
	}, nil
}

func (s *Service) Snapshot() SettingsResponse {
	if s == nil || s.store == nil {
		return SettingsResponse{
			Settings:         DefaultSettings(),
			APIKeyConfigured: false,
		}
	}
	return s.store.Snapshot()
}

func (s *Service) Update(request UpdateSettingsRequest) (SettingsResponse, error) {
	if s == nil || s.store == nil {
		return SettingsResponse{}, ErrAIUnavailable
	}
	return s.store.Update(request)
}

func (s *Service) GenerateQuery(ctx context.Context, indexService *index.Service, request QueryCopilotRequest) (QueryCopilotResponse, error) {
	if s == nil || s.store == nil {
		return QueryCopilotResponse{}, ErrAIUnavailable
	}
	if indexService == nil {
		return QueryCopilotResponse{}, ErrAINoIndex
	}
	if strings.TrimSpace(request.Intent) == "" {
		return QueryCopilotResponse{}, ErrAIEmptyIntent
	}

	settings, apiKey, err := s.store.Resolve()
	if err != nil {
		return QueryCopilotResponse{}, err
	}
	if !settings.Enabled {
		return QueryCopilotResponse{}, ErrAIDisabled
	}
	if strings.TrimSpace(apiKey) == "" {
		return QueryCopilotResponse{}, ErrAIUnconfigured
	}

	previewLimit := request.PreviewLimit
	if previewLimit <= 0 {
		previewLimit = defaultPreviewLimit
	}

	messages, err := buildInitialMessages(request)
	if err != nil {
		return QueryCopilotResponse{}, err
	}

	response, validatorErrors, draft, err := s.generateAttempt(ctx, indexService, settings, apiKey, messages, previewLimit)
	if err != nil {
		return QueryCopilotResponse{}, err
	}
	response.Attempts = 1
	response.Repaired = false
	if response.Valid {
		return response, nil
	}

	repairMessages, err := buildRepairMessages(request, draft, validatorErrors)
	if err != nil {
		return response, nil
	}
	repaired, _, _, repairErr := s.generateAttempt(ctx, indexService, settings, apiKey, repairMessages, previewLimit)
	if repairErr != nil {
		return response, nil
	}
	repaired.Attempts = 2
	repaired.Repaired = true
	return repaired, nil
}

func (s *Service) generateAttempt(
	ctx context.Context,
	indexService *index.Service,
	settings Settings,
	apiKey string,
	messages []chatMessage,
	previewLimit int,
) (QueryCopilotResponse, string, modelQueryDraft, error) {
	raw, err := s.client.complete(ctx, settings.BaseURL, settings.Model, apiKey, messages)
	if err != nil {
		return QueryCopilotResponse{}, "", modelQueryDraft{}, err
	}

	draft, err := decodeModelQueryDraft(raw)
	if err != nil {
		response := QueryCopilotResponse{
			Valid: false,
			Error: err.Error(),
		}
		return response, err.Error(), modelQueryDraft{}, nil
	}

	response, validatorErrors := validateGeneratedQuery(ctx, indexService, draft, previewLimit)
	return response, validatorErrors, draft, nil
}

func validateGeneratedQuery(
	ctx context.Context,
	indexService *index.Service,
	draft modelQueryDraft,
	previewLimit int,
) (QueryCopilotResponse, string) {
	formatted := query.Format(draft.Query)
	analyze := query.Analyze(draft.Query)
	lint := query.Lint(draft.Query)
	workbench := query.Workbench(ctx, indexService, draft.Query, previewLimit)
	validatorErrors := validatorErrorSummary(formatted, analyze, lint, workbench)
	response := QueryCopilotResponse{
		Query:       draft.Query,
		Explanation: draft.Explanation,
		Assumptions: append([]string(nil), draft.Assumptions...),
		Analyze:     analyze,
		Lint:        lint,
		Workbench:   workbench,
		Valid:       validatorErrors == "",
	}
	if formatted.Valid {
		response.FormattedQuery = formatted.Formatted
	} else {
		response.FormattedQuery = draft.Query
	}
	if validatorErrors != "" {
		response.Error = firstNonEmpty(
			formatted.Error,
			analyze.Error,
			lint.Error,
			workbenchPreviewError(workbench),
			workbenchCountError(workbench),
		)
	}
	return response, validatorErrors
}

func validatorErrorSummary(
	formatted query.QueryFormatResult,
	analyze query.QueryAnalysis,
	lint query.QueryLintResult,
	workbench query.QueryWorkbenchResult,
) string {
	parts := make([]string, 0, 5)
	if !formatted.Valid && formatted.Error != "" {
		parts = append(parts, "format: "+formatted.Error)
	}
	if !analyze.Valid && analyze.Error != "" {
		parts = append(parts, "analyze: "+analyze.Error)
	}
	if !lint.Valid && lint.Error != "" {
		parts = append(parts, "lint: "+lint.Error)
	}
	if errorText := workbenchPreviewError(workbench); errorText != "" {
		parts = append(parts, "preview: "+errorText)
	}
	if errorText := workbenchCountError(workbench); errorText != "" {
		parts = append(parts, "count: "+errorText)
	}
	return strings.Join(parts, "\n")
}

func workbenchPreviewError(workbench query.QueryWorkbenchResult) string {
	if workbench.Preview != nil && !workbench.Preview.Valid && workbench.Preview.Error != "" {
		return workbench.Preview.Error
	}
	return ""
}

func workbenchCountError(workbench query.QueryWorkbenchResult) string {
	if workbench.Count != nil && !workbench.Count.Valid && workbench.Count.Error != "" {
		return workbench.Count.Error
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func (s *Service) ValidateConnection() error {
	if s == nil || s.store == nil {
		return ErrAIUnavailable
	}
	settings, apiKey, err := s.store.Resolve()
	if err != nil {
		return err
	}
	if !settings.Enabled {
		return ErrAIDisabled
	}
	if strings.TrimSpace(apiKey) == "" {
		return ErrAIUnconfigured
	}
	return nil
}

func (r QueryCopilotResponse) Summary() string {
	if r.Valid {
		return "valid"
	}
	if r.Error != "" {
		return r.Error
	}
	return "invalid"
}

func (r QueryCopilotRequest) Validate() error {
	if strings.TrimSpace(r.Intent) == "" {
		return ErrAIEmptyIntent
	}
	return nil
}

func (r QueryCopilotResponse) String() string {
	return fmt.Sprintf("valid=%t attempts=%d repaired=%t summary=%s", r.Valid, r.Attempts, r.Repaired, r.Summary())
}
