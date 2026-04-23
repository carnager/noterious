import type { NoteriousEditorApi } from "./types";

declare global {
  interface HTMLTextAreaElement {
    __noteriousEditor?: NoteriousEditorApi | null;
  }

  interface Window {
    NoteriousCodeEditor?: {
      create(textarea: HTMLTextAreaElement): NoteriousEditorApi | null;
    };
  }
}

export {};
