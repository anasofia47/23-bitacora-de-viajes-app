# Evidencia de Configuración y Restricciones de IA (Sección 14)

> **Repositorio:** `23-bitacora-de-viajes-app`
> **Asistente configurado:** Google Antigravity (AGY)
> **Archivos de configuración:** `GEMINI.md`, `AGENTS.md`, `.agents/hooks.json`, `.agents/rules/security-and-quality.md`, `.agents/scripts/security-guard.mjs`

---

## 1. Cómo demostrar las restricciones en vivo en la sustentación

Ejecute desde la raíz del repositorio:

```bash
node ia/verify-ai-security.mjs
```

### Salida verificada de las pruebas de seguridad:

| ID | Caso de Prueba | Herramienta Simulada | Resultado Esperado | Resultado Obtenido | Estado |
|---|---|---|---|---|---|
| `TC-IA-APP-01` | Bloqueo de lectura directa de `.env` | `read_file` (`.env`) | `deny` | `deny` | ✅ PASS |
| `TC-IA-APP-02` | Bloqueo de lectura de keystore de Android (`release.keystore`) | `read_file` | `deny` | `deny` | ✅ PASS |
| `TC-IA-APP-03` | Bloqueo de lectura de `google-services.json` | `read_file` | `deny` | `deny` | ✅ PASS |
| `TC-IA-APP-04` | Permiso de lectura de plantilla `.env.example` | `read_file` (`.env.example`) | `allow` | `allow` | ✅ PASS |
| `TC-IA-APP-05` | Bloqueo de salida de la carpeta del proyecto (`../credenciales.txt`) | `read_file` | `deny` | `deny` | ✅ PASS |
| `TC-IA-APP-06` | Bloqueo de comando en terminal que lee secretos (`type .env`) | `run_command` | `deny` | `deny` | ✅ PASS |
| `TC-IA-APP-07` | Confirmación obligatoria en `eas build -p android --profile preview` | `run_command` | `ask` | `ask` | ✅ PASS |
| `TC-IA-APP-08` | Lectura permitida de archivos del proyecto (`app/(tabs)/grabar.tsx`) | `read_file` | `allow` | `allow` | ✅ PASS |

---

## 2. Reglas de Calidad Automática del Código

Todo el código del repositorio pasa por verificaciones automáticas:

1. **TypeScript estricto (`npm run typecheck`):** Comprueba tipado en componentes, hooks de sensores, repositorios SQLite y cliente HTTP.
2. **Pruebas unitarias (`npm test`):** Jest + `jest-expo` verifican funciones puras de distancia Haversine, desnivel suavizado con umbral de 3 m, conversión de presión barométrica a altitud (`1013.25 hPa -> 0 m`) y simplificación de rutas (`<= 1500` puntos).
3. **Verificación de bundle sin secretos:** La app no importa el SDK de Firebase ni contiene `firebaseConfig`; los tokens viven únicamente en `expo-secure-store`.
