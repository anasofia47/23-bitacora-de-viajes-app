# Reglas de Antigravity AI — 23 · Bitácora de Viajes y Caminatas (App Móvil)

> **Asistente configurado:** Google Antigravity (AGY)
> **Repositorio:** `23-bitacora-de-viajes-app`
> **Rol:** Aplicación móvil offline-first construida con Expo (última versión SDK 58), React Native, TypeScript, Expo Router, SQLite local, sensores (`expo-location`, `Barometer`, `Pedometer`, `Magnetometer`, `expo-camera`), gestos (`react-native-gesture-handler` + `react-native-reanimated`) y visualización vectorial (`react-native-svg`).

---

## 1. Stack Tecnológico y Comandos

- **Framework:** Expo SDK 58 + React Native + TypeScript estricto (`strict: true`)
- **Navegación:** Expo Router (`app/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/grabar.tsx`, `app/viaje/[id].tsx`, `app/foto/[id].tsx`)
- **Persistencia Offline:** `expo-sqlite` (con columnas de sincronización `remote_id`, `updated_at`, `deleted`, `pending`)
- **Almacenamiento Seguro de Sesión:** `expo-secure-store` (nunca `AsyncStorage` para tokens)
- **Gestos y Animaciones:** `react-native-gesture-handler` (`Gesture.Pinch`, `Gesture.Pan`, `Gesture.Fling`, `Gesture.LongPress`) + `react-native-reanimated`
- **Sensores y Cámara:** `expo-location`, `expo-sensors` (`Barometer`, `Pedometer`, `Magnetometer`), `expo-camera`, `expo-image-manipulator`, `expo-haptics`
- **Gráficos:** `react-native-svg` (dibujo de ruta GPS y perfil de altitud sin mapas con API key)
- **Pruebas:** Jest + `jest-expo` + `@testing-library/react-native`

### Comandos oficiales del proyecto
- `npx expo start` — Inicia el servidor de desarrollo de Expo.
- `npm run typecheck` — Verifica tipos con TypeScript (`tsc --noEmit`).
- `npm run lint` — Ejecuta el linter del proyecto.
- `npm test` — Ejecuta la suite de pruebas unitarias y de servicios con Jest.
- `node ia/verify-ai-security.mjs` — Ejecuta las pruebas automatizadas de seguridad y restricciones de la configuración de Antigravity.

---

## 2. Estructura del Proyecto

```text
23-bitacora-de-viajes-app/
├── .agents/
│   ├── hooks.json                  # Hooks de ciclo de vida de Antigravity (PreToolUse)
│   ├── rules/
│   │   └── security-and-quality.md # Reglas modulares de seguridad, sensores y accesibilidad
│   └── scripts/
│       └── security-guard.mjs      # Guardia de seguridad ejecutado en PreToolUse
├── app/
│   ├── _layout.tsx                 # Stack/Tabs, GestureHandlerRootView, proveedor de sesión y DB
│   ├── (tabs)/
│   │   ├── _layout.tsx             # Configuración de pestañas (Viajes, Grabar)
│   │   ├── index.tsx               # Lista de viajes, estadísticas, búsqueda y sincronización
│   │   └── grabar.tsx              # Grabación en vivo (GPS, Barómetro, Podómetro, Cámara, Gestos)
│   ├── viaje/
│   │   └── [id].tsx                # Resumen con ruta SVG, perfil de altitud interactivo, rumbo y fotos
│   └── foto/
│       └── [id].tsx                # Visor de foto con zoom por pellizco, deslizamiento y botones accesibles
├── src/
│   ├── db/                         # Apertura de SQLite y migraciones
│   ├── repositories/               # Consultas SQL parametrizadas (viaje, punto, foto)
│   ├── services/                   # Lógica pura (altitud barométrica, distancia, desnivel, RDP, GPX, sync)
│   ├── api/                        # Cliente HTTP (fetch + Bearer token + refresh 401 + manejo de errores)
│   ├── sensors/                    # Hooks de sensores con isAvailableAsync(), cleanup y fallback
│   └── components/                 # Componentes UI reutilizables y accesibles (RutaSvg, PerfilAltitudSvg, etc.)
├── __tests__/                      # Pruebas Jest (distancia/desnivel, presión->altitud, simplificación <=1500)
├── ia/                             # Evidencias de configuración de Antigravity y Bitácora de IA
├── GEMINI.md                       # Instrucciones principales para Antigravity
└── AGENTS.md                       # Enlace compatible con agentes basados en AGENTS.md
```

---

## 3. Regla de Oro de Seguridad y Reglas de Negocio

### Lo que SÍ debe hacer Antigravity:
1. **Cero credenciales en la app:** La app móvil **NO** contiene `firebaseConfig`, ni claves de Firebase, ni tokens de Vercel Blob. Solo utiliza `EXPO_PUBLIC_API_URL` apuntando por HTTPS a la API desplegada y guarda los tokens del usuario en `expo-secure-store`.
2. **Separar lógica pura de sensores:**
   - Estimar altitud barométrica con la fórmula barométrica internacional: `h = 44330 * (1 - Math.pow(p / p0, 0.1903))`.
   - Descartar puntos GPS con precisión peor de `30 m` (`accuracy > 30`).
   - Guardar puntos cada `5 s` o `10 m` (y ninguno mientras la grabación está en pausa).
   - Suavizar el desnivel positivo con un umbral de `3 m` para evitar ruido.
   - Simplificar la ruta a `<= 1500` puntos antes de sincronizar con Firestore.
   - Reducir las fotos con `expo-image-manipulator` (`width <= 1280`, JPEG `compress: 0.7`) antes de subirlas a `POST /api/imagenes`.
3. **Sensores resilientes:**
   - Llamar siempre a `isAvailableAsync()` antes de suscribirse a un sensor.
   - Solicitar permisos únicamente cuando el usuario activa la función, explicando el motivo.
   - Cancelar siempre las suscripciones (`subscription.remove()`) al desmontar o salir de la pantalla.
   - Mostrar aviso de menor precisión cuando no haya barómetro y se use altitud GPS, u ofrecer modo de simulación/entrada manual cuando el dispositivo no tenga sensor.
4. **Accesibilidad obligatoria en gestos:** Todo gesto (`Pinch`, `Pan`, `Fling`, `LongPress`) debe tener una alternativa equivalente mediante botones con `accessibilityLabel` descriptivo.

### Lo que NO debe hacer (Restricciones Estrictas):
1. **PROHIBIDO leer archivos de secretos o keystores:** Antigravity no puede leer `.env`, `.env.local`, `.env.production`, `*.keystore`, `*.jks`, `*.pem`, `*.key`, `google-services.json`, ni credenciales de cuentas de servicio.
2. **PROHIBIDO salir de la carpeta del repositorio:** Ninguna herramienta puede leer, escribir ni navegar fuera de `23-bitacora-de-viajes-app`.
3. **PROHIBIDO ejecutar acciones externas sin permiso (`ask`):** Comandos como `git push`, `eas build`, `npx eas` o despliegues remotos requieren confirmación explícita del usuario.
4. **PROHIBIDO usar `AsyncStorage` para tokens o `localhost` en builds de producción.**
