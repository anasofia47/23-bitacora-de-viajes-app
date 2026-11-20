# 23 · Bitácora de Viajes y Caminatas — App Móvil (`23-bitacora-de-viajes-app`)

Aplicación móvil offline-first construida con **Expo (SDK 58, última versión)**, **React Native**, **TypeScript**, **Expo Router**, **SQLite local**, **Sensores del dispositivo**, **Gestos accesibles** y **SVG**.

---

## 1. Requisitos y Características Implementadas

- **Regla de Oro de Seguridad:** La app no contiene `firebaseConfig`, ni claves de Firebase, ni tokens de Vercel Blob. Solo conoce `EXPO_PUBLIC_API_URL` (HTTPS) y almacena los tokens de sesión del usuario en `expo-secure-store`.
- **Pantallas y Rutas (Expo Router):**
  - `app/(tabs)/index.tsx`: Lista de viajes guardados en SQLite, búsqueda sin conexión, estadísticas anuales, inicio de sesión y sincronización incremental con la API.
  - `app/(tabs)/grabar.tsx`: Grabación en vivo con telemetría GPS + Barómetro + Podómetro, cámara geolocalizada, vista previa SVG en vivo y modo de simulación/entrada manual.
  - `app/viaje/[id].tsx`: Resumen del recorrido con ruta en SVG, perfil de altitud interactivo, rumbo por Magnetómetro, galería de fotos geolocalizadas y exportación GPX (Reto opcional).
  - `app/foto/[id].tsx`: Visor de fotos geolocalizadas con zoom por pellizco y navegación por deslizamiento horizontal.
- **Gestos con Alternativa por Botón Accesible (`accessibilityLabel`):**
  1. **Pellizco (`Gesture.Pinch`):** Zoom del perfil de altitud y de las fotos (`+ Zoom` / `- Zoom`).
  2. **Arrastre sobre el perfil (`Gesture.Pan`):** Inspección del punto exacto con su altitud (`◀ Punto ant.` / `Punto sig. ▶`).
  3. **Deslizar horizontal (`Gesture.Fling`):** Pasar entre fotos (`◀ Foto anterior` / `Siguiente foto ▶`).
  4. **Pulsación larga (`Gesture.LongPress`):** Tomar foto rápida geolocalizada (`📷 Botón Tomar Foto` / `🖼️ Galería`).
- **Sensores con `isAvailableAsync()`, limpieza (`subscription.remove()`) y Alternativas:**
  - `expo-location` + `Barometer` (con aviso de menor precisión cuando se usa solo altitud GPS, y entrada manual/simulación si el dispositivo no tiene sensor).
  - `Pedometer` (pasos del recorrido; se omite si no está disponible).
  - `Magnetometer` (rumbo en el resumen; se omite si no está disponible).
  - `expo-camera` (fotos geolocalizadas; alternativa con Galería y reducción con `expo-image-manipulator` a `<= 1280 px`, JPEG `0.7`).

---

## 2. Puesta en Marcha y Pruebas

```bash
npm install
npm run verify:ia   # Ejecuta las 8 pruebas de seguridad de Antigravity AI (Sección 14)
npm run typecheck   # Verifica tipos con TypeScript
npm test            # Ejecuta las pruebas unitarias con Jest + jest-expo
npx expo start      # Inicia el servidor de desarrollo de Expo
```

---

## 3. Configuración de IA (Sección 14) — Google Antigravity

- **Instrucciones del proyecto:** [`GEMINI.md`](./GEMINI.md) y [`AGENTS.md`](./AGENTS.md)
- **Hook de seguridad `PreToolUse`:** [`.agents/hooks.json`](./.agents/hooks.json) y [`.agents/scripts/security-guard.mjs`](./.agents/scripts/security-guard.mjs)
- **Evidencias y Bitácora:** [`ia/evidencia-restricciones.md`](./ia/evidencia-restricciones.md), [`ia/bitacora-ia.md`](./ia/bitacora-ia.md) y script ejecutable [`ia/verify-ai-security.mjs`](./ia/verify-ai-security.mjs).
