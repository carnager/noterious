import type { LoadedPageDetail } from "./details";
import type { PageConflictDraft } from "./pageConflict";
import { syncRemotePageChange } from "./remotePageChangeFlow";

export interface RunSelectedPageRemoteSyncInput {
  pagePath: string;
  baseMarkdown: string;
  localMarkdown: string;
  unsafeUIState: boolean;
  selectionStart: number;
  selectionEnd: number;
  scrollTop: number;
  focusEditor: boolean;
  loadRemoteDetail: (pagePath: string) => Promise<LoadedPageDetail>;
  shouldContinue: () => boolean;
  formatErrorMessage: (error: unknown) => string;
  applyLoadedPageDetailState: (pagePath: string, loaded: LoadedPageDetail, nextMarkdown: string) => boolean;
  restoreCurrentEditorViewport: (selectionStart: number, selectionEnd: number, scrollTop: number, focusEditor: boolean) => void;
  showRemoteChangeToast: (pagePath: string) => void;
  openConflict: (draft: PageConflictDraft, loaded: LoadedPageDetail, status: string, noteStatus: string) => void;
  setNoteStatus: (status: string) => void;
  refreshCollections: () => void;
}

export async function runSelectedPageRemoteSync(input: RunSelectedPageRemoteSyncInput): Promise<void> {
  if (!input.pagePath || !input.shouldContinue()) {
    return;
  }

  try {
    const outcome = await syncRemotePageChange({
      pagePath: input.pagePath,
      baseMarkdown: input.baseMarkdown,
      localMarkdown: input.localMarkdown,
      unsafeUIState: input.unsafeUIState,
      loadRemoteDetail: input.loadRemoteDetail,
      shouldContinue: input.shouldContinue,
      formatErrorMessage: input.formatErrorMessage,
    });

    if (outcome.action === "stale") {
      return;
    }

    if (outcome.action === "error") {
      input.showRemoteChangeToast(input.pagePath);
      input.setNoteStatus(outcome.status);
      return;
    }

    if (outcome.action === "conflict") {
      input.openConflict(
        outcome.draft,
        outcome.loaded,
        outcome.status,
        outcome.draft.mode === "unsafe-remote-review"
          ? ("Remote change review needed for " + input.pagePath + ".")
          : ("Conflict review opened for " + input.pagePath + ".")
      );
      return;
    }

    const templateFillActive = input.applyLoadedPageDetailState(input.pagePath, outcome.loaded, outcome.markdown);
    input.restoreCurrentEditorViewport(
      input.selectionStart,
      input.selectionEnd,
      input.scrollTop,
      input.focusEditor && !templateFillActive
    );
    input.setNoteStatus(outcome.status);
  } finally {
    input.refreshCollections();
  }
}
