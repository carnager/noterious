import { mergeText, TextMergeConflictError } from "./textMerge";

export interface RemoteSyncUIState {
  propertyDraftOpen: boolean;
  propertyTypeMenuOpen: boolean;
  propertyValueInputFocused: boolean;
  taskPickerOpen: boolean;
  inlineTableEditorOpen: boolean;
  inlineTableEditorFocused: boolean;
  noteTitleFocused: boolean;
  noteTitleEditing: boolean;
}

export interface RemoteSyncPlanInput {
  baseMarkdown: string;
  localMarkdown: string;
  remoteMarkdown: string;
  unsafeUIState: boolean;
}

export type RemoteSyncPlan =
  | { action: "warn"; reason: "unsafe-ui-state" | "conflict" }
  | { action: "apply"; markdown: string; mergedLocalEdits: boolean };

export function hasUnsafeRemoteSyncUIState(state: RemoteSyncUIState): boolean {
  return Boolean(
    state.propertyDraftOpen ||
    state.propertyTypeMenuOpen ||
    state.propertyValueInputFocused ||
    state.taskPickerOpen ||
    state.inlineTableEditorOpen ||
    state.inlineTableEditorFocused ||
    state.noteTitleFocused ||
    state.noteTitleEditing
  );
}

export function buildRemoteSyncPlan(input: RemoteSyncPlanInput): RemoteSyncPlan {
  if (input.unsafeUIState) {
    return { action: "warn", reason: "unsafe-ui-state" };
  }

  try {
    const markdown = mergeText(input.baseMarkdown, input.localMarkdown, input.remoteMarkdown);
    return {
      action: "apply",
      markdown,
      mergedLocalEdits: input.localMarkdown !== input.baseMarkdown &&
        input.remoteMarkdown !== input.baseMarkdown &&
        markdown !== input.remoteMarkdown,
    };
  } catch (error) {
    if (error instanceof TextMergeConflictError) {
      return { action: "warn", reason: "conflict" };
    }
    throw error;
  }
}
