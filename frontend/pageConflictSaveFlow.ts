import type { LoadedPageDetail } from "./details";
import { HTTPError } from "./http";
import { createPageConflictDialogDraft, type PageConflictDraft, type PageConflictMode } from "./pageConflict";
import type { PageRecord } from "./types";

export interface SavePageConflictResolutionInput {
  mode: PageConflictMode;
  pagePath: string;
  baseMarkdown: string;
  remoteMarkdown: string;
  resolutionMarkdown: string;
  saveResolvedMarkdown: (pagePath: string, markdownToSave: string, baseMarkdown: string) => Promise<PageRecord>;
  loadLatestRemote: (pagePath: string) => Promise<LoadedPageDetail>;
  formatErrorMessage?: (error: unknown) => string;
}

export type SavePageConflictResolutionResult =
  | {
      action: "saved";
      payload: PageRecord;
      status: string;
    }
  | {
      action: "reopened";
      loadedRemote: LoadedPageDetail;
      draft: PageConflictDraft;
      status: string;
      noteStatus: string;
    }
  | {
      action: "reload-error";
      status: string;
    }
  | {
      action: "save-error";
      status: string;
    };

function defaultErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function savePageConflictResolutionFlow(input: SavePageConflictResolutionInput): Promise<SavePageConflictResolutionResult> {
  const formatErrorMessage = input.formatErrorMessage || defaultErrorMessage;

  try {
    const payload = await input.saveResolvedMarkdown(
      input.pagePath,
      input.resolutionMarkdown,
      input.remoteMarkdown
    );
    return {
      action: "saved",
      payload,
      status: "Saved resolved version of " + input.pagePath + ".",
    };
  } catch (error) {
    if (error instanceof HTTPError && error.status === 409) {
      try {
        const loadedRemote = await input.loadLatestRemote(input.pagePath);
        return {
          action: "reopened",
          loadedRemote,
          draft: createPageConflictDialogDraft({
            mode: input.mode,
            pagePath: input.pagePath,
            baseMarkdown: input.baseMarkdown,
            localMarkdown: input.resolutionMarkdown,
            remoteMarkdown: loadedRemote.page.rawMarkdown || "",
            resolutionMarkdown: input.resolutionMarkdown,
          }),
          status: "The page changed again while you were resolving it. Review the latest remote version and save again.",
          noteStatus: "Conflict changed again on " + input.pagePath + ".",
        };
      } catch (reloadError) {
        return {
          action: "reload-error",
          status: "The page changed again, and the latest remote version could not be loaded: " + formatErrorMessage(reloadError),
        };
      }
    }

    return {
      action: "save-error",
      status: "Save failed: " + formatErrorMessage(error),
    };
  }
}
