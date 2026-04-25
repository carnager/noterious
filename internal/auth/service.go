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
	bootstrapSecretFileName  = "bootstrap-admin.txt"
	roleAdmin                = "admin"
	roleUser                 = "user"
)

var (
	ErrAuthenticationRequired = errors.New("authentication required")
	ErrInvalidCredentials     = errors.New("invalid username or password")
	ErrPasswordChangeRejected = errors.New("password change rejected")
	ErrSetupRejected          = errors.New("initial admin setup rejected")
)

type BootstrapConfig struct {
	Username string
	Password string
}

type BootstrapResult struct {
	Created       bool
	Username      string
	SetupRequired bool
}

type NotificationSettings struct {
	NtfyTopicURL string `json:"ntfyTopicUrl"`
	NtfyToken    string `json:"ntfyToken"`
}

type UserSettings struct {
	HomePage      string               `json:"homePage"`
	Notifications NotificationSettings `json:"notifications"`
}

type NotificationTarget struct {
	UserID   int64
	Username string
	TopicURL string
	Token    string
}

type User struct {
	ID                 int64      `json:"id"`
	Username           string     `json:"username"`
	Role               string     `json:"role"`
	CreatedAt          time.Time  `json:"createdAt"`
	LastLoginAt        *time.Time `json:"lastLoginAt,omitempty"`
	MustChangePassword bool       `json:"mustChangePassword"`
}

type Session struct {
	Token     string
	User      User
	ExpiresAt time.Time
}

type Service struct {
	db         *sql.DB
	dataDir    string
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
		dataDir:    dataDir,
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

func (s *Service) BootstrapCredentialsPath() string {
	if s == nil || strings.TrimSpace(s.dataDir) == "" {
		return ""
	}
	return filepath.Join(s.dataDir, bootstrapSecretFileName)
}

func (s *Service) SetupRequired(ctx context.Context) (bool, error) {
	if s == nil {
		return false, fmt.Errorf("auth service unavailable")
	}
	count, err := s.userCount(ctx)
	if err != nil {
		return false, err
	}
	return count == 0, nil
}

func (s *Service) EnsureBootstrap(ctx context.Context, cfg BootstrapConfig) (BootstrapResult, error) {
	if s == nil {
		return BootstrapResult{}, fmt.Errorf("auth service unavailable")
	}

	count, err := s.userCount(ctx)
	if err != nil {
		return BootstrapResult{}, err
	}
	if count > 0 {
		return BootstrapResult{}, nil
	}

	password := strings.TrimSpace(cfg.Password)
	if password == "" {
		_ = s.clearBootstrapCredentials()
		return BootstrapResult{
			SetupRequired: true,
		}, nil
	}

	username := normalizeUsername(cfg.Username)
	if username == "" {
		username = "admin"
	}

	if _, err := s.createUser(ctx, username, password, "admin", false); err != nil {
		return BootstrapResult{}, err
	}

	return BootstrapResult{
		Created:  true,
		Username: username,
	}, nil
}

func (s *Service) CreateInitialAdmin(ctx context.Context, username string, password string) (User, error) {
	if s == nil {
		return User{}, fmt.Errorf("auth service unavailable")
	}

	count, err := s.userCount(ctx)
	if err != nil {
		return User{}, err
	}
	if count > 0 {
		return User{}, fmt.Errorf("%w: users already exist", ErrSetupRejected)
	}

	user, err := s.createUser(ctx, username, password, "admin", false)
	if err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Service) CreateUser(ctx context.Context, username string, password string, role string) (User, error) {
	if s == nil {
		return User{}, fmt.Errorf("auth service unavailable")
	}
	return s.createUser(ctx, username, password, role, false)
}

func (s *Service) ListUsers(ctx context.Context) ([]User, error) {
	if s == nil {
		return nil, fmt.Errorf("auth service unavailable")
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, username, role, created_at, last_login_at, must_change_password
		FROM users
		ORDER BY username ASC;
	`)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		var user User
		var createdAtMillis int64
		var lastLoginMillis sql.NullInt64
		if err := rows.Scan(&user.ID, &user.Username, &user.Role, &createdAtMillis, &lastLoginMillis, &user.MustChangePassword); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		user.CreatedAt = time.UnixMilli(createdAtMillis).UTC()
		if lastLoginMillis.Valid {
			lastLogin := time.UnixMilli(lastLoginMillis.Int64).UTC()
			user.LastLoginAt = &lastLogin
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate users: %w", err)
	}
	return users, nil
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
		SELECT id, username, password_hash, role, created_at, last_login_at, must_change_password
		FROM users
		WHERE username = ?;
	`, normalized)

	var user User
	var passwordHash string
	var createdAtMillis int64
	var lastLoginMillis sql.NullInt64
	var mustChangePassword bool
	if err := row.Scan(&user.ID, &user.Username, &passwordHash, &user.Role, &createdAtMillis, &lastLoginMillis, &mustChangePassword); err != nil {
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
	user.MustChangePassword = mustChangePassword
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
		INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen_at, current_vault_id)
		VALUES(?, ?, ?, ?, ?, NULL);
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

func (s *Service) CurrentVaultIDByToken(ctx context.Context, token string) (int64, error) {
	if s == nil {
		return 0, ErrAuthenticationRequired
	}
	trimmed := strings.TrimSpace(token)
	if trimmed == "" {
		return 0, ErrAuthenticationRequired
	}

	row := s.db.QueryRowContext(ctx, `
		SELECT current_vault_id
		FROM sessions
		WHERE token_hash = ?;
	`, hashToken(trimmed))

	var currentVaultID sql.NullInt64
	if err := row.Scan(&currentVaultID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrAuthenticationRequired
		}
		return 0, fmt.Errorf("load current vault id: %w", err)
	}
	if !currentVaultID.Valid || currentVaultID.Int64 <= 0 {
		return 0, nil
	}
	return currentVaultID.Int64, nil
}

func (s *Service) SetCurrentVaultID(ctx context.Context, token string, vaultID int64) error {
	if s == nil {
		return ErrAuthenticationRequired
	}
	trimmed := strings.TrimSpace(token)
	if trimmed == "" {
		return ErrAuthenticationRequired
	}

	var value any
	if vaultID > 0 {
		value = vaultID
	}
	result, err := s.db.ExecContext(ctx, `
		UPDATE sessions
		SET current_vault_id = ?, last_seen_at = ?
		WHERE token_hash = ?;
	`, value, time.Now().UTC().UnixMilli(), hashToken(trimmed))
	if err != nil {
		return fmt.Errorf("set current vault id: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read updated session rows: %w", err)
	}
	if rowsAffected == 0 {
		return ErrAuthenticationRequired
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
		SELECT u.id, u.username, u.role, u.created_at, u.last_login_at, u.must_change_password, s.expires_at, s.last_seen_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ?;
	`, hashToken(trimmed))

	var user User
	var createdAtMillis int64
	var lastLoginMillis sql.NullInt64
	var mustChangePassword bool
	var expiresAtMillis int64
	var lastSeenMillis int64
	if err := row.Scan(&user.ID, &user.Username, &user.Role, &createdAtMillis, &lastLoginMillis, &mustChangePassword, &expiresAtMillis, &lastSeenMillis); err != nil {
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
	user.MustChangePassword = mustChangePassword
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

func (s *Service) ChangePassword(ctx context.Context, userID int64, currentPassword string, newPassword string) (User, error) {
	if s == nil {
		return User{}, fmt.Errorf("auth service unavailable")
	}
	if userID <= 0 {
		return User{}, fmt.Errorf("%w: user is required", ErrPasswordChangeRejected)
	}
	if strings.TrimSpace(currentPassword) == "" {
		return User{}, fmt.Errorf("%w: current password is required", ErrPasswordChangeRejected)
	}
	if strings.TrimSpace(newPassword) == "" {
		return User{}, fmt.Errorf("%w: new password is required", ErrPasswordChangeRejected)
	}
	if currentPassword == newPassword {
		return User{}, fmt.Errorf("%w: new password must differ from current password", ErrPasswordChangeRejected)
	}

	row := s.db.QueryRowContext(ctx, `
		SELECT username, password_hash, role, created_at, last_login_at, must_change_password
		FROM users
		WHERE id = ?;
	`, userID)

	var user User
	var passwordHash string
	var createdAtMillis int64
	var lastLoginMillis sql.NullInt64
	if err := row.Scan(&user.Username, &passwordHash, &user.Role, &createdAtMillis, &lastLoginMillis, &user.MustChangePassword); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrAuthenticationRequired
		}
		return User{}, fmt.Errorf("load user for password change: %w", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(currentPassword)); err != nil {
		return User{}, ErrInvalidCredentials
	}

	newPasswordHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return User{}, fmt.Errorf("hash password: %w", err)
	}

	now := time.Now().UTC()
	if _, err := s.db.ExecContext(ctx, `
		UPDATE users
		SET password_hash = ?, must_change_password = 0, updated_at = ?
		WHERE id = ?;
	`, string(newPasswordHash), now.UnixMilli(), userID); err != nil {
		return User{}, fmt.Errorf("update password: %w", err)
	}

	if user.MustChangePassword {
		_ = s.clearBootstrapCredentials()
	}

	user.ID = userID
	user.CreatedAt = time.UnixMilli(createdAtMillis).UTC()
	user.MustChangePassword = false
	if lastLoginMillis.Valid {
		lastLogin := time.UnixMilli(lastLoginMillis.Int64).UTC()
		user.LastLoginAt = &lastLogin
	}
	return user, nil
}

func (s *Service) UserSettings(ctx context.Context, userID int64) (UserSettings, error) {
	if s == nil {
		return UserSettings{}, fmt.Errorf("auth service unavailable")
	}
	if userID <= 0 {
		return UserSettings{}, ErrAuthenticationRequired
	}

	row := s.db.QueryRowContext(ctx, `
		SELECT home_page, ntfy_topic_url, ntfy_token
		FROM users
		WHERE id = ?;
	`, userID)

	var settings UserSettings
	if err := row.Scan(&settings.HomePage, &settings.Notifications.NtfyTopicURL, &settings.Notifications.NtfyToken); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return UserSettings{}, ErrAuthenticationRequired
		}
		return UserSettings{}, fmt.Errorf("load user settings: %w", err)
	}
	return normalizeUserSettings(settings), nil
}

func (s *Service) UpdateUserSettings(ctx context.Context, userID int64, next UserSettings) (UserSettings, error) {
	if s == nil {
		return UserSettings{}, fmt.Errorf("auth service unavailable")
	}
	if userID <= 0 {
		return UserSettings{}, ErrAuthenticationRequired
	}

	normalized := normalizeUserSettings(next)
	result, err := s.db.ExecContext(ctx, `
		UPDATE users
		SET home_page = ?, ntfy_topic_url = ?, ntfy_token = ?, updated_at = ?
		WHERE id = ?;
	`, normalized.HomePage, normalized.Notifications.NtfyTopicURL, normalized.Notifications.NtfyToken, time.Now().UTC().UnixMilli(), userID)
	if err != nil {
		return UserSettings{}, fmt.Errorf("update user settings: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return UserSettings{}, fmt.Errorf("read updated rows: %w", err)
	}
	if rowsAffected == 0 {
		return UserSettings{}, ErrAuthenticationRequired
	}
	return normalized, nil
}

func (s *Service) ListNotificationTargets(ctx context.Context) ([]NotificationTarget, error) {
	if s == nil {
		return nil, fmt.Errorf("auth service unavailable")
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, username, ntfy_topic_url, ntfy_token
		FROM users
		WHERE TRIM(ntfy_topic_url) != '';
	`)
	if err != nil {
		return nil, fmt.Errorf("list notification targets: %w", err)
	}
	defer rows.Close()

	targets := make([]NotificationTarget, 0)
	for rows.Next() {
		var target NotificationTarget
		if err := rows.Scan(&target.UserID, &target.Username, &target.TopicURL, &target.Token); err != nil {
			return nil, fmt.Errorf("scan notification target: %w", err)
		}
		target.Username = normalizeUsername(target.Username)
		target.TopicURL = strings.TrimSpace(target.TopicURL)
		target.Token = strings.TrimSpace(target.Token)
		if target.Username == "" || target.TopicURL == "" {
			continue
		}
		targets = append(targets, target)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate notification targets: %w", err)
	}
	return targets, nil
}

func (s *Service) userCount(ctx context.Context) (int, error) {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users;`).Scan(&count); err != nil {
		return 0, fmt.Errorf("count users: %w", err)
	}
	return count, nil
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

func (s *Service) createUser(ctx context.Context, username string, password string, role string, mustChangePassword bool) (User, error) {
	normalized := normalizeUsername(username)
	if normalized == "" {
		return User{}, fmt.Errorf("username is required")
	}
	if strings.TrimSpace(password) == "" {
		return User{}, fmt.Errorf("password is required")
	}
	normalizedRole, ok := normalizeUserRole(role)
	if !ok {
		return User{}, fmt.Errorf("invalid role %q", strings.TrimSpace(role))
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, fmt.Errorf("hash password: %w", err)
	}

	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO users(username, password_hash, role, created_at, updated_at, must_change_password)
		VALUES(?, ?, ?, ?, ?, ?);
	`, normalized, string(passwordHash), normalizedRole, now.UnixMilli(), now.UnixMilli(), mustChangePassword)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique constraint failed: users.username") {
			return User{}, fmt.Errorf("username already exists")
		}
		return User{}, fmt.Errorf("create user: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return User{}, fmt.Errorf("read created user id: %w", err)
	}

	return User{
		ID:                 id,
		Username:           normalized,
		Role:               normalizedRole,
		CreatedAt:          now,
		MustChangePassword: mustChangePassword,
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
			must_change_password INTEGER NOT NULL DEFAULT 0,
			last_login_at INTEGER,
			home_page TEXT NOT NULL DEFAULT '',
			ntfy_topic_url TEXT NOT NULL DEFAULT '',
			ntfy_token TEXT NOT NULL DEFAULT ''
		);`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id INTEGER PRIMARY KEY,
			token_hash TEXT NOT NULL UNIQUE,
			user_id INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,
			last_seen_at INTEGER NOT NULL,
			current_vault_id INTEGER,
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
	if err := s.ensureUsersMustChangeColumn(ctx); err != nil {
		return err
	}
	if err := s.ensureUsersNotificationSettingsColumns(ctx); err != nil {
		return err
	}
	if err := s.ensureUsersHomePageColumn(ctx); err != nil {
		return err
	}
	if err := s.ensureSessionsCurrentVaultColumn(ctx); err != nil {
		return err
	}
	return nil
}

func (s *Service) ensureUsersMustChangeColumn(ctx context.Context) error {
	columns, err := s.userColumnSet(ctx)
	if err != nil {
		return err
	}
	if _, ok := columns["must_change_password"]; ok {
		return nil
	}

	if _, err := s.db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;`); err != nil {
		return fmt.Errorf("add users.must_change_password column: %w", err)
	}
	return nil
}

func (s *Service) ensureUsersNotificationSettingsColumns(ctx context.Context) error {
	columns, err := s.userColumnSet(ctx)
	if err != nil {
		return err
	}
	if _, ok := columns["ntfy_topic_url"]; !ok {
		if _, err := s.db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN ntfy_topic_url TEXT NOT NULL DEFAULT '';`); err != nil {
			return fmt.Errorf("add users.ntfy_topic_url column: %w", err)
		}
	}
	if _, ok := columns["ntfy_token"]; !ok {
		if _, err := s.db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN ntfy_token TEXT NOT NULL DEFAULT '';`); err != nil {
			return fmt.Errorf("add users.ntfy_token column: %w", err)
		}
	}
	return nil
}

func (s *Service) ensureUsersHomePageColumn(ctx context.Context) error {
	columns, err := s.userColumnSet(ctx)
	if err != nil {
		return err
	}
	if _, ok := columns["home_page"]; ok {
		return nil
	}
	if _, err := s.db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN home_page TEXT NOT NULL DEFAULT '';`); err != nil {
		return fmt.Errorf("add users.home_page column: %w", err)
	}
	return nil
}

func (s *Service) userColumnSet(ctx context.Context) (map[string]struct{}, error) {
	rows, err := s.db.QueryContext(ctx, `PRAGMA table_info(users);`)
	if err != nil {
		return nil, fmt.Errorf("inspect users schema: %w", err)
	}
	defer rows.Close()

	columns := make(map[string]struct{})
	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return nil, fmt.Errorf("scan users schema: %w", err)
		}
		columns[name] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate users schema: %w", err)
	}
	return columns, nil
}

func (s *Service) ensureSessionsCurrentVaultColumn(ctx context.Context) error {
	columns, err := s.sessionColumnSet(ctx)
	if err != nil {
		return err
	}
	if _, ok := columns["current_vault_id"]; ok {
		return nil
	}
	if _, err := s.db.ExecContext(ctx, `ALTER TABLE sessions ADD COLUMN current_vault_id INTEGER;`); err != nil {
		return fmt.Errorf("add sessions.current_vault_id column: %w", err)
	}
	return nil
}

func (s *Service) sessionColumnSet(ctx context.Context) (map[string]struct{}, error) {
	rows, err := s.db.QueryContext(ctx, `PRAGMA table_info(sessions);`)
	if err != nil {
		return nil, fmt.Errorf("inspect sessions schema: %w", err)
	}
	defer rows.Close()

	columns := make(map[string]struct{})
	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return nil, fmt.Errorf("scan sessions schema: %w", err)
		}
		columns[name] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sessions schema: %w", err)
	}
	return columns, nil
}

func (s *Service) clearBootstrapCredentials() error {
	path := s.BootstrapCredentialsPath()
	if path == "" {
		return nil
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove bootstrap credential file: %w", err)
	}
	return nil
}

func normalizeUsername(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizeUserRole(value string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", roleUser:
		return roleUser, true
	case roleAdmin:
		return roleAdmin, true
	default:
		return "", false
	}
}

func normalizeUserSettings(input UserSettings) UserSettings {
	return UserSettings{
		HomePage: strings.TrimSpace(input.HomePage),
		Notifications: NotificationSettings{
			NtfyTopicURL: strings.TrimSpace(input.Notifications.NtfyTopicURL),
			NtfyToken:    strings.TrimSpace(input.Notifications.NtfyToken),
		},
	}
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

func isSecureRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https")
}
