package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/markdown"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/vaults"
)

func mountTaskEndpoints(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("/api/tasks", func(w http.ResponseWriter, r *http.Request) {
		handleTasksRequest(w, r, deps)
	})

	mux.HandleFunc("/api/tasks/", func(w http.ResponseWriter, r *http.Request) {
		handleTaskRequest(w, r, deps)
	})
}

func handleTasksRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w, http.MethodGet)
		return
	}

	tasks, err := deps.Index.ListTasks(r.Context())
	if err != nil {
		http.Error(w, "failed to list tasks", http.StatusInternalServerError)
		return
	}

	queryText := strings.TrimSpace(r.URL.Query().Get("q"))
	if queryText != "" {
		tasks = filterTasks(tasks, queryText)
	}

	stateFilter := strings.TrimSpace(r.URL.Query().Get("state"))
	if stateFilter != "" {
		tasks = filterTasksByState(tasks, stateFilter)
	}
	whoFilter := strings.TrimSpace(r.URL.Query().Get("who"))
	if whoFilter != "" {
		tasks = filterTasksByWho(tasks, whoFilter)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"query":   queryText,
		"state":   stateFilter,
		"who":     whoFilter,
		"tasks":   tasks,
		"count":   len(tasks),
		"summary": summarizeTasks(tasks),
	})
}

func handleTaskRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	vaultID := vaults.VaultIDFromContext(r.Context())
	vaultService := currentVault(r.Context(), deps)
	if r.Method != http.MethodPatch && r.Method != http.MethodDelete {
		writeMethodNotAllowed(w, http.MethodPatch, http.MethodDelete)
		return
	}

	ref := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/api/tasks/"))
	if ref == "" {
		http.NotFound(w, r)
		return
	}

	task, err := deps.Index.GetTask(r.Context(), ref)
	if err != nil {
		writeTaskError(w, r, err)
		return
	}
	var previousPageSummary *index.PageSummary
	if previousPage, err := deps.Index.GetPage(r.Context(), task.Page); err == nil {
		summary, err := summarizePageRecord(r.Context(), deps.Index, previousPage)
		if err == nil {
			previousPageSummary = &summary
		}
	}

	rawMarkdown, err := vaultService.ReadPage(task.Page)
	if err != nil {
		http.Error(w, "failed to read task page", http.StatusInternalServerError)
		return
	}

	var updatedMarkdown string
	if r.Method == http.MethodDelete {
		updatedMarkdown, err = markdown.RemoveTaskLine(string(rawMarkdown), task.Line)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	} else {
		var request struct {
			Text   *string  `json:"text"`
			State  *string  `json:"state"`
			Due    *string  `json:"due"`
			Remind *string  `json:"remind"`
			Who    []string `json:"who"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		var who *[]string
		if request.Who != nil {
			copied := append([]string(nil), request.Who...)
			who = &copied
		}

		updatedMarkdown, _, err = markdown.ApplyTaskPatch(string(rawMarkdown), task.Line, markdown.TaskPatch{
			Text:   request.Text,
			State:  request.State,
			Due:    request.Due,
			Remind: request.Remind,
			Who:    who,
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	if err := vaultService.WritePage(task.Page, []byte(updatedMarkdown)); err != nil {
		http.Error(w, "failed to write task page", http.StatusInternalServerError)
		return
	}
	if deps.History != nil {
		if _, err := deps.History.SaveRevisionForVault(vaultID, task.Page, []byte(updatedMarkdown)); err != nil {
			http.Error(w, "failed to save page history", http.StatusInternalServerError)
			return
		}
	}
	if err := refreshPageDerivedState(r.Context(), deps, vaultService, task.Page); err != nil {
		http.Error(w, "failed to update page state", http.StatusInternalServerError)
		return
	}
	if deps.Events != nil {
		deps.Events.PublishToVault(vaultID, Event{
			Type: map[bool]string{true: "task.deleted", false: "task.changed"}[r.Method == http.MethodDelete],
			Data: map[string]any{
				"ref":  ref,
				"page": task.Page,
			},
		})
	}
	var updatedPageSummary *index.PageSummary
	if updatedPage, err := deps.Index.GetPage(r.Context(), task.Page); err == nil {
		summary, err := summarizePageRecord(r.Context(), deps.Index, updatedPage)
		if err == nil {
			updatedPageSummary = &summary
		}
	}
	if deps.Events != nil {
		oldTask := task
		var newTask *index.Task
		if r.Method != http.MethodDelete {
			updatedTask, err := deps.Index.GetTask(r.Context(), ref)
			if err != nil {
				writeTaskError(w, r, err)
				return
			}
			newTask = &updatedTask
		}
		PublishInvalidationEvents(r.Context(), deps.Events, deps.Index, deps.Query, task.Page, []query.PageChange{{
			Before: previousPageSummary,
			After:  updatedPageSummary,
		}}, []query.TaskChange{{
			Before: &oldTask,
			After:  newTask,
		}})
	}
	if deps.OnPageChanged != nil {
		deps.OnPageChanged(task.Page)
	}

	if r.Method == http.MethodDelete {
		writeJSON(w, http.StatusOK, map[string]any{
			"deleted": true,
			"ref":     ref,
			"page":    task.Page,
		})
		return
	}

	updatedTask, err := deps.Index.GetTask(r.Context(), ref)
	if err != nil {
		writeTaskError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, updatedTask)
}

func writeTaskError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, index.ErrTaskNotFound) {
		http.NotFound(w, r)
		return
	}
	http.Error(w, "failed to load task", http.StatusInternalServerError)
}

func filterTasks(tasks []index.Task, queryText string) []index.Task {
	needle := strings.ToLower(strings.TrimSpace(queryText))
	if needle == "" {
		return tasks
	}

	filtered := make([]index.Task, 0, len(tasks))
	for _, task := range tasks {
		if strings.Contains(strings.ToLower(task.Ref), needle) ||
			strings.Contains(strings.ToLower(task.Page), needle) ||
			strings.Contains(strings.ToLower(task.Text), needle) {
			filtered = append(filtered, task)
		}
	}
	return filtered
}

func filterTasksByState(tasks []index.Task, stateFilter string) []index.Task {
	filter := strings.ToLower(strings.TrimSpace(stateFilter))
	if filter == "" {
		return tasks
	}

	filtered := make([]index.Task, 0, len(tasks))
	for _, task := range tasks {
		switch filter {
		case "open":
			if !task.Done {
				filtered = append(filtered, task)
			}
		case "done":
			if task.Done {
				filtered = append(filtered, task)
			}
		default:
			if strings.EqualFold(task.State, filter) {
				filtered = append(filtered, task)
			}
		}
	}
	return filtered
}

func filterTasksByWho(tasks []index.Task, whoFilter string) []index.Task {
	needle := strings.TrimSpace(whoFilter)
	if needle == "" {
		return tasks
	}

	filtered := make([]index.Task, 0, len(tasks))
	for _, task := range tasks {
		for _, who := range task.Who {
			if strings.EqualFold(strings.TrimSpace(who), needle) {
				filtered = append(filtered, task)
				break
			}
		}
	}
	return filtered
}

func summarizeTasks(tasks []index.Task) map[string]int {
	summary := map[string]int{
		"total":      len(tasks),
		"open":       0,
		"done":       0,
		"withDue":    0,
		"withoutDue": 0,
	}
	for _, task := range tasks {
		if task.Done {
			summary["done"]++
		} else {
			summary["open"]++
		}
		if task.Due != nil && strings.TrimSpace(*task.Due) != "" {
			summary["withDue"]++
		} else {
			summary["withoutDue"]++
		}
	}
	return summary
}
