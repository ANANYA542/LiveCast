import { MMKV } from "react-native-mmkv";

// Instantiate the JSI-backed storage
export const storage = new MMKV({
  id: "buildai-app-storage",
});

// Helper functions for easy get/set
export const StorageKeys = {
  USER_ID: "user_identity_id",
  DISPLAY_NAME: "user_identity_name",
  OUTBOX: "offline_chat_outbox",
};

export const AppStorage = {
  getString: (key: string): string | undefined => {
    return storage.getString(key);
  },

  setString: (key: string, value: string): void => {
    storage.set(key, value);
  },

  delete: (key: string): void => {
    storage.delete(key);
  },

  clearAll: (): void => {
    storage.clearAll();
  },
};
