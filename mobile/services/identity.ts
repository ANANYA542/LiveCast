import uuid from "react-native-uuid";
import { AppStorage, StorageKeys } from "./storage";

export interface UserIdentity {
  id: string;
  displayName: string;
}

export const IdentityManager = {
  // Check if identity exists in local storage
  hasIdentity: (): boolean => {
    const id = AppStorage.getString(StorageKeys.USER_ID);
    const name = AppStorage.getString(StorageKeys.DISPLAY_NAME);
    return !!(id && name);
  },

  // Retrieve current user identity
  getIdentity: (): UserIdentity | null => {
    const id = AppStorage.getString(StorageKeys.USER_ID);
    const name = AppStorage.getString(StorageKeys.DISPLAY_NAME);
    if (id && name) {
      return { id, displayName: name };
    }
    return null;
  },

  // Save new user identity (generates UUID if not provided)
  saveIdentity: (displayName: string): UserIdentity => {
    const cleanName = displayName.trim();
    if (!cleanName) {
      throw new Error("Display Name cannot be empty");
    }

    // Generate a fresh client-side UUID v4
    const newId = uuid.v4() as string;

    AppStorage.setString(StorageKeys.USER_ID, newId);
    AppStorage.setString(StorageKeys.DISPLAY_NAME, cleanName);

    return { id: newId, displayName: cleanName };
  },

  // Save specific authenticated credentials returned from the backend
  saveAuthenticatedIdentity: (id: string, displayName: string): UserIdentity => {
    AppStorage.setString(StorageKeys.USER_ID, id);
    AppStorage.setString(StorageKeys.DISPLAY_NAME, displayName);
    return { id, displayName };
  },

  // Clear identity (used for logouts or resets)
  clearIdentity: (): void => {
    AppStorage.delete(StorageKeys.USER_ID);
    AppStorage.delete(StorageKeys.DISPLAY_NAME);
  },
};
