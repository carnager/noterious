// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { renderAutomationSettings, type SettingsUiElements, type SettingsUiState } from "./settingsUi";
import type { APITokenRecord, WebhookRecord } from "./types";

interface AutomationElements {
  settingsTokenCreated: HTMLDivElement;
  settingsTokenList: HTMLDivElement;
  settingsTokenCreate: HTMLButtonElement;
  settingsWebhookList: HTMLDivElement;
  settingsWebhookCreate: HTMLButtonElement;
}

function automationElements(): AutomationElements & SettingsUiElements {
  const els: AutomationElements = {
    settingsTokenCreated: document.createElement("div"),
    settingsTokenList: document.createElement("div"),
    settingsTokenCreate: document.createElement("button"),
    settingsWebhookList: document.createElement("div"),
    settingsWebhookCreate: document.createElement("button"),
  };
  return els as AutomationElements & SettingsUiElements;
}

function automationState(overrides?: Partial<SettingsUiState>): SettingsUiState {
  return {
    automationLoaded: true,
    apiTokens: [] as APITokenRecord[],
    webhooks: [] as WebhookRecord[],
    createdAPIToken: null,
    ...overrides,
  } as SettingsUiState;
}

function token(overrides?: Partial<APITokenRecord>): APITokenRecord {
  return {
    id: 1,
    label: "backup-script",
    createdAt: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

function webhook(overrides?: Partial<WebhookRecord>): WebhookRecord {
  return {
    id: 7,
    label: "home-assistant",
    url: "https://example.net/hooks/noterious",
    events: ["task.changed", "reminder.fired"],
    enabled: true,
    createdAt: "2026-06-01T10:00:00Z",
    delivery: {},
    ...overrides,
  };
}

describe("renderAutomationSettings", function () {
  it("shows loading placeholders and disables creation before data arrives", function () {
    const els = automationElements();
    renderAutomationSettings(automationState({ automationLoaded: false }), els);

    expect(els.settingsTokenList.textContent).toContain("Loading tokens");
    expect(els.settingsWebhookList.textContent).toContain("Loading webhooks");
    expect(els.settingsTokenCreate.disabled).toBe(true);
    expect(els.settingsWebhookCreate.disabled).toBe(true);
  });

  it("shows empty states once loaded", function () {
    const els = automationElements();
    renderAutomationSettings(automationState(), els);

    expect(els.settingsTokenList.textContent).toContain("No API tokens yet");
    expect(els.settingsWebhookList.textContent).toContain("No webhooks yet");
    expect(els.settingsTokenCreate.disabled).toBe(false);
    expect(els.settingsWebhookCreate.disabled).toBe(false);
    expect(els.settingsTokenCreated.classList.contains("hidden")).toBe(true);
  });

  it("renders token rows with revoke actions", function () {
    const els = automationElements();
    renderAutomationSettings(automationState({
      apiTokens: [token(), token({ id: 2, label: "phone", lastUsedAt: "2026-06-10T08:00:00Z" })],
    }), els);

    const revokeButtons = els.settingsTokenList.querySelectorAll('[data-automation-action="revoke-token"]');
    expect(revokeButtons.length).toBe(2);
    expect(revokeButtons[0].getAttribute("data-token-id")).toBe("1");
    expect(revokeButtons[1].getAttribute("data-token-id")).toBe("2");
    expect(els.settingsTokenList.textContent).toContain("backup-script");
    expect(els.settingsTokenList.textContent).toContain("never used");
    expect(els.settingsTokenList.textContent).toContain("last used");
  });

  it("shows the created token exactly once with copy and dismiss actions", function () {
    const els = automationElements();
    renderAutomationSettings(automationState({
      createdAPIToken: { label: "backup-script", token: "ntr_secret-value" },
    }), els);

    expect(els.settingsTokenCreated.classList.contains("hidden")).toBe(false);
    expect(els.settingsTokenCreated.textContent).toContain("ntr_secret-value");
    expect(els.settingsTokenCreated.textContent).toContain("will not be shown again");
    expect(els.settingsTokenCreated.querySelector('[data-automation-action="copy-token"]')).toBeTruthy();
    expect(els.settingsTokenCreated.querySelector('[data-automation-action="dismiss-token"]')).toBeTruthy();
  });

  it("renders webhook rows with events, delivery state, and delete actions", function () {
    const els = automationElements();
    renderAutomationSettings(automationState({
      webhooks: [
        webhook(),
        webhook({
          id: 8,
          label: "flaky-hook",
          secret: "s3cret",
          delivery: { lastFiredAt: "2026-06-11T12:00:00Z", lastStatus: "error", lastError: "connection refused" },
        }),
      ],
    }), els);

    const deleteButtons = els.settingsWebhookList.querySelectorAll('[data-automation-action="delete-webhook"]');
    expect(deleteButtons.length).toBe(2);
    expect(deleteButtons[0].getAttribute("data-webhook-id")).toBe("7");
    expect(els.settingsWebhookList.textContent).toContain("https://example.net/hooks/noterious");
    expect(els.settingsWebhookList.textContent).toContain("task.changed, reminder.fired");
    expect(els.settingsWebhookList.textContent).toContain("No deliveries yet.");
    expect(els.settingsWebhookList.textContent).toContain("signed");
    expect(els.settingsWebhookList.textContent).toContain("error: connection refused");
    expect(els.settingsWebhookList.querySelector(".settings-automation-delivery.is-warning")).toBeTruthy();
  });
});
