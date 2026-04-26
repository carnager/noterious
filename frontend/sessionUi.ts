import { clearNode } from "./dom";
import type { AuthSessionResponse, AuthenticatedUser, VaultRecord } from "./types";

export type AuthGateMode = "login" | "setup" | "changePassword";

export interface SessionUiState {
  authenticated: boolean;
  currentUser: AuthenticatedUser | null;
  currentVault: VaultRecord | null;
  availableVaults: VaultRecord[];
  vaultSwitchPending: boolean;
  vaultSwitcherOpen: boolean;
  mustChangePassword: boolean;
  setupRequired: boolean;
  authGateMode: AuthGateMode;
}

export interface SessionUiElements {
  appShell?: HTMLElement | null;
  authShell: HTMLElement;
  authEyebrow: HTMLElement;
  authTitle: HTMLElement;
  authCopy: HTMLElement;
  authIdentity: HTMLElement;
  authUsernameRow: HTMLElement;
  authPasswordRow: HTMLElement;
  authSetupConfirmRow: HTMLElement;
  authChangeFields: HTMLElement;
  authUsername: HTMLInputElement;
  authPassword: HTMLInputElement;
  authCurrentPassword: HTMLInputElement;
  authNewPassword: HTMLInputElement;
  authSubmit: HTMLButtonElement;
  authStatus: HTMLElement;
  sessionMenuPanel: HTMLElement;
  openSessionMenu: HTMLButtonElement;
  sessionUser: HTMLElement;
  logoutSession: HTMLElement;
  vaultSwitcher: HTMLElement;
  openVaultSwitcher: HTMLButtonElement;
  currentVaultName: HTMLElement;
  vaultSwitcherPanel: HTMLElement;
  vaultSwitcherList: HTMLDivElement;
}

function canSwitchVault(state: SessionUiState): boolean {
  return state.authenticated && state.availableVaults.some(function (vault) {
    return !state.currentVault || vault.id !== state.currentVault.id;
  });
}

export function applyAuthSessionResponse(state: SessionUiState, session: AuthSessionResponse): void {
  state.authenticated = Boolean(session.authenticated);
  state.currentUser = state.authenticated && session.user
    ? session.user
    : null;
  state.currentVault = state.authenticated && session.vault
    ? session.vault
    : null;
  if (!state.authenticated) {
    state.availableVaults = [];
    state.vaultSwitchPending = false;
  }
  state.mustChangePassword = Boolean(state.currentUser && state.currentUser.mustChangePassword);
  state.setupRequired = Boolean(!state.authenticated && session.setupRequired);
  state.authGateMode = state.mustChangePassword
    ? "changePassword"
    : (state.setupRequired ? "setup" : "login");
}

export function renderAuthGate(state: SessionUiState, els: SessionUiElements): void {
  const setupRequired = state.authGateMode === "setup";
  const mustChangePassword = state.authGateMode === "changePassword";

  if (mustChangePassword) {
    els.authEyebrow.textContent = "Password Rotation";
    els.authTitle.textContent = "Rotate Bootstrap Password";
    els.authCopy.textContent = "This session is using a generated bootstrap credential. Set a new password before loading notes, queries, documents, history, or live events.";
  } else if (setupRequired) {
    els.authEyebrow.textContent = "Welcome";
    els.authTitle.textContent = "Who Are You?";
    els.authCopy.textContent = "Set up this installation with the username and password you want to use here.";
  } else {
    els.authEyebrow.textContent = "Auth Required";
    els.authTitle.textContent = "Sign In To Noterious";
    els.authCopy.textContent = "The server now requires a session before loading notes, queries, documents, history, or live events.";
  }

  els.authIdentity.classList.toggle("hidden", !mustChangePassword);
  if (mustChangePassword && state.currentUser) {
    els.authIdentity.textContent = "Signed in as " + state.currentUser.username + ".";
  } else {
    els.authIdentity.textContent = "";
  }

  els.authUsernameRow.classList.toggle("hidden", mustChangePassword);
  els.authPasswordRow.classList.toggle("hidden", mustChangePassword);
  els.authSetupConfirmRow.classList.toggle("hidden", !setupRequired);
  els.authChangeFields.classList.toggle("hidden", !mustChangePassword);
  els.authSubmit.textContent = mustChangePassword
    ? "Update Password"
    : (setupRequired ? "Set Up Account" : "Sign In");
}

export function setAuthGateOpen(state: SessionUiState, els: SessionUiElements, open: boolean, status?: string): void {
  renderAuthGate(state, els);
  els.authShell.classList.toggle("hidden", !open);
  if (els.appShell) {
    if (open) {
      els.appShell.setAttribute("inert", "");
    } else {
      els.appShell.removeAttribute("inert");
    }
  }
  if (typeof status === "string") {
    els.authStatus.textContent = status;
  } else if (!open) {
    els.authStatus.textContent = "";
  }
  if (!open) {
    return;
  }
  window.setTimeout(function () {
    if (state.authGateMode === "changePassword") {
      if (els.authCurrentPassword.value.trim()) {
        els.authNewPassword.focus();
        return;
      }
      els.authCurrentPassword.focus();
      return;
    }
    if (state.authGateMode === "setup") {
      if (els.authUsername.value.trim()) {
        els.authPassword.focus();
        return;
      }
      els.authUsername.focus();
      return;
    }
    if (els.authUsername.value.trim()) {
      els.authPassword.focus();
      return;
    }
    els.authUsername.focus();
  }, 0);
}

export function setVaultSwitcherOpen(state: SessionUiState, els: SessionUiElements, open: boolean): void {
  state.vaultSwitcherOpen = canSwitchVault(state) && open;
  els.vaultSwitcherPanel.classList.toggle("hidden", !state.vaultSwitcherOpen);
  els.openVaultSwitcher.setAttribute("aria-expanded", state.vaultSwitcherOpen ? "true" : "false");
}

export function setSessionMenuOpen(state: SessionUiState, els: SessionUiElements, open: boolean): void {
  if (!state.authenticated) {
    open = false;
  }
  els.sessionMenuPanel.classList.toggle("hidden", !open);
  els.openSessionMenu.setAttribute("aria-expanded", open ? "true" : "false");
}

export function renderSessionState(
  state: SessionUiState,
  els: SessionUiElements,
  onSwitchVault: (vaultID: number) => void,
): void {
  const username = state.currentUser && state.currentUser.username
    ? state.currentUser.username
    : "Sign In";
  els.sessionUser.textContent = username;
  els.logoutSession.classList.toggle("hidden", !state.authenticated);
  els.openSessionMenu.title = state.authenticated
    ? "Session menu"
    : "Open sign in";
  if (!state.authenticated) {
    setSessionMenuOpen(state, els, false);
  }

  const hasCurrentVault = state.authenticated && Boolean(state.currentVault);
  const canToggleVaults = canSwitchVault(state);

  els.vaultSwitcher.classList.toggle("hidden", !hasCurrentVault);
  els.currentVaultName.textContent = state.currentVault && state.currentVault.name
    ? state.currentVault.name
    : "Vault";
  els.openVaultSwitcher.disabled = !canToggleVaults || state.vaultSwitchPending;
  clearNode(els.vaultSwitcherList);

  if (!hasCurrentVault || !canToggleVaults) {
    setVaultSwitcherOpen(state, els, false);
    return;
  }

  state.availableVaults.forEach(function (vault) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vault-switcher-item";
    if (state.currentVault && vault.id === state.currentVault.id) {
      button.classList.add("active");
    }
    button.disabled = state.vaultSwitchPending;
    button.addEventListener("click", function () {
      onSwitchVault(vault.id);
    });

    const title = document.createElement("strong");
    title.textContent = vault.name || vault.key || ("Vault " + String(vault.id));
    button.appendChild(title);

    if (state.currentVault && vault.id === state.currentVault.id) {
      const meta = document.createElement("span");
      meta.textContent = "Current";
      button.appendChild(meta);
    }

    els.vaultSwitcherList.appendChild(button);
  });

  els.vaultSwitcherPanel.classList.toggle("hidden", !state.vaultSwitcherOpen);
  els.openVaultSwitcher.setAttribute("aria-expanded", state.vaultSwitcherOpen ? "true" : "false");
}
