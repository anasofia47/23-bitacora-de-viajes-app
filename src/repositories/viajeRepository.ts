import { getDb } from "../db/database";
import {
  type PuntoCrudo,
  type PuntoSimplificado,
  simplificarRutaParaFirestore,
  MAX_PUNTOS_FIRESTORE,
} from "../services/telemetria";

export interface ViajeRow {
  id: number;
  nombre: string;
  inicio: string;
  fin: string | null;
  metros: number;
  desnivel_pos_m: number;
  altitud_max_m: number | null;
  pasos: number | null;
  remote_id: string;
  updated_at: string;
  deleted: number;
  pending: number;
}

export interface PuntoRow {
  id: number;
  viaje_id: number;
  t: string;
  lat: number;
  lng: number;
  altitud_gps: number | null;
  presion_hpa: number | null;
  remote_id: string | null;
  updated_at: string | null;
  deleted: number;
  pending: number;
}

export interface FotoRow {
  id: number;
  viaje_id: number;
  uri: string;
  lat: number | null;
  lng: number | null;
  t: string;
  remote_id: string | null;
  updated_at: string | null;
  deleted: number;
  pending: number;
}

export interface ViajeCompleto extends ViajeRow {
  puntos: PuntoRow[];
  fotos: FotoRow[];
}

export interface PayloadSincronizacionViaje {
  remote_id: string;
  nombre: string;
  inicio: string;
  fin: string | null;
  metros: number;
  desnivel_pos_m: number;
  altitud_max_m: number | null;
  pasos: number | null;
  ruta: PuntoSimplificado[];
  fotos: Array<{
    id: number;
    uri: string;
    lat: number | null;
    lng: number | null;
    t: string;
  }>;
}

function generateUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Construye el payload del viaje con su ruta simplificada (<= 1500 puntos)
 * función pura reutilizable y verificable en pruebas unitarias (Sección 11).
 */
export function construirViajeConRutaSimplificada(params: {
  remoteId?: string;
  nombre: string;
  inicio: string;
  fin: string | null;
  metros: number;
  desnivel_pos_m: number;
  altitud_max_m: number | null;
  pasos: number | null;
  puntos: PuntoCrudo[];
  maxPuntos?: number;
}): {
  remote_id: string;
  nombre: string;
  inicio: string;
  fin: string | null;
  metros: number;
  desnivel_pos_m: number;
  altitud_max_m: number | null;
  pasos: number | null;
  rutaSimplificada: PuntoSimplificado[];
} {
  const remoteId = params.remoteId || generateUuid();
  const rutaSimplificada = simplificarRutaParaFirestore(
    params.puntos,
    params.maxPuntos ?? MAX_PUNTOS_FIRESTORE
  );

  return {
    remote_id: remoteId,
    nombre: params.nombre.trim(),
    inicio: params.inicio,
    fin: params.fin,
    metros: Math.round(params.metros),
    desnivel_pos_m: Math.round(params.desnivel_pos_m),
    altitud_max_m: params.altitud_max_m,
    pasos: params.pasos,
    rutaSimplificada,
  };
}

export async function crearViajeGrabado(params: {
  nombre: string;
  inicio: string;
  fin: string;
  metros: number;
  desnivel_pos_m: number;
  altitud_max_m: number | null;
  pasos: number | null;
  puntos: PuntoCrudo[];
  fotos: Array<{ uri: string; lat: number | null; lng: number | null; t: string }>;
}): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();
  const preparado = construirViajeConRutaSimplificada({
    nombre: params.nombre,
    inicio: params.inicio,
    fin: params.fin,
    metros: params.metros,
    desnivel_pos_m: params.desnivel_pos_m,
    altitud_max_m: params.altitud_max_m,
    pasos: params.pasos,
    puntos: params.puntos,
  });

  const result = await db.runAsync(
    `INSERT INTO viaje (nombre, inicio, fin, metros, desnivel_pos_m, altitud_max_m, pasos, remote_id, updated_at, deleted, pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [
      preparado.nombre,
      preparado.inicio,
      preparado.fin,
      preparado.metros,
      preparado.desnivel_pos_m,
      preparado.altitud_max_m,
      preparado.pasos,
      preparado.remote_id,
      now,
    ]
  );

  const viajeId = result.lastInsertRowId;

  // Guardamos los puntos simplificados (<= 1500) en SQLite
  const puntosParaGuardar =
    params.puntos.length > MAX_PUNTOS_FIRESTORE
      ? preparado.rutaSimplificada.map((p) => ({
          t: p.t,
          lat: p.lat,
          lng: p.lng,
          altitud_gps: p.alt,
          presion_hpa: null,
        }))
      : params.puntos;

  for (const pt of puntosParaGuardar) {
    await db.runAsync(
      `INSERT INTO punto (viaje_id, t, lat, lng, altitud_gps, presion_hpa, remote_id, updated_at, deleted, pending)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
      [
        viajeId,
        pt.t,
        pt.lat,
        pt.lng,
        pt.altitud_gps ?? null,
        pt.presion_hpa ?? null,
        generateUuid(),
        now,
      ]
    );
  }

  for (const f of params.fotos) {
    await db.runAsync(
      `INSERT INTO foto (viaje_id, uri, lat, lng, t, remote_id, updated_at, deleted, pending)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`,
      [viajeId, f.uri, f.lat ?? null, f.lng ?? null, f.t, generateUuid(), now]
    );
  }

  return viajeId;
}

export async function listarViajes(busqueda: string = ""): Promise<
  Array<ViajeRow & { total_fotos: number; total_puntos: number }>
> {
  const db = await getDb();
  const filtro = `%${busqueda.trim()}%`;

  const rows = await db.getAllAsync<
    ViajeRow & { total_fotos: number; total_puntos: number }
  >(
    `SELECT v.*,
            (SELECT COUNT(*) FROM foto f WHERE f.viaje_id = v.id AND f.deleted = 0) AS total_fotos,
            (SELECT COUNT(*) FROM punto p WHERE p.viaje_id = v.id AND p.deleted = 0) AS total_puntos
     FROM viaje v
     WHERE v.deleted = 0
       AND v.nombre LIKE ?
     ORDER BY v.inicio DESC`,
    [filtro]
  );

  return rows;
}

export async function obtenerViajePorId(id: number): Promise<ViajeCompleto | null> {
  const db = await getDb();
  const viaje = await db.getFirstAsync<ViajeRow>(
    `SELECT * FROM viaje WHERE id = ? AND deleted = 0`,
    [id]
  );
  if (!viaje) {
    return null;
  }

  const puntos = await db.getAllAsync<PuntoRow>(
    `SELECT * FROM punto WHERE viaje_id = ? AND deleted = 0 ORDER BY t ASC, id ASC`,
    [id]
  );

  const fotos = await db.getAllAsync<FotoRow>(
    `SELECT * FROM foto WHERE viaje_id = ? AND deleted = 0 ORDER BY t ASC, id ASC`,
    [id]
  );

  return {
    ...viaje,
    puntos,
    fotos,
  };
}

export async function obtenerFotoPorId(fotoId: number): Promise<{
  foto: FotoRow;
  hermanas: FotoRow[];
  viajeNombre: string;
} | null> {
  const db = await getDb();
  const foto = await db.getFirstAsync<FotoRow>(
    `SELECT * FROM foto WHERE id = ? AND deleted = 0`,
    [fotoId]
  );
  if (!foto) {
    return null;
  }

  const viaje = await db.getFirstAsync<ViajeRow>(
    `SELECT * FROM viaje WHERE id = ?`,
    [foto.viaje_id]
  );

  const hermanas = await db.getAllAsync<FotoRow>(
    `SELECT * FROM foto WHERE viaje_id = ? AND deleted = 0 ORDER BY t ASC, id ASC`,
    [foto.viaje_id]
  );

  return {
    foto,
    hermanas,
    viajeNombre: viaje?.nombre ?? "Recorrido",
  };
}

export async function eliminarViajeLogico(id: number): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE viaje SET deleted = 1, pending = 1, updated_at = ? WHERE id = ?`,
    [now, id]
  );
}

export async function obtenerViajesPendientes(): Promise<ViajeCompleto[]> {
  const db = await getDb();
  const pendientes = await db.getAllAsync<ViajeRow>(
    `SELECT * FROM viaje WHERE pending = 1`
  );

  const resultado: ViajeCompleto[] = [];
  for (const v of pendientes) {
    const puntos = await db.getAllAsync<PuntoRow>(
      `SELECT * FROM punto WHERE viaje_id = ? AND deleted = 0 ORDER BY t ASC, id ASC`,
      [v.id]
    );
    const fotos = await db.getAllAsync<FotoRow>(
      `SELECT * FROM foto WHERE viaje_id = ? AND deleted = 0 ORDER BY t ASC, id ASC`,
      [v.id]
    );
    resultado.push({ ...v, puntos, fotos });
  }
  return resultado;
}

export async function actualizarUriFotoLocal(fotoId: number, remoteUrl: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE foto SET uri = ?, updated_at = ?, pending = 0 WHERE id = ?`,
    [remoteUrl, now, fotoId]
  );
}

export async function marcarViajeSincronizado(viajeId: number, serverUpdatedAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE viaje SET pending = 0, updated_at = ? WHERE id = ?`,
    [serverUpdatedAt, viajeId]
  );
}

export async function aplicarViajeRemoto(remoto: {
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
}): Promise<void> {
  const db = await getDb();
  const existente = await db.getFirstAsync<ViajeRow>(
    `SELECT * FROM viaje WHERE remote_id = ?`,
    [remoto.id]
  );

  const isDeleted = remoto.deleted_at !== null && remoto.deleted_at !== undefined ? 1 : 0;

  if (existente) {
    // 9.3: Conflictos: gana la última escritura (updated_at del servidor)
    if (existente.updated_at && existente.updated_at > remoto.updated_at && existente.pending === 1) {
      return;
    }

    await db.runAsync(
      `UPDATE viaje
       SET nombre = ?, inicio = ?, fin = ?, metros = ?, desnivel_pos_m = ?, altitud_max_m = ?, pasos = ?,
           updated_at = ?, deleted = ?, pending = 0
       WHERE id = ?`,
      [
        remoto.nombre,
        remoto.inicio,
        remoto.fin ?? null,
        remoto.metros ?? 0,
        remoto.desnivel_pos_m ?? 0,
        remoto.altitud_max_m ?? null,
        remoto.pasos ?? null,
        remoto.updated_at,
        isDeleted,
        existente.id,
      ]
    );
    return;
  }

  if (isDeleted) {
    return;
  }

  const ins = await db.runAsync(
    `INSERT INTO viaje (nombre, inicio, fin, metros, desnivel_pos_m, altitud_max_m, pasos, remote_id, updated_at, deleted, pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    [
      remoto.nombre,
      remoto.inicio,
      remoto.fin ?? null,
      remoto.metros ?? 0,
      remoto.desnivel_pos_m ?? 0,
      remoto.altitud_max_m ?? null,
      remoto.pasos ?? null,
      remoto.id,
      remoto.updated_at,
    ]
  );

  const nuevoViajeId = ins.lastInsertRowId;

  for (const pt of remoto.ruta ?? []) {
    await db.runAsync(
      `INSERT INTO punto (viaje_id, t, lat, lng, altitud_gps, presion_hpa, remote_id, updated_at, deleted, pending)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0, 0)`,
      [nuevoViajeId, pt.t, pt.lat, pt.lng, pt.alt ?? null, generateUuid(), remoto.updated_at]
    );
  }

  for (const f of remoto.fotos ?? []) {
    await db.runAsync(
      `INSERT INTO foto (viaje_id, uri, lat, lng, t, remote_id, updated_at, deleted, pending)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [nuevoViajeId, f.url, f.lat ?? null, f.lng ?? null, f.t, generateUuid(), remoto.updated_at]
    );
  }
}

export async function obtenerUltimoSince(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ valor: string }>(
    `SELECT valor FROM sync_meta WHERE clave = 'last_since'`
  );
  return row?.valor ?? null;
}

export async function guardarUltimoSince(sinceIso: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_meta (clave, valor) VALUES ('last_since', ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    [sinceIso]
  );
}
