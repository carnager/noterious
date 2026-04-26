package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/carnager/noterious/internal/themes"
)

func mountThemeEndpoints(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("/api/themes", func(w http.ResponseWriter, r *http.Request) {
		handleThemesRequest(w, r, deps)
	})
	mux.HandleFunc("/api/themes/", func(w http.ResponseWriter, r *http.Request) {
		handleThemeRequest(w, r, deps)
	})
}

func handleThemesRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if deps.Themes == nil {
		http.Error(w, "theme management unavailable", http.StatusServiceUnavailable)
		return
	}
	switch r.Method {
	case http.MethodGet:
		items, err := deps.Themes.List()
		if err != nil {
			http.Error(w, "failed to list themes", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"themes": items,
			"count":  len(items),
		})
	case http.MethodPost:
		if err := r.ParseMultipartForm(themes.MaxUploadBytes); err != nil {
			http.Error(w, "invalid multipart upload", http.StatusBadRequest)
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "file is required", http.StatusBadRequest)
			return
		}
		defer file.Close()
		created, err := deps.Themes.CreateFromReader(header.Filename, file)
		if err != nil {
			switch {
			case errors.Is(err, themes.ErrInvalidTheme):
				http.Error(w, err.Error(), http.StatusBadRequest)
			case errors.Is(err, themes.ErrThemeExists):
				http.Error(w, err.Error(), http.StatusConflict)
			default:
				http.Error(w, "failed to create theme", http.StatusInternalServerError)
			}
			return
		}
		writeJSON(w, http.StatusCreated, created)
	default:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func handleThemeRequest(w http.ResponseWriter, r *http.Request, deps Dependencies) {
	if deps.Themes == nil {
		http.Error(w, "theme management unavailable", http.StatusServiceUnavailable)
		return
	}
	themeID := normalizeThemePath(strings.TrimPrefix(r.URL.Path, "/api/themes/"))
	if themeID == "" {
		http.Error(w, "invalid theme path", http.StatusBadRequest)
		return
	}
	if r.Method != http.MethodDelete {
		writeMethodNotAllowed(w, http.MethodDelete)
		return
	}
	if err := deps.Themes.Delete(themeID); err != nil {
		switch {
		case errors.Is(err, themes.ErrThemeNotFound):
			http.Error(w, err.Error(), http.StatusNotFound)
		case errors.Is(err, themes.ErrBuiltinTheme):
			http.Error(w, err.Error(), http.StatusConflict)
		case errors.Is(err, themes.ErrInvalidTheme):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, "failed to delete theme", http.StatusInternalServerError)
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true,
		"id": themeID,
	})
}

func normalizeThemePath(value string) string {
	trimmed := strings.Trim(strings.TrimSpace(value), "/")
	if trimmed == "" || strings.Contains(trimmed, "/") || strings.Contains(trimmed, `\`) {
		return ""
	}
	return trimmed
}
