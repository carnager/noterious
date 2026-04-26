package app

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestShouldLogHTTPRequest(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		method   string
		path     string
		status   int
		duration time.Duration
		want     bool
	}{
		{
			name:     "successful api get is logged",
			method:   http.MethodGet,
			path:     "/api/pages",
			status:   http.StatusOK,
			duration: 10 * time.Millisecond,
			want:     true,
		},
		{
			name:     "healthz remains suppressed",
			method:   http.MethodGet,
			path:     "/api/healthz",
			status:   http.StatusOK,
			duration: 10 * time.Millisecond,
			want:     false,
		},
		{
			name:     "events remains suppressed",
			method:   http.MethodGet,
			path:     "/api/events",
			status:   http.StatusOK,
			duration: 10 * time.Millisecond,
			want:     false,
		},
		{
			name:     "errors are always logged",
			method:   http.MethodGet,
			path:     "/api/healthz",
			status:   http.StatusInternalServerError,
			duration: 10 * time.Millisecond,
			want:     true,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(tt.method, tt.path, nil)
			got := shouldLogHTTPRequest(req, tt.status, tt.duration)
			if got != tt.want {
				t.Fatalf("shouldLogHTTPRequest(%s %s, %d, %s) = %v, want %v", tt.method, tt.path, tt.status, tt.duration, got, tt.want)
			}
		})
	}
}

func TestResponseRecorderTracksImplicitStatusAndBytes(t *testing.T) {
	t.Parallel()

	recorder := &responseRecorder{ResponseWriter: httptest.NewRecorder()}
	written, err := recorder.Write([]byte("ok"))
	if err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if written != 2 {
		t.Fatalf("Write() = %d, want 2", written)
	}
	if recorder.status != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.status, http.StatusOK)
	}
	if recorder.bytes != 2 {
		t.Fatalf("bytes = %d, want 2", recorder.bytes)
	}
}
