# Reglas de Seguridad, Sensores, Accesibilidad y Calidad — Antigravity AI

## 1. Protección de Secretos y Keystores
- Ningún archivo `.env`, `.env.*` (salvo `.env.example`), `*.keystore`, `*.jks`, `*.pem`, `*.key`, `google-services.json` ni credenciales puede ser leído ni modificado por Antigravity.
- La app móvil **NO** contiene `firebaseConfig`, ni claves privadas, ni tokens de Vercel Blob.
- Los tokens de sesión (`token` y `refreshToken`) se almacenan exclusivamente en `expo-secure-store`, jamás en `AsyncStorage`.

## 2. Confinamiento al Directorio del Repositorio
- Toda operación de lectura/escritura o comando debe permanecer dentro de la raíz de `23-bitacora-de-viajes-app`.
- Cualquier intento de acceder a rutas externas (`../` fuera del repo) es bloqueado (`deny`) por `.agents/scripts/security-guard.mjs`.

## 3. Confirmación para Efectos Externos
- Comandos con efectos fuera de la máquina local (`git push`, `eas build`, `npx eas`, `npm publish`) devuelven `"decision": "ask"` para requerir confirmación del usuario.

## 4. Calidad Automática del Código
- Todo código escrito por el equipo o por Antigravity debe superar:
  1. `npm run typecheck` (TypeScript estricto).
  2. `npm run lint` (ESLint / Expo Lint).
  3. `npm test` (Jest + jest-expo + React Native Testing Library).
