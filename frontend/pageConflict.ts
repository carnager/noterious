export type PageConflictMode = "save-conflict" | "remote-conflict" | "unsafe-remote-review";

export interface PageConflictDraftInput {
  mode: PageConflictMode;
  pagePath: string;
  baseMarkdown: string;
  localMarkdown: string;
  remoteMarkdown: string;
}

export interface PageConflictDraft {
  mode: PageConflictMode;
  pagePath: string;
  baseMarkdown: string;
  localMarkdown: string;
  remoteMarkdown: string;
  resolutionMarkdown: string;
  title: string;
  summary: string;
  callout: string;
  editable: boolean;
}

function normalizeMarkdown(value: string): string {
  return String(value || "");
}

export function createPageConflictDraft(input: PageConflictDraftInput): PageConflictDraft {
  const pagePath = String(input.pagePath || "").trim();
  const baseMarkdown = normalizeMarkdown(input.baseMarkdown);
  const localMarkdown = normalizeMarkdown(input.localMarkdown);
  const remoteMarkdown = normalizeMarkdown(input.remoteMarkdown);

  if (input.mode === "save-conflict") {
    return {
      mode: input.mode,
      pagePath,
      baseMarkdown,
      localMarkdown,
      remoteMarkdown,
      resolutionMarkdown: localMarkdown,
      title: "Resolve Save Conflict",
      summary: pagePath
        ? (pagePath + " changed before your save completed. Review both versions and save the markdown you want to keep.")
        : "The page changed before your save completed. Review both versions and save the markdown you want to keep.",
      callout: "Your local markdown is preserved. Nothing was overwritten on the server.",
      editable: true,
    };
  }

  if (input.mode === "remote-conflict") {
    return {
      mode: input.mode,
      pagePath,
      baseMarkdown,
      localMarkdown,
      remoteMarkdown,
      resolutionMarkdown: localMarkdown,
      title: "Resolve Remote Change",
      summary: pagePath
        ? (pagePath + " changed while you were editing. Automatic merge stopped because both sides touched overlapping lines.")
        : "The page changed while you were editing. Automatic merge stopped because both sides touched overlapping lines.",
      callout: "Your local markdown is preserved in this dialog until you choose how to continue.",
      editable: true,
    };
  }

  return {
    mode: input.mode,
    pagePath,
    baseMarkdown,
    localMarkdown,
    remoteMarkdown,
    resolutionMarkdown: localMarkdown,
    title: "Review Remote Change",
    summary: pagePath
      ? (pagePath + " changed while a structured editor was open. Automatic merge paused to avoid discarding draft state that is not yet part of the markdown.")
      : "The page changed while a structured editor was open. Automatic merge paused to avoid discarding draft state that is not yet part of the markdown.",
    callout: "Finish or cancel the open property, table, or title edit first if you want to keep working locally. Reloading now will discard those transient edits.",
    editable: false,
  };
}
