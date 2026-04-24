package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/carnager/noterious/internal/config"
	"github.com/carnager/noterious/internal/documents"
	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/query"
	"github.com/carnager/noterious/internal/settings"
	"github.com/carnager/noterious/internal/vault"
)

func TestGetPageReturnsIndexedContent(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	raw := `---
title: Daily Note
tags:
  - work
---
# Daily Note

Link to [[projects/alpha]].

- [ ] Follow up due:: 2026-05-01 who:: [Ralf]
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault: vaultService,
		Index: indexService,
		Query: query.NewService(),
	})

	request := httptest.NewRequest(http.MethodGet, "/api/pages/daily/today", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Page        string         `json:"page"`
		Title       string         `json:"title"`
		RawMarkdown string         `json:"rawMarkdown"`
		Frontmatter map[string]any `json:"frontmatter"`
		Links       []struct {
			TargetPage string `json:"targetPage"`
			Kind       string `json:"kind"`
		} `json:"links"`
		Tasks []struct {
			Ref  string   `json:"ref"`
			Due  string   `json:"due"`
			Who  []string `json:"who"`
			Done bool     `json:"done"`
		} `json:"tasks"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Page != "daily/today" {
		t.Fatalf("page = %q", payload.Page)
	}
	if payload.Title != "Daily Note" {
		t.Fatalf("title = %q", payload.Title)
	}
	if payload.Frontmatter["title"] != "Daily Note" {
		t.Fatalf("frontmatter title = %#v", payload.Frontmatter["title"])
	}
	if len(payload.Links) != 1 || payload.Links[0].TargetPage != "projects/alpha" || payload.Links[0].Kind != "wikilink" {
		t.Fatalf("links = %#v", payload.Links)
	}
	if len(payload.Tasks) != 1 || payload.Tasks[0].Ref != "daily/today:10" || payload.Tasks[0].Due != "2026-05-01" || payload.Tasks[0].Done {
		t.Fatalf("tasks = %#v", payload.Tasks)
	}
	if len(payload.Tasks[0].Who) != 1 || payload.Tasks[0].Who[0] != "Ralf" {
		t.Fatalf("task who = %#v", payload.Tasks[0].Who)
	}
}

func TestSettingsAPIStoresWorkspaceAndHotkeys(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(vaultDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "index.md"), []byte("# Home\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	cfg := config.Config{
		ListenAddr: ":8080",
		VaultPath:  vaultDir,
		DataDir:    dataDir,
		HomePage:   "index",
	}
	settingsStore, err := settings.NewStore(dataDir, settings.DefaultSettingsFromConfig(cfg))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	router := buildTestRouterWithDeps(t, vaultDir, dataDir, Dependencies{
		Config:   cfg,
		Settings: settingsStore,
	})

	getRequest := httptest.NewRequest(http.MethodGet, "/api/settings", nil)
	getResponse := httptest.NewRecorder()
	router.ServeHTTP(getResponse, getRequest)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("GET /api/settings status = %d want %d", getResponse.Code, http.StatusOK)
	}

	var initial settings.Snapshot
	if err := json.NewDecoder(getResponse.Body).Decode(&initial); err != nil {
		t.Fatalf("Decode(initial) error = %v", err)
	}
	if initial.Settings.Workspace.VaultPath != vaultDir {
		t.Fatalf("initial vault path = %q want %q", initial.Settings.Workspace.VaultPath, vaultDir)
	}

	body := bytes.NewBufferString(`{
	  "preferences": {
	    "ui": {
	      "fontFamily": "sans",
	      "fontSize": "18"
	    },
	    "hotkeys": {
	      "quickSwitcher": "Mod+O",
	      "globalSearch": "Mod+Shift+F",
	      "commandPalette": "Mod+/",
	      "help": "?",
	      "saveCurrentPage": "Mod+S",
	      "toggleRawMode": "Mod+E"
	    }
	  },
	  "workspace": {
	    "vaultPath": "` + filepath.ToSlash(filepath.Join(rootDir, "other-vault")) + `",
	    "homePage": "notes/start"
	  }
	}`)
	putRequest := httptest.NewRequest(http.MethodPut, "/api/settings", body)
	putRequest.Header.Set("Content-Type", "application/json")
	putResponse := httptest.NewRecorder()
	router.ServeHTTP(putResponse, putRequest)
	if putResponse.Code != http.StatusOK {
		t.Fatalf("PUT /api/settings status = %d want %d body=%s", putResponse.Code, http.StatusOK, putResponse.Body.String())
	}

	var updated settings.Snapshot
	if err := json.NewDecoder(putResponse.Body).Decode(&updated); err != nil {
		t.Fatalf("Decode(updated) error = %v", err)
	}
	if updated.Settings.Preferences.Hotkeys.GlobalSearch != "Mod+Shift+F" {
		t.Fatalf("global search hotkey = %q want %q", updated.Settings.Preferences.Hotkeys.GlobalSearch, "Mod+Shift+F")
	}
	if updated.Settings.Preferences.UI.FontFamily != "sans" || updated.Settings.Preferences.UI.FontSize != "18" {
		t.Fatalf("ui settings = %#v", updated.Settings.Preferences.UI)
	}
	if !updated.RestartRequired {
		t.Fatalf("updated settings should require restart after vault path change")
	}
	if updated.AppliedWorkspace.VaultPath != vaultDir {
		t.Fatalf("applied vault path = %q want %q", updated.AppliedWorkspace.VaultPath, vaultDir)
	}
}

func TestDocumentsAPIUploadsListsAndDownloads(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")
	if err := os.MkdirAll(vaultDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	router := buildTestRouterWithDeps(t, vaultDir, dataDir, Dependencies{})

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "meeting-notes.pdf")
	if err != nil {
		t.Fatalf("CreateFormFile() error = %v", err)
	}
	if _, err := io.WriteString(part, "%PDF-1.4 fake"); err != nil {
		t.Fatalf("WriteString() error = %v", err)
	}
	if err := writer.WriteField("page", "notes/alpha"); err != nil {
		t.Fatalf("WriteField() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	uploadRequest := httptest.NewRequest(http.MethodPost, "/api/documents", &body)
	uploadRequest.Header.Set("Content-Type", writer.FormDataContentType())
	uploadResponse := httptest.NewRecorder()
	router.ServeHTTP(uploadResponse, uploadRequest)
	if uploadResponse.Code != http.StatusCreated {
		t.Fatalf("POST /api/documents status = %d body=%s", uploadResponse.Code, uploadResponse.Body.String())
	}

	var uploaded struct {
		ID          string `json:"id"`
		Path        string `json:"path"`
		Name        string `json:"name"`
		ContentType string `json:"contentType"`
		DownloadURL string `json:"downloadURL"`
	}
	if err := json.NewDecoder(uploadResponse.Body).Decode(&uploaded); err != nil {
		t.Fatalf("Decode(upload) error = %v", err)
	}
	if uploaded.ID == "" || uploaded.Path != "notes/meeting-notes.pdf" || uploaded.DownloadURL == "" {
		t.Fatalf("uploaded = %#v", uploaded)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/documents?q=meeting", nil)
	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("GET /api/documents status = %d body=%s", listResponse.Code, listResponse.Body.String())
	}

	var listed struct {
		Count     int `json:"count"`
		Documents []struct {
			ID   string `json:"id"`
			Path string `json:"path"`
			Name string `json:"name"`
		} `json:"documents"`
	}
	if err := json.NewDecoder(listResponse.Body).Decode(&listed); err != nil {
		t.Fatalf("Decode(list) error = %v", err)
	}
	if listed.Count != 1 || len(listed.Documents) != 1 || listed.Documents[0].ID != uploaded.ID || listed.Documents[0].Path != uploaded.Path {
		t.Fatalf("listed = %#v", listed)
	}

	downloadRequest := httptest.NewRequest(http.MethodGet, uploaded.DownloadURL, nil)
	downloadResponse := httptest.NewRecorder()
	router.ServeHTTP(downloadResponse, downloadRequest)
	if downloadResponse.Code != http.StatusOK {
		t.Fatalf("GET download status = %d body=%s", downloadResponse.Code, downloadResponse.Body.String())
	}
	if got := downloadResponse.Header().Get("Content-Disposition"); !strings.Contains(got, "meeting-notes.pdf") {
		t.Fatalf("Content-Disposition = %q", got)
	}
	if !strings.Contains(downloadResponse.Body.String(), "%PDF-1.4 fake") {
		t.Fatalf("download body = %q", downloadResponse.Body.String())
	}
}

func TestGetPageReturnsNotFoundForMissingPage(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{},
		Vault:  vaultService,
		Index:  indexService,
		Query:  query.NewService(),
	})

	request := httptest.NewRequest(http.MethodGet, "/api/pages/missing", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestRootServesExploratoryUI(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store, max-age=0" {
		t.Fatalf("Cache-Control = %q", got)
	}
	if !strings.Contains(recorder.Body.String(), "id=\"toggle-rail\"") || !strings.Contains(recorder.Body.String(), "id=\"rail-tab-tags\"") || !strings.Contains(recorder.Body.String(), "id=\"detail-path\"") {
		t.Fatalf("body = %s", recorder.Body.String())
	}
}

func TestUIServesStaticAssets(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store, max-age=0" {
		t.Fatalf("Cache-Control = %q", got)
	}
	if !strings.Contains(recorder.Body.String(), "connectEvents") || !strings.Contains(recorder.Body.String(), "runQueryWorkbench") {
		t.Fatalf("body = %s", recorder.Body.String())
	}
}

func TestMetaIncludesConfiguredHomePage(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouterWithDeps(t, vaultDir, dataDir, Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
			HomePage:   "index",
		},
	})

	request := httptest.NewRequest(http.MethodGet, "/api/meta", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		HomePage string `json:"homePage"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if payload.HomePage != "index" {
		t.Fatalf("homePage = %q", payload.HomePage)
	}
}

func TestGetPagesReturnsIndexedSummaries(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "notes"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): "---\ntags:\n  - journal\n---\n# Today\n\n- [ ] Follow up\n",
		filepath.Join(vaultDir, "notes", "alpha.md"): "---\ntags:\n  - work\n  - reference\n---\n# Alpha\n\nSee [[daily/today]].\n\n```query\nfrom tasks\nselect ref\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/pages", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Count int `json:"count"`
		Pages []struct {
			Path      string   `json:"path"`
			Title     string   `json:"title"`
			CreatedAt string   `json:"createdAt"`
			UpdatedAt string   `json:"updatedAt"`
			Tags      []string `json:"tags"`
			Counts    struct {
				OutgoingLinks int `json:"outgoingLinks"`
				Backlinks     int `json:"backlinks"`
				Tasks         int `json:"tasks"`
				OpenTasks     int `json:"openTasks"`
				DoneTasks     int `json:"doneTasks"`
				QueryBlocks   int `json:"queryBlocks"`
			} `json:"counts"`
		} `json:"pages"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Count != 2 || len(payload.Pages) != 2 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Pages[0].Path != "daily/today" || payload.Pages[0].Title != "Today" || payload.Pages[0].CreatedAt == "" || payload.Pages[0].UpdatedAt == "" || len(payload.Pages[0].Tags) != 1 || payload.Pages[0].Tags[0] != "journal" || payload.Pages[0].Counts.OutgoingLinks != 0 || payload.Pages[0].Counts.Backlinks != 1 || payload.Pages[0].Counts.Tasks != 1 || payload.Pages[0].Counts.OpenTasks != 1 || payload.Pages[0].Counts.DoneTasks != 0 || payload.Pages[0].Counts.QueryBlocks != 0 {
		t.Fatalf("first page = %#v", payload.Pages[0])
	}
	if payload.Pages[1].Path != "notes/alpha" || payload.Pages[1].Title != "Alpha" || payload.Pages[1].CreatedAt == "" || payload.Pages[1].UpdatedAt == "" || len(payload.Pages[1].Tags) != 2 || payload.Pages[1].Tags[0] != "work" || payload.Pages[1].Tags[1] != "reference" || payload.Pages[1].Counts.OutgoingLinks != 1 || payload.Pages[1].Counts.Backlinks != 0 || payload.Pages[1].Counts.Tasks != 0 || payload.Pages[1].Counts.OpenTasks != 0 || payload.Pages[1].Counts.DoneTasks != 0 || payload.Pages[1].Counts.QueryBlocks != 1 {
		t.Fatalf("second page = %#v", payload.Pages[1])
	}
}

func TestGlobalSearchReturnsPagesTasksAndSavedQueries(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "contacts"),
		filepath.Join(vaultDir, "notes"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "contacts", "alice.md"): `---
title: Alice Alpha
tags: contact
location: Deweerthstraße
---
# Alice Alpha

Alpha note body.
`,
		filepath.Join(vaultDir, "notes", "today.md"): `# Today

- [ ] Alpha follow-up due:: 2026-05-01 who:: [Ralf]
`,
	}
	for filename, content := range files {
		if err := os.WriteFile(filename, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filename, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if _, err := indexService.PutSavedQuery(context.Background(), index.SavedQuery{
		Name:  "alpha-dashboard",
		Title: "Alpha Dashboard",
		Query: "from tasks where text contains \"alpha\" select ref, text",
	}); err != nil {
		t.Fatalf("PutSavedQuery() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault:  vaultService,
		Index:  indexService,
		Query:  queryService,
		Events: NewEventBroker(),
	})

	request := httptest.NewRequest(http.MethodGet, "/api/search?q=alpha", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query string `json:"query"`
		Pages []struct {
			Path  string `json:"path"`
			Match string `json:"match"`
		} `json:"pages"`
		Tasks []struct {
			Ref  string `json:"ref"`
			Text string `json:"text"`
		} `json:"tasks"`
		Queries []struct {
			Name string `json:"name"`
		} `json:"queries"`
		Counts map[string]int `json:"counts"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Query != "alpha" {
		t.Fatalf("query = %q", payload.Query)
	}
	if len(payload.Pages) == 0 || payload.Pages[0].Path != "contacts/alice" {
		t.Fatalf("pages = %#v", payload.Pages)
	}
	if len(payload.Tasks) == 0 || payload.Tasks[0].Text != "Alpha follow-up" {
		t.Fatalf("tasks = %#v", payload.Tasks)
	}
	if len(payload.Queries) == 0 || payload.Queries[0].Name != "alpha-dashboard" {
		t.Fatalf("queries = %#v", payload.Queries)
	}
	if payload.Counts["total"] < 3 {
		t.Fatalf("counts = %#v", payload.Counts)
	}
}

func TestGetPagesFiltersByQuery(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "notes"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"):    "# Today\n\nBody.\n",
		filepath.Join(vaultDir, "notes", "alpha.md"):    "# Alpha Notes\n\nBody.\n",
		filepath.Join(vaultDir, "projects", "alpha.md"): "# Project Alpha\n\nBody.\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/pages?q=alpha", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query string `json:"query"`
		Count int    `json:"count"`
		Pages []struct {
			Path   string   `json:"path"`
			Title  string   `json:"title"`
			Tags   []string `json:"tags"`
			Counts struct {
				OutgoingLinks int `json:"outgoingLinks"`
				Backlinks     int `json:"backlinks"`
				Tasks         int `json:"tasks"`
				OpenTasks     int `json:"openTasks"`
				DoneTasks     int `json:"doneTasks"`
				QueryBlocks   int `json:"queryBlocks"`
			} `json:"counts"`
		} `json:"pages"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Query != "alpha" || payload.Count != 2 || len(payload.Pages) != 2 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Pages[0].Path != "notes/alpha" || payload.Pages[1].Path != "projects/alpha" {
		t.Fatalf("pages = %#v", payload.Pages)
	}
	if len(payload.Pages[0].Tags) != 0 || len(payload.Pages[1].Tags) != 0 {
		t.Fatalf("tags = %#v / %#v", payload.Pages[0].Tags, payload.Pages[1].Tags)
	}
	if payload.Pages[0].Counts.OutgoingLinks != 0 || payload.Pages[0].Counts.Backlinks != 0 || payload.Pages[0].Counts.Tasks != 0 || payload.Pages[0].Counts.OpenTasks != 0 || payload.Pages[0].Counts.DoneTasks != 0 || payload.Pages[0].Counts.QueryBlocks != 0 {
		t.Fatalf("first counts = %#v", payload.Pages[0].Counts)
	}
	if payload.Pages[1].Counts.OutgoingLinks != 0 || payload.Pages[1].Counts.Backlinks != 0 || payload.Pages[1].Counts.Tasks != 0 || payload.Pages[1].Counts.OpenTasks != 0 || payload.Pages[1].Counts.DoneTasks != 0 || payload.Pages[1].Counts.QueryBlocks != 0 {
		t.Fatalf("second counts = %#v", payload.Pages[1].Counts)
	}
}

func TestGetPagesFiltersByTag(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "notes"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"):    "---\ntags:\n  - journal\n---\n# Today\n",
		filepath.Join(vaultDir, "notes", "alpha.md"):    "---\ntags:\n  - work\n  - reference\n---\n# Alpha\n",
		filepath.Join(vaultDir, "projects", "alpha.md"): "---\ntags:\n  - work\n---\n# Project Alpha\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/pages?tag=work", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Tag   string `json:"tag"`
		Count int    `json:"count"`
		Pages []struct {
			Path string   `json:"path"`
			Tags []string `json:"tags"`
		} `json:"pages"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Tag != "work" || payload.Count != 2 || len(payload.Pages) != 2 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Pages[0].Path != "notes/alpha" || payload.Pages[1].Path != "projects/alpha" {
		t.Fatalf("pages = %#v", payload.Pages)
	}
	if len(payload.Pages[0].Tags) != 2 || len(payload.Pages[1].Tags) != 1 {
		t.Fatalf("tags = %#v", payload.Pages)
	}
}

func TestPutPageWritesMarkdownAndReindexes(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte("# Alpha\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte("{\"rawMarkdown\":\"---\\ntitle: Updated Alpha\\n---\\n# Alpha\\n\\nLink to [[notes/beta]].\\n\\n- [ ] Follow up due:: 2026-05-03\\n\"}")
	request := httptest.NewRequest(http.MethodPut, "/api/pages/notes/alpha", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Page        string         `json:"page"`
		Title       string         `json:"title"`
		RawMarkdown string         `json:"rawMarkdown"`
		Frontmatter map[string]any `json:"frontmatter"`
		Links       []struct {
			TargetPage string `json:"targetPage"`
		} `json:"links"`
		Tasks []struct {
			Ref string `json:"ref"`
			Due string `json:"due"`
		} `json:"tasks"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Page != "notes/alpha" || payload.Title != "Updated Alpha" {
		t.Fatalf("payload page/title = %#v / %#v", payload.Page, payload.Title)
	}
	if payload.Frontmatter["title"] != "Updated Alpha" {
		t.Fatalf("frontmatter = %#v", payload.Frontmatter)
	}
	if len(payload.Links) != 1 || payload.Links[0].TargetPage != "notes/beta" {
		t.Fatalf("links = %#v", payload.Links)
	}
	if len(payload.Tasks) != 1 || payload.Tasks[0].Ref != "notes/alpha:8" || payload.Tasks[0].Due != "2026-05-03" {
		t.Fatalf("tasks = %#v", payload.Tasks)
	}

	updated, err := os.ReadFile(filepath.Join(vaultDir, "notes", "alpha.md"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if string(updated) != payload.RawMarkdown {
		t.Fatalf("written markdown = %q, payload rawMarkdown = %q", string(updated), payload.RawMarkdown)
	}

	derivedRequest := httptest.NewRequest(http.MethodGet, "/api/pages/notes/alpha/derived", nil)
	derivedRecorder := httptest.NewRecorder()
	router.ServeHTTP(derivedRecorder, derivedRequest)
	if derivedRecorder.Code != http.StatusOK {
		t.Fatalf("derived status = %d, body = %s", derivedRecorder.Code, derivedRecorder.Body.String())
	}

	var derivedPayload struct {
		LinkCounts map[string]int `json:"linkCounts"`
		TaskCounts map[string]int `json:"taskCounts"`
	}
	if err := json.Unmarshal(derivedRecorder.Body.Bytes(), &derivedPayload); err != nil {
		t.Fatalf("Unmarshal derived error = %v", err)
	}
	if derivedPayload.LinkCounts["outgoing"] != 1 || derivedPayload.TaskCounts["total"] != 1 || derivedPayload.TaskCounts["open"] != 1 {
		t.Fatalf("derived payload = %#v", derivedPayload)
	}
}

func TestDeletePageRemovesMarkdownAndIndexEntry(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte("# Alpha\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodDelete, "/api/pages/notes/alpha", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	if _, err := os.Stat(filepath.Join(vaultDir, "notes", "alpha.md")); !os.IsNotExist(err) {
		t.Fatalf("Stat() error = %v, want not exists", err)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/pages/notes/alpha", nil)
	getRecorder := httptest.NewRecorder()
	router.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusNotFound {
		t.Fatalf("get status = %d, body = %s", getRecorder.Code, getRecorder.Body.String())
	}
}

func TestDeleteFolderRemovesNestedMarkdownAndRebuildsIndex(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes", "team"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "team", "alpha.md"), []byte("# Alpha\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "team", "beta.md"), []byte("# Beta\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodDelete, "/api/folders/notes/team", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	if _, err := os.Stat(filepath.Join(vaultDir, "notes", "team")); !os.IsNotExist(err) {
		t.Fatalf("Stat() error = %v, want not exists", err)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/pages", nil)
	listRecorder := httptest.NewRecorder()
	router.ServeHTTP(listRecorder, listRequest)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", listRecorder.Code, listRecorder.Body.String())
	}

	var payload struct {
		Count int `json:"count"`
	}
	if err := json.Unmarshal(listRecorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if payload.Count != 0 {
		t.Fatalf("count = %d, want 0", payload.Count)
	}
}

func TestMoveFolderRenamesNestedMarkdownAndRebuildsIndex(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes", "team"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "archive"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "team", "alpha.md"), []byte("# Alpha\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodPost, "/api/folders/notes/team/move", strings.NewReader(`{"targetFolder":"archive"}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	if _, err := os.Stat(filepath.Join(vaultDir, "notes", "team")); !os.IsNotExist(err) {
		t.Fatalf("old Stat() error = %v, want not exists", err)
	}
	if _, err := os.Stat(filepath.Join(vaultDir, "archive", "team", "alpha.md")); err != nil {
		t.Fatalf("new Stat() error = %v", err)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/pages/archive/team/alpha", nil)
	getRecorder := httptest.NewRecorder()
	router.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("get status = %d, body = %s", getRecorder.Code, getRecorder.Body.String())
	}
}

func TestMovePageRenamesMarkdownAndReindexes(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := "---\n" +
		"title: Alpha\n" +
		"tags:\n" +
		"  - work\n" +
		"---\n" +
		"# Alpha\n\n" +
		"See [[notes/beta]].\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"targetPage":"projects/alpha-renamed"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/pages/notes/alpha/move", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	if _, err := os.Stat(filepath.Join(vaultDir, "notes", "alpha.md")); !os.IsNotExist(err) {
		t.Fatalf("old Stat() error = %v, want not exists", err)
	}
	updated, err := os.ReadFile(filepath.Join(vaultDir, "projects", "alpha-renamed.md"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if string(updated) != raw {
		t.Fatalf("updated markdown = %q, want %q", string(updated), raw)
	}

	var payload struct {
		Page  string `json:"page"`
		Title string `json:"title"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if payload.Page != "projects/alpha-renamed" || payload.Title != "Alpha" {
		t.Fatalf("payload = %#v", payload)
	}

	oldRequest := httptest.NewRequest(http.MethodGet, "/api/pages/notes/alpha", nil)
	oldRecorder := httptest.NewRecorder()
	router.ServeHTTP(oldRecorder, oldRequest)
	if oldRecorder.Code != http.StatusNotFound {
		t.Fatalf("old status = %d, body = %s", oldRecorder.Code, oldRecorder.Body.String())
	}

	newRequest := httptest.NewRequest(http.MethodGet, "/api/pages/projects/alpha-renamed", nil)
	newRecorder := httptest.NewRecorder()
	router.ServeHTTP(newRecorder, newRequest)
	if newRecorder.Code != http.StatusOK {
		t.Fatalf("new status = %d, body = %s", newRecorder.Code, newRecorder.Body.String())
	}
}

func TestPatchPageFrontmatterUpdatesMarkdownAndReindexes(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	raw := "---\n" +
		"title: Alpha\n" +
		"tags:\n" +
		"  - work\n" +
		"obsolete: true\n" +
		"---\n" +
		"# Alpha\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"set":{"title":"Updated Alpha","tags":["work","urgent"],"count":3},"remove":["obsolete"]}`)
	request := httptest.NewRequest(http.MethodPatch, "/api/pages/notes/alpha/frontmatter", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	updated, err := os.ReadFile(filepath.Join(vaultDir, "notes", "alpha.md"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	expected := "---\n" +
		"count: 3\n" +
		"tags:\n" +
		"  - work\n" +
		"  - urgent\n" +
		"title: Updated Alpha\n" +
		"---\n" +
		"# Alpha\n"
	if string(updated) != expected {
		t.Fatalf("updated markdown = %q, want %q", string(updated), expected)
	}

	var payload struct {
		Title       string         `json:"title"`
		Frontmatter map[string]any `json:"frontmatter"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if payload.Title != "Updated Alpha" {
		t.Fatalf("title = %#v", payload.Title)
	}
	if payload.Frontmatter["title"] != "Updated Alpha" || payload.Frontmatter["count"] != float64(3) {
		t.Fatalf("frontmatter = %#v", payload.Frontmatter)
	}
}

func TestPatchPageFrontmatterCreatesBlockWhenMissing(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte("# Alpha\n\nBody.\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"set":{"title":"Alpha","tags":["work"]}}`)
	request := httptest.NewRequest(http.MethodPatch, "/api/pages/notes/alpha/frontmatter", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	updated, err := os.ReadFile(filepath.Join(vaultDir, "notes", "alpha.md"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	expected := "---\n" +
		"tags:\n" +
		"  - work\n" +
		"title: Alpha\n" +
		"---\n" +
		"# Alpha\n\nBody.\n"
	if string(updated) != expected {
		t.Fatalf("updated markdown = %q, want %q", string(updated), expected)
	}
}

func TestPatchPageAppliesFrontmatterPatch(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte("# Alpha\n\nBody.\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"frontmatter":{"set":{"title":"Alpha","tags":["work"]}}}`)
	request := httptest.NewRequest(http.MethodPatch, "/api/pages/notes/alpha", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Title       string         `json:"title"`
		Frontmatter map[string]any `json:"frontmatter"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if payload.Title != "Alpha" || payload.Frontmatter["title"] != "Alpha" {
		t.Fatalf("payload = %#v", payload)
	}

	updated, err := os.ReadFile(filepath.Join(vaultDir, "notes", "alpha.md"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	expected := "---\n" +
		"tags:\n" +
		"  - work\n" +
		"title: Alpha\n" +
		"---\n" +
		"# Alpha\n\nBody.\n"
	if string(updated) != expected {
		t.Fatalf("updated markdown = %q, want %q", string(updated), expected)
	}
}

func TestPatchPageAppliesTitlePatch(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte("# Alpha\n\nBody.\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"title":"Renamed Alpha"}`)
	request := httptest.NewRequest(http.MethodPatch, "/api/pages/notes/alpha", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Title       string         `json:"title"`
		Frontmatter map[string]any `json:"frontmatter"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if payload.Title != "Renamed Alpha" || payload.Frontmatter["title"] != "Renamed Alpha" {
		t.Fatalf("payload = %#v", payload)
	}

	updated, err := os.ReadFile(filepath.Join(vaultDir, "notes", "alpha.md"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	expected := "---\n" +
		"title: Renamed Alpha\n" +
		"---\n" +
		"# Alpha\n\nBody.\n"
	if string(updated) != expected {
		t.Fatalf("updated markdown = %q, want %q", string(updated), expected)
	}
}

func TestPatchPageRemovesSemanticTitleAndFallsBackToHeading(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	raw := "---\n" +
		"title: Renamed Alpha\n" +
		"tags:\n" +
		"  - work\n" +
		"---\n" +
		"# Alpha\n\nBody.\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"title":""}`)
	request := httptest.NewRequest(http.MethodPatch, "/api/pages/notes/alpha", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Title       string         `json:"title"`
		Frontmatter map[string]any `json:"frontmatter"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if payload.Title != "Alpha" {
		t.Fatalf("title = %#v", payload.Title)
	}
	if _, ok := payload.Frontmatter["title"]; ok {
		t.Fatalf("frontmatter = %#v", payload.Frontmatter)
	}

	updated, err := os.ReadFile(filepath.Join(vaultDir, "notes", "alpha.md"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	expected := "---\n" +
		"tags:\n" +
		"  - work\n" +
		"---\n" +
		"# Alpha\n\nBody.\n"
	if string(updated) != expected {
		t.Fatalf("updated markdown = %q, want %q", string(updated), expected)
	}
}

func TestPatchPageAppliesTagsPatch(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte("# Alpha\n\nBody.\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"tags":["work","urgent"]}`)
	request := httptest.NewRequest(http.MethodPatch, "/api/pages/notes/alpha", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Frontmatter map[string]any `json:"frontmatter"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	tagsAny, ok := payload.Frontmatter["tags"].([]any)
	if !ok || len(tagsAny) != 2 || tagsAny[0] != "work" || tagsAny[1] != "urgent" {
		t.Fatalf("frontmatter tags = %#v", payload.Frontmatter["tags"])
	}

	updated, err := os.ReadFile(filepath.Join(vaultDir, "notes", "alpha.md"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	expected := "---\n" +
		"tags:\n" +
		"  - work\n" +
		"  - urgent\n" +
		"---\n" +
		"# Alpha\n\nBody.\n"
	if string(updated) != expected {
		t.Fatalf("updated markdown = %q, want %q", string(updated), expected)
	}
}

func TestPatchPageRemovesSemanticTags(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := "---\n" +
		"tags:\n" +
		"  - work\n" +
		"  - urgent\n" +
		"---\n" +
		"# Alpha\n\nBody.\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"tags":[]}`)
	request := httptest.NewRequest(http.MethodPatch, "/api/pages/notes/alpha", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Frontmatter map[string]any `json:"frontmatter"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if _, ok := payload.Frontmatter["tags"]; ok {
		t.Fatalf("frontmatter = %#v", payload.Frontmatter)
	}

	updated, err := os.ReadFile(filepath.Join(vaultDir, "notes", "alpha.md"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	expected := "# Alpha\n\nBody.\n"
	if string(updated) != expected {
		t.Fatalf("updated markdown = %q, want %q", string(updated), expected)
	}
}

func TestGetPageBacklinksReturnsSources(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "projects"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `---
title: Daily Note
---
See [[projects/alpha|Alpha]].
`,
		filepath.Join(vaultDir, "projects", "overview.md"): `# Overview

Reference [Alpha](projects/alpha.md).
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/pages/projects/alpha/backlinks", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Page      string `json:"page"`
		Backlinks []struct {
			SourcePage  string `json:"sourcePage"`
			SourceTitle string `json:"sourceTitle"`
			LinkText    string `json:"linkText"`
			Kind        string `json:"kind"`
			Line        int    `json:"line"`
		} `json:"backlinks"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Page != "projects/alpha" {
		t.Fatalf("page = %q", payload.Page)
	}
	if len(payload.Backlinks) != 2 {
		t.Fatalf("backlinks = %#v", payload.Backlinks)
	}
	if payload.Backlinks[0].SourcePage != "daily/today" || payload.Backlinks[0].SourceTitle != "Daily Note" || payload.Backlinks[0].LinkText != "Alpha" || payload.Backlinks[0].Kind != "wikilink" {
		t.Fatalf("first backlink = %#v", payload.Backlinks[0])
	}
	if payload.Backlinks[1].SourcePage != "projects/overview" || payload.Backlinks[1].SourceTitle != "Overview" || payload.Backlinks[1].LinkText != "Alpha" || payload.Backlinks[1].Kind != "markdown" {
		t.Fatalf("second backlink = %#v", payload.Backlinks[1])
	}
}

func TestGetPageBacklinksReturnsNotFoundForMissingPage(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/pages/missing/backlinks", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestGetPageDerivedReturnsFragments(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	files := map[string]string{
		filepath.Join(vaultDir, "notes", "alpha.md"): "# Alpha\n\n## Summary\n\nSee [[notes/beta]].\n\n### Tasks\n\n- [ ] Open task due:: 2026-05-01\n- [x] Done task\n\n```query id=open-tasks\nfrom tasks\nwhere done = false\norder by due\nselect ref, due\n```\n\n```query\nfrom unknown\nselect ref\n```\n",
		filepath.Join(vaultDir, "daily", "today.md"): `# Daily

Reference [[notes/alpha|Alpha]].
`,
		filepath.Join(vaultDir, "notes", "beta.md"): `# Beta
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/pages/notes/alpha/derived", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Page  string `json:"page"`
		Title string `json:"title"`
		TOC   []struct {
			Level  int    `json:"level"`
			Text   string `json:"text"`
			Anchor string `json:"anchor"`
			Line   int    `json:"line"`
		} `json:"toc"`
		Links []struct {
			TargetPage string `json:"targetPage"`
		} `json:"links"`
		Tasks []struct {
			Ref  string `json:"ref"`
			Done bool   `json:"done"`
		} `json:"tasks"`
		Backlinks []struct {
			SourcePage string `json:"sourcePage"`
		} `json:"backlinks"`
		QueryBlocks []struct {
			ID          string   `json:"id"`
			Key         string   `json:"key"`
			Source      string   `json:"source"`
			Line        int      `json:"line"`
			Error       string   `json:"error"`
			Datasets    []string `json:"datasets"`
			MatchPage   string   `json:"matchPage"`
			RowCount    int      `json:"rowCount"`
			RenderHint  string   `json:"renderHint"`
			Stale       bool     `json:"stale"`
			StalePage   string   `json:"stalePage"`
			StaleSince  string   `json:"staleSince"`
			StaleReason string   `json:"staleReason"`
			Result      struct {
				Query struct {
					From string `json:"from"`
				} `json:"query"`
				Columns []string `json:"columns"`
				Rows    []struct {
					Ref string `json:"ref"`
					Due string `json:"due"`
				} `json:"rows"`
			} `json:"result"`
		} `json:"queryBlocks"`
		LinkCounts map[string]int `json:"linkCounts"`
		TaskCounts map[string]int `json:"taskCounts"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Page != "notes/alpha" || payload.Title != "Alpha" {
		t.Fatalf("page/title = %#v / %#v", payload.Page, payload.Title)
	}
	if len(payload.TOC) != 3 {
		t.Fatalf("toc = %#v", payload.TOC)
	}
	if payload.TOC[0].Text != "Alpha" || payload.TOC[0].Level != 1 || payload.TOC[0].Anchor != "alpha" {
		t.Fatalf("first toc item = %#v", payload.TOC[0])
	}
	if payload.TOC[1].Text != "Summary" || payload.TOC[1].Level != 2 || payload.TOC[1].Anchor != "summary" {
		t.Fatalf("second toc item = %#v", payload.TOC[1])
	}
	if payload.TOC[2].Text != "Tasks" || payload.TOC[2].Level != 3 || payload.TOC[2].Anchor != "tasks" {
		t.Fatalf("third toc item = %#v", payload.TOC[2])
	}
	if len(payload.Links) != 1 || payload.Links[0].TargetPage != "notes/beta" {
		t.Fatalf("links = %#v", payload.Links)
	}
	if len(payload.Tasks) != 2 || payload.Tasks[0].Done || !payload.Tasks[1].Done {
		t.Fatalf("tasks = %#v", payload.Tasks)
	}
	if len(payload.Backlinks) != 1 || payload.Backlinks[0].SourcePage != "daily/today" {
		t.Fatalf("backlinks = %#v", payload.Backlinks)
	}
	if len(payload.QueryBlocks) != 2 {
		t.Fatalf("queryBlocks = %#v", payload.QueryBlocks)
	}
	if payload.QueryBlocks[0].ID != "open-tasks" || payload.QueryBlocks[0].Key == "" || payload.QueryBlocks[0].Line != 12 || payload.QueryBlocks[0].Error != "" || payload.QueryBlocks[0].Stale || payload.QueryBlocks[0].StaleReason != "" || payload.QueryBlocks[0].StaleSince != "" || payload.QueryBlocks[0].StalePage != "" || len(payload.QueryBlocks[0].Datasets) != 1 || payload.QueryBlocks[0].Datasets[0] != "tasks" || payload.QueryBlocks[0].MatchPage != "" || payload.QueryBlocks[0].RowCount != 1 || payload.QueryBlocks[0].RenderHint != "table" {
		t.Fatalf("first query block = %#v", payload.QueryBlocks[0])
	}
	if payload.QueryBlocks[0].Result.Query.From != "tasks" {
		t.Fatalf("first query block result = %#v", payload.QueryBlocks[0].Result)
	}
	if len(payload.QueryBlocks[0].Result.Columns) != 2 || payload.QueryBlocks[0].Result.Columns[0] != "ref" || payload.QueryBlocks[0].Result.Columns[1] != "due" {
		t.Fatalf("first query block columns = %#v", payload.QueryBlocks[0].Result.Columns)
	}
	if len(payload.QueryBlocks[0].Result.Rows) != 1 || payload.QueryBlocks[0].Result.Rows[0].Ref != "notes/alpha:9" || payload.QueryBlocks[0].Result.Rows[0].Due != "2026-05-01" {
		t.Fatalf("first query block rows = %#v", payload.QueryBlocks[0].Result.Rows)
	}
	if payload.QueryBlocks[1].Key == "" || payload.QueryBlocks[1].Line != 19 || payload.QueryBlocks[1].Error == "" || payload.QueryBlocks[1].Stale || payload.QueryBlocks[1].StaleReason != "" || payload.QueryBlocks[1].StaleSince != "" || payload.QueryBlocks[1].StalePage != "" || len(payload.QueryBlocks[1].Datasets) != 0 || payload.QueryBlocks[1].MatchPage != "" || payload.QueryBlocks[1].RowCount != 0 || payload.QueryBlocks[1].RenderHint != "error" {
		t.Fatalf("second query block = %#v", payload.QueryBlocks[1])
	}
	if payload.QueryBlocks[0].Key == payload.QueryBlocks[1].Key {
		t.Fatalf("query block keys should be distinct: %#v", payload.QueryBlocks)
	}
	if payload.LinkCounts["outgoing"] != 1 || payload.LinkCounts["backlinks"] != 1 {
		t.Fatalf("linkCounts = %#v", payload.LinkCounts)
	}
	if payload.TaskCounts["total"] != 2 || payload.TaskCounts["open"] != 1 || payload.TaskCounts["done"] != 1 {
		t.Fatalf("taskCounts = %#v", payload.TaskCounts)
	}
}

func TestGetQueryBlockReturnsSingleEnrichedBlock(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "notes"),
		filepath.Join(vaultDir, "daily"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "notes", "alpha.md"): "# Alpha\n\n## Summary\n\nSee [[notes/beta]].\n\n### Tasks\n\n- [ ] Open task due:: 2026-05-01\n- [x] Done task\n\n```query id=open-tasks\nfrom tasks\nwhere done = false\norder by due\nselect ref, due\n```\n",
		filepath.Join(vaultDir, "daily", "today.md"): `# Daily

Reference [[notes/alpha|Alpha]].
`,
		filepath.Join(vaultDir, "notes", "beta.md"): `# Beta
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	queryBlocks, err := indexService.GetQueryBlocks(context.Background(), "notes/alpha")
	if err != nil {
		t.Fatalf("GetQueryBlocks() error = %v", err)
	}
	if len(queryBlocks) != 1 {
		t.Fatalf("queryBlocks = %#v", queryBlocks)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault:  vaultService,
		Index:  indexService,
		Query:  queryService,
		Events: NewEventBroker(),
	})

	request := httptest.NewRequest(http.MethodGet, "/api/pages/notes/alpha/query-blocks/"+queryBlocks[0].BlockKey, nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Page       string `json:"page"`
		QueryBlock struct {
			ID         string   `json:"id"`
			Key        string   `json:"key"`
			Datasets   []string `json:"datasets"`
			MatchPage  string   `json:"matchPage"`
			RowCount   int      `json:"rowCount"`
			RenderHint string   `json:"renderHint"`
			Stale      bool     `json:"stale"`
		} `json:"queryBlock"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Page != "notes/alpha" {
		t.Fatalf("page = %#v", payload.Page)
	}
	if payload.QueryBlock.ID != "open-tasks" || payload.QueryBlock.Key != queryBlocks[0].BlockKey || len(payload.QueryBlock.Datasets) != 1 || payload.QueryBlock.Datasets[0] != "tasks" || payload.QueryBlock.MatchPage != "" || payload.QueryBlock.RowCount != 1 || payload.QueryBlock.RenderHint != "table" || payload.QueryBlock.Stale {
		t.Fatalf("queryBlock = %#v", payload.QueryBlock)
	}
}

func TestGetQueryBlockReturnsNotFoundForUnknownKey(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte("# Alpha\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/pages/notes/alpha/query-blocks/missing-key", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestGetQueryBlockByIDReturnsBlock(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "notes"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): "# Today\n\n- [ ] First task due:: 2026-05-01\n",
		filepath.Join(vaultDir, "notes", "alpha.md"): "# Alpha\n\n```query id=open-tasks\nfrom tasks\nselect ref\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/pages/notes/alpha/query-blocks/id/open-tasks", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Page       string `json:"page"`
		QueryBlock struct {
			ID         string `json:"id"`
			RowCount   int    `json:"rowCount"`
			RenderHint string `json:"renderHint"`
		} `json:"queryBlock"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Page != "notes/alpha" || payload.QueryBlock.ID != "open-tasks" || payload.QueryBlock.RowCount != 1 || payload.QueryBlock.RenderHint != "list" {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestGetQueryBlockByIDReturnsNotFoundForUnknownID(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte("# Alpha\n\n```query id=open-tasks\nfrom pages\nselect path\n```\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/pages/notes/alpha/query-blocks/id/missing", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestGetQueryBlocksReturnsCollection(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "notes"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): "# Today\n\n- [ ] First task due:: 2026-05-01\n",
		filepath.Join(vaultDir, "notes", "alpha.md"): "# Alpha\n\n```query id=open-tasks\nfrom tasks\nselect ref\n```\n\n```query\nfrom tasks\nwhere done = false\nselect ref, due\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault:  vaultService,
		Index:  indexService,
		Query:  queryService,
		Events: NewEventBroker(),
	})

	request := httptest.NewRequest(http.MethodGet, "/api/pages/notes/alpha/query-blocks", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Page        string `json:"page"`
		Count       int    `json:"count"`
		QueryBlocks []struct {
			ID         string   `json:"id"`
			Key        string   `json:"key"`
			Datasets   []string `json:"datasets"`
			RowCount   int      `json:"rowCount"`
			RenderHint string   `json:"renderHint"`
			Stale      bool     `json:"stale"`
		} `json:"queryBlocks"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Page != "notes/alpha" || payload.Count != 2 || len(payload.QueryBlocks) != 2 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.QueryBlocks[0].ID != "open-tasks" || payload.QueryBlocks[0].RowCount != 1 || payload.QueryBlocks[0].RenderHint != "list" || payload.QueryBlocks[0].Stale {
		t.Fatalf("first queryBlock = %#v", payload.QueryBlocks[0])
	}
	if payload.QueryBlocks[1].ID != "" || payload.QueryBlocks[1].RowCount != 1 || payload.QueryBlocks[1].RenderHint != "table" || payload.QueryBlocks[1].Stale || len(payload.QueryBlocks[1].Datasets) != 1 || payload.QueryBlocks[1].Datasets[0] != "tasks" {
		t.Fatalf("second queryBlock = %#v", payload.QueryBlocks[1])
	}
}

func TestRefreshQueryBlockRecomputesSingleBlock(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "dashboards"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"):      "# Today\n\n- [ ] First task due:: 2026-05-01\n",
		filepath.Join(vaultDir, "dashboards", "tasks.md"): "# Tasks\n\n```query id=open-tasks\nfrom tasks\nwhere page = \"daily/today\"\nselect ref, due\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	queryBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/tasks")
	if err != nil {
		t.Fatalf("GetQueryBlocks() error = %v", err)
	}
	if len(queryBlocks) != 1 {
		t.Fatalf("queryBlocks = %#v", queryBlocks)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault:  vaultService,
		Index:  indexService,
		Query:  queryService,
		Events: NewEventBroker(),
	})

	time.Sleep(2 * time.Millisecond)

	updatedTaskPage := filepath.Join(vaultDir, "daily", "today.md")
	if err := os.WriteFile(updatedTaskPage, []byte("# Today\n\n- [ ] First task due:: 2026-05-02\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated task page) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "daily/today"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/pages/dashboards/tasks/query-blocks/"+queryBlocks[0].BlockKey+"/refresh", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Page       string `json:"page"`
		QueryBlock struct {
			ID          string   `json:"id"`
			Key         string   `json:"key"`
			Datasets    []string `json:"datasets"`
			MatchPage   string   `json:"matchPage"`
			RowCount    int      `json:"rowCount"`
			RenderHint  string   `json:"renderHint"`
			Stale       bool     `json:"stale"`
			StalePage   string   `json:"stalePage"`
			StaleReason string   `json:"staleReason"`
			Result      struct {
				Rows []struct {
					Ref string `json:"ref"`
					Due string `json:"due"`
				} `json:"rows"`
			} `json:"result"`
		} `json:"queryBlock"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Page != "dashboards/tasks" {
		t.Fatalf("page = %#v", payload.Page)
	}
	if payload.QueryBlock.ID != "open-tasks" || payload.QueryBlock.Key != queryBlocks[0].BlockKey || len(payload.QueryBlock.Datasets) != 1 || payload.QueryBlock.Datasets[0] != "tasks" || payload.QueryBlock.MatchPage != "daily/today" || payload.QueryBlock.RowCount != 1 || payload.QueryBlock.RenderHint != "table" || payload.QueryBlock.Stale || payload.QueryBlock.StalePage != "" || payload.QueryBlock.StaleReason != "" {
		t.Fatalf("queryBlock = %#v", payload.QueryBlock)
	}
	if len(payload.QueryBlock.Result.Rows) != 1 || payload.QueryBlock.Result.Rows[0].Ref != "daily/today:3" || payload.QueryBlock.Result.Rows[0].Due != "2026-05-02" {
		t.Fatalf("queryBlock rows = %#v", payload.QueryBlock.Result.Rows)
	}
}

func TestRefreshQueryBlockByIDRecomputesSingleBlock(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "dashboards"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"):      "# Today\n\n- [ ] First task due:: 2026-05-01\n",
		filepath.Join(vaultDir, "dashboards", "tasks.md"): "# Tasks\n\n```query id=open-tasks\nfrom tasks\nwhere page = \"daily/today\"\nselect ref, due\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault:  vaultService,
		Index:  indexService,
		Query:  queryService,
		Events: NewEventBroker(),
	})

	time.Sleep(2 * time.Millisecond)

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task due:: 2026-05-02\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated task page) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "daily/today"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/pages/dashboards/tasks/query-blocks/id/open-tasks/refresh", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Page       string `json:"page"`
		QueryBlock struct {
			ID         string `json:"id"`
			RowCount   int    `json:"rowCount"`
			RenderHint string `json:"renderHint"`
			Result     struct {
				Rows []struct {
					Ref string `json:"ref"`
					Due string `json:"due"`
				} `json:"rows"`
			} `json:"result"`
		} `json:"queryBlock"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if payload.Page != "dashboards/tasks" || payload.QueryBlock.ID != "open-tasks" || payload.QueryBlock.RowCount != 1 || payload.QueryBlock.RenderHint != "table" {
		t.Fatalf("payload = %#v", payload)
	}
	if len(payload.QueryBlock.Result.Rows) != 1 || payload.QueryBlock.Result.Rows[0].Ref != "daily/today:3" || payload.QueryBlock.Result.Rows[0].Due != "2026-05-02" {
		t.Fatalf("rows = %#v", payload.QueryBlock.Result.Rows)
	}
}

func TestRefreshAllQueryBlocksRecomputesPage(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "dashboards"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"):      "# Today\n\n- [ ] First task due:: 2026-05-01\n",
		filepath.Join(vaultDir, "dashboards", "tasks.md"): "# Tasks\n\n```query id=open-tasks\nfrom tasks\nwhere page = \"daily/today\"\nselect ref\n```\n\n```query\nfrom tasks\nwhere page = \"daily/today\"\nselect ref, due\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault:  vaultService,
		Index:  indexService,
		Query:  queryService,
		Events: NewEventBroker(),
	})

	time.Sleep(2 * time.Millisecond)

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task due:: 2026-05-02\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated task page) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "daily/today"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/pages/dashboards/tasks/query-blocks/refresh", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Page        string `json:"page"`
		Count       int    `json:"count"`
		QueryBlocks []struct {
			ID         string `json:"id"`
			RowCount   int    `json:"rowCount"`
			RenderHint string `json:"renderHint"`
			Result     struct {
				Rows []map[string]any `json:"rows"`
			} `json:"result"`
		} `json:"queryBlocks"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Page != "dashboards/tasks" || payload.Count != 2 || len(payload.QueryBlocks) != 2 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.QueryBlocks[0].ID != "open-tasks" || payload.QueryBlocks[0].RowCount != 1 || payload.QueryBlocks[0].RenderHint != "list" {
		t.Fatalf("first queryBlock = %#v", payload.QueryBlocks[0])
	}
	if payload.QueryBlocks[1].ID != "" || payload.QueryBlocks[1].RowCount != 1 || payload.QueryBlocks[1].RenderHint != "table" {
		t.Fatalf("second queryBlock = %#v", payload.QueryBlocks[1])
	}
	if len(payload.QueryBlocks[1].Result.Rows) != 1 || payload.QueryBlocks[1].Result.Rows[0]["due"] != "2026-05-02" {
		t.Fatalf("rows = %#v", payload.QueryBlocks[1].Result.Rows)
	}
}

func TestGetTasksReturnsIndexedTasks(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "projects"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First task due:: 2026-05-01 who:: [Ralf]
- [x] Done task
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Second task who:: [Mina]
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/tasks", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Count   int `json:"count"`
		Summary struct {
			Total      int `json:"total"`
			Open       int `json:"open"`
			Done       int `json:"done"`
			WithDue    int `json:"withDue"`
			WithoutDue int `json:"withoutDue"`
		} `json:"summary"`
		Tasks []struct {
			Ref  string   `json:"ref"`
			Page string   `json:"page"`
			Due  string   `json:"due"`
			Who  []string `json:"who"`
			Done bool     `json:"done"`
		} `json:"tasks"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Count != 3 || len(payload.Tasks) != 3 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Summary.Total != 3 || payload.Summary.Open != 2 || payload.Summary.Done != 1 || payload.Summary.WithDue != 1 || payload.Summary.WithoutDue != 2 {
		t.Fatalf("summary = %#v", payload.Summary)
	}
	if payload.Tasks[0].Ref != "daily/today:3" || payload.Tasks[0].Due != "2026-05-01" || payload.Tasks[0].Done {
		t.Fatalf("first task = %#v", payload.Tasks[0])
	}
	if len(payload.Tasks[0].Who) != 1 || payload.Tasks[0].Who[0] != "Ralf" {
		t.Fatalf("first task who = %#v", payload.Tasks[0].Who)
	}
	if payload.Tasks[1].Ref != "projects/alpha:3" || payload.Tasks[1].Page != "projects/alpha" || payload.Tasks[1].Done {
		t.Fatalf("second task = %#v", payload.Tasks[1])
	}
	if len(payload.Tasks[1].Who) != 1 || payload.Tasks[1].Who[0] != "Mina" {
		t.Fatalf("second task who = %#v", payload.Tasks[1].Who)
	}
	if payload.Tasks[2].Ref != "daily/today:4" || !payload.Tasks[2].Done {
		t.Fatalf("third task = %#v", payload.Tasks[2])
	}
}

func TestGetTasksFiltersByQueryAndState(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "projects"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] Alpha follow-up due:: 2026-05-01 who:: [Ralf]
- [x] Done alpha cleanup
`,
		filepath.Join(vaultDir, "projects", "beta.md"): `# Beta

- [ ] Beta task who:: [Mina]
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/tasks?q=alpha&state=open&who=ralf", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query   string `json:"query"`
		State   string `json:"state"`
		Who     string `json:"who"`
		Count   int    `json:"count"`
		Summary struct {
			Total      int `json:"total"`
			Open       int `json:"open"`
			Done       int `json:"done"`
			WithDue    int `json:"withDue"`
			WithoutDue int `json:"withoutDue"`
		} `json:"summary"`
		Tasks []struct {
			Ref  string `json:"ref"`
			Text string `json:"text"`
			Done bool   `json:"done"`
		} `json:"tasks"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Query != "alpha" || payload.State != "open" || payload.Who != "ralf" || payload.Count != 1 || len(payload.Tasks) != 1 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Summary.Total != 1 || payload.Summary.Open != 1 || payload.Summary.Done != 0 || payload.Summary.WithDue != 1 || payload.Summary.WithoutDue != 0 {
		t.Fatalf("summary = %#v", payload.Summary)
	}
	if payload.Tasks[0].Ref != "daily/today:3" || payload.Tasks[0].Text != "Alpha follow-up" || payload.Tasks[0].Done {
		t.Fatalf("task = %#v", payload.Tasks[0])
	}
}

func TestGetLinksReturnsIndexedLinks(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "notes"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "notes", "alpha.md"): `# Alpha

See [[projects/beta]] and [Gamma](projects/gamma.md).
`,
		filepath.Join(vaultDir, "projects", "beta.md"):  "# Beta\n",
		filepath.Join(vaultDir, "projects", "gamma.md"): "# Gamma\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/links", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Count   int `json:"count"`
		Summary struct {
			Total     int `json:"total"`
			Wikilink  int `json:"wikilink"`
			Markdown  int `json:"markdown"`
			OtherKind int `json:"otherKind"`
		} `json:"summary"`
		Links []struct {
			SourcePage string `json:"sourcePage"`
			TargetPage string `json:"targetPage"`
			LinkText   string `json:"linkText"`
			Kind       string `json:"kind"`
			Line       int    `json:"line"`
		} `json:"links"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Count != 2 || len(payload.Links) != 2 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Summary.Total != 2 || payload.Summary.Wikilink != 1 || payload.Summary.Markdown != 1 || payload.Summary.OtherKind != 0 {
		t.Fatalf("summary = %#v", payload.Summary)
	}
	if payload.Links[0].SourcePage != "notes/alpha" || payload.Links[0].TargetPage != "projects/beta" || payload.Links[0].Kind != "wikilink" {
		t.Fatalf("first link = %#v", payload.Links[0])
	}
	if payload.Links[1].SourcePage != "notes/alpha" || payload.Links[1].TargetPage != "projects/gamma" || payload.Links[1].Kind != "markdown" {
		t.Fatalf("second link = %#v", payload.Links[1])
	}
}

func TestGetLinksFiltersByQueryAndFields(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "notes"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "notes", "alpha.md"): `# Alpha

See [[projects/beta]] and [Gamma](projects/gamma.md).
`,
		filepath.Join(vaultDir, "projects", "beta.md"):  "# Beta\n",
		filepath.Join(vaultDir, "projects", "gamma.md"): "# Gamma\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/links?q=gamma&sourcePage=notes/alpha&targetPage=projects/gamma&kind=markdown", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query      string `json:"query"`
		SourcePage string `json:"sourcePage"`
		TargetPage string `json:"targetPage"`
		Kind       string `json:"kind"`
		Count      int    `json:"count"`
		Summary    struct {
			Total     int `json:"total"`
			Wikilink  int `json:"wikilink"`
			Markdown  int `json:"markdown"`
			OtherKind int `json:"otherKind"`
		} `json:"summary"`
		Links []struct {
			TargetPage string `json:"targetPage"`
			Kind       string `json:"kind"`
		} `json:"links"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Query != "gamma" || payload.SourcePage != "notes/alpha" || payload.TargetPage != "projects/gamma" || payload.Kind != "markdown" {
		t.Fatalf("filters = %#v", payload)
	}
	if payload.Count != 1 || len(payload.Links) != 1 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Summary.Total != 1 || payload.Summary.Wikilink != 0 || payload.Summary.Markdown != 1 || payload.Summary.OtherKind != 0 {
		t.Fatalf("summary = %#v", payload.Summary)
	}
	if payload.Links[0].TargetPage != "projects/gamma" || payload.Links[0].Kind != "markdown" {
		t.Fatalf("link = %#v", payload.Links[0])
	}
}

func TestSavedQueryCRUDAndFiltering(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	createBody, err := json.Marshal(map[string]any{
		"name":        "open-tasks",
		"title":       "Open Tasks",
		"description": "All unfinished tasks",
		"folder":      "dashboards/tasks",
		"tags":        []string{"work", "ops"},
		"query":       "from tasks\nwhere done = false\nselect ref, page",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	createRequest := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(createBody))
	createRequest.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()
	router.ServeHTTP(createRecorder, createRequest)

	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createRecorder.Code, createRecorder.Body.String())
	}

	var created struct {
		Name        string   `json:"name"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Folder      string   `json:"folder"`
		Tags        []string `json:"tags"`
		Query       string   `json:"query"`
		CreatedAt   string   `json:"createdAt"`
		UpdatedAt   string   `json:"updatedAt"`
	}
	if err := json.Unmarshal(createRecorder.Body.Bytes(), &created); err != nil {
		t.Fatalf("Unmarshal(created) error = %v", err)
	}

	if created.Name != "open-tasks" || created.Title != "Open Tasks" || created.Description != "All unfinished tasks" || created.Folder != "dashboards/tasks" || !reflect.DeepEqual(created.Tags, []string{"work", "ops"}) || created.Query == "" || created.CreatedAt == "" || created.UpdatedAt == "" {
		t.Fatalf("created = %#v", created)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/queries/open-tasks", nil)
	getRecorder := httptest.NewRecorder()
	router.ServeHTTP(getRecorder, getRequest)

	if getRecorder.Code != http.StatusOK {
		t.Fatalf("get status = %d, body = %s", getRecorder.Code, getRecorder.Body.String())
	}

	var fetched struct {
		Name        string   `json:"name"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Folder      string   `json:"folder"`
		Tags        []string `json:"tags"`
		Query       string   `json:"query"`
	}
	if err := json.Unmarshal(getRecorder.Body.Bytes(), &fetched); err != nil {
		t.Fatalf("Unmarshal(fetched) error = %v", err)
	}

	if fetched.Name != "open-tasks" || fetched.Title != "Open Tasks" || fetched.Description != "All unfinished tasks" || fetched.Folder != "dashboards/tasks" || !reflect.DeepEqual(fetched.Tags, []string{"work", "ops"}) {
		t.Fatalf("fetched = %#v", fetched)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/queries?q=unfinished&folder=dashboards/tasks&tag=ops", nil)
	listRecorder := httptest.NewRecorder()
	router.ServeHTTP(listRecorder, listRequest)

	if listRecorder.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", listRecorder.Code, listRecorder.Body.String())
	}

	var listed struct {
		Query   string `json:"query"`
		Folder  string `json:"folder"`
		Tag     string `json:"tag"`
		Count   int    `json:"count"`
		Queries []struct {
			Name        string   `json:"name"`
			Title       string   `json:"title"`
			Description string   `json:"description"`
			Folder      string   `json:"folder"`
			Tags        []string `json:"tags"`
		} `json:"queries"`
	}
	if err := json.Unmarshal(listRecorder.Body.Bytes(), &listed); err != nil {
		t.Fatalf("Unmarshal(listed) error = %v", err)
	}

	if listed.Query != "unfinished" || listed.Folder != "dashboards/tasks" || listed.Tag != "ops" || listed.Count != 1 || len(listed.Queries) != 1 {
		t.Fatalf("listed = %#v", listed)
	}
	if listed.Queries[0].Name != "open-tasks" || listed.Queries[0].Title != "Open Tasks" || listed.Queries[0].Folder != "dashboards/tasks" || !reflect.DeepEqual(listed.Queries[0].Tags, []string{"work", "ops"}) {
		t.Fatalf("listed query = %#v", listed.Queries[0])
	}

	updateBody, err := json.Marshal(map[string]any{
		"title":       "Pending Tasks",
		"description": "Open task dashboard",
		"folder":      "dashboards/ops",
		"tags":        []string{"ops", "urgent"},
		"query":       "from tasks\nwhere done = false\norder by due\nselect ref, due",
	})
	if err != nil {
		t.Fatalf("Marshal(update) error = %v", err)
	}

	updateRequest := httptest.NewRequest(http.MethodPut, "/api/queries/open-tasks", bytes.NewReader(updateBody))
	updateRequest.Header.Set("Content-Type", "application/json")
	updateRecorder := httptest.NewRecorder()
	router.ServeHTTP(updateRecorder, updateRequest)

	if updateRecorder.Code != http.StatusOK {
		t.Fatalf("update status = %d, body = %s", updateRecorder.Code, updateRecorder.Body.String())
	}

	var updated struct {
		Name        string   `json:"name"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Folder      string   `json:"folder"`
		Tags        []string `json:"tags"`
		Query       string   `json:"query"`
	}
	if err := json.Unmarshal(updateRecorder.Body.Bytes(), &updated); err != nil {
		t.Fatalf("Unmarshal(updated) error = %v", err)
	}

	if updated.Name != "open-tasks" || updated.Title != "Pending Tasks" || updated.Description != "Open task dashboard" || updated.Folder != "dashboards/ops" || !reflect.DeepEqual(updated.Tags, []string{"ops", "urgent"}) || !strings.Contains(updated.Query, "order by due") {
		t.Fatalf("updated = %#v", updated)
	}

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/queries/open-tasks", nil)
	deleteRecorder := httptest.NewRecorder()
	router.ServeHTTP(deleteRecorder, deleteRequest)

	if deleteRecorder.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, body = %s", deleteRecorder.Code, deleteRecorder.Body.String())
	}

	missingRequest := httptest.NewRequest(http.MethodGet, "/api/queries/open-tasks", nil)
	missingRecorder := httptest.NewRecorder()
	router.ServeHTTP(missingRecorder, missingRequest)

	if missingRecorder.Code != http.StatusNotFound {
		t.Fatalf("missing status = %d, body = %s", missingRecorder.Code, missingRecorder.Body.String())
	}
}

func TestCreateSavedQueryRequiresName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"title": "Missing Name",
		"query": "from tasks\nselect ref",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestGetSavedQueryFacetsReturnsFolderAndTagCounts(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	for _, payload := range []map[string]any{
		{
			"name":        "open-tasks",
			"title":       "Open Tasks",
			"description": "Ops dashboard",
			"folder":      "dashboards/tasks",
			"tags":        []string{"ops", "work"},
			"query":       "from tasks\nwhere done = false\nselect ref",
		},
		{
			"name":        "urgent-tasks",
			"title":       "Urgent Tasks",
			"description": "Urgent ops dashboard",
			"folder":      "dashboards/tasks",
			"tags":        []string{"ops", "urgent"},
			"query":       "from tasks\nwhere done = false\nselect ref, due",
		},
		{
			"name":        "page-links",
			"title":       "Page Links",
			"description": "Reference links",
			"folder":      "reference/links",
			"tags":        []string{"reference"},
			"query":       "from links\nselect sourcePage, targetPage",
		},
	} {
		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("Marshal() error = %v", err)
		}
		request := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(bodyBytes))
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusCreated {
			t.Fatalf("create status = %d, body = %s", recorder.Code, recorder.Body.String())
		}
	}

	request := httptest.NewRequest(http.MethodGet, "/api/queries/facets?q=dashboard&tag=ops", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query   string `json:"query"`
		Tag     string `json:"tag"`
		Count   int    `json:"count"`
		Folders []struct {
			Folder string `json:"folder"`
			Count  int    `json:"count"`
		} `json:"folders"`
		Tags []struct {
			Tag   string `json:"tag"`
			Count int    `json:"count"`
		} `json:"tags"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Query != "dashboard" || payload.Tag != "ops" || payload.Count != 2 {
		t.Fatalf("payload = %#v", payload)
	}
	if len(payload.Folders) != 1 || payload.Folders[0].Folder != "dashboards/tasks" || payload.Folders[0].Count != 2 {
		t.Fatalf("folders = %#v", payload.Folders)
	}
	if len(payload.Tags) != 3 {
		t.Fatalf("tags = %#v", payload.Tags)
	}
	if payload.Tags[0].Tag != "ops" || payload.Tags[0].Count != 2 {
		t.Fatalf("first tag = %#v", payload.Tags[0])
	}
	if payload.Tags[1].Count != 1 || payload.Tags[2].Count != 1 {
		t.Fatalf("tags = %#v", payload.Tags)
	}
}

func TestGetSavedQueryTreeReturnsGroupedFolders(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	for _, payload := range []map[string]any{
		{
			"name":        "open-tasks",
			"title":       "Open Tasks",
			"description": "Ops dashboard",
			"folder":      "dashboards/tasks",
			"tags":        []string{"ops", "work"},
			"query":       "from tasks\nwhere done = false\nselect ref",
		},
		{
			"name":        "urgent-tasks",
			"title":       "Urgent Tasks",
			"description": "Urgent ops dashboard",
			"folder":      "dashboards/tasks",
			"tags":        []string{"ops", "urgent"},
			"query":       "from tasks\nwhere done = false\nselect ref, due",
		},
		{
			"name":        "page-links",
			"title":       "Page Links",
			"description": "Reference links",
			"folder":      "reference/links",
			"tags":        []string{"reference"},
			"query":       "from links\nselect sourcePage, targetPage",
		},
		{
			"name":        "scratch",
			"title":       "Scratch",
			"description": "Loose query",
			"tags":        []string{"adhoc"},
			"query":       "from pages\nselect path",
		},
	} {
		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("Marshal() error = %v", err)
		}
		request := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(bodyBytes))
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusCreated {
			t.Fatalf("create status = %d, body = %s", recorder.Code, recorder.Body.String())
		}
	}

	request := httptest.NewRequest(http.MethodGet, "/api/queries/tree?q=query", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query   string `json:"query"`
		Count   int    `json:"count"`
		Folders []struct {
			Folder  string `json:"folder"`
			Count   int    `json:"count"`
			Queries []struct {
				Name        string   `json:"name"`
				Title       string   `json:"title"`
				Description string   `json:"description"`
				Folder      string   `json:"folder"`
				Tags        []string `json:"tags"`
			} `json:"queries"`
		} `json:"folders"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Query != "query" || payload.Count != 1 || len(payload.Folders) != 1 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Folders[0].Folder != "" || payload.Folders[0].Count != 1 || len(payload.Folders[0].Queries) != 1 {
		t.Fatalf("folders = %#v", payload.Folders)
	}
	if payload.Folders[0].Queries[0].Name != "scratch" || payload.Folders[0].Queries[0].Title != "Scratch" || payload.Folders[0].Queries[0].Folder != "" || !reflect.DeepEqual(payload.Folders[0].Queries[0].Tags, []string{"adhoc"}) {
		t.Fatalf("query = %#v", payload.Folders[0].Queries[0])
	}

	request = httptest.NewRequest(http.MethodGet, "/api/queries/tree?tag=ops", nil)
	recorder = httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("filtered status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal(filtered) error = %v", err)
	}

	if payload.Count != 2 || len(payload.Folders) != 1 {
		t.Fatalf("filtered payload = %#v", payload)
	}
	if payload.Folders[0].Folder != "dashboards/tasks" || payload.Folders[0].Count != 2 || len(payload.Folders[0].Queries) != 2 {
		t.Fatalf("filtered folders = %#v", payload.Folders)
	}
	if payload.Folders[0].Queries[0].Name != "open-tasks" || payload.Folders[0].Queries[1].Name != "urgent-tasks" {
		t.Fatalf("filtered queries = %#v", payload.Folders[0].Queries)
	}
}

func TestBulkPatchSavedQueriesUpdatesFolderAndTags(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	for _, payload := range []map[string]any{
		{
			"name":        "open-tasks",
			"title":       "Open Tasks",
			"description": "Ops dashboard",
			"folder":      "dashboards/tasks",
			"tags":        []string{"ops", "work"},
			"query":       "from tasks\nwhere done = false\nselect ref",
		},
		{
			"name":        "urgent-tasks",
			"title":       "Urgent Tasks",
			"description": "Urgent ops dashboard",
			"folder":      "dashboards/tasks",
			"tags":        []string{"ops", "urgent"},
			"query":       "from tasks\nwhere done = false\nselect ref, due",
		},
		{
			"name":        "page-links",
			"title":       "Page Links",
			"description": "Reference links",
			"folder":      "reference/links",
			"tags":        []string{"reference"},
			"query":       "from links\nselect sourcePage, targetPage",
		},
	} {
		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("Marshal() error = %v", err)
		}
		request := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(bodyBytes))
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusCreated {
			t.Fatalf("create status = %d, body = %s", recorder.Code, recorder.Body.String())
		}
	}

	bodyBytes, err := json.Marshal(map[string]any{
		"names":  []string{"open-tasks", "urgent-tasks"},
		"folder": "dashboards/ops",
		"tags":   []string{"ops", "triage"},
	})
	if err != nil {
		t.Fatalf("Marshal(patch) error = %v", err)
	}

	request := httptest.NewRequest(http.MethodPatch, "/api/queries", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Count   int `json:"count"`
		Queries []struct {
			Name   string   `json:"name"`
			Folder string   `json:"folder"`
			Tags   []string `json:"tags"`
		} `json:"queries"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Count != 2 || len(payload.Queries) != 2 {
		t.Fatalf("payload = %#v", payload)
	}
	for _, savedQuery := range payload.Queries {
		if savedQuery.Folder != "dashboards/ops" || !reflect.DeepEqual(savedQuery.Tags, []string{"ops", "triage"}) {
			t.Fatalf("savedQuery = %#v", savedQuery)
		}
	}

	request = httptest.NewRequest(http.MethodGet, "/api/queries?folder=dashboards/ops&tag=triage", nil)
	recorder = httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("filtered status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var filtered struct {
		Count   int `json:"count"`
		Queries []struct {
			Name string `json:"name"`
		} `json:"queries"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &filtered); err != nil {
		t.Fatalf("Unmarshal(filtered) error = %v", err)
	}

	if filtered.Count != 2 || len(filtered.Queries) != 2 {
		t.Fatalf("filtered = %#v", filtered)
	}
	if filtered.Queries[0].Name != "open-tasks" || filtered.Queries[1].Name != "urgent-tasks" {
		t.Fatalf("filtered queries = %#v", filtered.Queries)
	}
}

func TestBulkPatchSavedQueriesRequiresNamesAndChanges(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	for _, payload := range []map[string]any{
		{},
		{"names": []string{"open-tasks"}},
	} {
		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("Marshal() error = %v", err)
		}
		request := httptest.NewRequest(http.MethodPatch, "/api/queries", bytes.NewReader(bodyBytes))
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("payload=%#v status = %d, body = %s", payload, recorder.Code, recorder.Body.String())
		}
	}
}

func TestExecuteSavedQueryByName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := "# Today\n\n- [ ] First task due:: 2026-05-01\n- [x] Done task\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	createBody, err := json.Marshal(map[string]string{
		"name":        "open-tasks",
		"title":       "Open Tasks",
		"description": "Saved query for unfinished tasks",
		"query":       "from tasks\nwhere done = false\nselect ref, done",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	createRequest := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(createBody))
	createRequest.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()
	router.ServeHTTP(createRecorder, createRequest)

	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createRecorder.Code, createRecorder.Body.String())
	}

	executeRequest := httptest.NewRequest(http.MethodPost, "/api/queries/open-tasks/execute", nil)
	executeRecorder := httptest.NewRecorder()
	router.ServeHTTP(executeRecorder, executeRequest)

	if executeRecorder.Code != http.StatusOK {
		t.Fatalf("execute status = %d, body = %s", executeRecorder.Code, executeRecorder.Body.String())
	}

	var payload struct {
		Name        string `json:"name"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Query       string `json:"query"`
		Result      struct {
			Columns []string         `json:"columns"`
			Rows    []map[string]any `json:"rows"`
		} `json:"result"`
	}
	if err := json.Unmarshal(executeRecorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Name != "open-tasks" || payload.Title != "Open Tasks" || payload.Description != "Saved query for unfinished tasks" {
		t.Fatalf("payload = %#v", payload)
	}
	if !reflect.DeepEqual(payload.Result.Columns, []string{"ref", "done"}) {
		t.Fatalf("columns = %#v", payload.Result.Columns)
	}
	if len(payload.Result.Rows) != 1 {
		t.Fatalf("rows = %#v", payload.Result.Rows)
	}
	if payload.Result.Rows[0]["ref"] != "daily/today:3" || payload.Result.Rows[0]["done"] != false {
		t.Fatalf("row = %#v", payload.Result.Rows[0])
	}
}

func TestExecuteSavedQueryReturnsNotFoundForMissingName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodPost, "/api/queries/missing/execute", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestSavedQueryWorkbenchByName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := "# Today\n\n- [ ] First task due:: 2026-05-01\n- [ ] Second task due:: 2026-05-02\n- [ ] Third task due:: 2026-05-03\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	createBody, err := json.Marshal(map[string]string{
		"name":        "open-tasks",
		"title":       "Open Tasks",
		"description": "Saved workbench query",
		"query":       "from tasks\nwhere done = false\norder by due\nselect ref, due",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	createRequest := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(createBody))
	createRequest.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()
	router.ServeHTTP(createRecorder, createRequest)

	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createRecorder.Code, createRecorder.Body.String())
	}

	workbenchBody, err := json.Marshal(map[string]any{
		"previewLimit": 2,
	})
	if err != nil {
		t.Fatalf("Marshal(workbench) error = %v", err)
	}

	workbenchRequest := httptest.NewRequest(http.MethodPost, "/api/queries/open-tasks/workbench", bytes.NewReader(workbenchBody))
	workbenchRequest.Header.Set("Content-Type", "application/json")
	workbenchRecorder := httptest.NewRecorder()
	router.ServeHTTP(workbenchRecorder, workbenchRequest)

	if workbenchRecorder.Code != http.StatusOK {
		t.Fatalf("workbench status = %d, body = %s", workbenchRecorder.Code, workbenchRecorder.Body.String())
	}

	var payload struct {
		Name        string `json:"name"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Query       string `json:"query"`
		Workbench   struct {
			Analyze struct {
				Valid   bool   `json:"valid"`
				Dataset string `json:"dataset"`
			} `json:"analyze"`
			Plan struct {
				Valid bool   `json:"valid"`
				Mode  string `json:"mode"`
			} `json:"plan"`
			Preview struct {
				Valid     bool     `json:"valid"`
				Count     int      `json:"count"`
				Limit     int      `json:"limit"`
				Truncated bool     `json:"truncated"`
				Columns   []string `json:"columns"`
			} `json:"preview"`
			Count struct {
				Valid bool `json:"valid"`
				Count int  `json:"count"`
			} `json:"count"`
		} `json:"workbench"`
	}
	if err := json.Unmarshal(workbenchRecorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Name != "open-tasks" || payload.Title != "Open Tasks" || payload.Description != "Saved workbench query" {
		t.Fatalf("payload = %#v", payload)
	}
	if !payload.Workbench.Analyze.Valid || payload.Workbench.Analyze.Dataset != "tasks" {
		t.Fatalf("analyze = %#v", payload.Workbench.Analyze)
	}
	if !payload.Workbench.Plan.Valid || payload.Workbench.Plan.Mode != "rows" {
		t.Fatalf("plan = %#v", payload.Workbench.Plan)
	}
	if !payload.Workbench.Preview.Valid || payload.Workbench.Preview.Count != 2 || payload.Workbench.Preview.Limit != 2 || !payload.Workbench.Preview.Truncated {
		t.Fatalf("preview = %#v", payload.Workbench.Preview)
	}
	if !reflect.DeepEqual(payload.Workbench.Preview.Columns, []string{"ref", "due"}) {
		t.Fatalf("preview columns = %#v", payload.Workbench.Preview.Columns)
	}
	if !payload.Workbench.Count.Valid || payload.Workbench.Count.Count != 3 {
		t.Fatalf("count = %#v", payload.Workbench.Count)
	}
}

func TestSavedQueryWorkbenchReturnsNotFoundForMissingName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodPost, "/api/queries/missing/workbench", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestSavedQueryPreviewByName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := "# Today\n\n- [ ] First task due:: 2026-05-01\n- [ ] Second task due:: 2026-05-02\n- [ ] Third task due:: 2026-05-03\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	createBody, err := json.Marshal(map[string]string{
		"name":        "open-tasks",
		"title":       "Open Tasks",
		"description": "Saved preview query",
		"query":       "from tasks\nwhere done = false\norder by due\nselect ref, due",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	createRequest := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(createBody))
	createRequest.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()
	router.ServeHTTP(createRecorder, createRequest)

	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createRecorder.Code, createRecorder.Body.String())
	}

	previewBody, err := json.Marshal(map[string]any{
		"limit": 2,
	})
	if err != nil {
		t.Fatalf("Marshal(preview) error = %v", err)
	}

	previewRequest := httptest.NewRequest(http.MethodPost, "/api/queries/open-tasks/preview", bytes.NewReader(previewBody))
	previewRequest.Header.Set("Content-Type", "application/json")
	previewRecorder := httptest.NewRecorder()
	router.ServeHTTP(previewRecorder, previewRequest)

	if previewRecorder.Code != http.StatusOK {
		t.Fatalf("preview status = %d, body = %s", previewRecorder.Code, previewRecorder.Body.String())
	}

	var payload struct {
		Name        string `json:"name"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Query       string `json:"query"`
		Preview     struct {
			Valid     bool     `json:"valid"`
			Count     int      `json:"count"`
			Limit     int      `json:"limit"`
			Truncated bool     `json:"truncated"`
			Columns   []string `json:"columns"`
		} `json:"preview"`
	}
	if err := json.Unmarshal(previewRecorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Name != "open-tasks" || payload.Title != "Open Tasks" || payload.Description != "Saved preview query" {
		t.Fatalf("payload = %#v", payload)
	}
	if !payload.Preview.Valid || payload.Preview.Count != 2 || payload.Preview.Limit != 2 || !payload.Preview.Truncated {
		t.Fatalf("preview = %#v", payload.Preview)
	}
	if !reflect.DeepEqual(payload.Preview.Columns, []string{"ref", "due"}) {
		t.Fatalf("preview columns = %#v", payload.Preview.Columns)
	}
}

func TestSavedQueryCountByName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := "# Today\n\n- [ ] First task due:: 2026-05-01\n- [ ] Second task due:: 2026-05-02\n- [ ] Third task due:: 2026-05-03\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	createBody, err := json.Marshal(map[string]string{
		"name":        "open-tasks",
		"title":       "Open Tasks",
		"description": "Saved count query",
		"query":       "from tasks\nwhere done = false\nselect ref, due",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	createRequest := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(createBody))
	createRequest.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()
	router.ServeHTTP(createRecorder, createRequest)

	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createRecorder.Code, createRecorder.Body.String())
	}

	countRequest := httptest.NewRequest(http.MethodPost, "/api/queries/open-tasks/count", nil)
	countRecorder := httptest.NewRecorder()
	router.ServeHTTP(countRecorder, countRequest)

	if countRecorder.Code != http.StatusOK {
		t.Fatalf("count status = %d, body = %s", countRecorder.Code, countRecorder.Body.String())
	}

	var payload struct {
		Name        string `json:"name"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Query       string `json:"query"`
		Count       struct {
			Valid bool `json:"valid"`
			Count int  `json:"count"`
			Plan  struct {
				Dataset string `json:"dataset"`
				Mode    string `json:"mode"`
			} `json:"plan"`
		} `json:"count"`
	}
	if err := json.Unmarshal(countRecorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Name != "open-tasks" || payload.Title != "Open Tasks" || payload.Description != "Saved count query" {
		t.Fatalf("payload = %#v", payload)
	}
	if !payload.Count.Valid || payload.Count.Count != 3 {
		t.Fatalf("count = %#v", payload.Count)
	}
	if payload.Count.Plan.Dataset != "tasks" || payload.Count.Plan.Mode != "rows" {
		t.Fatalf("count plan = %#v", payload.Count.Plan)
	}
}

func TestSavedQueryPreviewAndCountReturnNotFoundForMissingName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	for _, path := range []string{
		"/api/queries/missing/preview",
		"/api/queries/missing/count",
	} {
		request := httptest.NewRequest(http.MethodPost, path, nil)
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusNotFound {
			t.Fatalf("%s status = %d, body = %s", path, recorder.Code, recorder.Body.String())
		}
	}
}

func TestSavedQueryAnalyzePlanAndLintByName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	createBody, err := json.Marshal(map[string]string{
		"name":        "open-tasks",
		"title":       "Open Tasks",
		"description": "Saved introspection query",
		"query":       "from tasks\nwhere done = false\norder by due\nselect ref, due",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	createRequest := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(createBody))
	createRequest.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()
	router.ServeHTTP(createRecorder, createRequest)

	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createRecorder.Code, createRecorder.Body.String())
	}

	tests := []struct {
		path  string
		check func(t *testing.T, body []byte)
	}{
		{
			path: "/api/queries/open-tasks/analyze",
			check: func(t *testing.T, body []byte) {
				t.Helper()
				var payload struct {
					Name    string `json:"name"`
					Analyze struct {
						Valid            bool     `json:"valid"`
						Dataset          string   `json:"dataset"`
						ProjectedColumns []string `json:"projectedColumns"`
						Aggregate        bool     `json:"aggregate"`
					} `json:"analyze"`
				}
				if err := json.Unmarshal(body, &payload); err != nil {
					t.Fatalf("Unmarshal(analyze) error = %v", err)
				}
				if payload.Name != "open-tasks" || !payload.Analyze.Valid || payload.Analyze.Dataset != "tasks" || payload.Analyze.Aggregate {
					t.Fatalf("analyze payload = %#v", payload)
				}
				if !reflect.DeepEqual(payload.Analyze.ProjectedColumns, []string{"ref", "due"}) {
					t.Fatalf("analyze projected columns = %#v", payload.Analyze.ProjectedColumns)
				}
			},
		},
		{
			path: "/api/queries/open-tasks/plan",
			check: func(t *testing.T, body []byte) {
				t.Helper()
				var payload struct {
					Name string `json:"name"`
					Plan struct {
						Valid            bool     `json:"valid"`
						Dataset          string   `json:"dataset"`
						Mode             string   `json:"mode"`
						ProjectedColumns []string `json:"projectedColumns"`
					} `json:"plan"`
				}
				if err := json.Unmarshal(body, &payload); err != nil {
					t.Fatalf("Unmarshal(plan) error = %v", err)
				}
				if payload.Name != "open-tasks" || !payload.Plan.Valid || payload.Plan.Dataset != "tasks" || payload.Plan.Mode != "rows" {
					t.Fatalf("plan payload = %#v", payload)
				}
				if !reflect.DeepEqual(payload.Plan.ProjectedColumns, []string{"ref", "due"}) {
					t.Fatalf("plan projected columns = %#v", payload.Plan.ProjectedColumns)
				}
			},
		},
		{
			path: "/api/queries/open-tasks/lint",
			check: func(t *testing.T, body []byte) {
				t.Helper()
				var payload struct {
					Name string `json:"name"`
					Lint struct {
						Valid bool `json:"valid"`
						Count int  `json:"count"`
					} `json:"lint"`
				}
				if err := json.Unmarshal(body, &payload); err != nil {
					t.Fatalf("Unmarshal(lint) error = %v", err)
				}
				if payload.Name != "open-tasks" || !payload.Lint.Valid || payload.Lint.Count != 0 {
					t.Fatalf("lint payload = %#v", payload)
				}
			},
		},
	}

	for _, tc := range tests {
		request := httptest.NewRequest(http.MethodPost, tc.path, nil)
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Fatalf("%s status = %d, body = %s", tc.path, recorder.Code, recorder.Body.String())
		}
		tc.check(t, recorder.Body.Bytes())
	}
}

func TestSavedQueryAnalyzePlanAndLintReturnNotFoundForMissingName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	for _, path := range []string{
		"/api/queries/missing/analyze",
		"/api/queries/missing/plan",
		"/api/queries/missing/lint",
	} {
		request := httptest.NewRequest(http.MethodPost, path, nil)
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusNotFound {
			t.Fatalf("%s status = %d, body = %s", path, recorder.Code, recorder.Body.String())
		}
	}
}

func TestSavedQueryFormatByName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	createBody, err := json.Marshal(map[string]string{
		"name":        "open-tasks",
		"title":       "Open Tasks",
		"description": "Saved formatting query",
		"query":       "from tasks\nselect ref,due\nwhere done = false\norder by due",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	createRequest := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(createBody))
	createRequest.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()
	router.ServeHTTP(createRecorder, createRequest)

	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createRecorder.Code, createRecorder.Body.String())
	}

	request := httptest.NewRequest(http.MethodPost, "/api/queries/open-tasks/format", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Name   string `json:"name"`
		Format struct {
			Valid     bool   `json:"valid"`
			Formatted string `json:"formatted"`
		} `json:"format"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Name != "open-tasks" || !payload.Format.Valid {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Format.Formatted != "from tasks\nwhere done = false\norder by due\nselect ref, due" {
		t.Fatalf("formatted = %q", payload.Format.Formatted)
	}
}

func TestSavedQueryFormatReturnsNotFoundForMissingName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodPost, "/api/queries/missing/format", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestSavedQuerySuggestByName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	createBody, err := json.Marshal(map[string]string{
		"name":        "page-groups",
		"title":       "Page Groups",
		"description": "Saved grouped query",
		"query":       "from tasks\ngroup by page\nselect page, count(*) as total",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	createRequest := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(createBody))
	createRequest.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()
	router.ServeHTTP(createRecorder, createRequest)

	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createRecorder.Code, createRecorder.Body.String())
	}

	suggestBody, err := json.Marshal(map[string]string{
		"clause": "having",
		"prefix": "to",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/queries/page-groups/suggest", bytes.NewReader(suggestBody))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Name    string `json:"name"`
		Suggest struct {
			Dataset     string `json:"dataset"`
			Clause      string `json:"clause"`
			Prefix      string `json:"prefix"`
			Count       int    `json:"count"`
			Suggestions []struct {
				Kind  string `json:"kind"`
				Value string `json:"value"`
			} `json:"suggestions"`
		} `json:"suggest"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Name != "page-groups" || payload.Suggest.Dataset != "tasks" || payload.Suggest.Clause != "having" || payload.Suggest.Prefix != "to" || payload.Suggest.Count != 1 || len(payload.Suggest.Suggestions) != 1 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Suggest.Suggestions[0].Kind != "field" || payload.Suggest.Suggestions[0].Value != "total" {
		t.Fatalf("suggestion = %#v", payload.Suggest.Suggestions[0])
	}
}

func TestSavedQuerySuggestReturnsNotFoundForMissingName(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodPost, "/api/queries/missing/suggest", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestGetQueryDatasetsReturnsBuiltInDatasetMetadata(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/query/datasets", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Count    int `json:"count"`
		Datasets []struct {
			Name   string `json:"name"`
			Fields []struct {
				Name    string `json:"name"`
				Numeric bool   `json:"numeric"`
			} `json:"fields"`
		} `json:"datasets"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Count != 3 || len(payload.Datasets) != 3 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Datasets[0].Name != "tasks" || payload.Datasets[1].Name != "pages" || payload.Datasets[2].Name != "links" {
		t.Fatalf("datasets = %#v", payload.Datasets)
	}
	if len(payload.Datasets[0].Fields) == 0 || payload.Datasets[0].Fields[2].Name != "line" || !payload.Datasets[0].Fields[2].Numeric {
		t.Fatalf("tasks fields = %#v", payload.Datasets[0].Fields)
	}
	if len(payload.Datasets[1].Fields) == 0 || payload.Datasets[1].Fields[2].Name != "tags" || payload.Datasets[1].Fields[2].Numeric {
		t.Fatalf("pages fields = %#v", payload.Datasets[1].Fields)
	}
	if len(payload.Datasets[2].Fields) == 0 || payload.Datasets[2].Fields[len(payload.Datasets[2].Fields)-1].Name != "line" || !payload.Datasets[2].Fields[len(payload.Datasets[2].Fields)-1].Numeric {
		t.Fatalf("links fields = %#v", payload.Datasets[2].Fields)
	}
}

func TestGetQueryCapabilitiesReturnsSupportedOperatorsAndClauses(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/query/capabilities", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Operators  []string `json:"operators"`
		Aggregates []string `json:"aggregates"`
		Clauses    []string `json:"clauses"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if !reflect.DeepEqual(payload.Operators[:4], []string{"=", "!=", "contains", "not contains"}) {
		t.Fatalf("operators = %#v", payload.Operators)
	}
	if !containsString(payload.Aggregates, "count(distinct field)") || !containsString(payload.Aggregates, "avg(field)") {
		t.Fatalf("aggregates = %#v", payload.Aggregates)
	}
	if !containsString(payload.Clauses, "select distinct") || !containsString(payload.Clauses, "group by") || !containsString(payload.Clauses, "having") {
		t.Fatalf("clauses = %#v", payload.Clauses)
	}
}

func TestGetQuerySchemaReturnsCombinedDiscoveryPayload(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	createBody, err := json.Marshal(map[string]any{
		"name":        "open-tasks",
		"title":       "Open Tasks",
		"description": "Saved dashboard query",
		"folder":      "dashboards/tasks",
		"tags":        []string{"work", "ops"},
		"query":       "from tasks\nwhere done = false\nselect ref",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	createRequest := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(createBody))
	createRequest.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()
	router.ServeHTTP(createRecorder, createRequest)

	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createRecorder.Code, createRecorder.Body.String())
	}

	request := httptest.NewRequest(http.MethodGet, "/api/query/schema", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Datasets []struct {
			Name string `json:"name"`
		} `json:"datasets"`
		Capabilities struct {
			Operators []string `json:"operators"`
			Clauses   []string `json:"clauses"`
		} `json:"capabilities"`
		Examples []struct {
			Dataset string `json:"dataset"`
			Query   string `json:"query"`
		} `json:"examples"`
		SavedQueries []struct {
			Name        string   `json:"name"`
			Title       string   `json:"title"`
			Description string   `json:"description"`
			Folder      string   `json:"folder"`
			Tags        []string `json:"tags"`
			UpdatedAt   string   `json:"updatedAt"`
		} `json:"savedQueries"`
		Counts struct {
			Datasets     int `json:"datasets"`
			Examples     int `json:"examples"`
			SavedQueries int `json:"savedQueries"`
		} `json:"counts"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Counts.Datasets != 3 || payload.Counts.Examples != 6 || payload.Counts.SavedQueries != 1 {
		t.Fatalf("counts = %#v", payload.Counts)
	}
	if len(payload.Datasets) != payload.Counts.Datasets || len(payload.Examples) != payload.Counts.Examples || len(payload.SavedQueries) != payload.Counts.SavedQueries {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Datasets[0].Name != "tasks" || payload.Datasets[1].Name != "pages" || payload.Datasets[2].Name != "links" {
		t.Fatalf("datasets = %#v", payload.Datasets)
	}
	if !containsString(payload.Capabilities.Operators, "not") || !containsString(payload.Capabilities.Clauses, "group by") {
		t.Fatalf("capabilities = %#v", payload.Capabilities)
	}
	if payload.Examples[0].Dataset != "tasks" || !strings.Contains(payload.Examples[len(payload.Examples)-1].Query, "from links") {
		t.Fatalf("examples = %#v", payload.Examples)
	}
	if payload.SavedQueries[0].Name != "open-tasks" || payload.SavedQueries[0].Title != "Open Tasks" || payload.SavedQueries[0].Description != "Saved dashboard query" || payload.SavedQueries[0].Folder != "dashboards/tasks" || !reflect.DeepEqual(payload.SavedQueries[0].Tags, []string{"work", "ops"}) || payload.SavedQueries[0].UpdatedAt == "" {
		t.Fatalf("savedQueries = %#v", payload.SavedQueries)
	}
}

func TestGetQueryExamplesReturnsBuiltInExamples(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/query/examples", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Dataset  string `json:"dataset"`
		Count    int    `json:"count"`
		Examples []struct {
			Name        string `json:"name"`
			Dataset     string `json:"dataset"`
			Description string `json:"description"`
			Query       string `json:"query"`
		} `json:"examples"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Dataset != "" || payload.Count != 6 || len(payload.Examples) != 6 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Examples[0].Dataset != "tasks" || payload.Examples[0].Name == "" || payload.Examples[0].Description == "" || !strings.Contains(payload.Examples[0].Query, "from tasks") {
		t.Fatalf("first example = %#v", payload.Examples[0])
	}
	if payload.Examples[len(payload.Examples)-1].Dataset != "links" || !strings.Contains(payload.Examples[len(payload.Examples)-1].Query, "from links") {
		t.Fatalf("last example = %#v", payload.Examples[len(payload.Examples)-1])
	}
}

func TestGetQueryExamplesFiltersByDataset(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	request := httptest.NewRequest(http.MethodGet, "/api/query/examples?dataset=pages", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Dataset  string `json:"dataset"`
		Count    int    `json:"count"`
		Examples []struct {
			Dataset string `json:"dataset"`
			Query   string `json:"query"`
		} `json:"examples"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Dataset != "pages" || payload.Count != 3 || len(payload.Examples) != 3 {
		t.Fatalf("payload = %#v", payload)
	}
	for _, example := range payload.Examples {
		if example.Dataset != "pages" || !strings.Contains(example.Query, "from pages") {
			t.Fatalf("example = %#v", example)
		}
	}
}

func TestAnalyzeQueryReturnsStructuredMetadata(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "```query\nfrom tasks\nwhere not (done = true or due is null)\ngroup by page\nhaving count(*) > 1\norder by count(*) desc, page\nselect page, count(*) as total\n```",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/analyze", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid            bool     `json:"valid"`
		Error            string   `json:"error"`
		Dataset          string   `json:"dataset"`
		Aggregate        bool     `json:"aggregate"`
		Grouped          bool     `json:"grouped"`
		Distinct         bool     `json:"distinct"`
		ProjectedColumns []string `json:"projectedColumns"`
		Query            struct {
			From    string   `json:"from"`
			GroupBy []string `json:"groupBy"`
			OrderBy []struct {
				Field string `json:"field"`
				Desc  bool   `json:"desc"`
			} `json:"orderBy"`
		} `json:"query"`
		Fields struct {
			Select  []string `json:"select"`
			Where   []string `json:"where"`
			GroupBy []string `json:"groupBy"`
			Having  []string `json:"having"`
			OrderBy []string `json:"orderBy"`
		} `json:"fields"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if !payload.Valid || payload.Error != "" {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Dataset != "tasks" || !payload.Aggregate || !payload.Grouped || payload.Distinct {
		t.Fatalf("payload = %#v", payload)
	}
	if !reflect.DeepEqual(payload.ProjectedColumns, []string{"page", "total"}) {
		t.Fatalf("projectedColumns = %#v", payload.ProjectedColumns)
	}
	if payload.Query.From != "tasks" || !reflect.DeepEqual(payload.Query.GroupBy, []string{"page"}) {
		t.Fatalf("query = %#v", payload.Query)
	}
	if len(payload.Query.OrderBy) != 2 || payload.Query.OrderBy[0].Field != "total" || !payload.Query.OrderBy[0].Desc || payload.Query.OrderBy[1].Field != "page" {
		t.Fatalf("orderBy = %#v", payload.Query.OrderBy)
	}
	if !reflect.DeepEqual(payload.Fields.Select, []string{"page"}) {
		t.Fatalf("select fields = %#v", payload.Fields.Select)
	}
	if !reflect.DeepEqual(payload.Fields.Where, []string{"done", "due"}) {
		t.Fatalf("where fields = %#v", payload.Fields.Where)
	}
	if !reflect.DeepEqual(payload.Fields.GroupBy, []string{"page"}) {
		t.Fatalf("groupBy fields = %#v", payload.Fields.GroupBy)
	}
	if !reflect.DeepEqual(payload.Fields.Having, []string{"total"}) {
		t.Fatalf("having fields = %#v", payload.Fields.Having)
	}
	if !reflect.DeepEqual(payload.Fields.OrderBy, []string{"total", "page"}) {
		t.Fatalf("orderBy fields = %#v", payload.Fields.OrderBy)
	}
}

func TestAnalyzeQueryReturnsValidationErrorsWithoutFailingRequest(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "from tasks\nselect count(*) as total, ref",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/analyze", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid bool   `json:"valid"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Valid || payload.Error == "" || !strings.Contains(payload.Error, "aggregate selects currently require only aggregate expressions") {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestSuggestQueryReturnsDatasetAndClauseMatches(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"clause": "from",
		"prefix": "li",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/suggest", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Clause      string `json:"clause"`
		Prefix      string `json:"prefix"`
		Count       int    `json:"count"`
		Suggestions []struct {
			Kind  string `json:"kind"`
			Value string `json:"value"`
		} `json:"suggestions"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Clause != "from" || payload.Prefix != "li" || payload.Count != 1 || len(payload.Suggestions) != 1 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Suggestions[0].Kind != "dataset" || payload.Suggestions[0].Value != "links" {
		t.Fatalf("suggestion = %#v", payload.Suggestions[0])
	}
}

func TestSuggestQueryUsesGroupedQueryContext(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query":  "from tasks\ngroup by page\nselect page, count(*) as total",
		"clause": "having",
		"prefix": "to",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/suggest", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Dataset     string `json:"dataset"`
		Clause      string `json:"clause"`
		Prefix      string `json:"prefix"`
		Count       int    `json:"count"`
		Suggestions []struct {
			Kind  string `json:"kind"`
			Value string `json:"value"`
		} `json:"suggestions"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Dataset != "tasks" || payload.Clause != "having" || payload.Prefix != "to" || payload.Count != 1 || len(payload.Suggestions) != 1 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Suggestions[0].Kind != "field" || payload.Suggestions[0].Value != "total" {
		t.Fatalf("suggestion = %#v", payload.Suggestions[0])
	}
}

func TestGetQueryEditorReturnsBootstrapMetadata(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	createBody, err := json.Marshal(map[string]any{
		"name":        "open-tasks",
		"title":       "Open Tasks",
		"description": "Saved editor query",
		"folder":      "dashboards/tasks",
		"tags":        []string{"work", "ops"},
		"query":       "from tasks\nwhere done = false\nselect ref",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	createRequest := httptest.NewRequest(http.MethodPost, "/api/queries", bytes.NewReader(createBody))
	createRequest.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()
	router.ServeHTTP(createRecorder, createRequest)

	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createRecorder.Code, createRecorder.Body.String())
	}

	request := httptest.NewRequest(http.MethodGet, "/api/query/editor", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Schema struct {
			Datasets []struct {
				Name string `json:"name"`
			} `json:"datasets"`
			Examples []struct {
				Dataset string `json:"dataset"`
			} `json:"examples"`
			SavedQueries []struct {
				Name        string   `json:"name"`
				Title       string   `json:"title"`
				Description string   `json:"description"`
				Folder      string   `json:"folder"`
				Tags        []string `json:"tags"`
				UpdatedAt   string   `json:"updatedAt"`
			} `json:"savedQueries"`
		} `json:"schema"`
		RootSuggestions struct {
			Count       int `json:"count"`
			Suggestions []struct {
				Kind  string `json:"kind"`
				Value string `json:"value"`
			} `json:"suggestions"`
		} `json:"rootSuggestions"`
		ClauseSuggestions []struct {
			Clause      string `json:"clause"`
			Count       int    `json:"count"`
			Suggestions []struct {
				Kind  string `json:"kind"`
				Value string `json:"value"`
			} `json:"suggestions"`
		} `json:"clauseSuggestions"`
		DatasetSuggestions []struct {
			Dataset string `json:"dataset"`
			Clauses []struct {
				Clause      string `json:"clause"`
				Count       int    `json:"count"`
				Suggestions []struct {
					Kind  string `json:"kind"`
					Value string `json:"value"`
				} `json:"suggestions"`
			} `json:"clauses"`
		} `json:"datasetSuggestions"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Schema.Datasets) != 3 || len(payload.Schema.Examples) != 6 || len(payload.Schema.SavedQueries) != 1 {
		t.Fatalf("schema = %#v", payload.Schema)
	}
	if payload.Schema.SavedQueries[0].Name != "open-tasks" || payload.Schema.SavedQueries[0].Title != "Open Tasks" || payload.Schema.SavedQueries[0].Description != "Saved editor query" || payload.Schema.SavedQueries[0].Folder != "dashboards/tasks" || !reflect.DeepEqual(payload.Schema.SavedQueries[0].Tags, []string{"work", "ops"}) || payload.Schema.SavedQueries[0].UpdatedAt == "" {
		t.Fatalf("savedQueries = %#v", payload.Schema.SavedQueries)
	}
	if payload.RootSuggestions.Count == 0 || len(payload.RootSuggestions.Suggestions) != payload.RootSuggestions.Count {
		t.Fatalf("rootSuggestions = %#v", payload.RootSuggestions)
	}
	if payload.RootSuggestions.Suggestions[0].Kind != "clause" || payload.RootSuggestions.Suggestions[0].Value != "from" {
		t.Fatalf("root suggestion = %#v", payload.RootSuggestions.Suggestions[0])
	}
	if len(payload.ClauseSuggestions) != 6 {
		t.Fatalf("clauseSuggestions = %#v", payload.ClauseSuggestions)
	}
	if payload.ClauseSuggestions[1].Clause != "select" || payload.ClauseSuggestions[1].Count == 0 {
		t.Fatalf("select suggestions = %#v", payload.ClauseSuggestions[1])
	}
	if len(payload.DatasetSuggestions) != 3 {
		t.Fatalf("datasetSuggestions = %#v", payload.DatasetSuggestions)
	}
	if payload.DatasetSuggestions[0].Dataset != "tasks" || len(payload.DatasetSuggestions[0].Clauses) != 4 {
		t.Fatalf("task dataset suggestions = %#v", payload.DatasetSuggestions[0])
	}
	if payload.DatasetSuggestions[0].Clauses[0].Clause != "select" || payload.DatasetSuggestions[0].Clauses[0].Suggestions[0].Value != "*" {
		t.Fatalf("task select suggestions = %#v", payload.DatasetSuggestions[0].Clauses[0])
	}
	if payload.DatasetSuggestions[1].Dataset != "pages" || payload.DatasetSuggestions[1].Clauses[1].Clause != "where" || payload.DatasetSuggestions[1].Clauses[1].Count == 0 {
		t.Fatalf("page where suggestions = %#v", payload.DatasetSuggestions[1].Clauses[1])
	}
}

func TestFormatQueryReturnsCanonicalBody(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "select page, count(*) as total\norder by count(*) desc, page\nhaving count(*) > 1\ngroup by page\nwhere done = false and page = \"daily/today\" or due is null\nfrom tasks",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/format", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid     bool   `json:"valid"`
		Error     string `json:"error"`
		Formatted string `json:"formatted"`
		Fenced    bool   `json:"fenced"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	expected := "from tasks\nwhere (done = false and page = \"daily/today\") or due is null\ngroup by page\nhaving total > 1\norder by total desc, page\nselect page, count(*) as total"
	if !payload.Valid || payload.Error != "" || payload.Fenced || payload.Formatted != expected {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestFormatQueryPreservesFencedQueryBlocks(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "```query id=open-tasks\nselect ref, page\norder by page\nwhere done = false\nfrom tasks\n```",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/format", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid     bool   `json:"valid"`
		Error     string `json:"error"`
		Formatted string `json:"formatted"`
		Fenced    bool   `json:"fenced"`
		ID        string `json:"id"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	expected := "```query id=open-tasks\nfrom tasks\nwhere done = false\norder by page\nselect ref, page\n```"
	if !payload.Valid || payload.Error != "" || !payload.Fenced || payload.ID != "open-tasks" || payload.Formatted != expected {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestPlanQueryReturnsExecutionSummary(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "from tasks\nwhere done = false and due is not null\ngroup by page\nhaving count(*) > 1\norder by count(*) desc, page\nselect page, count(*) as total",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/plan", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid            bool     `json:"valid"`
		Error            string   `json:"error"`
		Dataset          string   `json:"dataset"`
		Mode             string   `json:"mode"`
		Aggregate        bool     `json:"aggregate"`
		Grouped          bool     `json:"grouped"`
		Distinct         bool     `json:"distinct"`
		ProjectedColumns []string `json:"projectedColumns"`
		Fields           struct {
			Where   []string `json:"where"`
			GroupBy []string `json:"groupBy"`
			Having  []string `json:"having"`
			OrderBy []string `json:"orderBy"`
			Select  []string `json:"select"`
		} `json:"fields"`
		Counts struct {
			Where   int `json:"where"`
			GroupBy int `json:"groupBy"`
			Having  int `json:"having"`
			OrderBy int `json:"orderBy"`
			Select  int `json:"select"`
		} `json:"counts"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if !payload.Valid || payload.Error != "" || payload.Dataset != "tasks" || payload.Mode != "grouped-aggregate" {
		t.Fatalf("payload = %#v", payload)
	}
	if !payload.Aggregate || !payload.Grouped || payload.Distinct {
		t.Fatalf("payload = %#v", payload)
	}
	if !reflect.DeepEqual(payload.ProjectedColumns, []string{"page", "total"}) {
		t.Fatalf("projectedColumns = %#v", payload.ProjectedColumns)
	}
	if !reflect.DeepEqual(payload.Fields.Where, []string{"done", "due"}) || !reflect.DeepEqual(payload.Fields.GroupBy, []string{"page"}) {
		t.Fatalf("fields = %#v", payload.Fields)
	}
	if !reflect.DeepEqual(payload.Fields.Having, []string{"total"}) || !reflect.DeepEqual(payload.Fields.OrderBy, []string{"total", "page"}) {
		t.Fatalf("fields = %#v", payload.Fields)
	}
	if !reflect.DeepEqual(payload.Fields.Select, []string{"page"}) {
		t.Fatalf("fields = %#v", payload.Fields)
	}
	if payload.Counts.Where != 2 || payload.Counts.GroupBy != 1 || payload.Counts.Having != 1 || payload.Counts.OrderBy != 2 || payload.Counts.Select != 2 {
		t.Fatalf("counts = %#v", payload.Counts)
	}
}

func TestPlanQueryReturnsValidationErrorsWithoutFailingRequest(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "from tasks\nhaving count(*) > 1\nselect ref",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/plan", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid bool   `json:"valid"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Valid || payload.Error == "" || !strings.Contains(payload.Error, "having currently requires group by") {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestLintQueryReturnsNonFatalWarnings(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "from tasks\nwhere done = false and done = false\norder by page, page",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/lint", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid    bool   `json:"valid"`
		Error    string `json:"error"`
		Dataset  string `json:"dataset"`
		Count    int    `json:"count"`
		Warnings []struct {
			Code    string `json:"code"`
			Clause  string `json:"clause"`
			Message string `json:"message"`
		} `json:"warnings"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if !payload.Valid || payload.Error != "" || payload.Dataset != "tasks" || payload.Count != 3 || len(payload.Warnings) != 3 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Warnings[0].Code != "implicit-select" || payload.Warnings[0].Clause != "select" {
		t.Fatalf("warning[0] = %#v", payload.Warnings[0])
	}
	if payload.Warnings[1].Code != "duplicate-order-by-field" || payload.Warnings[1].Clause != "order by" {
		t.Fatalf("warning[1] = %#v", payload.Warnings[1])
	}
	if payload.Warnings[2].Code != "duplicate-where-filter" || payload.Warnings[2].Clause != "where" {
		t.Fatalf("warning[2] = %#v", payload.Warnings[2])
	}
}

func TestLintQueryReturnsValidationErrorsWithoutFailingRequest(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "from tasks\nselect count(*) as total, ref",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/lint", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid bool   `json:"valid"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Valid || payload.Error == "" || !strings.Contains(payload.Error, "aggregate selects currently require only aggregate expressions") {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestPreviewQueryReturnsCappedSampleAndPlan(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := "# Today\n\n- [ ] First task due:: 2026-05-01\n- [ ] Second task due:: 2026-05-02\n- [ ] Third task due:: 2026-05-03\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault: vaultService,
		Index: indexService,
		Query: query.NewService(),
	})

	bodyBytes, err := json.Marshal(map[string]any{
		"query": "from tasks\norder by due\nselect ref, due",
		"limit": 2,
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/preview", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid     bool     `json:"valid"`
		Error     string   `json:"error"`
		Count     int      `json:"count"`
		Limit     int      `json:"limit"`
		Truncated bool     `json:"truncated"`
		Columns   []string `json:"columns"`
		Rows      []struct {
			Ref string `json:"ref"`
			Due string `json:"due"`
		} `json:"rows"`
		Plan struct {
			Dataset string `json:"dataset"`
			Mode    string `json:"mode"`
		} `json:"plan"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if !payload.Valid || payload.Error != "" || payload.Count != 2 || payload.Limit != 2 || !payload.Truncated {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Plan.Dataset != "tasks" || payload.Plan.Mode != "rows" {
		t.Fatalf("plan = %#v", payload.Plan)
	}
	if !reflect.DeepEqual(payload.Columns, []string{"ref", "due"}) {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 2 || payload.Rows[0].Due != "2026-05-01" || payload.Rows[1].Due != "2026-05-02" {
		t.Fatalf("rows = %#v", payload.Rows)
	}
}

func TestPreviewQueryReturnsValidationErrorsWithoutFailingRequest(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "from tasks\nselect count(*) as total, ref",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/preview", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid bool   `json:"valid"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Valid || payload.Error == "" || !strings.Contains(payload.Error, "aggregate selects currently require only aggregate expressions") {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestCountQueryReturnsRowCardinality(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"):    "# Today\n\n- [ ] One due:: 2026-05-01\n- [ ] Two due:: 2026-05-02\n",
		filepath.Join(vaultDir, "daily", "tomorrow.md"): "# Tomorrow\n\n- [ ] Three due:: 2026-05-03\n",
	}
	for path, content := range files {
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", path, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault: vaultService,
		Index: indexService,
		Query: query.NewService(),
	})

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "from tasks\ngroup by page\nselect page, count(*) as total",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/count", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid bool   `json:"valid"`
		Error string `json:"error"`
		Count int    `json:"count"`
		Plan  struct {
			Dataset string `json:"dataset"`
			Mode    string `json:"mode"`
		} `json:"plan"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if !payload.Valid || payload.Error != "" || payload.Count != 2 {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Plan.Dataset != "tasks" || payload.Plan.Mode != "grouped-aggregate" {
		t.Fatalf("plan = %#v", payload.Plan)
	}
}

func TestCountQueryReturnsValidationErrorsWithoutFailingRequest(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "from tasks\nselect count(*) as total, ref",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/count", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Valid bool   `json:"valid"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Valid || payload.Error == "" || !strings.Contains(payload.Error, "aggregate selects currently require only aggregate expressions") {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestWorkbenchQueryReturnsBundledEditorState(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	raw := "# Today\n\n- [ ] First task due:: 2026-05-01\n- [ ] Second task due:: 2026-05-02\n- [ ] Third task due:: 2026-05-03\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault: vaultService,
		Index: indexService,
		Query: query.NewService(),
	})

	bodyBytes, err := json.Marshal(map[string]any{
		"query":        "from tasks\nwhere done = false\norder by due\nselect ref, due",
		"previewLimit": 2,
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/workbench", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Analyze struct {
			Valid   bool   `json:"valid"`
			Dataset string `json:"dataset"`
		} `json:"analyze"`
		Plan struct {
			Valid bool   `json:"valid"`
			Mode  string `json:"mode"`
		} `json:"plan"`
		Lint struct {
			Valid bool `json:"valid"`
			Count int  `json:"count"`
		} `json:"lint"`
		Preview struct {
			Valid     bool     `json:"valid"`
			Count     int      `json:"count"`
			Limit     int      `json:"limit"`
			Truncated bool     `json:"truncated"`
			Columns   []string `json:"columns"`
		} `json:"preview"`
		Count struct {
			Valid bool `json:"valid"`
			Count int  `json:"count"`
		} `json:"count"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if !payload.Analyze.Valid || payload.Analyze.Dataset != "tasks" {
		t.Fatalf("analyze = %#v", payload.Analyze)
	}
	if !payload.Plan.Valid || payload.Plan.Mode != "rows" {
		t.Fatalf("plan = %#v", payload.Plan)
	}
	if !payload.Lint.Valid || payload.Lint.Count != 0 {
		t.Fatalf("lint = %#v", payload.Lint)
	}
	if !payload.Preview.Valid || payload.Preview.Count != 2 || payload.Preview.Limit != 2 || !payload.Preview.Truncated {
		t.Fatalf("preview = %#v", payload.Preview)
	}
	if !reflect.DeepEqual(payload.Preview.Columns, []string{"ref", "due"}) {
		t.Fatalf("preview columns = %#v", payload.Preview.Columns)
	}
	if !payload.Count.Valid || payload.Count.Count != 3 {
		t.Fatalf("count = %#v", payload.Count)
	}
}

func TestWorkbenchQueryPropagatesInvalidQueryAcrossSections(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	router := buildTestRouter(t, vaultDir, dataDir)

	bodyBytes, err := json.Marshal(map[string]string{
		"query": "from tasks\nselect count(*) as total, ref",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/query/workbench", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Analyze struct {
			Valid bool   `json:"valid"`
			Error string `json:"error"`
		} `json:"analyze"`
		Plan struct {
			Valid bool   `json:"valid"`
			Error string `json:"error"`
		} `json:"plan"`
		Lint struct {
			Valid bool   `json:"valid"`
			Error string `json:"error"`
		} `json:"lint"`
		Preview struct {
			Valid bool   `json:"valid"`
			Error string `json:"error"`
		} `json:"preview"`
		Count struct {
			Valid bool   `json:"valid"`
			Error string `json:"error"`
		} `json:"count"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	for _, section := range []struct {
		name  string
		valid bool
		err   string
	}{
		{"analyze", payload.Analyze.Valid, payload.Analyze.Error},
		{"plan", payload.Plan.Valid, payload.Plan.Error},
		{"lint", payload.Lint.Valid, payload.Lint.Error},
		{"preview", payload.Preview.Valid, payload.Preview.Error},
		{"count", payload.Count.Valid, payload.Count.Error},
	} {
		if section.valid || section.err == "" || !strings.Contains(section.err, "aggregate selects currently require only aggregate expressions") {
			t.Fatalf("%s = %#v", section.name, section)
		}
	}
}

func TestGetDerivedMarksStaleQueryBlocksWhenDependenciesOutrunCache(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "dashboards"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"):      "# Today\n\n- [ ] First task due:: 2026-05-01\n",
		filepath.Join(vaultDir, "dashboards", "tasks.md"): "# Tasks\n\n```query id=open-tasks\nfrom tasks\nwhere page = \"daily/today\"\nselect ref\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	router := NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault:  vaultService,
		Index:  indexService,
		Query:  queryService,
		Events: NewEventBroker(),
	})

	time.Sleep(2 * time.Millisecond)

	updatedTaskPage := filepath.Join(vaultDir, "daily", "today.md")
	if err := os.WriteFile(updatedTaskPage, []byte("# Today\n\n- [ ] First task due:: 2026-05-02\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated task page) error = %v", err)
	}
	future := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(updatedTaskPage, future, future); err != nil {
		t.Fatalf("Chtimes() error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "daily/today"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/pages/dashboards/tasks/derived", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		QueryBlocks []struct {
			ID          string   `json:"id"`
			Key         string   `json:"key"`
			Datasets    []string `json:"datasets"`
			MatchPage   string   `json:"matchPage"`
			RowCount    int      `json:"rowCount"`
			RenderHint  string   `json:"renderHint"`
			Stale       bool     `json:"stale"`
			StalePage   string   `json:"stalePage"`
			StaleSince  string   `json:"staleSince"`
			StaleReason string   `json:"staleReason"`
		} `json:"queryBlocks"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.QueryBlocks) != 1 {
		t.Fatalf("queryBlocks = %#v", payload.QueryBlocks)
	}
	if payload.QueryBlocks[0].ID != "open-tasks" || payload.QueryBlocks[0].Key == "" || !payload.QueryBlocks[0].Stale || payload.QueryBlocks[0].StaleReason != "page-newer-than-cache" || payload.QueryBlocks[0].StaleSince == "" || payload.QueryBlocks[0].StalePage != "daily/today" || len(payload.QueryBlocks[0].Datasets) != 1 || payload.QueryBlocks[0].Datasets[0] != "tasks" || payload.QueryBlocks[0].MatchPage != "daily/today" || payload.QueryBlocks[0].RowCount != 1 || payload.QueryBlocks[0].RenderHint != "list" {
		t.Fatalf("query block = %#v", payload.QueryBlocks[0])
	}
}

func TestExecuteQueryReturnsTaskRows(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "projects"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First task due:: 2026-05-01 who:: [Ralf]
- [x] Done task
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Second task due:: 2026-04-30 who:: [Mina]
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nwhere done = false\norder by due, page\nselect ref, due, who, page"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			From string `json:"from"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			Ref  string   `json:"ref"`
			Due  string   `json:"due"`
			Who  []string `json:"who"`
			Page string   `json:"page"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Query.From != "tasks" {
		t.Fatalf("from = %q", payload.Query.From)
	}
	if len(payload.Columns) != 4 || payload.Columns[0] != "ref" || payload.Columns[1] != "due" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Ref != "projects/alpha:3" || payload.Rows[0].Due != "2026-04-30" || payload.Rows[0].Page != "projects/alpha" {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if len(payload.Rows[0].Who) != 1 || payload.Rows[0].Who[0] != "Mina" {
		t.Fatalf("first row who = %#v", payload.Rows[0].Who)
	}
	if payload.Rows[1].Ref != "daily/today:3" || payload.Rows[1].Due != "2026-05-01" || payload.Rows[1].Page != "daily/today" {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestExecuteQuerySupportsSelectAliases(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] First task due:: 2026-05-01
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nselect ref as taskRef, page as sourcePage, due as deadline"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			SelectFields []struct {
				Field string `json:"field"`
				Alias string `json:"alias"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			TaskRef    string `json:"taskRef"`
			SourcePage string `json:"sourcePage"`
			Deadline   string `json:"deadline"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.SelectFields) != 3 {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if payload.Query.SelectFields[0].Field != "ref" || payload.Query.SelectFields[0].Alias != "taskRef" {
		t.Fatalf("first select field = %#v", payload.Query.SelectFields[0])
	}
	if payload.Query.SelectFields[1].Field != "page" || payload.Query.SelectFields[1].Alias != "sourcePage" {
		t.Fatalf("second select field = %#v", payload.Query.SelectFields[1])
	}
	if payload.Query.SelectFields[2].Field != "due" || payload.Query.SelectFields[2].Alias != "deadline" {
		t.Fatalf("third select field = %#v", payload.Query.SelectFields[2])
	}
	if len(payload.Columns) != 3 || payload.Columns[0] != "taskRef" || payload.Columns[1] != "sourcePage" || payload.Columns[2] != "deadline" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].TaskRef != "daily/today:3" || payload.Rows[0].SourcePage != "daily/today" || payload.Rows[0].Deadline != "2026-05-01" {
		t.Fatalf("row = %#v", payload.Rows[0])
	}
}

func TestExecuteQuerySupportsOrderBySelectAlias(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] Daily task due:: 2026-05-02
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha task due:: 2026-05-01
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nselect ref as taskRef, due as deadline\norder by deadline\n"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			OrderBy []struct {
				Field string `json:"field"`
			} `json:"orderBy"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			TaskRef  string `json:"taskRef"`
			Deadline string `json:"deadline"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.OrderBy) != 1 || payload.Query.OrderBy[0].Field != "due" {
		t.Fatalf("orderBy = %#v", payload.Query.OrderBy)
	}
	if len(payload.Columns) != 2 || payload.Columns[0] != "taskRef" || payload.Columns[1] != "deadline" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].TaskRef != "projects/alpha:3" || payload.Rows[0].Deadline != "2026-05-01" {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].TaskRef != "daily/today:3" || payload.Rows[1].Deadline != "2026-05-02" {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestExecuteQuerySupportsCountAggregate(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First task
- [x] Done task
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Second task
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nwhere done = false\nselect count(*) as openCount"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			SelectFields []struct {
				Aggregate string `json:"aggregate"`
				Alias     string `json:"alias"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			OpenCount int `json:"openCount"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.SelectFields) != 1 || payload.Query.SelectFields[0].Aggregate != "count" || payload.Query.SelectFields[0].Alias != "openCount" {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if len(payload.Columns) != 1 || payload.Columns[0] != "openCount" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 || payload.Rows[0].OpenCount != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
}

func TestExecuteQuerySupportsCountFieldAggregate(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] First task due:: 2026-05-01
- [ ] Second task
- [ ] Third task due:: 2026-05-03
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nselect count(due) as dueCount"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			SelectFields []struct {
				Field     string `json:"field"`
				Aggregate string `json:"aggregate"`
				Alias     string `json:"alias"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			DueCount int `json:"dueCount"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.SelectFields) != 1 || payload.Query.SelectFields[0].Field != "due" || payload.Query.SelectFields[0].Aggregate != "count" || payload.Query.SelectFields[0].Alias != "dueCount" {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if len(payload.Columns) != 1 || payload.Columns[0] != "dueCount" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 || payload.Rows[0].DueCount != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
}

func TestExecuteQuerySupportsCountDistinctFieldAggregate(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First daily task
- [ ] Second daily task
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha task
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nselect count(distinct page) as pageCount"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			SelectFields []struct {
				Field     string `json:"field"`
				Aggregate string `json:"aggregate"`
				Alias     string `json:"alias"`
				Distinct  bool   `json:"distinct"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			PageCount int `json:"pageCount"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.SelectFields) != 1 || payload.Query.SelectFields[0].Field != "page" || payload.Query.SelectFields[0].Aggregate != "count" || !payload.Query.SelectFields[0].Distinct || payload.Query.SelectFields[0].Alias != "pageCount" {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if len(payload.Columns) != 1 || payload.Columns[0] != "pageCount" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 || payload.Rows[0].PageCount != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
}

func TestExecuteQuerySupportsMultipleAggregateExpressions(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First daily task
- [ ] Second daily task
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha task
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nselect count(*) as total, count(distinct page) as pageCount"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			SelectFields []struct {
				Field     string `json:"field"`
				Aggregate string `json:"aggregate"`
				Alias     string `json:"alias"`
				Distinct  bool   `json:"distinct"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			Total     int `json:"total"`
			PageCount int `json:"pageCount"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.SelectFields) != 2 {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if payload.Query.SelectFields[0].Field != "" || payload.Query.SelectFields[0].Aggregate != "count" || payload.Query.SelectFields[0].Alias != "total" || payload.Query.SelectFields[0].Distinct {
		t.Fatalf("first select field = %#v", payload.Query.SelectFields[0])
	}
	if payload.Query.SelectFields[1].Field != "page" || payload.Query.SelectFields[1].Aggregate != "count" || payload.Query.SelectFields[1].Alias != "pageCount" || !payload.Query.SelectFields[1].Distinct {
		t.Fatalf("second select field = %#v", payload.Query.SelectFields[1])
	}
	if len(payload.Columns) != 2 || payload.Columns[0] != "total" || payload.Columns[1] != "pageCount" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 || payload.Rows[0].Total != 3 || payload.Rows[0].PageCount != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
}

func TestExecuteQuerySupportsSelectDistinctProjection(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First daily task
- [ ] Second daily task
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha task
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\norder by page\nselect distinct page as sourcePage\noffset 1\nlimit 1"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			Distinct     bool `json:"distinct"`
			Offset       int  `json:"offset"`
			Limit        int  `json:"limit"`
			SelectFields []struct {
				Field string `json:"field"`
				Alias string `json:"alias"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			SourcePage string `json:"sourcePage"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if !payload.Query.Distinct || payload.Query.Offset != 1 || payload.Query.Limit != 1 {
		t.Fatalf("query = %#v", payload.Query)
	}
	if len(payload.Query.SelectFields) != 1 || payload.Query.SelectFields[0].Field != "page" || payload.Query.SelectFields[0].Alias != "sourcePage" {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if len(payload.Columns) != 1 || payload.Columns[0] != "sourcePage" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 || payload.Rows[0].SourcePage != "projects/alpha" {
		t.Fatalf("rows = %#v", payload.Rows)
	}
}

func TestExecuteQuerySupportsSelectStar(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] First task due:: 2026-05-01 who:: alex
- [x] Second task
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\norder by ref\nselect *\nlimit 1"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			SelectFields []struct {
				Field string `json:"field"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			Ref    string   `json:"ref"`
			Page   string   `json:"page"`
			Line   int64    `json:"line"`
			Text   string   `json:"text"`
			State  string   `json:"state"`
			Done   bool     `json:"done"`
			Due    string   `json:"due"`
			Remind any      `json:"remind"`
			Who    []string `json:"who"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	wantColumns := []string{"ref", "page", "line", "text", "state", "done", "due", "remind", "who"}
	if !reflect.DeepEqual(payload.Columns, wantColumns) {
		t.Fatalf("columns = %#v, want %#v", payload.Columns, wantColumns)
	}
	if len(payload.Query.SelectFields) != len(wantColumns) || payload.Query.SelectFields[0].Field != "ref" || payload.Query.SelectFields[len(payload.Query.SelectFields)-1].Field != "who" {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if len(payload.Rows) != 1 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Ref != "daily/today:3" || payload.Rows[0].Page != "daily/today" || payload.Rows[0].Line != 3 || payload.Rows[0].Text != "First task" || payload.Rows[0].State != "todo" || payload.Rows[0].Done || payload.Rows[0].Due != "2026-05-01" || payload.Rows[0].Remind != nil || !reflect.DeepEqual(payload.Rows[0].Who, []string{"alex"}) {
		t.Fatalf("row = %#v", payload.Rows[0])
	}
}

func TestExecuteQuerySupportsSelectDistinctStar(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First daily task
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha task
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from pages\norder by path\nselect distinct *\nlimit 1"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			Distinct     bool `json:"distinct"`
			SelectFields []struct {
				Field string `json:"field"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			Path      string `json:"path"`
			Title     string `json:"title"`
			CreatedAt string `json:"createdAt"`
			UpdatedAt string `json:"updatedAt"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	wantColumns := []string{"path", "title", "tags", "outgoingLinkCount", "backlinkCount", "taskCount", "openTaskCount", "doneTaskCount", "queryBlockCount", "createdAt", "updatedAt"}
	if !payload.Query.Distinct {
		t.Fatalf("query = %#v", payload.Query)
	}
	if !reflect.DeepEqual(payload.Columns, wantColumns) {
		t.Fatalf("columns = %#v, want %#v", payload.Columns, wantColumns)
	}
	if len(payload.Query.SelectFields) != len(wantColumns) || payload.Query.SelectFields[0].Field != "path" || payload.Query.SelectFields[len(payload.Query.SelectFields)-1].Field != "updatedAt" {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if len(payload.Rows) != 1 || payload.Rows[0].Path != "daily/today" || payload.Rows[0].Title != "Today" {
		t.Fatalf("rows = %#v", payload.Rows)
	}
}

func TestExecuteQuerySupportsPagesTagsField(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "notes"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "notes", "alpha.md"): `---
title: Alpha
tags:
  - work
  - writing
---

# Alpha
`,
		filepath.Join(vaultDir, "projects", "beta.md"): `---
title: Beta
tags:
  - personal
---

# Beta
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from pages\nwhere tags contains \"work\"\nselect path, tags\norder by path"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			Where []struct {
				Field string `json:"field"`
				Op    string `json:"op"`
			} `json:"where"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			Path string   `json:"path"`
			Tags []string `json:"tags"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.Where) != 1 || payload.Query.Where[0].Field != "tags" || payload.Query.Where[0].Op != "contains" {
		t.Fatalf("where = %#v", payload.Query.Where)
	}
	if !reflect.DeepEqual(payload.Columns, []string{"path", "tags"}) {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 || payload.Rows[0].Path != "notes/alpha" || !reflect.DeepEqual(payload.Rows[0].Tags, []string{"work", "writing"}) {
		t.Fatalf("rows = %#v", payload.Rows)
	}
}

func TestExecuteQuerySupportsPagesDerivedCountFields(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "notes"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "notes", "alpha.md"): `# Alpha

- [ ] First task
- [x] Second task

[[projects/beta]]
`,
		filepath.Join(vaultDir, "projects", "beta.md"): `# Beta

Body
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from pages\nwhere taskCount > 0\nselect path, taskCount, openTaskCount, doneTaskCount, outgoingLinkCount\norder by path"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			Where []struct {
				Field string `json:"field"`
				Op    string `json:"op"`
			} `json:"where"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			Path              string `json:"path"`
			TaskCount         int64  `json:"taskCount"`
			OpenTaskCount     int64  `json:"openTaskCount"`
			DoneTaskCount     int64  `json:"doneTaskCount"`
			OutgoingLinkCount int64  `json:"outgoingLinkCount"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.Where) != 1 || payload.Query.Where[0].Field != "taskCount" || payload.Query.Where[0].Op != ">" {
		t.Fatalf("where = %#v", payload.Query.Where)
	}
	if !reflect.DeepEqual(payload.Columns, []string{"path", "taskCount", "openTaskCount", "doneTaskCount", "outgoingLinkCount"}) {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Path != "notes/alpha" || payload.Rows[0].TaskCount != 2 || payload.Rows[0].OpenTaskCount != 1 || payload.Rows[0].DoneTaskCount != 1 || payload.Rows[0].OutgoingLinkCount != 1 {
		t.Fatalf("row = %#v", payload.Rows[0])
	}
}

func TestExecuteQuerySupportsPagesFrontmatterFields(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "contacts"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	files := map[string]string{
		filepath.Join(vaultDir, "contacts", "anna.md"): `---
tags:
  - contact
vorname: Anna
nachname: Zeis
location: Deweerthstraße
role:
  - Leitung
  - Orga
mav: true
phone_work: "+49 202 111111"
---

# Anna
`,
		filepath.Join(vaultDir, "contacts", "berta.md"): `---
tags:
  - contact
vorname: Berta
nachname: Adler
location: Extern
role: Verwaltung
mav: false
phone_work: "+49 202 222222"
---

# Berta
`,
		filepath.Join(vaultDir, "contacts", "clara.md"): `---
tags:
  - personal
vorname: Clara
nachname: Intern
location: Deweerthstraße
role: Intern
mav: false
phone_work: "+49 202 333333"
---

# Clara
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from pages\nwhere tags contains \"contact\" and (location = \"Deweerthstraße\" or mav = true or role contains \"Verwaltung\")\norder by nachname, vorname\nselect path, nachname, vorname, location, role, mav, phone_work"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Columns []string `json:"columns"`
		Rows    []struct {
			Path      string `json:"path"`
			Nachname  string `json:"nachname"`
			Vorname   string `json:"vorname"`
			Location  string `json:"location"`
			Role      any    `json:"role"`
			MAV       bool   `json:"mav"`
			PhoneWork string `json:"phone_work"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if !reflect.DeepEqual(payload.Columns, []string{"path", "nachname", "vorname", "location", "role", "mav", "phone_work"}) {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Path != "contacts/berta" || payload.Rows[0].Nachname != "Adler" || payload.Rows[0].Location != "Extern" || payload.Rows[0].PhoneWork != "+49 202 222222" {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].Path != "contacts/anna" || payload.Rows[1].Nachname != "Zeis" || !payload.Rows[1].MAV {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
	roleList, ok := payload.Rows[1].Role.([]any)
	if !ok || len(roleList) != 2 || roleList[0] != "Leitung" || roleList[1] != "Orga" {
		t.Fatalf("role = %#v", payload.Rows[1].Role)
	}
}

func TestExecuteQuerySupportsPageDateFunctions(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "contacts"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	today := time.Now()
	soonBirthday := today.AddDate(0, 0, 5).Format("2006-01-02")
	laterBirthday := today.AddDate(0, 0, 20).Format("2006-01-02")

	files := map[string]string{
		filepath.Join(vaultDir, "contacts", "soon.md"): fmt.Sprintf(`---
tags: contact
vorname: Soon
nachname: Person
birthday: %s
birthday_reminder: true
---

# Soon
`, soonBirthday),
		filepath.Join(vaultDir, "contacts", "later.md"): fmt.Sprintf(`---
tags: contact
vorname: Later
nachname: Person
birthday: %s
birthday_reminder: true
---

# Later
`, laterBirthday),
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from pages\nwhere tags contains \"contact\" and birthday_reminder = true and birthday != \"\" and daysUntilAnnual(birthday) <= 14\norder by daysUntilAnnual(birthday), nachname, vorname\nselect path, birthday, daysUntilAnnual(birthday) as daysUntil"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Columns []string `json:"columns"`
		Rows    []struct {
			Path      string `json:"path"`
			Birthday  string `json:"birthday"`
			DaysUntil int64  `json:"daysUntil"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if !reflect.DeepEqual(payload.Columns, []string{"path", "birthday", "daysUntil"}) {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Path != "contacts/soon" || payload.Rows[0].Birthday != soonBirthday || payload.Rows[0].DaysUntil != 5 {
		t.Fatalf("row = %#v", payload.Rows[0])
	}
}

func TestExecuteQuerySupportsLinksDataset(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "notes"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "notes", "alpha.md"): `# Alpha

See [[projects/beta]] and [Gamma](projects/gamma.md).
`,
		filepath.Join(vaultDir, "projects", "beta.md"):  "# Beta\n",
		filepath.Join(vaultDir, "projects", "gamma.md"): "# Gamma\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from links\nwhere sourcePage = \"notes/alpha\"\nselect sourcePage, targetPage, kind, line\norder by line, targetPage"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			Where []struct {
				Field string `json:"field"`
				Op    string `json:"op"`
			} `json:"where"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			SourcePage string `json:"sourcePage"`
			TargetPage string `json:"targetPage"`
			Kind       string `json:"kind"`
			Line       int64  `json:"line"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.Where) != 1 || payload.Query.Where[0].Field != "sourcePage" || payload.Query.Where[0].Op != "=" {
		t.Fatalf("where = %#v", payload.Query.Where)
	}
	if !reflect.DeepEqual(payload.Columns, []string{"sourcePage", "targetPage", "kind", "line"}) {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].SourcePage != "notes/alpha" || payload.Rows[0].TargetPage != "projects/beta" || payload.Rows[0].Kind != "wikilink" {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].SourcePage != "notes/alpha" || payload.Rows[1].TargetPage != "projects/gamma" || payload.Rows[1].Kind != "markdown" {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestExecuteQuerySupportsGroupByCount(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First daily task
- [ ] Second daily task
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha task
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\ngroup by page\norder by page\nselect page, count(*) as total"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			GroupBy      []string `json:"groupBy"`
			SelectFields []struct {
				Field     string `json:"field"`
				Aggregate string `json:"aggregate"`
				Alias     string `json:"alias"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			Page  string `json:"page"`
			Total int    `json:"total"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.GroupBy) != 1 || payload.Query.GroupBy[0] != "page" {
		t.Fatalf("groupBy = %#v", payload.Query.GroupBy)
	}
	if len(payload.Query.SelectFields) != 2 || payload.Query.SelectFields[0].Field != "page" || payload.Query.SelectFields[1].Aggregate != "count" || payload.Query.SelectFields[1].Alias != "total" {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if len(payload.Columns) != 2 || payload.Columns[0] != "page" || payload.Columns[1] != "total" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Page != "daily/today" || payload.Rows[0].Total != 2 {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].Page != "projects/alpha" || payload.Rows[1].Total != 1 {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestExecuteQuerySupportsGroupByCountDistinct(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] Shared owner one who:: alex
- [ ] Shared owner two who:: alex
- [ ] Different owner who:: sam
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha task who:: alex
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\ngroup by page\norder by page\nselect page, count(distinct who) as uniqueOwners"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			GroupBy      []string `json:"groupBy"`
			SelectFields []struct {
				Field     string `json:"field"`
				Aggregate string `json:"aggregate"`
				Alias     string `json:"alias"`
				Distinct  bool   `json:"distinct"`
			} `json:"selectFields"`
		} `json:"query"`
		Rows []struct {
			Page         string `json:"page"`
			UniqueOwners int    `json:"uniqueOwners"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.GroupBy) != 1 || payload.Query.GroupBy[0] != "page" {
		t.Fatalf("groupBy = %#v", payload.Query.GroupBy)
	}
	if len(payload.Query.SelectFields) != 2 || payload.Query.SelectFields[1].Field != "who" || payload.Query.SelectFields[1].Aggregate != "count" || !payload.Query.SelectFields[1].Distinct || payload.Query.SelectFields[1].Alias != "uniqueOwners" {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Page != "daily/today" || payload.Rows[0].UniqueOwners != 2 {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].Page != "projects/alpha" || payload.Rows[1].UniqueOwners != 1 {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestExecuteQuerySupportsGroupByMultipleAggregates(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] Shared owner one who:: alex
- [ ] Shared owner two who:: alex
- [ ] Different owner who:: sam
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha task who:: alex
- [ ] Alpha partner who:: pat
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\ngroup by page\nselect page, count(*) as total, count(distinct who) as uniqueOwners\norder by total desc, page"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			GroupBy      []string `json:"groupBy"`
			SelectFields []struct {
				Field     string `json:"field"`
				Aggregate string `json:"aggregate"`
				Alias     string `json:"alias"`
				Distinct  bool   `json:"distinct"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			Page         string `json:"page"`
			Total        int    `json:"total"`
			UniqueOwners int    `json:"uniqueOwners"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.GroupBy) != 1 || payload.Query.GroupBy[0] != "page" {
		t.Fatalf("groupBy = %#v", payload.Query.GroupBy)
	}
	if len(payload.Query.SelectFields) != 3 {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if payload.Query.SelectFields[1].Field != "" || payload.Query.SelectFields[1].Aggregate != "count" || payload.Query.SelectFields[1].Alias != "total" || payload.Query.SelectFields[1].Distinct {
		t.Fatalf("count select field = %#v", payload.Query.SelectFields[1])
	}
	if payload.Query.SelectFields[2].Field != "who" || payload.Query.SelectFields[2].Aggregate != "count" || payload.Query.SelectFields[2].Alias != "uniqueOwners" || !payload.Query.SelectFields[2].Distinct {
		t.Fatalf("distinct count select field = %#v", payload.Query.SelectFields[2])
	}
	if len(payload.Columns) != 3 || payload.Columns[0] != "page" || payload.Columns[1] != "total" || payload.Columns[2] != "uniqueOwners" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Page != "daily/today" || payload.Rows[0].Total != 3 || payload.Rows[0].UniqueOwners != 2 {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].Page != "projects/alpha" || payload.Rows[1].Total != 2 || payload.Rows[1].UniqueOwners != 2 {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestExecuteQuerySupportsHavingOnGroupedResults(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First daily task
- [ ] Second daily task
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha task
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\ngroup by page\nselect page, count(*) as total\nhaving count(*) > 1\norder by page"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			GroupBy []string `json:"groupBy"`
			Having  []struct {
				Field string `json:"field"`
				Op    string `json:"op"`
			} `json:"having"`
		} `json:"query"`
		Rows []struct {
			Page  string `json:"page"`
			Total int    `json:"total"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.GroupBy) != 1 || payload.Query.GroupBy[0] != "page" {
		t.Fatalf("groupBy = %#v", payload.Query.GroupBy)
	}
	if len(payload.Query.Having) != 1 || payload.Query.Having[0].Field != "total" || payload.Query.Having[0].Op != ">" {
		t.Fatalf("having = %#v", payload.Query.Having)
	}
	if len(payload.Rows) != 1 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Page != "daily/today" || payload.Rows[0].Total != 2 {
		t.Fatalf("row = %#v", payload.Rows[0])
	}
}

func TestExecuteQuerySupportsGroupedOrderByAliasAndPagination(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
		filepath.Join(vaultDir, "notes"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First daily task
- [ ] Second daily task
- [ ] Third daily task
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha task
- [ ] Alpha follow-up
`,
		filepath.Join(vaultDir, "notes", "beta.md"): `# Beta

- [ ] Beta task
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\ngroup by page\nselect page, count(*) as total\norder by count(*) desc, page\noffset 1\nlimit 1"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			GroupBy []string `json:"groupBy"`
			OrderBy []struct {
				Field string `json:"field"`
				Desc  bool   `json:"desc"`
			} `json:"orderBy"`
			Offset int `json:"offset"`
			Limit  int `json:"limit"`
		} `json:"query"`
		Rows []struct {
			Page  string `json:"page"`
			Total int    `json:"total"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.GroupBy) != 1 || payload.Query.GroupBy[0] != "page" {
		t.Fatalf("groupBy = %#v", payload.Query.GroupBy)
	}
	if len(payload.Query.OrderBy) != 2 || payload.Query.OrderBy[0].Field != "total" || !payload.Query.OrderBy[0].Desc || payload.Query.OrderBy[1].Field != "page" || payload.Query.OrderBy[1].Desc {
		t.Fatalf("orderBy = %#v", payload.Query.OrderBy)
	}
	if payload.Query.Offset != 1 || payload.Query.Limit != 1 {
		t.Fatalf("query pagination = %#v", payload.Query)
	}
	if len(payload.Rows) != 1 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Page != "projects/alpha" || payload.Rows[0].Total != 2 {
		t.Fatalf("row = %#v", payload.Rows[0])
	}
}

func TestExecuteQuerySupportsMinAndMaxAggregates(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] Third task due:: 2026-05-03
- [ ] First task due:: 2026-05-01
- [ ] Second task due:: 2026-05-02
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	testCases := []struct {
		name        string
		query       string
		aggregate   string
		alias       string
		expectedDue string
	}{
		{
			name:        "min",
			query:       "from tasks\nselect min(due) as earliestDue",
			aggregate:   "min",
			alias:       "earliestDue",
			expectedDue: "2026-05-01",
		},
		{
			name:        "max",
			query:       "from tasks\nselect max(due) as latestDue",
			aggregate:   "max",
			alias:       "latestDue",
			expectedDue: "2026-05-03",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			body := []byte(fmt.Sprintf(`{"query":%q}`, tc.query))
			request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}

			var payload struct {
				Query struct {
					SelectFields []struct {
						Field     string `json:"field"`
						Aggregate string `json:"aggregate"`
						Alias     string `json:"alias"`
					} `json:"selectFields"`
				} `json:"query"`
				Columns []string            `json:"columns"`
				Rows    []map[string]string `json:"rows"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
				t.Fatalf("Unmarshal() error = %v", err)
			}

			if len(payload.Query.SelectFields) != 1 || payload.Query.SelectFields[0].Field != "due" || payload.Query.SelectFields[0].Aggregate != tc.aggregate || payload.Query.SelectFields[0].Alias != tc.alias {
				t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
			}
			if len(payload.Columns) != 1 || payload.Columns[0] != tc.alias {
				t.Fatalf("columns = %#v", payload.Columns)
			}
			if len(payload.Rows) != 1 || payload.Rows[0][tc.alias] != tc.expectedDue {
				t.Fatalf("rows = %#v", payload.Rows)
			}
		})
	}
}

func TestExecuteQuerySupportsSumAggregate(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] First task
- [ ] Second task
- [x] Done task
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nwhere done = false\nselect sum(line) as totalLineNumbers"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			SelectFields []struct {
				Field     string `json:"field"`
				Aggregate string `json:"aggregate"`
				Alias     string `json:"alias"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			TotalLineNumbers int64 `json:"totalLineNumbers"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.SelectFields) != 1 || payload.Query.SelectFields[0].Field != "line" || payload.Query.SelectFields[0].Aggregate != "sum" || payload.Query.SelectFields[0].Alias != "totalLineNumbers" {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if len(payload.Columns) != 1 || payload.Columns[0] != "totalLineNumbers" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 || payload.Rows[0].TotalLineNumbers != 7 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
}

func TestExecuteQuerySupportsAvgAggregate(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] First task
- [ ] Second task
- [x] Done task
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nwhere done = false\nselect avg(line) as averageLineNumber"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			SelectFields []struct {
				Field     string `json:"field"`
				Aggregate string `json:"aggregate"`
				Alias     string `json:"alias"`
			} `json:"selectFields"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			AverageLineNumber float64 `json:"averageLineNumber"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.SelectFields) != 1 || payload.Query.SelectFields[0].Field != "line" || payload.Query.SelectFields[0].Aggregate != "avg" || payload.Query.SelectFields[0].Alias != "averageLineNumber" {
		t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
	}
	if len(payload.Columns) != 1 || payload.Columns[0] != "averageLineNumber" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 || payload.Rows[0].AverageLineNumber != 3.5 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
}

func TestExecuteQueryAggregateEmptyResultBehavior(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] First task due:: 2026-05-01
- [x] Done task
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	testCases := []struct {
		name          string
		query         string
		aggregate     string
		alias         string
		expectNull    bool
		expectedInt64 int64
	}{
		{
			name:          "count empty",
			query:         "from tasks\nwhere page = \"missing/page\"\nselect count(*) as total",
			aggregate:     "count",
			alias:         "total",
			expectedInt64: 0,
		},
		{
			name:       "min empty",
			query:      "from tasks\nwhere page = \"missing/page\"\nselect min(due) as earliest",
			aggregate:  "min",
			alias:      "earliest",
			expectNull: true,
		},
		{
			name:       "max empty",
			query:      "from tasks\nwhere page = \"missing/page\"\nselect max(due) as latest",
			aggregate:  "max",
			alias:      "latest",
			expectNull: true,
		},
		{
			name:          "sum empty",
			query:         "from tasks\nwhere page = \"missing/page\"\nselect sum(line) as totalLineNumbers",
			aggregate:     "sum",
			alias:         "totalLineNumbers",
			expectedInt64: 0,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			body := []byte(fmt.Sprintf(`{"query":%q}`, tc.query))
			request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}

			var payload struct {
				Query struct {
					SelectFields []struct {
						Aggregate string `json:"aggregate"`
						Alias     string `json:"alias"`
					} `json:"selectFields"`
				} `json:"query"`
				Rows []map[string]any `json:"rows"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
				t.Fatalf("Unmarshal() error = %v", err)
			}

			if len(payload.Query.SelectFields) != 1 || payload.Query.SelectFields[0].Aggregate != tc.aggregate || payload.Query.SelectFields[0].Alias != tc.alias {
				t.Fatalf("selectFields = %#v", payload.Query.SelectFields)
			}
			if len(payload.Rows) != 1 {
				t.Fatalf("rows = %#v", payload.Rows)
			}
			value, ok := payload.Rows[0][tc.alias]
			if !ok {
				t.Fatalf("missing alias %q in row %#v", tc.alias, payload.Rows[0])
			}
			if tc.expectNull {
				if value != nil {
					t.Fatalf("value = %#v, want nil", value)
				}
				return
			}

			number, ok := value.(float64)
			if !ok || int64(number) != tc.expectedInt64 {
				t.Fatalf("value = %#v, want %d", value, tc.expectedInt64)
			}
		})
	}
}

func TestExecuteQueryRejectsInvalidAggregateShapes(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] First task due:: 2026-05-01
- [ ] Second task due:: 2026-05-02
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	testCases := []struct {
		name        string
		query       string
		wantMessage string
	}{
		{
			name:        "sum on non-numeric field",
			query:       "from tasks\nselect sum(due) as totalDue",
			wantMessage: `aggregate "sum" requires a numeric field`,
		},
		{
			name:        "having without group by",
			query:       "from tasks\nselect count(*) as total\nhaving total > 1",
			wantMessage: "having currently requires group by",
		},
		{
			name:        "mixed aggregate and scalar projection",
			query:       "from tasks\nselect count(*) as total, ref",
			wantMessage: "aggregate selects currently require only aggregate expressions",
		},
		{
			name:        "select distinct aggregate",
			query:       "from tasks\nselect distinct count(*) as total",
			wantMessage: "select distinct currently does not support aggregate selects",
		},
		{
			name:        "select star mixed with field",
			query:       "from tasks\nselect *, ref",
			wantMessage: "select * must be used on its own",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			body := []byte(fmt.Sprintf(`{"query":%q}`, tc.query))
			request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			if !strings.Contains(recorder.Body.String(), tc.wantMessage) {
				t.Fatalf("body = %q, want substring %q", recorder.Body.String(), tc.wantMessage)
			}
		})
	}
}

func TestExecuteQuerySupportsLimit(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] Third task due:: 2026-05-03
- [ ] First task due:: 2026-05-01
- [ ] Second task due:: 2026-05-02
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\norder by due\nlimit 2\nselect ref, due"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			Limit int `json:"limit"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			Ref string `json:"ref"`
			Due string `json:"due"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Query.Limit != 2 {
		t.Fatalf("limit = %#v", payload.Query)
	}
	if len(payload.Columns) != 2 || payload.Columns[0] != "ref" || payload.Columns[1] != "due" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Ref != "daily/today:4" || payload.Rows[0].Due != "2026-05-01" {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].Ref != "daily/today:5" || payload.Rows[1].Due != "2026-05-02" {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestExecuteQuerySupportsOffset(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] Third task due:: 2026-05-03
- [ ] First task due:: 2026-05-01
- [ ] Fourth task due:: 2026-05-04
- [ ] Second task due:: 2026-05-02
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\norder by due\noffset 1\nlimit 2\nselect ref, due"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			Limit  int `json:"limit"`
			Offset int `json:"offset"`
		} `json:"query"`
		Rows []struct {
			Ref string `json:"ref"`
			Due string `json:"due"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Query.Offset != 1 || payload.Query.Limit != 2 {
		t.Fatalf("query = %#v", payload.Query)
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Ref != "daily/today:6" || payload.Rows[0].Due != "2026-05-02" {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].Ref != "daily/today:3" || payload.Rows[1].Due != "2026-05-03" {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestExecuteQuerySupportsContainsAndNotEquals(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] Alpha follow-up who:: [Ralf]
- [x] Closed alpha note who:: [Ralf]
`,
		filepath.Join(vaultDir, "projects", "beta.md"): `# Beta

- [ ] Beta task who:: [Mina]
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nwhere done != true and text contains \"alpha\" and who contains \"ral\"\norder by ref\nselect ref, text, who, done"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			From  string `json:"from"`
			Where []struct {
				Field string `json:"field"`
				Op    string `json:"op"`
			} `json:"where"`
		} `json:"query"`
		Columns []string `json:"columns"`
		Rows    []struct {
			Ref  string   `json:"ref"`
			Text string   `json:"text"`
			Who  []string `json:"who"`
			Done bool     `json:"done"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Query.From != "tasks" || len(payload.Query.Where) != 3 {
		t.Fatalf("query = %#v", payload.Query)
	}
	if payload.Query.Where[0].Field != "done" || payload.Query.Where[0].Op != "!=" {
		t.Fatalf("first filter = %#v", payload.Query.Where[0])
	}
	if payload.Query.Where[1].Field != "text" || payload.Query.Where[1].Op != "contains" {
		t.Fatalf("second filter = %#v", payload.Query.Where[1])
	}
	if payload.Query.Where[2].Field != "who" || payload.Query.Where[2].Op != "contains" {
		t.Fatalf("third filter = %#v", payload.Query.Where[2])
	}
	if len(payload.Columns) != 4 || payload.Columns[0] != "ref" || payload.Columns[1] != "text" {
		t.Fatalf("columns = %#v", payload.Columns)
	}
	if len(payload.Rows) != 1 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Ref != "daily/today:3" || payload.Rows[0].Text != "Alpha follow-up" || payload.Rows[0].Done {
		t.Fatalf("row = %#v", payload.Rows[0])
	}
	if len(payload.Rows[0].Who) != 1 || payload.Rows[0].Who[0] != "Ralf" {
		t.Fatalf("row who = %#v", payload.Rows[0].Who)
	}
}

func TestExecuteQuerySupportsOrderedComparisons(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] First task due:: 2026-04-30
- [ ] Second task due:: 2026-05-01
- [ ] Third task due:: 2026-05-03
- [ ] No due task
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nwhere due >= \"2026-05-01\" and line > 3 and line <= 5\norder by due desc\nselect ref, due, line"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			Where []struct {
				Field string `json:"field"`
				Op    string `json:"op"`
			} `json:"where"`
		} `json:"query"`
		Rows []struct {
			Ref  string `json:"ref"`
			Due  string `json:"due"`
			Line int    `json:"line"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.Where) != 3 {
		t.Fatalf("where = %#v", payload.Query.Where)
	}
	if payload.Query.Where[0].Field != "due" || payload.Query.Where[0].Op != ">=" {
		t.Fatalf("first filter = %#v", payload.Query.Where[0])
	}
	if payload.Query.Where[1].Field != "line" || payload.Query.Where[1].Op != ">" {
		t.Fatalf("second filter = %#v", payload.Query.Where[1])
	}
	if payload.Query.Where[2].Field != "line" || payload.Query.Where[2].Op != "<=" {
		t.Fatalf("third filter = %#v", payload.Query.Where[2])
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Ref != "daily/today:5" || payload.Rows[0].Due != "2026-05-03" || payload.Rows[0].Line != 5 {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].Ref != "daily/today:4" || payload.Rows[1].Due != "2026-05-01" || payload.Rows[1].Line != 4 {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestExecuteQuerySupportsOrAcrossWhereClauses(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] Daily open
- [x] Daily done
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha open
`,
		filepath.Join(vaultDir, "projects", "beta.md"): `# Beta

- [ ] Beta open
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nwhere page = \"daily/today\" or page = \"projects/alpha\"\nwhere done = false\norder by ref\nselect ref, page, done"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			WhereAny [][]struct {
				Field string `json:"field"`
				Op    string `json:"op"`
			} `json:"whereAny"`
		} `json:"query"`
		Rows []struct {
			Ref  string `json:"ref"`
			Page string `json:"page"`
			Done bool   `json:"done"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.WhereAny) != 2 {
		t.Fatalf("whereAny = %#v", payload.Query.WhereAny)
	}
	if len(payload.Query.WhereAny[0]) != 2 || payload.Query.WhereAny[0][0].Field != "page" || payload.Query.WhereAny[0][0].Op != "=" || payload.Query.WhereAny[0][1].Field != "done" || payload.Query.WhereAny[0][1].Op != "=" {
		t.Fatalf("first group = %#v", payload.Query.WhereAny[0])
	}
	if len(payload.Query.WhereAny[1]) != 2 || payload.Query.WhereAny[1][0].Field != "page" || payload.Query.WhereAny[1][0].Op != "=" || payload.Query.WhereAny[1][1].Field != "done" || payload.Query.WhereAny[1][1].Op != "=" {
		t.Fatalf("second group = %#v", payload.Query.WhereAny[1])
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Ref != "daily/today:3" || payload.Rows[0].Page != "daily/today" || payload.Rows[0].Done {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].Ref != "projects/alpha:3" || payload.Rows[1].Page != "projects/alpha" || payload.Rows[1].Done {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestExecuteQuerySupportsNullChecks(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := `# Today

- [ ] With due due:: 2026-05-01
- [ ] Without due
`
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	testCases := []struct {
		name      string
		query     string
		field     string
		op        string
		wantRef   string
		wantCount int
	}{
		{
			name:      "is null",
			query:     "from tasks\nwhere due is null\nselect ref, due",
			field:     "due",
			op:        "is null",
			wantRef:   "daily/today:4",
			wantCount: 1,
		},
		{
			name:      "is not null",
			query:     "from tasks\nwhere due is not null\nselect ref, due",
			field:     "due",
			op:        "is not null",
			wantRef:   "daily/today:3",
			wantCount: 1,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			body := []byte(fmt.Sprintf(`{"query":%q}`, tc.query))
			request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}

			var payload struct {
				Query struct {
					Where []struct {
						Field string `json:"field"`
						Op    string `json:"op"`
					} `json:"where"`
				} `json:"query"`
				Rows []struct {
					Ref string `json:"ref"`
					Due any    `json:"due"`
				} `json:"rows"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
				t.Fatalf("Unmarshal() error = %v", err)
			}

			if len(payload.Query.Where) != 1 || payload.Query.Where[0].Field != tc.field || payload.Query.Where[0].Op != tc.op {
				t.Fatalf("where = %#v", payload.Query.Where)
			}
			if len(payload.Rows) != tc.wantCount {
				t.Fatalf("rows = %#v", payload.Rows)
			}
			if payload.Rows[0].Ref != tc.wantRef {
				t.Fatalf("row = %#v", payload.Rows[0])
			}
		})
	}
}

func TestExecuteQuerySupportsParenthesizedWhereExpressions(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] Daily open
- [x] Daily done
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [x] Alpha done
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nwhere (page = \"daily/today\" or page = \"projects/alpha\") and done = true\norder by ref\nselect ref, page, done"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			WhereAny [][]struct {
				Field string `json:"field"`
				Op    string `json:"op"`
			} `json:"whereAny"`
		} `json:"query"`
		Rows []struct {
			Ref  string `json:"ref"`
			Page string `json:"page"`
			Done bool   `json:"done"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.WhereAny) != 2 {
		t.Fatalf("whereAny = %#v", payload.Query.WhereAny)
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Ref != "daily/today:4" || payload.Rows[0].Page != "daily/today" || !payload.Rows[0].Done {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].Ref != "projects/alpha:3" || payload.Rows[1].Page != "projects/alpha" || !payload.Rows[1].Done {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestExecuteQuerySupportsNotWhereExpressions(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] Daily open
- [x] Daily done
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha open
- [x] Alpha done
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\nwhere not (page = \"daily/today\" or done = true)\norder by ref\nselect ref, page, done"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			Where []struct {
				Field string `json:"field"`
				Op    string `json:"op"`
			} `json:"where"`
			WhereAny [][]struct {
				Field string `json:"field"`
				Op    string `json:"op"`
			} `json:"whereAny"`
		} `json:"query"`
		Rows []struct {
			Ref  string `json:"ref"`
			Page string `json:"page"`
			Done bool   `json:"done"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.Where) != 2 {
		t.Fatalf("where = %#v", payload.Query.Where)
	}
	if payload.Query.Where[0].Field != "page" || payload.Query.Where[0].Op != "!=" {
		t.Fatalf("first negated filter = %#v", payload.Query.Where[0])
	}
	if payload.Query.Where[1].Field != "done" || payload.Query.Where[1].Op != "!=" {
		t.Fatalf("second negated filter = %#v", payload.Query.Where[1])
	}
	if len(payload.Rows) != 1 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Ref != "projects/alpha:3" || payload.Rows[0].Page != "projects/alpha" || payload.Rows[0].Done {
		t.Fatalf("row = %#v", payload.Rows[0])
	}
}

func TestExecuteQuerySupportsNotHavingExpressions(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"): `# Today

- [ ] First daily task
- [ ] Second daily task
`,
		filepath.Join(vaultDir, "projects", "alpha.md"): `# Alpha

- [ ] Alpha task
`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"query":"from tasks\ngroup by page\nselect page, count(*) as total\nhaving not count(*) = 1\norder by page"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			Having []struct {
				Field string `json:"field"`
				Op    string `json:"op"`
			} `json:"having"`
		} `json:"query"`
		Rows []struct {
			Page  string `json:"page"`
			Total int    `json:"total"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if len(payload.Query.Having) != 1 || payload.Query.Having[0].Field != "total" || payload.Query.Having[0].Op != "!=" {
		t.Fatalf("having = %#v", payload.Query.Having)
	}
	if len(payload.Rows) != 1 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Page != "daily/today" || payload.Rows[0].Total != 2 {
		t.Fatalf("row = %#v", payload.Rows[0])
	}
}

func TestExecuteQueryAcceptsFencedQueryBlock(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	files := map[string]string{
		filepath.Join(vaultDir, "notes", "alpha.md"): `# Alpha`,
		filepath.Join(vaultDir, "notes", "beta.md"):  `# Beta`,
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte("{\"query\":\"```query id=pages-desc\\nfrom pages\\norder by path desc\\nselect path, title\\n```\"}")
	request := httptest.NewRequest(http.MethodPost, "/api/query/execute", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Query struct {
			From string `json:"from"`
		} `json:"query"`
		Rows []struct {
			Path  string `json:"path"`
			Title string `json:"title"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Query.From != "pages" {
		t.Fatalf("from = %q", payload.Query.From)
	}
	if len(payload.Rows) != 2 {
		t.Fatalf("rows = %#v", payload.Rows)
	}
	if payload.Rows[0].Path != "notes/beta" || payload.Rows[0].Title != "Beta" {
		t.Fatalf("first row = %#v", payload.Rows[0])
	}
	if payload.Rows[1].Path != "notes/alpha" || payload.Rows[1].Title != "Alpha" {
		t.Fatalf("second row = %#v", payload.Rows[1])
	}
}

func TestPatchTaskUpdatesMarkdownAndReindexes(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := "# Today\n\n- [ ] First task due:: 2026-05-01 remind:: 2026-04-30 who:: [\"Ralf\"]\n"
	pagePath := filepath.Join(vaultDir, "daily", "today.md")
	if err := os.WriteFile(pagePath, []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"text":"First task","state":"done","due":"2026-05-02","remind":"","who":["Mina","Kai"]}`)
	request := httptest.NewRequest(http.MethodPatch, "/api/tasks/daily/today:3", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Ref    string   `json:"ref"`
		Page   string   `json:"page"`
		Due    string   `json:"due"`
		Remind string   `json:"remind"`
		Who    []string `json:"who"`
		Done   bool     `json:"done"`
		State  string   `json:"state"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if payload.Ref != "daily/today:3" || payload.Page != "daily/today" || !payload.Done || payload.State != "done" {
		t.Fatalf("payload = %#v", payload)
	}
	if payload.Due != "2026-05-02" || payload.Remind != "" {
		t.Fatalf("due/remind = %#v", payload)
	}
	if len(payload.Who) != 2 || payload.Who[0] != "Mina" || payload.Who[1] != "Kai" {
		t.Fatalf("who = %#v", payload.Who)
	}

	updated, err := os.ReadFile(pagePath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	expected := "# Today\n\n- [x] First task due:: 2026-05-02 who:: [\"Mina\", \"Kai\"]\n"
	if string(updated) != expected {
		t.Fatalf("updated markdown = %q, want %q", string(updated), expected)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/tasks", nil)
	getRecorder := httptest.NewRecorder()
	router.ServeHTTP(getRecorder, getRequest)

	if getRecorder.Code != http.StatusOK {
		t.Fatalf("GET /api/tasks status = %d, body = %s", getRecorder.Code, getRecorder.Body.String())
	}

	var tasksPayload struct {
		Tasks []struct {
			Ref    string   `json:"ref"`
			Due    string   `json:"due"`
			Remind string   `json:"remind"`
			Who    []string `json:"who"`
			Done   bool     `json:"done"`
			State  string   `json:"state"`
		} `json:"tasks"`
	}
	if err := json.Unmarshal(getRecorder.Body.Bytes(), &tasksPayload); err != nil {
		t.Fatalf("Unmarshal tasks payload error = %v", err)
	}
	if len(tasksPayload.Tasks) != 1 {
		t.Fatalf("tasks = %#v", tasksPayload.Tasks)
	}
	if tasksPayload.Tasks[0].Ref != "daily/today:3" || tasksPayload.Tasks[0].Due != "2026-05-02" || tasksPayload.Tasks[0].Remind != "" || !tasksPayload.Tasks[0].Done || tasksPayload.Tasks[0].State != "done" {
		t.Fatalf("reindexed task = %#v", tasksPayload.Tasks[0])
	}
}

func TestPatchTaskCanReplaceArbitraryTaskSuffix(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	source := "# Today\n\n- [ ] Legacy task [remind: \"2026-04-19 12:10\"] #remind [completed: \"2026-04-19T12:19:47\"]\n"
	pagePath := filepath.Join(vaultDir, "daily", "today.md")
	if err := os.WriteFile(pagePath, []byte(source), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := buildTestRouter(t, vaultDir, dataDir)

	body := []byte(`{"text":"Legacy task","state":"todo","due":"","remind":"","who":[]}`)
	request := httptest.NewRequest(http.MethodPatch, "/api/tasks/daily/today:3", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	updated, err := os.ReadFile(pagePath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	expected := "# Today\n\n- [ ] Legacy task\n"
	if string(updated) != expected {
		t.Fatalf("updated markdown = %q, want %q", string(updated), expected)
	}
}

func TestEventsStreamReceivesWriteInvalidation(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "dashboards"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "dashboards", "tasks.md"), []byte("# Tasks\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(dashboard) error = %v", err)
	}

	server := httptest.NewServer(buildTestRouter(t, vaultDir, dataDir))
	defer server.Close()

	response, err := http.Get(server.URL + "/api/events")
	if err != nil {
		t.Fatalf("GET /api/events error = %v", err)
	}
	defer response.Body.Close()

	reader := bufio.NewReader(response.Body)
	eventType, _, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read initial SSE event error = %v", err)
	}
	if eventType != "" {
		t.Fatalf("unexpected initial event type = %q", eventType)
	}

	body := []byte(`{"state":"done"}`)
	request, err := http.NewRequest(http.MethodPatch, server.URL+"/api/tasks/daily/today:3", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}
	request.Header.Set("Content-Type", "application/json")

	patchResponse, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("PATCH /api/tasks error = %v", err)
	}
	defer patchResponse.Body.Close()
	if patchResponse.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(patchResponse.Body)
		t.Fatalf("PATCH /api/tasks status = %d, body = %s", patchResponse.StatusCode, string(bodyBytes))
	}

	firstType, firstData, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read first event error = %v", err)
	}
	secondType, secondData, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read second event error = %v", err)
	}
	thirdType, thirdData, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read third event error = %v", err)
	}
	fourthType, fourthData, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read fourth event error = %v", err)
	}
	fifthType, fifthData, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read fifth event error = %v", err)
	}
	sixthType, sixthData, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read sixth event error = %v", err)
	}

	if firstType != "task.changed" || !bytes.Contains([]byte(firstData), []byte(`"ref":"daily/today:3"`)) {
		t.Fatalf("first event = %q / %q", firstType, firstData)
	}
	if secondType != "page.changed" || !bytes.Contains([]byte(secondData), []byte(`"page":"daily/today"`)) {
		t.Fatalf("second event = %q / %q", secondType, secondData)
	}
	if thirdType != "derived.changed" || !bytes.Contains([]byte(thirdData), []byte(`"page":"daily/today"`)) {
		t.Fatalf("third event = %q / %q", thirdType, thirdData)
	}
	if fourthType != "query-block.changed" || !bytes.Contains([]byte(fourthData), []byte(`"page":"dashboards/tasks"`)) || !bytes.Contains([]byte(fourthData), []byte(`"key":"`)) || !bytes.Contains([]byte(fourthData), []byte(`"rowCount":0`)) || !bytes.Contains([]byte(fourthData), []byte(`"renderHint":"empty"`)) || !bytes.Contains([]byte(fourthData), []byte(`"stale":false`)) {
		t.Fatalf("fourth event = %q / %q", fourthType, fourthData)
	}
	if fifthType != "derived.changed" || !bytes.Contains([]byte(fifthData), []byte(`"page":"dashboards/tasks"`)) {
		t.Fatalf("fifth event = %q / %q", fifthType, fifthData)
	}
	if sixthType != "query.changed" || !bytes.Contains([]byte(sixthData), []byte(`"page":"dashboards/tasks"`)) || !bytes.Contains([]byte(sixthData), []byte(`"triggerPage":"daily/today"`)) || !bytes.Contains([]byte(sixthData), []byte(`"blockCount":1`)) || !bytes.Contains([]byte(sixthData), []byte(`"blocks":[{`)) || !bytes.Contains([]byte(sixthData), []byte(`"renderHint":"empty"`)) {
		t.Fatalf("sixth event = %q / %q", sixthType, sixthData)
	}
}

func TestEventsStreamReceivesQueryBlockRefreshInvalidation(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "dashboards"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task due:: 2026-05-01\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(task page) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "dashboards", "tasks.md"), []byte("# Tasks\n\n```query id=open-tasks\nfrom tasks\nwhere page = \"daily/today\"\nselect ref, due\n```\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(dashboard) error = %v", err)
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	queryBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/tasks")
	if err != nil {
		t.Fatalf("GetQueryBlocks() error = %v", err)
	}
	if len(queryBlocks) != 1 {
		t.Fatalf("queryBlocks = %#v", queryBlocks)
	}

	server := httptest.NewServer(NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault:  vaultService,
		Index:  indexService,
		Query:  queryService,
		Events: NewEventBroker(),
	}))
	defer server.Close()

	response, err := http.Get(server.URL + "/api/events")
	if err != nil {
		t.Fatalf("GET /api/events error = %v", err)
	}
	defer response.Body.Close()

	reader := bufio.NewReader(response.Body)
	eventType, _, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read initial SSE event error = %v", err)
	}
	if eventType != "" {
		t.Fatalf("unexpected initial event type = %q", eventType)
	}

	time.Sleep(2 * time.Millisecond)

	updatedTaskPage := filepath.Join(vaultDir, "daily", "today.md")
	if err := os.WriteFile(updatedTaskPage, []byte("# Today\n\n- [ ] First task due:: 2026-05-02\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated task page) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "daily/today"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}

	refreshRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api/pages/dashboards/tasks/query-blocks/"+queryBlocks[0].BlockKey+"/refresh", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}

	refreshResponse, err := http.DefaultClient.Do(refreshRequest)
	if err != nil {
		t.Fatalf("POST refresh error = %v", err)
	}
	defer refreshResponse.Body.Close()
	if refreshResponse.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(refreshResponse.Body)
		t.Fatalf("POST refresh status = %d, body = %s", refreshResponse.StatusCode, string(bodyBytes))
	}

	firstType, firstData, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read first event error = %v", err)
	}
	secondType, secondData, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read second event error = %v", err)
	}
	thirdType, thirdData, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read third event error = %v", err)
	}

	if firstType != "query-block.changed" || !bytes.Contains([]byte(firstData), []byte(`"page":"dashboards/tasks"`)) || !bytes.Contains([]byte(firstData), []byte(`"id":"open-tasks"`)) || !bytes.Contains([]byte(firstData), []byte(`"key":"`+queryBlocks[0].BlockKey+`"`)) || !bytes.Contains([]byte(firstData), []byte(`"rowCount":1`)) || !bytes.Contains([]byte(firstData), []byte(`"renderHint":"table"`)) || !bytes.Contains([]byte(firstData), []byte(`"stale":false`)) {
		t.Fatalf("first event = %q / %q", firstType, firstData)
	}
	if secondType != "derived.changed" || !bytes.Contains([]byte(secondData), []byte(`"page":"dashboards/tasks"`)) {
		t.Fatalf("second event = %q / %q", secondType, secondData)
	}
	if thirdType != "query.changed" || !bytes.Contains([]byte(thirdData), []byte(`"page":"dashboards/tasks"`)) || !bytes.Contains([]byte(thirdData), []byte(`"triggerPage":"dashboards/tasks"`)) || !bytes.Contains([]byte(thirdData), []byte(`"id":"open-tasks"`)) || !bytes.Contains([]byte(thirdData), []byte(`"key":"`+queryBlocks[0].BlockKey+`"`)) || !bytes.Contains([]byte(thirdData), []byte(`"blockCount":1`)) || !bytes.Contains([]byte(thirdData), []byte(`"blocks":[{`)) || !bytes.Contains([]byte(thirdData), []byte(`"renderHint":"table"`)) {
		t.Fatalf("third event = %q / %q", thirdType, thirdData)
	}
}

func TestEventsStreamReceivesBulkQueryBlockRefreshInvalidation(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	if err := os.MkdirAll(filepath.Join(vaultDir, "daily"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(vaultDir, "dashboards"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task due:: 2026-05-01\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(task page) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "dashboards", "tasks.md"), []byte("# Tasks\n\n```query id=open-tasks\nfrom tasks\nwhere page = \"daily/today\"\nselect ref\n```\n\n```query\nfrom tasks\nwhere page = \"daily/today\"\nselect ref, due\n```\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(dashboard) error = %v", err)
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	server := httptest.NewServer(NewRouter(Dependencies{
		Config: config.Config{
			ListenAddr: ":8080",
			VaultPath:  vaultDir,
			DataDir:    dataDir,
		},
		Vault:  vaultService,
		Index:  indexService,
		Query:  queryService,
		Events: NewEventBroker(),
	}))
	defer server.Close()

	response, err := http.Get(server.URL + "/api/events")
	if err != nil {
		t.Fatalf("GET /api/events error = %v", err)
	}
	defer response.Body.Close()

	reader := bufio.NewReader(response.Body)
	eventType, _, err := readSSEEvent(reader)
	if err != nil {
		t.Fatalf("read initial SSE event error = %v", err)
	}
	if eventType != "" {
		t.Fatalf("unexpected initial event type = %q", eventType)
	}

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task due:: 2026-05-02\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated task page) error = %v", err)
	}

	if err := indexService.ReindexPage(context.Background(), vaultService, "daily/today"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}

	refreshRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api/pages/dashboards/tasks/query-blocks/refresh", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}

	refreshResponse, err := http.DefaultClient.Do(refreshRequest)
	if err != nil {
		t.Fatalf("POST bulk refresh error = %v", err)
	}
	defer refreshResponse.Body.Close()
	if refreshResponse.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(refreshResponse.Body)
		t.Fatalf("POST bulk refresh status = %d, body = %s", refreshResponse.StatusCode, string(bodyBytes))
	}

	events := make([]struct {
		Type string
		Data string
	}, 0, 4)
	for len(events) < 4 {
		eventType, eventData, err := readSSEEvent(reader)
		if err != nil {
			t.Fatalf("read event error = %v", err)
		}
		if eventType == "query-block.changed" || eventType == "derived.changed" || eventType == "query.changed" {
			events = append(events, struct {
				Type string
				Data string
			}{Type: eventType, Data: eventData})
		}
	}

	if events[0].Type != "query-block.changed" || !bytes.Contains([]byte(events[0].Data), []byte(`"page":"dashboards/tasks"`)) {
		t.Fatalf("first event = %#v", events[0])
	}
	if events[1].Type != "query-block.changed" || !bytes.Contains([]byte(events[1].Data), []byte(`"page":"dashboards/tasks"`)) || !bytes.Contains([]byte(events[1].Data), []byte(`"renderHint":"table"`)) {
		t.Fatalf("second event = %#v", events[1])
	}
	if events[2].Type != "derived.changed" || !bytes.Contains([]byte(events[2].Data), []byte(`"page":"dashboards/tasks"`)) {
		t.Fatalf("third event = %#v", events[2])
	}
	if events[3].Type != "query.changed" || !bytes.Contains([]byte(events[3].Data), []byte(`"page":"dashboards/tasks"`)) || !bytes.Contains([]byte(events[3].Data), []byte(`"blockCount":2`)) || !bytes.Contains([]byte(events[3].Data), []byte(`"blocks":[{`)) {
		t.Fatalf("fourth event = %#v", events[3])
	}
}

func TestPublishInvalidationEventsSkipsUnrelatedScopedQueryPages(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "dashboards"),
		filepath.Join(vaultDir, "projects"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"):      "# Today\n\n- [ ] First task\n",
		filepath.Join(vaultDir, "projects", "alpha.md"):   "# Alpha\n\n- [ ] Alpha task\n",
		filepath.Join(vaultDir, "dashboards", "all.md"):   "# All\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n",
		filepath.Join(vaultDir, "dashboards", "alpha.md"): "# Alpha Dashboard\n\n```query\nfrom tasks\nwhere page = \"projects/alpha\"\nselect ref\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	allBefore, err := indexService.GetQueryBlocks(context.Background(), "dashboards/all")
	if err != nil {
		t.Fatalf("GetQueryBlocks(all) error = %v", err)
	}
	alphaBefore, err := indexService.GetQueryBlocks(context.Background(), "dashboards/alpha")
	if err != nil {
		t.Fatalf("GetQueryBlocks(alpha) error = %v", err)
	}
	if len(allBefore) != 1 || len(alphaBefore) != 1 {
		t.Fatalf("initial query blocks = %#v / %#v", allBefore, alphaBefore)
	}
	beforeTask, err := indexService.GetTask(context.Background(), "daily/today:3")
	if err != nil {
		t.Fatalf("GetTask(before) error = %v", err)
	}

	time.Sleep(time.Millisecond)

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [x] First task\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "daily/today"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}
	afterTask, err := indexService.GetTask(context.Background(), "daily/today:3")
	if err != nil {
		t.Fatalf("GetTask(after) error = %v", err)
	}

	oldTask := beforeTask
	newTask := afterTask
	PublishInvalidationEvents(context.Background(), NewEventBroker(), indexService, queryService, "daily/today", nil, []query.TaskChange{{
		Before: &oldTask,
		After:  &newTask,
	}})

	allAfter, err := indexService.GetQueryBlocks(context.Background(), "dashboards/all")
	if err != nil {
		t.Fatalf("GetQueryBlocks(all after) error = %v", err)
	}
	alphaAfter, err := indexService.GetQueryBlocks(context.Background(), "dashboards/alpha")
	if err != nil {
		t.Fatalf("GetQueryBlocks(alpha after) error = %v", err)
	}

	if allAfter[0].UpdatedAt == allBefore[0].UpdatedAt {
		t.Fatalf("all dashboard cache did not refresh: before=%q after=%q", allBefore[0].UpdatedAt, allAfter[0].UpdatedAt)
	}
	if alphaAfter[0].UpdatedAt != alphaBefore[0].UpdatedAt {
		t.Fatalf("scoped dashboard cache unexpectedly refreshed: before=%q after=%q", alphaBefore[0].UpdatedAt, alphaAfter[0].UpdatedAt)
	}
}

func TestPublishInvalidationEventsSkipsTaskQueriesUnaffectedByChangedFields(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "dashboards"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"):        "# Today\n\n- [ ] First task due:: 2026-05-01\n",
		filepath.Join(vaultDir, "dashboards", "stable.md"):  "# Stable\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n",
		filepath.Join(vaultDir, "dashboards", "ordered.md"): "# Ordered\n\n```query\nfrom tasks\nwhere done = false\norder by due\nselect ref\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	stableBefore, err := indexService.GetQueryBlocks(context.Background(), "dashboards/stable")
	if err != nil {
		t.Fatalf("GetQueryBlocks(stable) error = %v", err)
	}
	orderedBefore, err := indexService.GetQueryBlocks(context.Background(), "dashboards/ordered")
	if err != nil {
		t.Fatalf("GetQueryBlocks(ordered) error = %v", err)
	}
	beforeTask, err := indexService.GetTask(context.Background(), "daily/today:3")
	if err != nil {
		t.Fatalf("GetTask(before) error = %v", err)
	}

	time.Sleep(time.Millisecond)

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task due:: 2026-05-02\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "daily/today"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}
	afterTask, err := indexService.GetTask(context.Background(), "daily/today:3")
	if err != nil {
		t.Fatalf("GetTask(after) error = %v", err)
	}

	oldTask := beforeTask
	newTask := afterTask
	PublishInvalidationEvents(context.Background(), NewEventBroker(), indexService, queryService, "daily/today", nil, []query.TaskChange{{
		Before: &oldTask,
		After:  &newTask,
	}})

	stableAfter, err := indexService.GetQueryBlocks(context.Background(), "dashboards/stable")
	if err != nil {
		t.Fatalf("GetQueryBlocks(stable after) error = %v", err)
	}
	orderedAfter, err := indexService.GetQueryBlocks(context.Background(), "dashboards/ordered")
	if err != nil {
		t.Fatalf("GetQueryBlocks(ordered after) error = %v", err)
	}

	if stableAfter[0].UpdatedAt != stableBefore[0].UpdatedAt {
		t.Fatalf("stable dashboard unexpectedly refreshed: before=%q after=%q", stableBefore[0].UpdatedAt, stableAfter[0].UpdatedAt)
	}
	if orderedAfter[0].UpdatedAt == orderedBefore[0].UpdatedAt {
		t.Fatalf("ordered dashboard did not refresh: before=%q after=%q", orderedBefore[0].UpdatedAt, orderedAfter[0].UpdatedAt)
	}
}

func TestPublishInvalidationEventsSkipsPageQueriesUnaffectedByChangedFields(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "notes"),
		filepath.Join(vaultDir, "dashboards"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "notes", "alpha.md"):             "# Alpha\n\nBody one.\n",
		filepath.Join(vaultDir, "dashboards", "pages-stable.md"): "# Stable\n\n```query\nfrom pages\nselect path\n```\n",
		filepath.Join(vaultDir, "dashboards", "pages-fresh.md"):  "# Fresh\n\n```query\nfrom pages\nselect path, title\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	beforePageRecord, err := indexService.GetPage(context.Background(), "notes/alpha")
	if err != nil {
		t.Fatalf("GetPage(before) error = %v", err)
	}
	stableBefore, err := indexService.GetQueryBlocks(context.Background(), "dashboards/pages-stable")
	if err != nil {
		t.Fatalf("GetQueryBlocks(stable) error = %v", err)
	}
	freshBefore, err := indexService.GetQueryBlocks(context.Background(), "dashboards/pages-fresh")
	if err != nil {
		t.Fatalf("GetQueryBlocks(fresh) error = %v", err)
	}

	time.Sleep(time.Millisecond)

	if err := os.WriteFile(filepath.Join(vaultDir, "notes", "alpha.md"), []byte("# Beta\n\nBody two.\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "notes/alpha"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}
	afterPageRecord, err := indexService.GetPage(context.Background(), "notes/alpha")
	if err != nil {
		t.Fatalf("GetPage(after) error = %v", err)
	}

	beforePage := index.PageSummary{
		Path:      beforePageRecord.Path,
		Title:     beforePageRecord.Title,
		CreatedAt: beforePageRecord.CreatedAt,
		UpdatedAt: beforePageRecord.UpdatedAt,
	}
	afterPage := index.PageSummary{
		Path:      afterPageRecord.Path,
		Title:     afterPageRecord.Title,
		CreatedAt: afterPageRecord.CreatedAt,
		UpdatedAt: afterPageRecord.UpdatedAt,
	}
	PublishInvalidationEvents(context.Background(), NewEventBroker(), indexService, queryService, "notes/alpha", []query.PageChange{{
		Before: &beforePage,
		After:  &afterPage,
	}}, nil)

	stableAfter, err := indexService.GetQueryBlocks(context.Background(), "dashboards/pages-stable")
	if err != nil {
		t.Fatalf("GetQueryBlocks(stable after) error = %v", err)
	}
	freshAfter, err := indexService.GetQueryBlocks(context.Background(), "dashboards/pages-fresh")
	if err != nil {
		t.Fatalf("GetQueryBlocks(fresh after) error = %v", err)
	}

	if stableAfter[0].UpdatedAt != stableBefore[0].UpdatedAt {
		t.Fatalf("stable page dashboard unexpectedly refreshed: before=%q after=%q", stableBefore[0].UpdatedAt, stableAfter[0].UpdatedAt)
	}
	if freshAfter[0].UpdatedAt == freshBefore[0].UpdatedAt {
		t.Fatalf("fresh page dashboard did not refresh: before=%q after=%q", freshBefore[0].UpdatedAt, freshAfter[0].UpdatedAt)
	}
}

func TestPublishInvalidationEventsRefreshesOnlyAffectedBlocksOnQueryPage(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "dashboards"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(vaultDir, "daily", "today.md"):      "# Today\n\n- [ ] First task due:: 2026-05-01\n",
		filepath.Join(vaultDir, "dashboards", "mixed.md"): "# Mixed\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n\n```query\nfrom tasks\nwhere done = false\norder by due\nselect ref\n```\n",
	}
	for filePath, content := range files {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) error = %v", filePath, err)
		}
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	beforeBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/mixed")
	if err != nil {
		t.Fatalf("GetQueryBlocks(before) error = %v", err)
	}
	if len(beforeBlocks) != 2 {
		t.Fatalf("beforeBlocks = %#v", beforeBlocks)
	}
	beforeTask, err := indexService.GetTask(context.Background(), "daily/today:3")
	if err != nil {
		t.Fatalf("GetTask(before) error = %v", err)
	}

	time.Sleep(time.Millisecond)

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task due:: 2026-05-02\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(updated) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "daily/today"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}
	afterTask, err := indexService.GetTask(context.Background(), "daily/today:3")
	if err != nil {
		t.Fatalf("GetTask(after) error = %v", err)
	}

	broker := NewEventBroker()
	events, unsubscribe := broker.Subscribe()
	defer unsubscribe()

	oldTask := beforeTask
	newTask := afterTask
	PublishInvalidationEvents(context.Background(), broker, indexService, queryService, "daily/today", nil, []query.TaskChange{{
		Before: &oldTask,
		After:  &newTask,
	}})

	afterBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/mixed")
	if err != nil {
		t.Fatalf("GetQueryBlocks(after) error = %v", err)
	}
	if len(afterBlocks) != 2 {
		t.Fatalf("afterBlocks = %#v", afterBlocks)
	}

	if afterBlocks[0].UpdatedAt != beforeBlocks[0].UpdatedAt {
		t.Fatalf("first block unexpectedly refreshed: before=%q after=%q", beforeBlocks[0].UpdatedAt, afterBlocks[0].UpdatedAt)
	}
	if afterBlocks[1].UpdatedAt == beforeBlocks[1].UpdatedAt {
		t.Fatalf("second block did not refresh: before=%q after=%q", beforeBlocks[1].UpdatedAt, afterBlocks[1].UpdatedAt)
	}

	received := make([]Event, 0, 5)
	for len(received) < 5 {
		select {
		case event := <-events:
			received = append(received, event)
		default:
			t.Fatalf("received %d events, want 5", len(received))
		}
	}

	if received[2].Type != "query-block.changed" {
		t.Fatalf("third event = %#v", received[2])
	}
	payload, ok := received[2].Data.(map[string]any)
	if !ok {
		t.Fatalf("query-block payload = %#v", received[2].Data)
	}
	if payload["page"] != "dashboards/mixed" || payload["key"] != afterBlocks[1].BlockKey {
		t.Fatalf("query-block payload = %#v", payload)
	}
	if payload["rowCount"] != 1 || payload["renderHint"] != "list" || payload["stale"] != false {
		t.Fatalf("query-block payload = %#v", payload)
	}

	if received[4].Type != "query.changed" {
		t.Fatalf("fifth event = %#v", received[4])
	}
	queryPayload, ok := received[4].Data.(map[string]any)
	if !ok {
		t.Fatalf("query payload = %#v", received[4].Data)
	}
	if queryPayload["page"] != "dashboards/mixed" || queryPayload["triggerPage"] != "daily/today" || queryPayload["blockCount"] != 1 || queryPayload["key"] != afterBlocks[1].BlockKey {
		t.Fatalf("query payload = %#v", queryPayload)
	}
	blocks, ok := queryPayload["blocks"].([]map[string]any)
	if !ok || len(blocks) != 1 || blocks[0]["key"] != afterBlocks[1].BlockKey || blocks[0]["renderHint"] != "list" {
		t.Fatalf("query blocks payload = %#v", queryPayload["blocks"])
	}
}

func TestRefreshPageCachePreservesBlockTimestampsAcrossLineShifts(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "dashboards"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(task page) error = %v", err)
	}

	original := "# Mixed\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n\n```query\nfrom tasks\nwhere done = false\norder by due\nselect ref\n```\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "dashboards", "mixed.md"), []byte(original), 0o644); err != nil {
		t.Fatalf("WriteFile(query page) error = %v", err)
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	beforeBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/mixed")
	if err != nil {
		t.Fatalf("GetQueryBlocks(before) error = %v", err)
	}
	if len(beforeBlocks) != 2 {
		t.Fatalf("beforeBlocks = %#v", beforeBlocks)
	}

	shifted := "# Mixed\n\nIntro paragraph.\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n\n```query\nfrom tasks\nwhere done = false\norder by due\nselect ref\n```\n"
	if err := vaultService.WritePage("dashboards/mixed", []byte(shifted)); err != nil {
		t.Fatalf("WritePage() error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "dashboards/mixed"); err != nil {
		t.Fatalf("ReindexPage() error = %v", err)
	}
	if err := queryService.RefreshPageCache(context.Background(), indexService, "dashboards/mixed"); err != nil {
		t.Fatalf("RefreshPageCache() error = %v", err)
	}

	afterBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/mixed")
	if err != nil {
		t.Fatalf("GetQueryBlocks(after) error = %v", err)
	}
	if len(afterBlocks) != 2 {
		t.Fatalf("afterBlocks = %#v", afterBlocks)
	}

	if afterBlocks[0].Line <= beforeBlocks[0].Line || afterBlocks[1].Line <= beforeBlocks[1].Line {
		t.Fatalf("line shift not applied: before=%#v after=%#v", beforeBlocks, afterBlocks)
	}
	if afterBlocks[0].UpdatedAt != beforeBlocks[0].UpdatedAt {
		t.Fatalf("first block timestamp changed across line shift: before=%q after=%q", beforeBlocks[0].UpdatedAt, afterBlocks[0].UpdatedAt)
	}
	if afterBlocks[1].UpdatedAt != beforeBlocks[1].UpdatedAt {
		t.Fatalf("second block timestamp changed across line shift: before=%q after=%q", beforeBlocks[1].UpdatedAt, afterBlocks[1].UpdatedAt)
	}
}

func TestRefreshPageCachePreservesDuplicateBlockTimestampsAcrossReorder(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "dashboards"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(task page) error = %v", err)
	}

	initial := "# Duplicate\n\n## Alpha\nAlpha note.\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "dashboards", "duplicate.md"), []byte(initial), 0o644); err != nil {
		t.Fatalf("WriteFile(query page) error = %v", err)
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	alphaOnly, err := indexService.GetQueryBlocks(context.Background(), "dashboards/duplicate")
	if err != nil {
		t.Fatalf("GetQueryBlocks(alpha only) error = %v", err)
	}
	if len(alphaOnly) != 1 {
		t.Fatalf("alphaOnly = %#v", alphaOnly)
	}
	alphaTimestamp := alphaOnly[0].UpdatedAt

	time.Sleep(time.Millisecond)

	betaThenAlpha := "# Duplicate\n\n## Beta\nBeta note.\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n\n## Alpha\nAlpha note.\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n"
	if err := vaultService.WritePage("dashboards/duplicate", []byte(betaThenAlpha)); err != nil {
		t.Fatalf("WritePage(betaThenAlpha) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "dashboards/duplicate"); err != nil {
		t.Fatalf("ReindexPage(betaThenAlpha) error = %v", err)
	}
	if err := queryService.RefreshPageCache(context.Background(), indexService, "dashboards/duplicate"); err != nil {
		t.Fatalf("RefreshPageCache(betaThenAlpha) error = %v", err)
	}

	afterAdd, err := indexService.GetQueryBlocks(context.Background(), "dashboards/duplicate")
	if err != nil {
		t.Fatalf("GetQueryBlocks(after add) error = %v", err)
	}
	if len(afterAdd) != 2 {
		t.Fatalf("afterAdd = %#v", afterAdd)
	}
	if afterAdd[1].UpdatedAt != alphaTimestamp {
		t.Fatalf("alpha block timestamp was not preserved when adding duplicate: before=%q after=%q", alphaTimestamp, afterAdd[1].UpdatedAt)
	}
	betaTimestamp := afterAdd[0].UpdatedAt
	if betaTimestamp == alphaTimestamp {
		t.Fatalf("expected duplicate blocks to have distinct timestamps after add: %#v", afterAdd)
	}

	time.Sleep(time.Millisecond)

	alphaThenBeta := "# Duplicate\n\n## Alpha\nAlpha note.\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n\n## Beta\nBeta note.\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n"
	if err := vaultService.WritePage("dashboards/duplicate", []byte(alphaThenBeta)); err != nil {
		t.Fatalf("WritePage(alphaThenBeta) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "dashboards/duplicate"); err != nil {
		t.Fatalf("ReindexPage(alphaThenBeta) error = %v", err)
	}
	if err := queryService.RefreshPageCache(context.Background(), indexService, "dashboards/duplicate"); err != nil {
		t.Fatalf("RefreshPageCache(alphaThenBeta) error = %v", err)
	}

	afterReorder, err := indexService.GetQueryBlocks(context.Background(), "dashboards/duplicate")
	if err != nil {
		t.Fatalf("GetQueryBlocks(after reorder) error = %v", err)
	}
	if len(afterReorder) != 2 {
		t.Fatalf("afterReorder = %#v", afterReorder)
	}

	if afterReorder[0].UpdatedAt != alphaTimestamp {
		t.Fatalf("alpha block timestamp followed occurrence order instead of structural identity: want=%q got=%q", alphaTimestamp, afterReorder[0].UpdatedAt)
	}
	if afterReorder[1].UpdatedAt != betaTimestamp {
		t.Fatalf("beta block timestamp followed occurrence order instead of structural identity: want=%q got=%q", betaTimestamp, afterReorder[1].UpdatedAt)
	}
}

func TestRefreshPageCachePreservesSameHeadingDuplicateBlockTimestampsAcrossReorder(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "dashboards"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(task page) error = %v", err)
	}

	initial := "# Same Heading\n\n## Tasks\nAlpha label.\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n\nBeta label.\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "dashboards", "same-heading.md"), []byte(initial), 0o644); err != nil {
		t.Fatalf("WriteFile(query page) error = %v", err)
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	beforeBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/same-heading")
	if err != nil {
		t.Fatalf("GetQueryBlocks(before) error = %v", err)
	}
	if len(beforeBlocks) != 2 {
		t.Fatalf("beforeBlocks = %#v", beforeBlocks)
	}
	alphaKey := beforeBlocks[0].BlockKey
	betaKey := beforeBlocks[1].BlockKey
	if alphaKey == betaKey {
		t.Fatalf("expected same-heading duplicates to have distinct block keys: %#v", beforeBlocks)
	}

	time.Sleep(time.Millisecond)

	reordered := "# Same Heading\n\n## Tasks\nBeta label.\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n\nAlpha label.\n\n```query\nfrom tasks\nwhere done = false\nselect ref\n```\n"
	if err := vaultService.WritePage("dashboards/same-heading", []byte(reordered)); err != nil {
		t.Fatalf("WritePage(reordered) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "dashboards/same-heading"); err != nil {
		t.Fatalf("ReindexPage(reordered) error = %v", err)
	}
	if err := queryService.RefreshPageCache(context.Background(), indexService, "dashboards/same-heading"); err != nil {
		t.Fatalf("RefreshPageCache(reordered) error = %v", err)
	}

	afterBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/same-heading")
	if err != nil {
		t.Fatalf("GetQueryBlocks(after) error = %v", err)
	}
	if len(afterBlocks) != 2 {
		t.Fatalf("afterBlocks = %#v", afterBlocks)
	}

	if afterBlocks[0].BlockKey != betaKey {
		t.Fatalf("beta block identity did not stay attached to its local label: want=%q got=%q", betaKey, afterBlocks[0].BlockKey)
	}
	if afterBlocks[1].BlockKey != alphaKey {
		t.Fatalf("alpha block identity did not stay attached to its local label: want=%q got=%q", alphaKey, afterBlocks[1].BlockKey)
	}
}

func TestRefreshPageCachePreservesExplicitIDAcrossAdjacentDuplicateReorder(t *testing.T) {
	t.Parallel()

	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	dataDir := filepath.Join(rootDir, "data")

	for _, dir := range []string{
		filepath.Join(vaultDir, "daily"),
		filepath.Join(vaultDir, "dashboards"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%q) error = %v", dir, err)
		}
	}

	if err := os.WriteFile(filepath.Join(vaultDir, "daily", "today.md"), []byte("# Today\n\n- [ ] First task\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(task page) error = %v", err)
	}

	initial := "# Explicit IDs\n\n## Tasks\n\n```query id=alpha\nfrom tasks\nwhere done = false\nselect ref\n```\n\n```query id=beta\nfrom tasks\nwhere done = false\nselect ref\n```\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "dashboards", "explicit-ids.md"), []byte(initial), 0o644); err != nil {
		t.Fatalf("WriteFile(query page) error = %v", err)
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	beforeBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/explicit-ids")
	if err != nil {
		t.Fatalf("GetQueryBlocks(before) error = %v", err)
	}
	if len(beforeBlocks) != 2 {
		t.Fatalf("beforeBlocks = %#v", beforeBlocks)
	}
	alphaKey := beforeBlocks[0].BlockKey
	betaKey := beforeBlocks[1].BlockKey
	if alphaKey == betaKey {
		t.Fatalf("expected explicit ids to produce distinct block keys: %#v", beforeBlocks)
	}

	reordered := "# Explicit IDs\n\n## Tasks\n\n```query id=beta\nfrom tasks\nwhere done = false\nselect ref\n```\n\n```query id=alpha\nfrom tasks\nwhere done = false\nselect ref\n```\n"
	if err := vaultService.WritePage("dashboards/explicit-ids", []byte(reordered)); err != nil {
		t.Fatalf("WritePage(reordered) error = %v", err)
	}
	if err := indexService.ReindexPage(context.Background(), vaultService, "dashboards/explicit-ids"); err != nil {
		t.Fatalf("ReindexPage(reordered) error = %v", err)
	}
	if err := queryService.RefreshPageCache(context.Background(), indexService, "dashboards/explicit-ids"); err != nil {
		t.Fatalf("RefreshPageCache(reordered) error = %v", err)
	}

	afterBlocks, err := indexService.GetQueryBlocks(context.Background(), "dashboards/explicit-ids")
	if err != nil {
		t.Fatalf("GetQueryBlocks(after) error = %v", err)
	}
	if len(afterBlocks) != 2 {
		t.Fatalf("afterBlocks = %#v", afterBlocks)
	}

	if afterBlocks[0].BlockKey != betaKey {
		t.Fatalf("beta explicit id did not preserve block identity: want=%q got=%q", betaKey, afterBlocks[0].BlockKey)
	}
	if afterBlocks[1].BlockKey != alphaKey {
		t.Fatalf("alpha explicit id did not preserve block identity: want=%q got=%q", alphaKey, afterBlocks[1].BlockKey)
	}
}

func buildTestRouter(t *testing.T, vaultDir, dataDir string) http.Handler {
	return buildTestRouterWithDeps(t, vaultDir, dataDir, Dependencies{})
}

func buildTestRouterWithDeps(t *testing.T, vaultDir, dataDir string, deps Dependencies) http.Handler {
	t.Helper()

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(dataDir)
	queryService := query.NewService()
	if err := indexService.Open(context.Background()); err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	t.Cleanup(func() {
		_ = indexService.Close()
	})
	if err := indexService.RebuildFromVault(context.Background(), vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}
	if err := queryService.RefreshAll(context.Background(), indexService); err != nil {
		t.Fatalf("RefreshAll() error = %v", err)
	}

	if deps.Config.ListenAddr == "" {
		deps.Config.ListenAddr = ":8080"
	}
	if deps.Config.VaultPath == "" {
		deps.Config.VaultPath = vaultDir
	}
	if deps.Config.DataDir == "" {
		deps.Config.DataDir = dataDir
	}
	if deps.Vault == nil {
		deps.Vault = vaultService
	}
	if deps.Index == nil {
		deps.Index = indexService
	}
	if deps.Query == nil {
		deps.Query = queryService
	}
	if deps.Documents == nil {
		documentService, err := documents.NewService(vaultDir)
		if err != nil {
			t.Fatalf("documents.NewService() error = %v", err)
		}
		deps.Documents = documentService
	}
	if deps.Events == nil {
		deps.Events = NewEventBroker()
	}

	return NewRouter(deps)
}

func readSSEEvent(reader *bufio.Reader) (string, string, error) {
	var eventType string
	var data string

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return "", "", err
		}

		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			return eventType, data, nil
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		if strings.HasPrefix(line, "event: ") {
			eventType = strings.TrimSpace(strings.TrimPrefix(line, "event: "))
			continue
		}
		if strings.HasPrefix(line, "data: ") {
			data = strings.TrimSpace(strings.TrimPrefix(line, "data: "))
		}
	}
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
