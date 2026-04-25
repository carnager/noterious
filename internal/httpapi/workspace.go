package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/carnager/noterious/internal/documents"
	"github.com/carnager/noterious/internal/vault"
	"github.com/carnager/noterious/internal/workspaces"
)

func wrapWithWorkspace(next http.Handler, workspaceService *workspaces.Service) http.Handler {
	if workspaceService == nil {
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			workspace, err := workspaceService.Default(r.Context())
			if err != nil {
				http.Error(w, "failed to resolve workspace", http.StatusInternalServerError)
				return
			}
			r = r.WithContext(workspaces.WithWorkspace(r.Context(), workspace))
		}
		next.ServeHTTP(w, r)
	})
}

func currentWorkspace(ctx context.Context, deps Dependencies) workspaces.Workspace {
	if workspace, ok := workspaces.WorkspaceFromContext(ctx); ok {
		return workspace
	}
	return workspaces.Workspace{
		ID:        workspaces.LegacyWorkspaceID,
		Key:       "legacy",
		Name:      "Legacy Workspace",
		VaultPath: deps.Config.VaultPath,
		HomePage:  deps.Config.HomePage,
	}
}

func currentVault(ctx context.Context, deps Dependencies) *vault.Service {
	workspace := currentWorkspace(ctx, deps)
	if workspace.ID == workspaces.LegacyWorkspaceID && deps.Vault != nil {
		return deps.Vault
	}
	return vault.NewService(workspace.VaultPath)
}

func currentDocuments(ctx context.Context, deps Dependencies) (*documents.Service, error) {
	workspace := currentWorkspace(ctx, deps)
	if workspace.ID == workspaces.LegacyWorkspaceID && deps.Documents != nil {
		return deps.Documents, nil
	}
	service, err := documents.NewService(workspace.VaultPath)
	if err != nil {
		return nil, fmt.Errorf("init workspace document service: %w", err)
	}
	return service, nil
}
