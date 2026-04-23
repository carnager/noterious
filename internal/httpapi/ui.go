package httpapi

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed static/*
var uiAssets embed.FS

func mountUI(mux *http.ServeMux) {
	staticFS, err := fs.Sub(uiAssets, "static")
	if err != nil {
		panic(err)
	}

	fileServer := http.FileServer(http.FS(staticFS))
	mux.Handle("/assets/", http.StripPrefix("/assets/", noCache(fileServer)))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		setNoCacheHeaders(w)
		http.ServeFileFS(w, r, staticFS, "index.html")
	})
}

func noCache(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		setNoCacheHeaders(w)
		next.ServeHTTP(w, r)
	})
}

func setNoCacheHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
}
