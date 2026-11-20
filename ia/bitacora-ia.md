# Bitácora de Uso de IA (Google Antigravity) — `23-bitacora-de-viajes-app`

Esta bitácora documenta cada intervención del asistente **Google Antigravity** siguiendo la estructura exigida en la guía: **Propósito**, **Evidencia**, **Validación** y **Decisión**.

---

## Entrada 1 — Diseño de la Configuración y Guardias de Seguridad de IA (Sección 14)

- **Propósito:** Definir en el **primer commit** del repositorio las reglas de proyecto para Antigravity (`GEMINI.md`, `.agents/rules/security-and-quality.md`) y el hook de ciclo de vida `PreToolUse` (`.agents/hooks.json` + `.agents/scripts/security-guard.mjs`) que impide leer `.env`, keystores (`*.keystore`, `*.jks`) o `google-services.json`, impide salir del directorio del repositorio y pide confirmación (`ask`) antes de ejecutar `eas build` o `git push`.
- **Evidencia:** Archivos `.agents/hooks.json`, `.agents/scripts/security-guard.mjs` y `ia/verify-ai-security.mjs` incluidos en el primer commit.
- **Validación:** Ejecución exitosa de `node ia/verify-ai-security.mjs` con `8/8` casos de prueba superados (`TC-IA-APP-01` a `TC-IA-APP-08`).
- **Decisión:** Se adoptó esta configuración como base obligatoria antes de iniciar el Hito 1.

---

## Entrada 2 — Lógica Pura de Altimetría Barométrica, Distancia, Suavizado de Desnivel y Simplificación RDP (RF-02, RF-03, RF-04, Sección 7)

- **Propósito:** Separar la matemática de telemetría de la lectura de sensores físicos para poder probarla con Jest sin depender del hardware.
- **Evidencia:** Módulo `src/services/telemetria.ts` y pruebas en `__tests__/telemetria.test.ts`.
- **Validación:**
  - Fórmula barométrica `h = 44330 * (1 - (p/p0)^0.1903)` verificada con `1013.25 hPa -> 0 m`.
  - Filtro de precisión que descarta lecturas GPS con `accuracy > 30 m`.
  - Regla de muestreo que guarda punto cada `>= 5 s` o `>= 10 m` y bloquea el registro cuando el estado es `pausado` (Criterio de Aceptación 3).
  - Suavizado de desnivel positivo con umbral de `3 m` verificado en una ruta simulada de subida de `120 m`, obteniendo resultado dentro del rango `120 ± 20 m` (Criterio de Aceptación 1).
  - Algoritmo Ramer-Douglas-Peucker que reduce rutas de más de 1500 puntos a `<= 1500` puntos conservando la geometría del recorrido.
- **Decisión:** Se mantuvo toda la lógica en funciones puras deterministas e independientes de React Native para garantizar 100 % de testabilidad.

---

## Entrada 3 — Persistencia Offline-First en SQLite y Cliente HTTP con Renovación de Token (Secciones 8 y 9.1)

- **Propósito:** Implementar la base de datos local `expo-sqlite` con las tablas `viaje`, `punto` y `foto` incluyendo columnas de sincronización (`remote_id`, `updated_at`, `deleted`, `pending`), y el cliente HTTP que guarda `token` y `refreshToken` en `expo-secure-store` renovando automáticamente ante un `401`.
- **Evidencia:** `src/db/schema.ts`, `src/repositories/viajeRepository.ts`, `src/api/client.ts` y `src/services/syncService.ts`.
- **Validación:** Se comprobó que al perder conexión los viajes se guardan con `pending = 1` y al recuperar red se comprimen las fotos con `expo-image-manipulator` (`width <= 1280`, `compress: 0.7`), se suben a `POST /api/imagenes` y se sincroniza el documento con `PUT /api/viaje/<remote_id>` y `GET /api/viaje?since=<ISO>`.
- **Decisión:** Se utilizó `remote_id` UUID generado en el cliente como identificador idempotente entre SQLite y Firestore.

---

## Entrada 4 — Sensores con Alternativas, Gráficos SVG y Gestos Accesibles (Secciones 4, 5 y 6)

- **Propósito:** Integrar `expo-location`, `Barometer`, `Pedometer`, `Magnetometer` y `expo-camera` verificando siempre `isAvailableAsync()`, mostrando el aviso de menor precisión cuando se usa solo altitud GPS (Criterio de Aceptación 2), dibujando la ruta y perfil de altitud en SVG e implementando los 4 gestos (`Pinch`, `Pan`, `Fling`, `LongPress`) con sus botones equivalentes con `accessibilityLabel`.
- **Evidencia:** `src/sensors/useRecorridoSensors.ts`, `src/components/RutaSvg.tsx`, `src/components/PerfilAltitudSvg.tsx`, `app/(tabs)/grabar.tsx`, `app/viaje/[id].tsx`, `app/foto/[id].tsx`.
- **Validación:** Se verificó que todas las suscripciones ejecuten `subscription.remove()` al salir de la pantalla y que cada gesto tenga controles por botón accesibles por lectores de pantalla (TalkBack / VoiceOver).
- **Decisión:** Se agregó además la exportación de la ruta en formato estándar **GPX 1.1** (Reto Opcional, Sección 12).
