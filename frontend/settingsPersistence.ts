export interface SettingsSaveSnapshot<TClient, TUser, TServer> {
  clientPreferences: TClient;
  userSettings: TUser;
  serverSettings: TServer;
}

export function prepareSettingsSave<TClient, TUser, TServer>(
  collectClientPreferences: () => TClient,
  collectUserSettings: () => TUser,
  collectServerSettings: () => TServer,
  applyClientPreferences: (preferences: TClient) => void,
): SettingsSaveSnapshot<TClient, TUser, TServer> {
  const clientPreferences = collectClientPreferences();
  const userSettings = collectUserSettings();
  const serverSettings = collectServerSettings();
  applyClientPreferences(clientPreferences);
  return {
    clientPreferences: clientPreferences,
    userSettings: userSettings,
    serverSettings: serverSettings,
  };
}
