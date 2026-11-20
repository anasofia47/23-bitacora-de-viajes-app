import * as ImageManipulator from "expo-image-manipulator";
import { apiFetch, obtenerSesionSegura } from "../api/client";
import {
  obtenerViajesPendientes,
  actualizarUriFotoLocal,
  marcarViajeSincronizado,
  aplicarViajeRemoto,
  obtenerUltimoSince,
  guardarUltimoSince,
} from "../repositories/viajeRepository";
import { simplificarRutaParaFirestore } from "./telemetria";

/**
 * Sección 9.5:
 * Vercel limita el cuerpo de una petición a 4,5 MB: la app reduce la foto antes de subirla
 * con expo-image-manipulator (ancho <= 1280 px, JPEG calidad ≈ 0,7 -> unos 150-300 KB).
 */
export async function reducirYSubirFoto(localUri: string): Promise<string> {
  if (localUri.startsWith("https://") || localUri.startsWith("http://")) {
    return localUri;
  }

  let uriOptimizada = localUri;
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 1280 } }],
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    uriOptimizada = manipResult.uri;
  } catch {
    uriOptimizada = localUri;
  }

  const fileRes = await fetch(uriOptimizada);
  const arrayBuffer = await fileRes.arrayBuffer();

  const uploadRes = await apiFetch("/api/imagenes", {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
    },
    body: arrayBuffer,
  });

  if (!uploadRes.ok) {
    const errBody = (await uploadRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || "Error al subir la imagen a Vercel Blob");
  }

  const data = (await uploadRes.json()) as { url: string; pathname: string };
  return data.url;
}

/**
 * Sección 9.3:
 * Estrategia de sincronización:
 * 1. Envía los registros locales con pending = 1 (PUT /api/viaje/<remote_id> o DELETE /api/viaje/<remote_id>).
 * 2. Pide GET /api/viaje?since=<ISO> en páginas de hasta 500 documentos hasta recibir < 500.
 */
export async function sincronizarConApi(): Promise<{
  subidos: number;
  descargados: number;
}> {
  const sesion = await obtenerSesionSegura();
  if (!sesion.token) {
    throw new Error("Inicie sesión para sincronizar sus viajes con la nube.");
  }

  let subidos = 0;
  let descargados = 0;

  // 1. Subir pendientes locales
  const pendientes = await obtenerViajesPendientes();
  for (const v of pendientes) {
    if (v.deleted === 1) {
      const delRes = await apiFetch(`/api/viaje/${encodeURIComponent(v.remote_id)}`, {
        method: "DELETE",
      });
      if (delRes.ok || delRes.status === 404) {
        await marcarViajeSincronizado(v.id, new Date().toISOString());
        subidos += 1;
      }
      continue;
    }

    // Subir fotos una por una con POST /api/imagenes (Sección 9.4 y 9.5)
    const fotosPayload: Array<{ url: string; lat: number | null; lng: number | null; t: string }> =
      [];

    for (const f of v.fotos) {
      const remoteUrl = await reducirYSubirFoto(f.uri);
      if (remoteUrl !== f.uri) {
        await actualizarUriFotoLocal(f.id, remoteUrl);
      }
      fotosPayload.push({
        url: remoteUrl,
        lat: f.lat,
        lng: f.lng,
        t: f.t,
      });
    }

    // Simplificar ruta a <= 1500 puntos (Sección 9.4)
    const rutaSimplificada = simplificarRutaParaFirestore(
      v.puntos.map((pt) => ({
        t: pt.t,
        lat: pt.lat,
        lng: pt.lng,
        altitud_gps: pt.altitud_gps,
        presion_hpa: pt.presion_hpa,
      }))
    );

    const putRes = await apiFetch(`/api/viaje/${encodeURIComponent(v.remote_id)}`, {
      method: "PUT",
      body: JSON.stringify({
        nombre: v.nombre,
        inicio: v.inicio,
        fin: v.fin,
        metros: v.metros,
        desnivel_pos_m: v.desnivel_pos_m,
        altitud_max_m: v.altitud_max_m,
        pasos: v.pasos,
        ruta: rutaSimplificada,
        fotos: fotosPayload,
      }),
    });

    if (putRes.ok) {
      const savedDoc = (await putRes.json()) as { updated_at?: string };
      await marcarViajeSincronizado(v.id, savedDoc.updated_at || new Date().toISOString());
      subidos += 1;
    }
  }

  // 2. Descargar cambios remotos (?since=<ISO>, repetir hasta recibir < 500)
  let sinceCursor = await obtenerUltimoSince();
  let continuarPaginando = true;

  while (continuarPaginando) {
    const query = sinceCursor ? `?since=${encodeURIComponent(sinceCursor)}` : "";
    const getRes = await apiFetch(`/api/viaje${query}`, { method: "GET" });
    if (!getRes.ok) {
      break;
    }

    const body = (await getRes.json()) as {
      items?: Array<{
        id: string;
        nombre: string;
        inicio: string;
        fin: string | null;
        metros: number;
        desnivel_pos_m: number;
        altitud_max_m: number | null;
        pasos?: number | null;
        ruta?: Array<{ t: string; lat: number; lng: number; alt: number | null }>;
        fotos?: Array<{ url: string; lat: number | null; lng: number | null; t: string }>;
        updated_at: string;
        deleted_at: string | null;
      }>;
      servidor_ahora?: string;
    };

    const items = body.items ?? [];
    for (const item of items) {
      await aplicarViajeRemoto(item);
      sinceCursor = item.updated_at;
      descargados += 1;
    }

    if (sinceCursor) {
      await guardarUltimoSince(sinceCursor);
    } else if (body.servidor_ahora) {
      await guardarUltimoSince(body.servidor_ahora);
    }

    if (items.length < 500) {
      continuarPaginando = false;
    }
  }

  return { subidos, descargados };
}

export async function consultarEstadisticasAnualesRemotas(anio?: number): Promise<{
  anio: number;
  total_viajes: number;
  metros_totales: number;
  kilometros_totales: number;
  desnivel_pos_acumulado_m: number;
  altitud_max_m: number | null;
} | null> {
  const sesion = await obtenerSesionSegura();
  if (!sesion.token) {
    return null;
  }

  const query = anio ? `?anio=${anio}` : "";
  const res = await apiFetch(`/api/viajes/estadisticas${query}`, { method: "GET" });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as {
    anio: number;
    total_viajes: number;
    metros_totales: number;
    kilometros_totales: number;
    desnivel_pos_acumulado_m: number;
    altitud_max_m: number | null;
  };
}
