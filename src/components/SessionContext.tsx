import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  obtenerSesionSegura,
  loginConApi,
  registroConApi,
  limpiarSesionSegura,
} from "../api/client";

interface SessionContextValue {
  email: string | null;
  autenticado: boolean;
  cargandoSesion: boolean;
  iniciarSesion: (email: string, password: string) => Promise<void>;
  registrarse: (email: string, password: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  recargarSesion: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  email: null,
  autenticado: false,
  cargandoSesion: true,
  iniciarSesion: async () => {},
  registrarse: async () => {},
  cerrarSesion: async () => {},
  recargarSesion: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [autenticado, setAutenticado] = useState(false);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  const recargarSesion = useCallback(async () => {
    try {
      const sesion = await obtenerSesionSegura();
      if (sesion.token) {
        setAutenticado(true);
        setEmail(sesion.email);
      } else {
        setAutenticado(false);
        setEmail(null);
      }
    } catch {
      setAutenticado(false);
      setEmail(null);
    } finally {
      setCargandoSesion(false);
    }
  }, []);

  useEffect(() => {
    recargarSesion();
  }, [recargarSesion]);

  const iniciarSesion = useCallback(async (correo: string, clave: string) => {
    const res = await loginConApi(correo, clave);
    setAutenticado(true);
    setEmail(res.usuario?.email || correo);
  }, []);

  const registrarse = useCallback(async (correo: string, clave: string) => {
    const res = await registroConApi(correo, clave);
    setAutenticado(true);
    setEmail(res.usuario?.email || correo);
  }, []);

  const cerrarSesion = useCallback(async () => {
    await limpiarSesionSegura();
    setAutenticado(false);
    setEmail(null);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        email,
        autenticado,
        cargandoSesion,
        iniciarSesion,
        registrarse,
        cerrarSesion,
        recargarSesion,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
