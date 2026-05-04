import type { LoadedPageDetail } from "./details";
import { createPageConflictDraft, type PageConflictDraft } from "./pageConflict";
import { buildRemoteSyncPlan } from "./remoteSync";

export type RemotePageSyncOutcome =
  | {
      action: "apply";
      markdown: string;
      mergedLocalEdits: boolean;
      status: string;
    }
  | {
      action: "conflict";
      draft: PageConflictDraft;
      status: string;
    };

export interface RemotePageSyncPlanInput {
  pagePath: string;
  baseMarkdown: string;
  localMarkdown: string;
  loadedRemote: LoadedPageDetail;
  unsafeUIState: boolean;
}

export function planRemotePageSync(input: RemotePageSyncPlanInput): RemotePageSyncOutcome {
  const pagePath = String(input.pagePath || "");
  const remoteMarkdown = input.loadedRemote.page.rawMarkdown || "";
  const plan = buildRemoteSyncPlan({
    baseMarkdown: input.baseMarkdown,
    localMarkdown: input.localMarkdown,
    remoteMarkdown,
    unsafeUIState: input.unsafeUIState,
  });

  if (plan.action === "apply") {
    return {
      action: "apply",
      markdown: plan.markdown,
      mergedLocalEdits: plan.mergedLocalEdits,
      status: plan.mergedLocalEdits
        ? ("Merged remote edits into " + pagePath + ".")
        : ("Updated " + pagePath + " from remote changes."),
    };
  }

  const mode = plan.reason === "unsafe-ui-state" ? "unsafe-remote-review" : "remote-conflict";
  return {
    action: "conflict",
    draft: createPageConflictDraft({
      mode,
      pagePath,
      baseMarkdown: input.baseMarkdown,
      localMarkdown: input.localMarkdown,
      remoteMarkdown,
    }),
    status: plan.reason === "unsafe-ui-state"
      ? "Remote changes are ready to review, but Noterious paused automatic merge because a structured editor is still open."
      : "Automatic merge found overlapping local and remote edits. Review both versions and save the final markdown you want to keep.",
  };
}
