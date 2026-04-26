package auth

import "context"

type contextKey string

const userContextKey contextKey = "noterious.auth.user"
const sessionTokenContextKey contextKey = "noterious.auth.session_token"

func WithUser(ctx context.Context, user User) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}

func UserFromContext(ctx context.Context) (User, bool) {
	user, ok := ctx.Value(userContextKey).(User)
	return user, ok
}

func WithSessionToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, sessionTokenContextKey, token)
}

func SessionTokenFromContext(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(sessionTokenContextKey).(string)
	return token, ok
}
