import * as SQLite from "expo-sqlite";

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Sección 8: Modelo de datos local (SQLite) con columnas de sincronización:
 * remote_id TEXT, updated_at TEXT, deleted INTEGER DEFAULT 0, pending INTEGER DEFAULT 0
 */
export const MIGRATION_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS viaje (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  inicio TEXT NOT NULL,
  fin TEXT,
  metros INTEGER NOT NULL DEFAULT 0,
  desnivel_pos_m INTEGER NOT NULL DEFAULT 0,
  altitud_max_m REAL,
  pasos INTEGER,
  remote_id TEXT,
  updated_at TEXT,
  deleted INTEGER DEFAULT 0,
  pending INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS punto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viaje_id INTEGER NOT NULL REFERENCES viaje(id) ON DELETE CASCADE,
  t TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  altitud_gps REAL,
  presion_hpa REAL,
  remote_id TEXT,
  updated_at TEXT,
  deleted INTEGER DEFAULT 0,
  pending INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS foto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viaje_id INTEGER NOT NULL REFERENCES viaje(id) ON DELETE CASCADE,
  uri TEXT NOT NULL,
  lat REAL,
  lng REAL,
  t TEXT NOT NULL,
  remote_id TEXT,
  updated_at TEXT,
  deleted INTEGER DEFAULT 0,
  pending INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_meta (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_viaje_remote_id ON viaje(remote_id);
CREATE INDEX IF NOT EXISTS idx_viaje_pending ON viaje(pending);
CREATE INDEX IF NOT EXISTS idx_punto_viaje_id ON punto(viaje_id);
CREATE INDEX IF NOT EXISTS idx_foto_viaje_id ON foto(viaje_id);
`;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }
  const db = await SQLite.openDatabaseAsync("bitacora_viajes.db");
  await db.execAsync(MIGRATION_SQL);
  dbInstance = db;
  return db;
}
