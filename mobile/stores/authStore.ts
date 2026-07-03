import { create } from "zustand";
import { IdentityManager, UserIdentity } from "../services/identity";
import { api } from "../services/api";

interface AuthState {
  identity: UserIdentity | null;
  isChecked: boolean;
  checkIdentity: () => void;
  registerIdentity: (displayName: string) => UserIdentity;
  login: (email: string, password: string) => Promise<UserIdentity>;
  register: (displayName: string, email: string, password: string) => Promise<UserIdentity>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  identity: null,
  isChecked: false,

  // Read identity from MMKV local storage on startup
  checkIdentity: () => {
    const identity = IdentityManager.getIdentity();
    set({ identity, isChecked: true });
  },

  // Save new user name and set local state
  registerIdentity: (displayName: string) => {
    const identity = IdentityManager.saveIdentity(displayName);
    set({ identity });
    return identity;
  },

  // Login API action
  login: async (email: string, password: string) => {
    const response = await api.post("/api/auth/login", { email, password });
    const { user } = response.data;
    const identity = IdentityManager.saveAuthenticatedIdentity(user.id, user.displayName);
    set({ identity });
    return identity;
  },

  // Register API action
  register: async (displayName: string, email: string, password: string) => {
    const response = await api.post("/api/auth/register", { displayName, email, password });
    const { user } = response.data;
    const identity = IdentityManager.saveAuthenticatedIdentity(user.id, user.displayName);
    set({ identity });
    return identity;
  },

  // Logout / clear local identity
  logout: () => {
    IdentityManager.clearIdentity();
    set({ identity: null });
  },
}));
