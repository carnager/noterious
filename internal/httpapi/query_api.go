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

func mountQueryEndpoints(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("/api/queries/", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueryRequest(w, r, deps)
	})

	mux.HandleFunc("/api/queries/facets", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueryFacetsRequest(w, r, deps)
	})

	mux.HandleFunc("/api/queries/tree", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueryTreeRequest(w, r, deps)
	})

	mux.HandleFunc("/api/queries", func(w http.ResponseWriter, r *http.Request) {
		handleSavedQueriesRequest(w, r, deps)
	})

	mux.HandleFunc("/api/query/datasets", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		datasets := query.DescribeDatasets()
		writeJSON(w, http.StatusOK, map[string]any{
			"datasets": datasets,
			"count":    len(datasets),
		})
	})

	mux.HandleFunc("/api/query/capabilities", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		writeJSON(w, http.StatusOK, query.DescribeCapabilities())
	})

	mux.HandleFunc("/api/query/schema", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		schema := query.DescribeSchema()
		savedQueries, err := deps.Index.ListSavedQueries(r.Context())
		if err != nil {
			http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
			return
		}
		savedQuerySummaries := buildSavedQuerySummaries(savedQueries)
		writeJSON(w, http.StatusOK, map[string]any{
			"datasets":     schema.Datasets,
			"capabilities": schema.Capabilities,
			"examples":     schema.Examples,
			"savedQueries": savedQuerySummaries,
			"counts": map[string]int{
				"datasets":     len(schema.Datasets),
				"examples":     len(schema.Examples),
				"savedQueries": len(savedQuerySummaries),
			},
		})
	})

	mux.HandleFunc("/api/query/examples", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

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

		writeJSON(w, http.StatusOK, map[string]any{
			"dataset":  dataset,
			"examples": examples,
			"count":    len(examples),
		})
	})

	mux.HandleFunc("/api/query/editor", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w, http.MethodGet)
			return
		}

		savedQueries, err := deps.Index.ListSavedQueries(r.Context())
		if err != nil {
			http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
			return
		}
		editor := query.DescribeEditor()
		writeJSON(w, http.StatusOK, map[string]any{
			"schema": map[string]any{
				"datasets":     editor.Schema.Datasets,
				"capabilities": editor.Schema.Capabilities,
				"examples":     editor.Schema.Examples,
				"savedQueries": buildSavedQuerySummaries(savedQueries),
			},
			"rootSuggestions":    editor.RootSuggestions,
			"clauseSuggestions":  editor.ClauseSuggestions,
			"datasetSuggestions": editor.DatasetSuggestions,
		})
	})

	mux.HandleFunc("/api/query/analyze", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Analyze(request.Query))
	})

	mux.HandleFunc("/api/query/plan", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Plan(request.Query))
	})

	mux.HandleFunc("/api/query/lint", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Lint(request.Query))
	})

	mux.HandleFunc("/api/query/preview", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

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

	mux.HandleFunc("/api/query/count", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Count(r.Context(), deps.Index, request.Query))
	})

	mux.HandleFunc("/api/query/workbench", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

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

	mux.HandleFunc("/api/query/suggest", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request query.QuerySuggestionRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Suggest(request))
	})

	mux.HandleFunc("/api/query/format", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}

		var request struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, query.Format(request.Query))
	})

	mux.HandleFunc("/api/query/execute", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}
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
		savedQuery, err := deps.Index.GetSavedQuery(r.Context(), name)
		if err != nil {
			writeSavedQueryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, savedQuery)
	case http.MethodPut:
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
	case http.MethodDelete:
		if err := deps.Index.DeleteSavedQuery(r.Context(), name); err != nil {
			writeSavedQueryError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPut, http.MethodDelete)
	}
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
		var request query.QuerySuggestionRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil && !errors.Is(err, io.EOF) {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		request.Query = savedQuery.Query
		writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, "suggest", query.Suggest(request)))
	case "format":
		writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, "format", query.Format(savedQuery.Query)))
	case "execute":
		if deps.Query == nil {
			http.Error(w, "query service unavailable", http.StatusInternalServerError)
			return
		}
		result, err := deps.Query.Execute(r.Context(), deps.Index, savedQuery.Query)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, "result", result))
	case "analyze":
		writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, "analyze", query.Analyze(savedQuery.Query)))
	case "plan":
		writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, "plan", query.Plan(savedQuery.Query)))
	case "lint":
		writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, "lint", query.Lint(savedQuery.Query)))
	case "preview":
		var request struct {
			Limit int `json:"limit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil && !errors.Is(err, io.EOF) {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, "preview", query.Preview(r.Context(), deps.Index, savedQuery.Query, request.Limit)))
	case "count":
		writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, "count", query.Count(r.Context(), deps.Index, savedQuery.Query)))
	case "workbench":
		var request struct {
			PreviewLimit int `json:"previewLimit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil && !errors.Is(err, io.EOF) {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, savedQueryActionPayload(savedQuery, "workbench", query.Workbench(r.Context(), deps.Index, savedQuery.Query, request.PreviewLimit)))
	default:
		http.NotFound(w, r)
	}
}

func handleSavedQueryFacetsRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w, http.MethodGet)
		return
	}

	savedQueries, queryText, folder, tag, err := filteredSavedQueriesFromRequest(r, deps.Index)
	if err != nil {
		http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
		return
	}

	folders, tags := summarizeSavedQueryFacets(savedQueries)
	writeJSON(w, http.StatusOK, map[string]any{
		"query":   queryText,
		"folder":  folder,
		"tag":     tag,
		"folders": folders,
		"tags":    tags,
		"count":   len(savedQueries),
	})
}

func handleSavedQueryTreeRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w, http.MethodGet)
		return
	}

	savedQueries, queryText, folder, tag, err := filteredSavedQueriesFromRequest(r, deps.Index)
	if err != nil {
		http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"query":   queryText,
		"folder":  folder,
		"tag":     tag,
		"folders": buildSavedQueryTree(savedQueries),
		"count":   len(savedQueries),
	})
}

func handleSavedQueriesRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost && r.Method != http.MethodPatch {
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPost, http.MethodPatch)
		return
	}

	switch r.Method {
	case http.MethodGet:
		savedQueries, queryText, folder, tag, err := filteredSavedQueriesFromRequest(r, deps.Index)
		if err != nil {
			http.Error(w, "failed to list saved queries", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"query":   queryText,
			"folder":  folder,
			"tag":     tag,
			"queries": savedQueries,
			"count":   len(savedQueries),
		})
	case http.MethodPost:
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
	case http.MethodPatch:
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

		writeJSON(w, http.StatusOK, map[string]any{
			"queries": updatedQueries,
			"count":   len(updatedQueries),
		})
	}
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

func savedQueryActionPayload(savedQuery index.SavedQuery, key string, value any) map[string]any {
	payload := map[string]any{
		"name":        savedQuery.Name,
		"title":       savedQuery.Title,
		"description": savedQuery.Description,
		"folder":      savedQuery.Folder,
		"tags":        savedQuery.Tags,
		"query":       savedQuery.Query,
	}
	payload[key] = value
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

func buildSavedQuerySummaries(savedQueries []index.SavedQuery) []map[string]any {
	summaries := make([]map[string]any, 0, len(savedQueries))
	for _, savedQuery := range savedQueries {
		summaries = append(summaries, map[string]any{
			"name":        savedQuery.Name,
			"title":       savedQuery.Title,
			"description": savedQuery.Description,
			"folder":      savedQuery.Folder,
			"tags":        append([]string(nil), savedQuery.Tags...),
			"updatedAt":   savedQuery.UpdatedAt,
		})
	}
	return summaries
}

func summarizeSavedQueryFacets(savedQueries []index.SavedQuery) ([]map[string]any, []map[string]any) {
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

	folders := make([]map[string]any, 0, len(folderCounts))
	for folder, count := range folderCounts {
		folders = append(folders, map[string]any{
			"folder": folder,
			"count":  count,
		})
	}
	sort.Slice(folders, func(i, j int) bool {
		left := folders[i]
		right := folders[j]
		leftCount := left["count"].(int)
		rightCount := right["count"].(int)
		if leftCount != rightCount {
			return leftCount > rightCount
		}
		return left["folder"].(string) < right["folder"].(string)
	})

	tags := make([]map[string]any, 0, len(tagCounts))
	for tag, count := range tagCounts {
		tags = append(tags, map[string]any{
			"tag":   tag,
			"count": count,
		})
	}
	sort.Slice(tags, func(i, j int) bool {
		left := tags[i]
		right := tags[j]
		leftCount := left["count"].(int)
		rightCount := right["count"].(int)
		if leftCount != rightCount {
			return leftCount > rightCount
		}
		return left["tag"].(string) < right["tag"].(string)
	})

	return folders, tags
}

func buildSavedQueryTree(savedQueries []index.SavedQuery) []map[string]any {
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

	tree := make([]map[string]any, 0, len(folderNames))
	for _, folder := range folderNames {
		queries := groups[folder]
		sort.Slice(queries, func(i, j int) bool {
			return queries[i].Name < queries[j].Name
		})
		tree = append(tree, map[string]any{
			"folder":  folder,
			"count":   len(queries),
			"queries": buildSavedQuerySummaries(queries),
		})
	}
	return tree
}
