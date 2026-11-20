import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY_ID_TOKEN = "bitacora_id_token";
const KEY_REFRESH_TOKEN = "bitacora_refresh_token";
const KEY_USER_EMAIL = "bitacora_user_email";

// Fallback en memoria únicamente para entorno web o test donde SecureStore nativo no existe
const memoryStore = new Map<string, string>();

async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    memoryStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return memoryStore.get(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    memoryStore.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (raw && raw.startsWith("https://")) {
    return raw.replace(/\/+$/, "");
  }
  return "https://23-bitacora-de-viajes-api.vercel.app";
}

export async function guardarSesionSegura(params: {
  token: string;
  refreshToken: string;
  email: string;
}): Promise<void> {
  await setSecureItem(KEY_ID_TOKEN, params.token);
  await setSecureItem(KEY_REFRESH_TOKEN, params.refreshToken);
  await setSecureItem(KEY_USER_EMAIL, params.email);
}

export async function obtenerSesionSegura(): Promise<{
  token: string | null;
  refreshToken: string | null;
  email: string | null;
}> {
  const [token, refreshToken, email] = await Promise.all([
    getSecureItem(KEY_ID_TOKEN),
    getSecureItem(KEY_REFRESH_TOKEN),
    getSecureItem(KEY_USER_EMAIL),
  ]);
  return { token, refreshToken, email };
}

export async function limpiarSesionSegura(): Promise<void> {
  await Promise.all([
    deleteSecureItem(KEY_ID_TOKEN),
    deleteSecureItem(KEY_REFRESH_TOKEN),
    deleteSecureItem(KEY_USER_EMAIL),
  ]);
}

async function intentarRenovarToken(): Promise<string | null> {
  const refreshToken = await getSecureItem(KEY_REFRESH_TOKEN);
  if (!refreshToken) {
    return null;
  }

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      await limpiarSesionSegura();
      return null;
    }

    const data = (await res.json()) as {
      token?: string;
      refreshToken?: string;
    };

    if (!data.token) {
      await limpiarSesionSegura();
      return null;
    }

    await setSecureItem(KEY_ID_TOKEN, data.token);
    if (data.refreshToken) {
      await setSecureItem(KEY_REFRESH_TOKEN, data.refreshToken);
    }
    return data.token;
  } catch {
    return null;
  }
}

/**
 * Sección 9.1:
 * Cliente HTTP con Bearer token. Si una petición devuelve 401,
 * llama UNA VEZ a /api/auth/refresh y reintenta; si falla, limpia sesión.
 */
export async function apiFetch(
  endpointPath: string,
  options: RequestInit = {},
  onUnauthorized?: () => void
): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`;
  const token = await getSecureItem(KEY_ID_TOKEN);

  const buildHeaders = (bearer: string | null): HeadersInit => {
    const baseHeaders: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (!baseHeaders["Content-Type"] && !(options.body instanceof ArrayBuffer)) {
      baseHeaders["Content-Type"] = "application/json";
    }
    if (bearer) {
      baseHeaders["Authorization"] = `Bearer ${bearer}`;
    }
    return baseHeaders;
  };

  let response = await fetch(url, {
    ...options,
    headers: buildHeaders(token),
  });

  if (response.status === 401 && token) {
    const nuevoToken = await intentarRenovarToken();
    if (nuevoToken) {
      response = await fetch(url, {
        ...options,
        headers: buildHeaders(nuevoToken),
      });
    } else {
      await limpiarSesionSegura();
      onUnauthorized?.();
    }
  }

  return response;
}

export async function loginConApi(email: string, password: string) {
  const res = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = (await res.json()) as {
    token?: string;
    refreshToken?: string;
    usuario?: { id: string; email: string };
    error?: string;
  };

  if (!res.ok || !data.token || !data.refreshToken) {
    throw new Error(data.error || "Credenciales inválidas");
  }

  await guardarSesionSegura({
    token: data.token,
    refreshToken: data.refreshToken,
    email: data.usuario?.email || email,
  });

  return data;
}

export async function registroConApi(email: string, password: string) {
  const res = await fetch(`${getApiBaseUrl()}/api/auth/registro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = (await res.json()) as {
    token?: string;
    refreshToken?: string;
    usuario?: { id: string; email: string };
    error?: string;
  };

  if (!res.ok || !data.token || !data.refreshToken) {
    throw new Error(data.error || "No fue posible registrar la cuenta");
  }

  await guardarSesionSegura({
    token: data.token,
    refreshToken: data.refreshToken,
    email: data.usuario?.email || email,
  });

  return data;
}
