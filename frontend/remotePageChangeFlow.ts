import type { LoadedPageDetail } from "./details";
import type { PageConflictDraft } from "./pageConflict";
import { planRemotePageSync } from "./remotePageSync";

export interface SyncRemotePageChangeInput {
  pagePath: string;
  baseMarkdown: string;
  localMarkdown: string;
  unsafeUIState: boolean;
  loadRemoteDetail: (pagePath: string) => Promise<LoadedPageDetail>;
  shouldContinue?: () => boolean;
  formatErrorMessage?: (error: unknown) => string;
}

export type SyncRemotePageChangeResult =
  | { action: "stale" }
  | { action: "error"; pagePath: string; status: string }
  | {
      action: "apply";
      pagePath: string;
      loaded: LoadedPageDetail;
      markdown: string;
      mergedLocalEdits: boolean;
      status: string;
    }
  | {
      action: "conflict";
      pagePath: string;
      loaded: LoadedPageDetail;
      draft: PageConflictDraft;
      status: string;
    };

function defaultErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function syncRemotePageChange(input: SyncRemotePageChangeInput): Promise<SyncRemotePageChangeResult> {
  const pagePath = String(input.pagePath || "");
  if (!pagePath) {
    return { action: "stale" };
  }

  try {
    const loaded = await input.loadRemoteDetail(pagePath);
    if (input.shouldContinue && !input.shouldContinue()) {
      return { action: "stale" };
    }

    const outcome = planRemotePageSync({
      pagePath,
      baseMarkdown: input.baseMarkdown,
      localMarkdown: input.localMarkdown,
      loadedRemote: loaded,
      unsafeUIState: input.unsafeUIState,
    });

    if (outcome.action === "conflict") {
      return {
        action: "conflict",
        pagePath,
        loaded,
        draft: outcome.draft,
        status: outcome.status,
      };
    }

    return {
      action: "apply",
      pagePath,
      loaded,
      markdown: outcome.markdown,
      mergedLocalEdits: outcome.mergedLocalEdits,
      status: outcome.status,
    };
  } catch (error) {
    const formatErrorMessage = input.formatErrorMessage || defaultErrorMessage;
    return {
      action: "error",
      pagePath,
      status: "Remote refresh failed: " + formatErrorMessage(error),
    };
  }
}
