package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

const (
	defaultCookieName        = "noterious_session"
	defaultSessionTTL        = 30 * 24 * time.Hour
	sessionHeartbeatInterval = 5 * time.Minute
)

var (
	ErrAuthenticationRequired = errors.New("authentication required")
	ErrInvalidCredentials     = errors.New("invalid username or password")
)

type BootstrapConfig struct {
	Username string
	Password string
}

type BootstrapResult struct {
	Created           bool
	Username          string
	GeneratedPassword string
}

type User struct {
	ID          int64      `json:"id"`
	Username    string     `json:"username"`
	Role        string     `json:"role"`
	CreatedAt   time.Time  `json:"createdAt"`
	LastLoginAt *time.Time `json:"lastLoginAt,omitempty"`
}

type Session struct {
	Token     string
	User      User
	ExpiresAt time.Time
}

type Service struct {
	db         *sql.DB
	path       string
	cookieName string
	sessionTTL time.Duration
}

func NewService(ctx context.Context, dataDir string, cookieName string, sessionTTL time.Duration) (*Service, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create auth data dir: %w", err)
	}
	dbPath := filepath.Join(dataDir, "noterious.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open auth sqlite: %w", err)
	}

	service := &Service{
		db:         db,
		path:       dbPath,
		cookieName: strings.TrimSpace(cookieName),
		sessionTTL: sessionTTL,
	}
	if service.cookieName == "" {
		service.cookieName = defaultCookieName
	}
	if service.sessionTTL <= 0 {
		service.sessionTTL = defaultSessionTTL
	}

	if err := service.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	return service, nil
}

func (s *Service) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Service) Path() string {
	return s.path
}

func (s *Service) CookieName() string {
	return s.cookieName
}

func (s *Service) SessionTTL() time.Duration {
	return s.sessionTTL
}

func (s *Service) EnsureBootstrap(ctx context.Context, cfg BootstrapConfig) (BootstrapResult, error) {
	if s == nil {
		return BootstrapResult{}, fmt.Errorf("auth service unavailable")
	}

	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users;`).Scan(&count); err != nil {
		return BootstrapResult{}, fmt.Errorf("count users: %w", err)
	}
	if count > 0 {
		return BootstrapResult{}, nil
	}

	username := normalizeUsername(cfg.Username)
	if username == "" {
		username = "admin"
	}

	password := strings.TrimSpace(cfg.Password)
	generatedPassword := ""
	if password == "" {
		value, err := randomPassword(24)
		if err != nil {
			return BootstrapResult{}, err
		}
		password = value
		generatedPassword = value
	}

	if _, err := s.createUser(ctx, username, password, "admin"); err != nil {
		return BootstrapResult{}, err
	}

	return BootstrapResult{
		Created:           true,
		Username:          username,
		GeneratedPassword: generatedPassword,
	}, nil
}

func (s *Service) Login(ctx context.Context, username string, password string) (Session, error) {
	if s == nil {
		return Session{}, fmt.Errorf("auth service unavailable")
	}

	normalized := normalizeUsername(username)
	if normalized == "" || strings.TrimSpace(password) == "" {
		return Session{}, ErrInvalidCredentials
	}

	row := s.db.QueryRowContext(ctx, `
		SELECT id, username, password_hash, role, created_at, last_login_at
		FROM users
		WHERE username = ?;
	`, normalized)

	var user User
	var passwordHash string
	var createdAtMillis int64
	var lastLoginMillis sql.NullInt64
	if err := row.Scan(&user.ID, &user.Username, &passwordHash, &user.Role, &createdAtMillis, &lastLoginMillis); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Session{}, ErrInvalidCredentials
		}
		return Session{}, fmt.Errorf("load user: %w", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		return Session{}, ErrInvalidCredentials
	}

	now := time.Now().UTC()
	user.CreatedAt = time.UnixMilli(createdAtMillis).UTC()
	if lastLoginMillis.Valid {
		lastLogin := time.UnixMilli(lastLoginMillis.Int64).UTC()
		user.LastLoginAt = &lastLogin
	}

	token, err := randomToken(32)
	if err != nil {
		return Session{}, err
	}
	expiresAt := now.Add(s.sessionTTL)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Session{}, fmt.Errorf("begin login tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= ?;`, now.UnixMilli()); err != nil {
		return Session{}, fmt.Errorf("cleanup expired sessions: %w", err)
	}
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen_at)
		VALUES(?, ?, ?, ?, ?);
	`, hashToken(token), user.ID, now.UnixMilli(), expiresAt.UnixMilli(), now.UnixMilli()); err != nil {
		return Session{}, fmt.Errorf("create session: %w", err)
	}
	if _, err = tx.ExecContext(ctx, `
		UPDATE users
		SET last_login_at = ?, updated_at = ?
		WHERE id = ?;
	`, now.UnixMilli(), now.UnixMilli(), user.ID); err != nil {
		return Session{}, fmt.Errorf("update last login: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return Session{}, fmt.Errorf("commit login tx: %w", err)
	}

	user.LastLoginAt = &now
	return Session{
		Token:     token,
		User:      user,
		ExpiresAt: expiresAt,
	}, nil
}

func (s *Service) Logout(ctx context.Context, token string) error {
	if s == nil {
		return nil
	}
	trimmed := strings.TrimSpace(token)
	if trimmed == "" {
		return nil
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?;`, hashToken(trimmed)); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func (s *Service) CurrentUserByToken(ctx context.Context, token string) (User, error) {
	if s == nil {
		return User{}, ErrAuthenticationRequired
	}
	trimmed := strings.TrimSpace(token)
	if trimmed == "" {
		return User{}, ErrAuthenticationRequired
	}

	row := s.db.QueryRowContext(ctx, `
		SELECT u.id, u.username, u.role, u.created_at, u.last_login_at, s.expires_at, s.last_seen_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ?;
	`, hashToken(trimmed))

	var user User
	var createdAtMillis int64
	var lastLoginMillis sql.NullInt64
	var expiresAtMillis int64
	var lastSeenMillis int64
	if err := row.Scan(&user.ID, &user.Username, &user.Role, &createdAtMillis, &lastLoginMillis, &expiresAtMillis, &lastSeenMillis); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrAuthenticationRequired
		}
		return User{}, fmt.Errorf("load session user: %w", err)
	}

	now := time.Now().UTC()
	if time.UnixMilli(expiresAtMillis).UTC().Before(now) {
		_ = s.Logout(ctx, trimmed)
		return User{}, ErrAuthenticationRequired
	}

	user.CreatedAt = time.UnixMilli(createdAtMillis).UTC()
	if lastLoginMillis.Valid {
		lastLogin := time.UnixMilli(lastLoginMillis.Int64).UTC()
		user.LastLoginAt = &lastLogin
	}

	lastSeenAt := time.UnixMilli(lastSeenMillis).UTC()
	if now.Sub(lastSeenAt) >= sessionHeartbeatInterval {
		// Session heartbeats should not make otherwise valid authenticated
		// requests fail under concurrent browser bootstrap traffic.
		_, _ = s.db.ExecContext(ctx, `
			UPDATE sessions
			SET last_seen_at = ?
			WHERE token_hash = ?;
		`, now.UnixMilli(), hashToken(trimmed))
	}

	return user, nil
}

func (s *Service) AuthenticateRequest(r *http.Request) (User, string, error) {
	if s == nil {
		return User{}, "", ErrAuthenticationRequired
	}
	cookie, err := r.Cookie(s.cookieName)
	if err != nil {
		if errors.Is(err, http.ErrNoCookie) {
			return User{}, "", ErrAuthenticationRequired
		}
		return User{}, "", err
	}
	user, err := s.CurrentUserByToken(r.Context(), cookie.Value)
	if err != nil {
		return User{}, cookie.Value, err
	}
	return user, cookie.Value, nil
}

func (s *Service) SetSessionCookie(w http.ResponseWriter, r *http.Request, session Session) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName,
		Value:    session.Token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
		Expires:  session.ExpiresAt,
		MaxAge:   int(time.Until(session.ExpiresAt).Seconds()),
	})
}

func (s *Service) ClearSessionCookie(w http.ResponseWriter, r *http.Request) {
	name := defaultCookieName
	if s != nil && strings.TrimSpace(s.cookieName) != "" {
		name = s.cookieName
	}
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
		MaxAge:   -1,
		Expires:  time.Unix(0, 0).UTC(),
	})
}

func (s *Service) createUser(ctx context.Context, username string, password string, role string) (User, error) {
	normalized := normalizeUsername(username)
	if normalized == "" {
		return User{}, fmt.Errorf("username is required")
	}
	if strings.TrimSpace(password) == "" {
		return User{}, fmt.Errorf("password is required")
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, fmt.Errorf("hash password: %w", err)
	}

	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO users(username, password_hash, role, created_at, updated_at)
		VALUES(?, ?, ?, ?, ?);
	`, normalized, string(passwordHash), strings.TrimSpace(role), now.UnixMilli(), now.UnixMilli())
	if err != nil {
		return User{}, fmt.Errorf("create user: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return User{}, fmt.Errorf("read created user id: %w", err)
	}

	return User{
		ID:        id,
		Username:  normalized,
		Role:      strings.TrimSpace(role),
		CreatedAt: now,
	}, nil
}

func (s *Service) migrate(ctx context.Context) error {
	statements := []string{
		`PRAGMA journal_mode = WAL;`,
		`PRAGMA foreign_keys = ON;`,
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'admin',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			last_login_at INTEGER
		);`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id INTEGER PRIMARY KEY,
			token_hash TEXT NOT NULL UNIQUE,
			user_id INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,
			last_seen_at INTEGER NOT NULL,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("migrate auth sqlite: %w", err)
		}
	}
	return nil
}

func normalizeUsername(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func randomToken(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate session token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func randomPassword(size int) (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
	if size <= 0 {
		size = 24
	}
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate bootstrap password: %w", err)
	}
	for index := range buf {
		buf[index] = alphabet[int(buf[index])%len(alphabet)]
	}
	return string(buf), nil
}

func isSecureRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https")
}
