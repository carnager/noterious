package query

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/carnager/noterious/internal/index"
	"github.com/carnager/noterious/internal/vault"
)

func TestResolveDateExpression(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 6, 12, 14, 30, 0, 0, time.Local)
	tests := []struct {
		input    string
		want     string
		resolved bool
	}{
		{input: "today", want: "2026-06-12", resolved: true},
		{input: "TODAY", want: "2026-06-12", resolved: true},
		{input: "today+7d", want: "2026-06-19", resolved: true},
		{input: "today-30d", want: "2026-05-13", resolved: true},
		{input: "today+2w", want: "2026-06-26", resolved: true},
		{input: "today+1m", want: "2026-07-12", resolved: true},
		{input: "today-1y", want: "2025-06-12", resolved: true},
		{input: "now", want: "2026-06-12 14:30", resolved: true},
		{input: "now+2h", want: "2026-06-12 16:30", resolved: true},
		{input: "now-1d", want: "2026-06-11 14:30", resolved: true},
		{input: "today+2h", resolved: false},
		{input: "tomorrow", resolved: false},
		{input: "today+d", resolved: false},
		{input: "today + 7d", resolved: false},
		{input: "todayish", resolved: false},
		{input: "", resolved: false},
	}

	for _, test := range tests {
		got, ok := resolveDateExpression(test.input, now)
		if ok != test.resolved {
			t.Errorf("resolveDateExpression(%q) resolved = %v, want %v", test.input, ok, test.resolved)
			continue
		}
		if ok && got != test.want {
			t.Errorf("resolveDateExpression(%q) = %q, want %q", test.input, got, test.want)
		}
	}
}

func TestParseWhereClauseResolvesRelativeDates(t *testing.T) {
	t.Parallel()

	expected, _ := resolveDateExpression("today+7d", time.Now().In(time.Local))

	for _, clause := range []string{
		"due <= today+7d",
		"due <= today + 7d",
	} {
		groups, err := parseWhereClause(clause)
		if err != nil {
			t.Fatalf("parseWhereClause(%q) error = %v", clause, err)
		}
		if len(groups) != 1 || len(groups[0]) != 1 {
			t.Fatalf("parseWhereClause(%q) groups = %#v", clause, groups)
		}
		filter := groups[0][0]
		if filter.Field != "due" || filter.Op != "<=" {
			t.Fatalf("parseWhereClause(%q) filter = %#v", clause, filter)
		}
		if filter.Value != expected {
			t.Fatalf("parseWhereClause(%q) value = %v, want %q", clause, filter.Value, expected)
		}
	}
}

func TestParseWhereClauseKeepsQuotedTodayLiteral(t *testing.T) {
	t.Parallel()

	groups, err := parseWhereClause(`status = "today"`)
	if err != nil {
		t.Fatalf("parseWhereClause() error = %v", err)
	}
	if groups[0][0].Value != "today" {
		t.Fatalf("quoted literal value = %v, want \"today\"", groups[0][0].Value)
	}
}

func TestParseWhereClauseStillRejectsInvalidMultiTokenValues(t *testing.T) {
	t.Parallel()

	if _, err := parseWhereClause("due <= foo bar"); err == nil {
		t.Fatal("parseWhereClause(due <= foo bar) expected error, got nil")
	}
}

func TestCommonEqualityValue(t *testing.T) {
	t.Parallel()

	pinned := [][]Filter{
		{{Field: "page", Op: "=", Value: "daily/today"}, {Field: "done", Op: "=", Value: false}},
		{{Field: "page", Op: "=", Value: "daily/today"}},
	}
	if value, ok := commonEqualityValue(pinned, "page"); !ok || value != "daily/today" {
		t.Fatalf("commonEqualityValue(pinned) = %q, %v", value, ok)
	}

	for name, groups := range map[string][][]Filter{
		"empty":           {},
		"missing in one":  {{{Field: "page", Op: "=", Value: "a"}}, {{Field: "done", Op: "=", Value: true}}},
		"different value": {{{Field: "page", Op: "=", Value: "a"}}, {{Field: "page", Op: "=", Value: "b"}}},
		"not equality":    {{{Field: "page", Op: "!=", Value: "a"}}},
		"non string":      {{{Field: "page", Op: "=", Value: int64(3)}}},
	} {
		if _, ok := commonEqualityValue(groups, "page"); ok {
			t.Fatalf("commonEqualityValue(%s) = true, want false", name)
		}
	}
}

func TestExecutePushesPageEqualityDown(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	if err := os.MkdirAll(vaultDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "alpha.md"), []byte("- [ ] One\n- [x] Two\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(alpha) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(vaultDir, "beta.md"), []byte("- [ ] Other\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(beta) error = %v", err)
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(filepath.Join(rootDir, "data"))
	if err := indexService.Open(ctx); err != nil {
		t.Fatalf("index.Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(ctx, vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}

	queryService := NewService()
	result, err := queryService.Execute(ctx, indexService, "from tasks\nwhere page = \"alpha\"\nselect ref, text, done")
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if len(result.Rows) != 2 {
		t.Fatalf("Execute() rows = %#v, want 2", result.Rows)
	}
	for _, row := range result.Rows {
		if fmt.Sprint(row["text"]) == "Other" {
			t.Fatalf("Execute() leaked row from other page: %#v", row)
		}
	}
}

func TestExecuteFiltersTasksByRelativeDueDate(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	rootDir := t.TempDir()
	vaultDir := filepath.Join(rootDir, "vault")
	if err := os.MkdirAll(vaultDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	now := time.Now().In(time.Local)
	soon := now.AddDate(0, 0, 3).Format("2006-01-02")
	far := now.AddDate(0, 0, 30).Format("2006-01-02")
	markdown := "# Tasks\n\n" +
		"- [ ] Soon [due: " + soon + "]\n" +
		"- [ ] Far [due: " + far + "]\n"
	if err := os.WriteFile(filepath.Join(vaultDir, "tasks.md"), []byte(markdown), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	vaultService := vault.NewService(vaultDir)
	indexService := index.NewService(filepath.Join(rootDir, "data"))
	if err := indexService.Open(ctx); err != nil {
		t.Fatalf("index.Open() error = %v", err)
	}
	defer func() {
		_ = indexService.Close()
	}()
	if err := indexService.RebuildFromVault(ctx, vaultService); err != nil {
		t.Fatalf("RebuildFromVault() error = %v", err)
	}

	queryService := NewService()
	result, err := queryService.Execute(ctx, indexService, "from tasks\nwhere done = false and due <= today + 7d\nselect ref, due")
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if len(result.Rows) != 1 {
		t.Fatalf("Execute() rows = %#v, want 1 row", result.Rows)
	}
	if due := fmt.Sprint(result.Rows[0]["due"]); due != soon {
		t.Fatalf("Execute() row due = %q, want %q", due, soon)
	}
}
