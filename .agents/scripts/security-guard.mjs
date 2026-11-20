#!/usr/bin/env node
/**
 * Guardia de Seguridad para Google Antigravity (PreToolUse Hook) — App Móvil
 * Verifica y aplica:
 * 1. Prohibición de lectura/escritura de archivos .env, keystores (.jks, .keystore), claves (.pem, .key) y credenciales.
 * 2. Prohibición de salir de la carpeta del repositorio (confinamiento de workspace).
 * 3. Solicitud de permiso ("ask") para comandos con efecto fuera de la máquina local (git push, eas build, etc.).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const SECRET_FILE_PATTERNS = [
  /(^|[\\/])\.env(\.(?!example$)[^\\/]+)?$/i,
  /\.(pem|key|keystore|jks|p12|pfx)$/i,
  /firebase-adminsdk.*\.json$/i,
  /google-services\.json$/i,
  /GoogleService-Info\.plist$/i,
  /credenciales.*\.txt$/i,
];

const EXTERNAL_EFFECT_PATTERNS = [
  /\bgit\s+push\b/i,
  /\beas\s+(build|submit|update)\b/i,
  /\bvercel(\s+deploy|\s+--prod)\b/i,
  /\bnpm\s+publish\b/i,
];

const SECRET_COMMAND_PATTERNS = [
  /\b(cat|type|get-content|gc|more|less|head|tail)\b.*(\.env(\.|$)|\.pem|\.key|\.keystore|\.jks|google-services|credenciales)/i,
];

export function evaluateToolCall(payload, repoRoot = REPO_ROOT) {
  const normalizedRoot = path.resolve(repoRoot);
  const toolName = payload?.toolCall?.name || "";
  const args = payload?.toolCall?.args || {};

  // 1. Validar herramientas de archivo (read_file, write_file, edit_file)
  const targetPath = args.Path || args.path || args.TargetFile || args.filePath;
  if (targetPath && typeof targetPath === "string") {
    const resolvedTarget = path.resolve(normalizedRoot, targetPath);

    // Verificar que no salga de la carpeta del repositorio
    const rel = path.relative(normalizedRoot, resolvedTarget);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return {
        decision: "deny",
        reason: `Restricción de seguridad IA: Acceso denegado fuera del repositorio (${targetPath}).`,
      };
    }

    // Verificar que no sea un archivo de secretos (.env, keystores, claves)
    for (const pattern of SECRET_FILE_PATTERNS) {
      if (pattern.test(resolvedTarget) || pattern.test(path.basename(resolvedTarget))) {
        return {
          decision: "deny",
          reason: `Restricción de seguridad IA: Lectura o acceso a archivo de secretos/keystore bloqueado (${path.basename(resolvedTarget)}).`,
        };
      }
    }
  }

  // 2. Validar ejecución de comandos en terminal (run_command)
  if (toolName === "run_command" || typeof args.CommandLine === "string") {
    const cmd = String(args.CommandLine || "");

    // Bloquear lectura de .env, keystores o secretos mediante comandos de shell
    for (const pattern of SECRET_COMMAND_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          decision: "deny",
          reason: "Restricción de seguridad IA: Prohibido leer archivos .env, keystores o credenciales desde la terminal.",
        };
      }
    }

    // Bloquear navegación fuera de la carpeta del proyecto (cd ..)
    if (/\bcd\s+(\.\.|\/|[a-zA-Z]:\\)/i.test(cmd) && !cmd.toLowerCase().includes(normalizedRoot.toLowerCase())) {
      return {
        decision: "deny",
        reason: "Restricción de seguridad IA: Prohibido salir de la carpeta del proyecto desde la terminal.",
      };
    }

    // Pedir confirmación ("ask") si el comando tiene efectos fuera de la máquina local
    for (const pattern of EXTERNAL_EFFECT_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          decision: "ask",
          reason: `Acción con efecto externo detectada (${cmd.trim()}). Se requiere confirmación explícita del usuario.`,
        };
      }
    }
  }

  return {
    decision: "allow",
    reason: "Operación permitida dentro de las políticas del proyecto.",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  let rawInput = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    rawInput += chunk;
  });
  process.stdin.on("end", () => {
    try {
      const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
      const result = evaluateToolCall(payload);
      process.stdout.write(JSON.stringify(result) + "\n");
    } catch {
      process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
    }
  });
}
