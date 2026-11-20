#!/usr/bin/env node
/**
 * Script de Evidencia y Verificación en Vivo — Configuración de IA (Sección 14)
 * Repositorio: 23-bitacora-de-viajes-app
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateToolCall } from "../.agents/scripts/security-guard.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const testCases = [
  {
    id: "TC-IA-APP-01",
    description: "Bloqueo de lectura directa de archivo .env",
    payload: {
      toolCall: {
        name: "read_file",
        args: { Path: path.join(REPO_ROOT, ".env") },
      },
    },
    expectedDecision: "deny",
  },
  {
    id: "TC-IA-APP-02",
    description: "Bloqueo de lectura de keystore de Android (release.keystore)",
    payload: {
      toolCall: {
        name: "read_file",
        args: { Path: path.join(REPO_ROOT, "release.keystore") },
      },
    },
    expectedDecision: "deny",
  },
  {
    id: "TC-IA-APP-03",
    description: "Bloqueo de lectura de google-services.json",
    payload: {
      toolCall: {
        name: "read_file",
        args: { Path: path.join(REPO_ROOT, "google-services.json") },
      },
    },
    expectedDecision: "deny",
  },
  {
    id: "TC-IA-APP-04",
    description: "Permiso de lectura de plantilla pública .env.example",
    payload: {
      toolCall: {
        name: "read_file",
        args: { Path: path.join(REPO_ROOT, ".env.example") },
      },
    },
    expectedDecision: "allow",
  },
  {
    id: "TC-IA-APP-05",
    description: "Bloqueo de acceso a archivo fuera de la carpeta del repositorio (../credenciales.txt)",
    payload: {
      toolCall: {
        name: "read_file",
        args: { Path: path.resolve(REPO_ROOT, "..", "credenciales.txt") },
      },
    },
    expectedDecision: "deny",
  },
  {
    id: "TC-IA-APP-06",
    description: "Bloqueo de comando de terminal que intenta leer .env (type .env)",
    payload: {
      toolCall: {
        name: "run_command",
        args: { CommandLine: "type .env" },
      },
    },
    expectedDecision: "deny",
  },
  {
    id: "TC-IA-APP-07",
    description: "Solicitud de confirmación (ask) en generación de APK externo (eas build -p android)",
    payload: {
      toolCall: {
        name: "run_command",
        args: { CommandLine: "eas build -p android --profile preview" },
      },
    },
    expectedDecision: "ask",
  },
  {
    id: "TC-IA-APP-08",
    description: "Permiso normal para lectura de pantallas en app/(tabs)/grabar.tsx",
    payload: {
      toolCall: {
        name: "read_file",
        args: { Path: path.join(REPO_ROOT, "app", "(tabs)", "grabar.tsx") },
      },
    },
    expectedDecision: "allow",
  },
];

console.log("=== Verificando Configuración de Seguridad de Antigravity AI (App Móvil) ===");
let passed = 0;

for (const tc of testCases) {
  const result = evaluateToolCall(tc.payload, REPO_ROOT);
  assert.equal(
    result.decision,
    tc.expectedDecision,
    `Fallo en ${tc.id} (${tc.description}): esperado '${tc.expectedDecision}', obtenido '${result.decision}'`
  );
  console.log(`[PASS] ${tc.id}: ${tc.description} -> decision="${result.decision}" (${result.reason})`);
  passed++;
}

console.log(`\nResultado: ${passed}/${testCases.length} pruebas de seguridad de IA superadas con éxito.`);
