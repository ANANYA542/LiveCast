import axios from "axios";
import { IdentityManager } from "./identity";

// Connect to local backend (using adb reverse tcp:3001 tcp:3001 makes this hit the Mac backend)
export const API_BASE_URL = "http://localhost:3001";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor to inject client identity headers dynamically on every request
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
