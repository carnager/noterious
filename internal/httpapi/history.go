package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	historyservice "github.com/carnager/noterious/internal/history"
)

type okPageResponse struct {
	OK   bool   `json:"ok"`
	Page string `json:"page"`
}

type okResponse struct {
	OK bool `json:"ok"`
}

type revisionResponse struct {
	ID          string `json:"id"`
	Page        string `json:"page"`
	SavedAt     string `json:"savedAt"`
	RawMarkdown string `json:"rawMarkdown"`
}

type pageHistoryResponse struct {
	Page      string             `json:"page"`
	Revisions []revisionResponse `json:"revisions"`
	Count     int                `json:"count"`
}

type trashEntryResponse struct {
	Page        string `json:"page"`
	DeletedAt   string `json:"deletedAt"`
	RawMarkdown string `json:"rawMarkdown"`
}

type trashPagesResponse struct {
	Pages []trashEntryResponse `json:"pages"`
	Count int                  `json:"count"`
}

func handlePageHistoryRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if deps.History == nil {
		http.Error(w, "history service unavailable", http.StatusInternalServerError)
		return
	}

	raw := strings.TrimPrefix(r.URL.Path, "/api/page-history/")
	restore := false
	if strings.HasSuffix(raw, "/restore") {
		restore = true
		raw = strings.TrimSuffix(raw, "/restore")
	}

	pagePath, ok := normalizeAPIPagePath(raw)
	if !ok {
		http.Error(w, "invalid page path", http.StatusBadRequest)
		return
	}

	if restore {
		handlePageHistoryRestore(w, r, deps, pagePath)
		return
	}

	switch r.Method {
	case http.MethodDelete:
		if err := deps.History.DeletePageHistory(pagePath); err != nil {
			http.Error(w, "failed to purge page history", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, okPageResponse{OK: true, Page: pagePath})
	case http.MethodGet:
		revisions, err := deps.History.ListRevisions(pagePath)
		if err != nil {
			http.Error(w, "failed to load page history", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, pageHistoryPayload(pagePath, revisions))
	default:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodDelete)
	}
}

func handlePageHistoryRestore(w http.ResponseWriter, r *http.Request, deps Dependencies, pagePath string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w, http.MethodPost)
		return
	}

	vaultService := currentVault(r.Context(), deps)
	var request struct {
		RevisionID string `json:"revisionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	revision, err := deps.History.GetRevision(pagePath, request.RevisionID)
	if err != nil {
		http.Error(w, "failed to load revision", http.StatusNotFound)
		return
	}
	if currentMarkdown, err := vaultService.ReadPage(pagePath); err == nil {
		if _, err := deps.History.SaveRevision(pagePath, currentMarkdown); err != nil {
			http.Error(w, "failed to snapshot current page", http.StatusInternalServerError)
			return
		}
	}
	if err := vaultService.WritePage(pagePath, []byte(revision.RawMarkdown)); err != nil {
		http.Error(w, "failed to restore page", http.StatusInternalServerError)
		return
	}
	if _, err := deps.History.SaveRevision(pagePath, []byte(revision.RawMarkdown)); err != nil {
		http.Error(w, "failed to save restored revision", http.StatusInternalServerError)
		return
	}
	if err := refreshPageDerivedState(r.Context(), deps, vaultService, pagePath); err != nil {
		http.Error(w, "failed to update page state", http.StatusInternalServerError)
		return
	}
	if deps.OnPageChanged != nil {
		deps.OnPageChanged(pagePath)
	}

	pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
	if err != nil {
		writePageError(w, r, err, "failed to load restored page")
		return
	}
	writeJSON(w, http.StatusOK, pageRecordPayload(pageRecord))
}

func handleTrashPagesRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if deps.History == nil {
		http.Error(w, "history service unavailable", http.StatusInternalServerError)
		return
	}

	switch r.Method {
	case http.MethodDelete:
		if err := deps.History.EmptyTrash(); err != nil {
			http.Error(w, "failed to empty trash", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, okResponse{OK: true})
	case http.MethodGet:
		trashEntries, err := deps.History.ListTrash()
		if err != nil {
			http.Error(w, "failed to load trash", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, trashPagesPayload(trashEntries))
	default:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodDelete)
	}
}

func handleTrashPageRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if deps.History == nil {
		http.Error(w, "history service unavailable", http.StatusInternalServerError)
		return
	}

	vaultService := currentVault(r.Context(), deps)
	raw := strings.TrimPrefix(r.URL.Path, "/api/trash/pages/")
	restore := false
	if strings.HasSuffix(raw, "/restore") {
		restore = true
		raw = strings.TrimSuffix(raw, "/restore")
	}

	pagePath, ok := normalizeAPIPagePath(raw)
	if !ok {
		http.Error(w, "invalid page path", http.StatusBadRequest)
		return
	}

	if restore {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w, http.MethodPost)
			return
		}
		entry, err := deps.History.RestoreFromTrash(pagePath)
		if err != nil {
			http.Error(w, "failed to restore trashed page", http.StatusNotFound)
			return
		}
		if err := vaultService.WritePage(pagePath, []byte(entry.RawMarkdown)); err != nil {
			http.Error(w, "failed to restore page", http.StatusInternalServerError)
			return
		}
		if _, err := deps.History.SaveRevision(pagePath, []byte(entry.RawMarkdown)); err != nil {
			http.Error(w, "failed to save restored page history", http.StatusInternalServerError)
			return
		}
		if err := refreshPageDerivedState(r.Context(), deps, vaultService, pagePath); err != nil {
			http.Error(w, "failed to update restored page state", http.StatusInternalServerError)
			return
		}
		if deps.OnPageChanged != nil {
			deps.OnPageChanged(pagePath)
		}
		pageRecord, err := deps.Index.GetPage(r.Context(), pagePath)
		if err != nil {
			writePageError(w, r, err, "failed to load restored page")
			return
		}
		writeJSON(w, http.StatusOK, pageRecordPayload(pageRecord))
		return
	}

	if r.Method != http.MethodDelete {
		writeMethodNotAllowed(w, http.MethodDelete)
		return
	}
	if err := deps.History.PermanentlyDelete(pagePath); err != nil {
		http.Error(w, "failed to permanently delete trashed page", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, okPageResponse{OK: true, Page: pagePath})
}

func pageHistoryPayload(pagePath string, revisions []historyservice.Revision) pageHistoryResponse {
	items := make([]revisionResponse, 0, len(revisions))
	for _, revision := range revisions {
		items = append(items, revisionResponse{
			ID:          revision.ID,
			Page:        revision.Page,
			SavedAt:     revision.SavedAt.UTC().Format(time.RFC3339Nano),
			RawMarkdown: revision.RawMarkdown,
		})
	}
	return pageHistoryResponse{
		Page:      pagePath,
		Revisions: items,
		Count:     len(items),
	}
}

func trashPagesPayload(trashEntries []historyservice.TrashEntry) trashPagesResponse {
	items := make([]trashEntryResponse, 0, len(trashEntries))
	for _, entry := range trashEntries {
		items = append(items, trashEntryResponse{
			Page:        entry.Page,
			DeletedAt:   entry.DeletedAt.UTC().Format(time.RFC3339Nano),
			RawMarkdown: entry.RawMarkdown,
		})
	}
	return trashPagesResponse{
		Pages: items,
		Count: len(items),
	}
}
