package app

import (
	"bufio"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"
)

type responseRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *responseRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *responseRecorder) Write(p []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	written, err := r.ResponseWriter.Write(p)
	r.bytes += written
	return written, err
}

func (r *responseRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}

func (r *responseRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (r *responseRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("response writer does not support hijacking")
	}
	return hijacker.Hijack()
}

func withHTTPLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		recorder := &responseRecorder{ResponseWriter: w}

		defer func() {
			if recovered := recover(); recovered != nil {
				slog.Error("http request panicked",
					"method", r.Method,
					"path", r.URL.Path,
					"remote", requestRemoteAddr(r),
					"error", fmt.Sprint(recovered),
				)
				http.Error(recorder, "internal server error", http.StatusInternalServerError)
			}

			status := recorder.status
			if status == 0 {
				status = http.StatusOK
			}
			duration := time.Since(started)
			if !shouldLogHTTPRequest(r, status, duration) {
				return
			}

			level := slog.LevelInfo
			message := "http request"
			switch {
			case status >= 500:
				level = slog.LevelError
				message = "http request failed"
			case status >= 400:
				level = slog.LevelWarn
				message = "http request rejected"
			case duration >= 750*time.Millisecond:
				message = "http request slow"
			}

			slog.Log(r.Context(), level, message,
				"method", r.Method,
				"path", r.URL.Path,
				"query", r.URL.RawQuery,
				"status", status,
				"duration", duration.Round(time.Millisecond).String(),
				"bytes", recorder.bytes,
				"remote", requestRemoteAddr(r),
			)
		}()

		next.ServeHTTP(recorder, r)
	})
}

func shouldLogHTTPRequest(r *http.Request, status int, duration time.Duration) bool {
	if status >= 400 {
		return true
	}
	if duration >= 750*time.Millisecond {
		return true
	}
	switch r.URL.Path {
	case "/api/healthz", "/api/events":
		return false
	default:
		return true
	}
}

func requestRemoteAddr(r *http.Request) string {
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	if forwarded := strings.TrimSpace(r.Header.Get("X-Real-IP")); forwarded != "" {
		return forwarded
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}
