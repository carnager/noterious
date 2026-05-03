import { describe, expect, it } from "vitest";

import { prepareSettingsSave, prepareSettingsSaveWithExtra } from "./settingsPersistence";

describe("settings persistence", function () {
  it("captures user and server payloads before client preference side effects rerender the form", function () {
    const formState = {
      ntfyTopicUrl: "https://ntfy.sh/new-topic",
      ntfyToken: "new-token",
      ntfyInterval: "5m",
      fontFamily: "serif",
    };

    const snapshot = prepareSettingsSave(
      function () {
        return {
          ui: {
            fontFamily: formState.fontFamily,
          },
        };
      },
      function () {
        return {
          settings: {
            notifications: {
              ntfyTopicUrl: formState.ntfyTopicUrl,
              ntfyToken: formState.ntfyToken,
            },
          },
        };
      },
      function () {
        return {
          notifications: {
            ntfyInterval: formState.ntfyInterval,
          },
        };
      },
      function () {
        formState.ntfyTopicUrl = "https://ntfy.sh/old-topic";
        formState.ntfyToken = "old-token";
        formState.ntfyInterval = "1m";
      },
    );

    expect(snapshot.clientPreferences.ui.fontFamily).toBe("serif");
    expect(snapshot.userSettings.settings.notifications.ntfyTopicUrl).toBe("https://ntfy.sh/new-topic");
    expect(snapshot.userSettings.settings.notifications.ntfyToken).toBe("new-token");
    expect(snapshot.serverSettings.notifications.ntfyInterval).toBe("5m");
  });

  it("captures extra payloads before client preference side effects rerender the form", function () {
    const formState = {
      aiBaseUrl: "https://api.deepseek.com/v1",
      aiModel: "deepseek-chat",
      apiKey: "secret-token",
      fontFamily: "sans",
    };

    const snapshot = prepareSettingsSaveWithExtra(
      function () {
        return {
          ui: {
            fontFamily: formState.fontFamily,
          },
        };
      },
      function () {
        return { settings: {} };
      },
      function () {
        return { notifications: { ntfyInterval: "1m" } };
      },
      function () {
        return {
          settings: {
            enabled: true,
            provider: "openai-compatible",
            baseUrl: formState.aiBaseUrl,
            model: formState.aiModel,
          },
          apiKey: formState.apiKey,
        };
      },
      function () {
        formState.aiBaseUrl = "https://api.openai.com/v1";
        formState.aiModel = "gpt-5-mini";
        formState.apiKey = "";
      },
    );

    expect(snapshot.extra.settings.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(snapshot.extra.settings.model).toBe("deepseek-chat");
    expect(snapshot.extra.apiKey).toBe("secret-token");
  });
});
