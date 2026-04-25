package workspaces

import "context"

type contextKey string

const (
	workspaceContextKey contextKey = "noterious.workspace"
	LegacyWorkspaceID   int64      = 0
)

func WithWorkspace(ctx context.Context, workspace Workspace) context.Context {
	return context.WithValue(ctx, workspaceContextKey, workspace)
}

func WorkspaceFromContext(ctx context.Context) (Workspace, bool) {
	workspace, ok := ctx.Value(workspaceContextKey).(Workspace)
	return workspace, ok
}

func WorkspaceIDFromContext(ctx context.Context) int64 {
	workspace, ok := WorkspaceFromContext(ctx)
	if !ok || workspace.ID <= 0 {
		return LegacyWorkspaceID
	}
	return workspace.ID
}
