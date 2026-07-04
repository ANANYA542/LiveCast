import axios from "axios";
import { IdentityManager } from "./identity";
import { NativeModules, Platform } from "react-native";

const USE_PRODUCTION_BACKEND = false;
const PRODUCTION_URL = "https://livecast-rag6.onrender.com";

const getBaseUrl = () => {
  if (USE_PRODUCTION_BACKEND || !__DEV__) {
    return PRODUCTION_URL;
  }

  const scriptURL = NativeModules.SourceCode?.scriptURL;
  if (scriptURL) {
    const matches = scriptURL.match(/^https?:\/\/([^:/]+)/);
    if (matches && matches[1]) {
      const ip = matches[1];
      
      if (Platform.OS === "ios") {
        return "http://127.0.0.1:3001";
      }
      
      if (Platform.OS === "android") {
        if (ip === "10.0.2.2") {
          return "http://10.0.2.2:3001";
        }
        return "http://127.0.0.1:3001";
      }
      
      return `http://${ip}:3001`;
    }
  }
  return Platform.OS === "android" ? "http://10.0.2.2:3001" : "http://127.0.0.1:3001";
};

export const API_BASE_URL = getBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const identity = IdentityManager.getIdentity();
    if (identity) {
      config.headers["X-User-Id"] = identity.id;
      config.headers["X-Display-Name"] = identity.displayName;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
