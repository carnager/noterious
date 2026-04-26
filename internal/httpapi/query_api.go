package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sort"
	"strings"

	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
)

type datasetsResponse struct {
	Datasets []query.DatasetDescriptor `json:"datasets"`
	Count    int                       `json:"count"`
}

type querySchemaCountsResponse struct {
	Datasets     int `json:"datasets"`
	Examples     int `json:"examples"`
	SavedQueries int `json:"savedQueries"`
}

type savedQuerySummaryResponse struct {
	Name        string   `json:"name"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Folder      string   `json:"folder"`
	Tags        []string `json:"tags"`
	UpdatedAt   string   `json:"updatedAt"`
}

type querySchemaResponse struct {
	Datasets     []query.DatasetDescriptor   `json:"datasets"`
	Capabilities query.QueryCapabilities     `json:"capabilities"`
	Examples     []query.QueryExample        `json:"examples"`
	SavedQueries []savedQuerySummaryResponse `json:"savedQueries"`
	Counts       querySchemaCountsResponse   `json:"counts"`
}

type queryExamplesResponse struct {
	Dataset  string               `json:"dataset"`
	Examples []query.QueryExample `json:"examples"`
	Count    int                  `json:"count"`
}

type queryEditorSchemaResponse struct {
	Datasets     []query.DatasetDescriptor   `json:"datasets"`
	Capabilities query.QueryCapabilities     `json:"capabilities"`
	Examples     []query.QueryExample        `json:"examples"`
	SavedQueries []savedQuerySummaryResponse `json:"savedQueries"`
}

type queryEditorResponse struct {
	Schema             queryEditorSchemaResponse         `json:"schema"`
	RootSuggestions    query.QuerySuggestionResult       `json:"rootSuggestions"`
	ClauseSuggestions  []query.QueryClauseSuggestionSet  `json:"clauseSuggestions"`
	DatasetSuggestions []query.QueryDatasetSuggestionSet `json:"datasetSuggestions"`
}

type savedQueryActionResponse struct {
	Name        string                       `json:"name"`
	Title       string                       `json:"title"`
	Description string                       `json:"description"`
	Folder      string                       `json:"folder"`
	Tags        []string                     `json:"tags"`
	Query       string                       `json:"query"`
	Suggest     *query.QuerySuggestionResult `json:"suggest,omitempty"`
	Format      *query.QueryFormatResult     `json:"format,omitempty"`
	Result      *query.Result                `json:"result,omitempty"`
	Analyze     *query.QueryAnalysis         `json:"analyze,omitempty"`
	Plan        *query.QueryPlan             `json:"plan,omitempty"`
	Lint        *query.QueryLintResult       `json:"lint,omitempty"`
	Preview     *query.QueryPreviewResult    `json:"preview,omitempty"`
	Count       *query.QueryCountResult      `json:"count,omitempty"`
	Workbench   *query.QueryWorkbenchResult  `json:"workbench,omitempty"`
}

type savedQueryFacetsItemResponse struct {
	Folder string `json:"folder,omitempty"`
	Tag    string `json:"tag,omitempty"`
	Count  int    `json:"count"`
}

type savedQueryFacetsResponse struct {
	Query   string                         `json:"query"`
	Folder  string                         `json:"folder"`
	Tag     string                         `json:"tag"`
	Folders []savedQueryFacetsItemResponse `json:"folders"`
	Tags    []savedQueryFacetsItemResponse `json:"tags"`
	Count   int                            `json:"count"`
}

type savedQueryTreeFolderResponse struct {
	Folder  string                      `json:"folder"`
	Count   int                         `json:"count"`
	Queries []savedQuerySummaryResponse `json:"queries"`
}

type savedQueryTreeResponse struct {
	Query   string                         `json:"query"`
	Folder  string                         `json:"folder"`
	Tag     string                         `json:"tag"`
	Folders []savedQueryTreeFolderResponse `json:"folders"`
	Count   int                            `json:"count"`
}

type savedQueriesResponse struct {
	Query   string             `json:"query"`
	Folder  string             `json:"folder"`
	Tag     string             `json:"tag"`
	Queries []index.SavedQuery `json:"queries"`
	Count   int                `json:"count"`
}

type updatedSavedQueriesResponse struct {
	Queries []index.SavedQuery `json:"queries"`
	Count   int                `json:"count"`
}

func mountQueryEndpoints(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("GET /api/queries/", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueryRequest(w, r, deps)
	})
	mux.HandleFunc("POST /api/queries/", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueryRequest(w, r, deps)
	})
	mux.HandleFunc("PUT /api/queries/", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueryRequest(w, r, deps)
	})
	mux.HandleFunc("DELETE /api/queries/", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueryRequest(w, r, deps)
	})

	mux.HandleFunc("GET /api/queries/facets", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueryFacetsRequest(w, r, deps)
	})

	mux.HandleFunc("GET /api/queries/tree", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueryTreeRequest(w, r, deps)
	})

	mux.HandleFunc("GET /api/queries", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueriesRequest(w, r, deps)
	})
	mux.HandleFunc("POST /api/queries", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueriesRequest(w, r, deps)
	})
	mux.HandleFunc("PATCH /api/queries", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueriesRequest(w, r, deps)
	})

	mux.HandleFunc("GET /api/query/datasets", func(w http.ResponseWriter, r *http.Request) {
		datasets := query.DescribeDatasets()
		writeJSON(w, http.StatusOK, datasetsResponse{Datasets: datasets, Count: len(datasets)})
	})

	mux.HandleFunc("GET /api/query/capabilities", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, query.DescribeCapabilities())
	})

	mux.HandleFunc("GET /api/query/schema", func(w http.ResponseWriter, r *http.Request) {
		schema := query.DescribeSchema()
		savedQueries, err := deps.Index.ListSavedQueries(r.Context())
		if err != nil {
			http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
			return
		}
		savedQuerySummaries := buildSavedQuerySummaries(savedQueries)
		writeJSON(w, http.StatusOK, querySchemaResponse{
			Datasets:     schema.Datasets,
			Capabilities: schema.Capabilities,
			Examples:     schema.Examples,
			SavedQueries: savedQuerySummaries,
			Counts: querySchemaCountsResponse{
				Datasets:     len(schema.Datasets),
				Examples:     len(schema.Examples),
				SavedQueries: len(savedQuerySummaries),
			},
		})
	})

	mux.HandleFunc("GET /api/query/examples", func(w http.ResponseWriter, r *http.Request) {
		dataset := strings.TrimSpace(r.URL.Query().Get("dataset"))
		examples := query.DescribeExamples()
		if dataset != "" {
			filtered := make([]query.QueryExample, 0, len(examples))
			for _, example := range examples {
				if strings.EqualFold(example.Dataset, dataset) {
					filtered = append(filtered, example)
				}
			}
			examples = filtered
		}

		writeJSON(w, http.StatusOK, queryExamplesResponse{
			Dataset:  dataset,
			Examples: examples,
			Count:    len(examples),
		})
	})

	mux.HandleFunc("GET /api/query/editor", func(w http.ResponseWriter, r *http.Request) {
		savedQueries, err := deps.Index.ListSavedQueries(r.Context())
		if err != nil {
			http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
			return
		}
		editor := query.DescribeEditor()
		writeJSON(w, http.StatusOK, queryEditorResponse{
			Schema: queryEditorSchemaResponse{
				Datasets:     editor.Schema.Datasets,
				Capabilities: editor.Schema.Capabilities,
				Examples:     editor.Schema.Examples,
				SavedQueries: buildSavedQuerySummaries(savedQueries),
			},
			RootSuggestions:    editor.RootSuggestions,
			ClauseSuggestions:  editor.ClauseSuggestions,
			DatasetSuggestions: editor.DatasetSuggestions,
		})
	})

	mux.HandleFunc("POST /api/query/analyze", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Analyze(request.Query))
	})

	mux.HandleFunc("POST /api/query/plan", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Plan(request.Query))
	})

	mux.HandleFunc("POST /api/query/lint", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Lint(request.Query))
	})

	mux.HandleFunc("POST /api/query/preview", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Query string `json:"query"`
			Limit int    `json:"limit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Preview(r.Context(), deps.Index, request.Query, request.Limit))
	})

	mux.HandleFunc("POST /api/query/count", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Count(r.Context(), deps.Index, request.Query))
	})

	mux.HandleFunc("POST /api/query/workbench", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Query        string `json:"query"`
			PreviewLimit int    `json:"previewLimit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Workbench(r.Context(), deps.Index, request.Query, request.PreviewLimit))
	})

	mux.HandleFunc("POST /api/query/suggest", func(w http.ResponseWriter, r *http.Request) {
		var request query.QuerySuggestionRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Suggest(request))
	})

	mux.HandleFunc("POST /api/query/format", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Format(request.Query))
	})

	mux.HandleFunc("POST /api/query/execute", func(w http.ResponseWriter, r *http.Request) {
		if deps.Query == nil {
			http.Error(w, "query service unavailable", http.StatusInternalServerError)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		result, err := deps.Query.Execute(r.Context(), deps.Index, request.Query)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, result)
	})
}

func handleSavedQueryRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	name, action, ok := parseSavedQueryPath(strings.TrimPrefix(r.URL.Path, "/api/queries/"))
	if !ok {
		http.Error(w, "invalid query name", http.StatusBadRequest)
		return
	}

	if action != "" {
		handleSavedQueryActionRequest(w, r, deps, name, action)
		return
	}

	switch r.Method {
	case http.MethodGet:
		handleSavedQueryGetRequest(w, r, deps, name)
	case http.MethodPut:
		handleSavedQueryPutRequest(w, r, deps, name)
	case http.MethodDelete:
		handleSavedQueryDeleteRequest(w, r, deps, name)
	default:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPut, http.MethodDelete)
	}
}

func handleSavedQueryGetRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, name string) {
	savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
	if err != nil {
		writeSavedQueryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, savedQuery)
}

func handleSavedQueryPutRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, name string) {
	var request struct {
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Folder      string   `json:"folder"`
		Tags        []string `json:"tags"`
		Query       string   `json:"query"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	savedQuery, err := deps.Index.PutSavedQuery(r.Context(), index.SavedQuery{
		Name:        name,
		Title:       strings.TrimSpace(request.Title),
		Description: strings.TrimSpace(request.Description),
		Folder:      strings.TrimSpace(request.Folder),
		Tags:        append([]string(nil), request.Tags...),
		Query:       request.Query,
	})
	if err != nil {
		http.Error(w, "failed to save query", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, savedQuery)
}

func handleSavedQueryDeleteRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, name string) {
	if err := deps.Index.DeleteSavedQuery(r.Context(), name); err != nil {
		writeSavedQueryError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleSavedQueryActionRequest(w http.ResponseWriter, r *http.Request, deps Dependencies, name string, action string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w, http.MethodPost)
		return
	}

	savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
	if err != nil {
		writeSavedQueryError(w, err)
		return
	}

	switch action {
	case "suggest":
		handleSavedQuerySuggestAction(w, r, savedQuery)
	case "format":
		handleSavedQueryFormatAction(w, savedQuery)
	case "execute":
		handleSavedQueryExecuteAction(w, r, deps, savedQuery)
	case "analyze":
		handleSavedQueryAnalyzeAction(w, savedQuery)
	case "plan":
		handleSavedQueryPlanAction(w, savedQuery)
	case "lint":
		handleSavedQueryLintAction(w, savedQuery)
	case "preview":
		handleSavedQueryPreviewAction(w, r, deps, savedQuery)
	case "count":
		handleSavedQueryCountAction(w, r, deps, savedQuery)
	case "workbench":
		handleSavedQueryWorkbenchAction(w, r, deps, savedQuery)
	default:
		http.NotFound(w, r)
	}
}

func handleSavedQuerySuggestAction(w http.ResponseWriter, r *http.Request, savedQuery index.SavedQuery) {
	var request query.QuerySuggestionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	request.Query = savedQuery.Query
	result := query.Suggest(request)
	writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, func(payload *savedQueryActionResponse) {
		payload.Suggest = &result
	}))
}

func handleSavedQueryFormatAction(w http.ResponseWriter, savedQuery index.SavedQuery) {
	result := query.Format(savedQuery.Query)
	writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, func(payload *savedQueryActionResponse) {
		payload.Format = &result
	}))
}

func handleSavedQueryExecuteAction(w http.ResponseWriter, r *http.Request, deps Dependencies, savedQuery index.SavedQuery) {
	if deps.Query == nil {
		http.Error(w, "query service unavailable", http.StatusInternalServerError)
		return
	}
	result, err := deps.Query.Execute(r.Context(), deps.Index, savedQuery.Query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, func(payload *savedQueryActionResponse) {
		payload.Result = &result
	}))
}

func handleSavedQueryAnalyzeAction(w http.ResponseWriter, savedQuery index.SavedQuery) {
	result := query.Analyze(savedQuery.Query)
	writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, func(payload *savedQueryActionResponse) {
		payload.Analyze = &result
	}))
}

func handleSavedQueryPlanAction(w http.ResponseWriter, savedQuery index.SavedQuery) {
	result := query.Plan(savedQuery.Query)
	writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, func(payload *savedQueryActionResponse) {
		payload.Plan = &result
	}))
}

func handleSavedQueryLintAction(w http.ResponseWriter, savedQuery index.SavedQuery) {
	result := query.Lint(savedQuery.Query)
	writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, func(payload *savedQueryActionResponse) {
		payload.Lint = &result
	}))
}

func handleSavedQueryPreviewAction(w http.ResponseWriter, r *http.Request, deps Dependencies, savedQuery index.SavedQuery) {
	var request struct {
		Limit int `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	result := query.Preview(r.Context(), deps.Index, savedQuery.Query, request.Limit)
	writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, func(payload *savedQueryActionResponse) {
		payload.Preview = &result
	}))
}

func handleSavedQueryCountAction(w http.ResponseWriter, r *http.Request, deps Dependencies, savedQuery index.SavedQuery) {
	result := query.Count(r.Context(), deps.Index, savedQuery.Query)
	writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, func(payload *savedQueryActionResponse) {
		payload.Count = &result
	}))
}

func handleSavedQueryWorkbenchAction(w http.ResponseWriter, r *http.Request, deps Dependencies, savedQuery index.SavedQuery) {
	var request struct {
		PreviewLimit int `json:"previewLimit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	result := query.Workbench(r.Context(), deps.Index, savedQuery.Query, request.PreviewLimit)
	writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, func(payload *savedQueryActionResponse) {
		payload.Workbench = &result
	}))
}

func handleSavedQueryFacetsRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	savedQueries, queryText, folder, tag, err := filteredSavedQueriesFromRequest(r, deps.Index)
	if err != nil {
		http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
		return
	}

	folders, tags := summarizeSavedQueryFacets(savedQueries)
	writeJSON(w, http.StatusOK, savedQueryFacetsResponse{
		Query:   queryText,
		Folder:  folder,
		Tag:     tag,
		Folders: folders,
		Tags:    tags,
		Count:   len(savedQueries),
	})
}

func handleSavedQueryTreeRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	savedQueries, queryText, folder, tag, err := filteredSavedQueriesFromRequest(r, deps.Index)
	if err != nil {
		http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, savedQueryTreeResponse{
		Query:   queryText,
		Folder:  folder,
		Tag:     tag,
		Folders: buildSavedQueryTree(savedQueries),
		Count:   len(savedQueries),
	})
}

func handleSavedQueriesRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	switch r.Method {
	case http.MethodGet:
		handleSavedQueriesGetRequest(w, r, deps)
	case http.MethodPost:
		handleSavedQueriesPostRequest(w, r, deps)
	case http.MethodPatch:
		handleSavedQueriesPatchRequest(w, r, deps)
	}
}

func handleSavedQueriesGetRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	savedQueries, queryText, folder, tag, err := filteredSavedQueriesFromRequest(r, deps.Index)
	if err != nil {
		http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, savedQueriesResponse{
		Query:   queryText,
		Folder:  folder,
		Tag:     tag,
		Queries: savedQueries,
		Count:   len(savedQueries),
	})
}

func handleSavedQueriesPostRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	var request struct {
		Name        string   `json:"name"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Folder      string   `json:"folder"`
		Tags        []string `json:"tags"`
		Query       string   `json:"query"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(request.Name)
	if name == "" {
		http.Error(w, "query name is required", http.StatusBadRequest)
		return
	}
	savedQuery, err := deps.Index.PutSavedQuery(r.Context(), index.SavedQuery{
		Name:        name,
		Title:       strings.TrimSpace(request.Title),
		Description: strings.TrimSpace(request.Description),
		Folder:      strings.TrimSpace(request.Folder),
		Tags:        append([]string(nil), request.Tags...),
		Query:       request.Query,
	})
	if err != nil {
		http.Error(w, "failed to save query", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, savedQuery)
}

func handleSavedQueriesPatchRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	var request struct {
		Names  []string  `json:"names"`
		Folder *string   `json:"folder"`
		Tags   *[]string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	names := normalizedSavedQueryNames(request.Names)
	if len(names) == 0 {
		http.Error(w, "query names are required", http.StatusBadRequest)
		return
	}
	if request.Folder == nil && request.Tags == nil {
		http.Error(w, "at least one bulk saved query change is required", http.StatusBadRequest)
		return
	}

	updatedQueries := make([]index.SavedQuery, 0, len(names))
	for _, name := range names {
		savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
		if err != nil {
			writeSavedQueryError(w, err)
			return
		}
		if request.Folder != nil {
			savedQuery.Folder = strings.TrimSpace(*request.Folder)
		}
		if request.Tags != nil {
			savedQuery.Tags = append([]string(nil), (*request.Tags)...)
		}

		savedQuery, err = deps.Index.PutSavedQuery(r.Context(), savedQuery)
		if err != nil {
			http.Error(w, "failed to save query", http.StatusInternalServerError)
			return
		}
		updatedQueries = append(updatedQueries, savedQuery)
	}

	writeJSON(w, http.StatusOK, updatedSavedQueriesResponse{
		Queries: updatedQueries,
		Count:   len(updatedQueries),
	})
}

func parseSavedQueryPath(rawPath string) (string, string, bool) {
	trimmed := strings.Trim(strings.TrimSpace(rawPath), "/")
	if trimmed == "" {
		return "", "", false
	}

	actions := []string{"suggest", "format", "lint", "plan", "analyze", "count", "preview", "workbench", "execute"}
	for _, action := range actions {
		suffix := "/" + action
		if strings.HasSuffix(trimmed, suffix) {
			name := strings.Trim(strings.TrimSuffix(trimmed, suffix), "/")
			if name == "" {
				return "", "", false
			}
			return name, action, true
		}
	}
	return trimmed, "", true
}

func savedQueryActionPayload(savedQuery index.SavedQuery, populate func(*savedQueryActionResponse)) savedQueryActionResponse {
	payload := savedQueryActionResponse{
		Name:        savedQuery.Name,
		Title:       savedQuery.Title,
		Description: savedQuery.Description,
		Folder:      savedQuery.Folder,
		Tags:        append([]string(nil), savedQuery.Tags...),
		Query:       savedQuery.Query,
	}
	populate(&payload)
	return payload
}

func filteredSavedQueriesFromRequest(r *http.Request, indexService *index.Service) ([]index.SavedQuery, string, string, string, error) {
	savedQueries, err := indexService.ListSavedQueries(r.Context())
	if err != nil {
		return nil, "", "", "", err
	}

	queryText := strings.TrimSpace(r.URL.Query().Get("q"))
	if queryText != "" {
		savedQueries = filterSavedQueries(savedQueries, queryText)
	}
	folder := strings.TrimSpace(r.URL.Query().Get("folder"))
	if folder != "" {
		savedQueries = filterSavedQueriesByFolder(savedQueries, folder)
	}
	tag := strings.TrimSpace(r.URL.Query().Get("tag"))
	if tag != "" {
		savedQueries = filterSavedQueriesByTag(savedQueries, tag)
	}

	return savedQueries, queryText, folder, tag, nil
}

func normalizedSavedQueryNames(names []string) []string {
	normalized := make([]string, 0, len(names))
	seen := make(map[string]struct{}, len(names))
	for _, name := range names {
		trimmed := strings.TrimSpace(name)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	return normalized
}

func writeSavedQueryError(w http.ResponseWriter, err error) {
	if errors.Is(err, index.ErrSavedQueryNotFound) {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	http.Error(w, "failed to load saved query", http.StatusInternalServerError)
}

func filterSavedQueries(savedQueries []index.SavedQuery, queryText string) []index.SavedQuery {
	needle := strings.ToLower(strings.TrimSpace(queryText))
	if needle == "" {
		return savedQueries
	}

	filtered := make([]index.SavedQuery, 0, len(savedQueries))
	for _, savedQuery := range savedQueries {
		if strings.Contains(strings.ToLower(savedQuery.Name), needle) ||
			strings.Contains(strings.ToLower(savedQuery.Title), needle) ||
			strings.Contains(strings.ToLower(savedQuery.Description), needle) ||
			strings.Contains(strings.ToLower(savedQuery.Folder), needle) ||
			containsSavedQueryTag(savedQuery.Tags, needle) {
			filtered = append(filtered, savedQuery)
		}
	}
	return filtered
}

func filterSavedQueriesByFolder(savedQueries []index.SavedQuery, folder string) []index.SavedQuery {
	needle := strings.TrimSpace(folder)
	if needle == "" {
		return savedQueries
	}

	filtered := make([]index.SavedQuery, 0, len(savedQueries))
	for _, savedQuery := range savedQueries {
		if strings.EqualFold(savedQuery.Folder, needle) {
			filtered = append(filtered, savedQuery)
		}
	}
	return filtered
}

func filterSavedQueriesByTag(savedQueries []index.SavedQuery, tag string) []index.SavedQuery {
	needle := strings.TrimSpace(tag)
	if needle == "" {
		return savedQueries
	}

	filtered := make([]index.SavedQuery, 0, len(savedQueries))
	for _, savedQuery := range savedQueries {
		for _, item := range savedQuery.Tags {
			if strings.EqualFold(strings.TrimSpace(item), needle) {
				filtered = append(filtered, savedQuery)
				break
			}
		}
	}
	return filtered
}

func containsSavedQueryTag(tags []string, needle string) bool {
	for _, tag := range tags {
		if strings.Contains(strings.ToLower(tag), needle) {
			return true
		}
	}
	return false
}

func buildSavedQuerySummaries(savedQueries []index.SavedQuery) []savedQuerySummaryResponse {
	summaries := make([]savedQuerySummaryResponse, 0, len(savedQueries))
	for _, savedQuery := range savedQueries {
		summaries = append(summaries, savedQuerySummaryResponse{
			Name:        savedQuery.Name,
			Title:       savedQuery.Title,
			Description: savedQuery.Description,
			Folder:      savedQuery.Folder,
			Tags:        append([]string(nil), savedQuery.Tags...),
			UpdatedAt:   savedQuery.UpdatedAt,
		})
	}
	return summaries
}

func summarizeSavedQueryFacets(savedQueries []index.SavedQuery) ([]savedQueryFacetsItemResponse, []savedQueryFacetsItemResponse) {
	folderCounts := make(map[string]int)
	tagCounts := make(map[string]int)

	for _, savedQuery := range savedQueries {
		if folder := strings.TrimSpace(savedQuery.Folder); folder != "" {
			folderCounts[folder]++
		}
		for _, tag := range savedQuery.Tags {
			trimmed := strings.TrimSpace(tag)
			if trimmed == "" {
				continue
			}
			tagCounts[trimmed]++
		}
	}

	folders := make([]savedQueryFacetsItemResponse, 0, len(folderCounts))
	for folder, count := range folderCounts {
		folders = append(folders, savedQueryFacetsItemResponse{
			Folder: folder,
			Count:  count,
		})
	}
	sort.Slice(folders, func(i, j int) bool {
		if folders[i].Count != folders[j].Count {
			return folders[i].Count > folders[j].Count
		}
		return folders[i].Folder < folders[j].Folder
	})

	tags := make([]savedQueryFacetsItemResponse, 0, len(tagCounts))
	for tag, count := range tagCounts {
		tags = append(tags, savedQueryFacetsItemResponse{
			Tag:   tag,
			Count: count,
		})
	}
	sort.Slice(tags, func(i, j int) bool {
		if tags[i].Count != tags[j].Count {
			return tags[i].Count > tags[j].Count
		}
		return tags[i].Tag < tags[j].Tag
	})

	return folders, tags
}

func buildSavedQueryTree(savedQueries []index.SavedQuery) []savedQueryTreeFolderResponse {
	groups := make(map[string][]index.SavedQuery)
	for _, savedQuery := range savedQueries {
		folder := strings.TrimSpace(savedQuery.Folder)
		groups[folder] = append(groups[folder], savedQuery)
	}

	folderNames := make([]string, 0, len(groups))
	for folder := range groups {
		folderNames = append(folderNames, folder)
	}
	sort.Strings(folderNames)

	tree := make([]savedQueryTreeFolderResponse, 0, len(folderNames))
	for _, folder := range folderNames {
		queries := groups[folder]
		sort.Slice(queries, func(i, j int) bool {
			return queries[i].Name < queries[j].Name
		})
		tree = append(tree, savedQueryTreeFolderResponse{
			Folder:  folder,
			Count:   len(queries),
			Queries: buildSavedQuerySummaries(queries),
		})
	}
	return tree
}
