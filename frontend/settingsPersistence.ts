export interface SettingsSaveSnapshot<TClient, TUser, TServer> {
  clientPreferences: TClient;
  userSettings: TUser;
  serverSettings: TServer;
}

export interface SettingsSaveSnapshotWithExtra<TClient, TUser, TServer, TExtra> extends SettingsSaveSnapshot<TClient, TUser, TServer> {
  extra: TExtra;
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

export function prepareSettingsSaveWithExtra<TClient, TUser, TServer, TExtra>(
  collectClientPreferences: () => TClient,
  collectUserSettings: () => TUser,
  collectServerSettings: () => TServer,
  collectExtra: () => TExtra,
  applyClientPreferences: (preferences: TClient) => void,
): SettingsSaveSnapshotWithExtra<TClient, TUser, TServer, TExtra> {
  const clientPreferences = collectClientPreferences();
  const userSettings = collectUserSettings();
  const serverSettings = collectServerSettings();
  const extra = collectExtra();
  applyClientPreferences(clientPreferences);
  return {
    clientPreferences: clientPreferences,
    userSettings: userSettings,
    serverSettings: serverSettings,
    extra: extra,
  };
}
