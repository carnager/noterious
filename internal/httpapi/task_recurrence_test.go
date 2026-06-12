package httpapi

import (
	"testing"
	"time"

	"github.com/carnager/noterious/internal/index"
)

func TestParseRepeatInterval(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input  string
		years  int
		months int
		days   int
		ok     bool
	}{
		{input: "daily", days: 1, ok: true},
		{input: "weekly", days: 7, ok: true},
		{input: "monthly", months: 1, ok: true},
		{input: "yearly", years: 1, ok: true},
		{input: "annually", years: 1, ok: true},
		{input: "2d", days: 2, ok: true},
		{input: "3w", days: 21, ok: true},
		{input: "6m", months: 6, ok: true},
		{input: "1y", years: 1, ok: true},
		{input: " Weekly ", days: 7, ok: true},
		{input: "0d", ok: false},
		{input: "sometimes", ok: false},
		{input: "", ok: false},
	}
	for _, test := range tests {
		years, months, days, ok := parseRepeatInterval(test.input)
		if ok != test.ok || years != test.years || months != test.months || days != test.days {
			t.Errorf("parseRepeatInterval(%q) = %d,%d,%d,%v want %d,%d,%d,%v",
				test.input, years, months, days, ok, test.years, test.months, test.days, test.ok)
		}
	}
}

func TestNextRecurrence(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 6, 12, 10, 0, 0, 0, time.Local)
	ptr := func(s string) *string { return &s }

	t.Run("future due advances once", func(t *testing.T) {
		due, remind, ok := nextRecurrence(index.Task{Repeat: ptr("weekly"), Due: ptr("2026-06-14")}, now)
		if !ok || due == nil || *due != "2026-06-21" || remind != nil {
			t.Fatalf("nextRecurrence = %v, %v, %v", deref(due), deref(remind), ok)
		}
	})

	t.Run("overdue due catches up past today", func(t *testing.T) {
		due, _, ok := nextRecurrence(index.Task{Repeat: ptr("weekly"), Due: ptr("2026-05-01")}, now)
		if !ok || due == nil || *due != "2026-06-19" {
			t.Fatalf("nextRecurrence = %v, %v", deref(due), ok)
		}
	})

	t.Run("remind keeps time of day", func(t *testing.T) {
		_, remind, ok := nextRecurrence(index.Task{Repeat: ptr("daily"), Remind: ptr("2026-06-12 08:30")}, now)
		if !ok || remind == nil || *remind != "2026-06-13 08:30" {
			t.Fatalf("nextRecurrence remind = %v, %v", deref(remind), ok)
		}
	})

	t.Run("no dates seeds due from today", func(t *testing.T) {
		due, remind, ok := nextRecurrence(index.Task{Repeat: ptr("monthly")}, now)
		if !ok || due == nil || *due != "2026-07-12" || remind != nil {
			t.Fatalf("nextRecurrence = %v, %v, %v", deref(due), deref(remind), ok)
		}
	})

	t.Run("invalid interval is ignored", func(t *testing.T) {
		if _, _, ok := nextRecurrence(index.Task{Repeat: ptr("whenever"), Due: ptr("2026-06-14")}, now); ok {
			t.Fatal("nextRecurrence accepted invalid interval")
		}
	})

	t.Run("no repeat field", func(t *testing.T) {
		if _, _, ok := nextRecurrence(index.Task{Due: ptr("2026-06-14")}, now); ok {
			t.Fatal("nextRecurrence fired without repeat field")
		}
	})
}

func deref(value *string) string {
	if value == nil {
		return "<nil>"
	}
	return *value
}
