import { useEffect, useState, useRef, useCallback } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import { Barometer, Pedometer, Magnetometer } from "expo-sensors";
import {
  type PuntoCrudo,
  debeGuardarPunto,
  calcularMetricasRuta,
  contrastarAltitudBarometroConGps,
} from "../services/telemetria";

export interface EstadoSensoresGrabacion {
  grabando: boolean;
  pausado: boolean;
  barometroDisponible: boolean;
  podometroDisponible: boolean;
  gpsDisponible: boolean;
  avisoSinBarometro: string | null;
  avisoPermisoGps: string | null;
  presionActualHpa: number | null;
  altitudRelativaIos: number | null;
  altitudBarometricaM: number | null;
  altitudGpsM: number | null;
  diferenciaAltitudM: number | null;
  pasos: number | null;
  puntos: PuntoCrudo[];
  metros: number;
  desnivel_pos_m: number;
  altitud_max_m: number | null;
}

export function useRecorridoSensors() {
  const [grabando, setGrabando] = useState(false);
  const [pausado, setPausado] = useState(false);

  const [barometroDisponible, setBarometroDisponible] = useState(false);
  const [podometroDisponible, setPodometroDisponible] = useState(false);
  const [gpsDisponible, setGpsDisponible] = useState(true);

  const [avisoSinBarometro, setAvisoSinBarometro] = useState<string | null>(null);
  const [avisoPermisoGps, setAvisoPermisoGps] = useState<string | null>(null);

  const [presionActualHpa, setPresionActualHpa] = useState<number | null>(null);
  const [altitudRelativaIos, setAltitudRelativaIos] = useState<number | null>(null);
  const [altitudGpsM, setAltitudGpsM] = useState<number | null>(null);
  const [pasos, setPasos] = useState<number | null>(null);
  const [puntos, setPuntos] = useState<PuntoCrudo[]>([]);

  const presionRef = useRef<number | null>(null);
  const pausadoRef = useRef<boolean>(false);
  const grabandoRef = useRef<boolean>(false);

  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const baroSubRef = useRef<{ remove: () => void } | null>(null);
  const pedoSubRef = useRef<{ remove: () => void } | null>(null);

  const limpiarSuscripciones = useCallback(() => {
    try {
      locationSubRef.current?.remove();
    } catch {
      // Ignorar si ya fue removida
    }
    locationSubRef.current = null;

    try {
      baroSubRef.current?.remove();
    } catch {
      // Ignorar
    }
    baroSubRef.current = null;

    try {
      pedoSubRef.current?.remove();
    } catch {
      // Ignorar
    }
    pedoSubRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      limpiarSuscripciones();
    };
  }, [limpiarSuscripciones]);

  const registrarPuntoManualOSensor = useCallback((candidato: PuntoCrudo) => {
    setPuntos((prev) => {
      const ultimo = prev.length > 0 ? prev[prev.length - 1]! : null;
      const guardar = debeGuardarPunto({
        pausado: pausadoRef.current,
        nuevoPunto: candidato,
        ultimoPuntoGuardado: ultimo,
      });
      if (!guardar) {
        return prev;
      }
      return [...prev, candidato];
    });
  }, []);

  const iniciarGrabacion = useCallback(async () => {
    limpiarSuscripciones();
    setPuntos([]);
    setPasos(null);
    setAvisoPermisoGps(null);
    setAvisoSinBarometro(null);

    pausadoRef.current = false;
    grabandoRef.current = true;
    setPausado(false);
    setGrabando(true);

    // 1. Barómetro (Regla 1: llamar siempre isAvailableAsync antes de usar un sensor)
    try {
      const isBaroAvailable = await Barometer.isAvailableAsync();
      setBarometroDisponible(isBaroAvailable);

      if (isBaroAvailable) {
        Barometer.setUpdateInterval(1500);
        baroSubRef.current = Barometer.addListener((data) => {
          // En iOS/Android pressure viene en hPa
          const hpa = typeof data.pressure === "number" ? Number(data.pressure.toFixed(2)) : null;
          presionRef.current = hpa;
          setPresionActualHpa(hpa);

          // Nota de plataforma (Sección 5): Barometer.relativeAltitude solo existe en iOS
          if (Platform.OS === "ios" && typeof data.relativeAltitude === "number") {
            setAltitudRelativaIos(Number(data.relativeAltitude.toFixed(2)));
          }
        });
      } else {
        // Criterio de aceptación 2: Dado un dispositivo sin barómetro, se usa altitud GPS con aviso de menor precisión
        setAvisoSinBarometro(
          "Dispositivo sin barómetro disponible: se está utilizando la altitud GPS (menor precisión en el cálculo de desnivel)."
        );
      }
    } catch {
      setBarometroDisponible(false);
      setAvisoSinBarometro(
        "Dispositivo sin barómetro disponible: se está utilizando la altitud GPS (menor precisión en el cálculo de desnivel)."
      );
    }

    // 2. Podómetro (Pedometer) — alternativa: Omitir si no está disponible
    try {
      const isPedoAvailable = await Pedometer.isAvailableAsync();
      setPodometroDisponible(isPedoAvailable);
      if (isPedoAvailable) {
        const permPedo = await Pedometer.requestPermissionsAsync();
        if (permPedo.granted) {
          setPasos(0);
          pedoSubRef.current = Pedometer.watchStepCount((result) => {
            if (!pausadoRef.current) {
              setPasos(result.steps);
            }
          });
        }
      }
    } catch {
      setPodometroDisponible(false);
    }

    // 3. Ubicación GPS (expo-location) — pedir permiso cuando el usuario activa la función
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setGpsDisponible(false);
        setAvisoPermisoGps(
          "Permiso de ubicación GPS no concedido. Puede registrar puntos mediante la entrada manual o simulación de sendero."
        );
        return;
      }

      setGpsDisponible(true);
      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // RF-02: cada 5 s
          distanceInterval: 10, // RF-02: o 10 m
        },
        (loc) => {
          if (!grabandoRef.current || pausadoRef.current) {
            return;
          }

          const altGps =
            typeof loc.coords.altitude === "number" ? Number(loc.coords.altitude.toFixed(1)) : null;
          setAltitudGpsM(altGps);

          const nuevoPunto: PuntoCrudo = {
            t: new Date(loc.timestamp || Date.now()).toISOString(),
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            altitud_gps: altGps,
            presion_hpa: presionRef.current,
            accuracy_m: loc.coords.accuracy ?? null,
          };

          registrarPuntoManualOSensor(nuevoPunto);
        }
      );
    } catch {
      setGpsDisponible(false);
      setAvisoPermisoGps(
        "Sensor GPS no disponible en este entorno. Use los controles de entrada manual / simulación de recorrido."
      );
    }
  }, [limpiarSuscripciones, registrarPuntoManualOSensor]);

  const pausarGrabacion = useCallback(() => {
    pausadoRef.current = true;
    setPausado(true);
  }, []);

  const reanudarGrabacion = useCallback(() => {
    pausadoRef.current = false;
    setPausado(false);
  }, []);

  const detenerGrabacion = useCallback(() => {
    grabandoRef.current = false;
    pausadoRef.current = false;
    setGrabando(false);
    setPausado(false);
    limpiarSuscripciones();
  }, [limpiarSuscripciones]);

  /**
   * Alternativa si el sensor no está disponible (Sección 5):
   * Permite agregar un punto manual o simular un tramo de caminata (p. ej. subida de 120 m).
   */
  const agregarPuntoManual = useCallback(
    (params: { lat: number; lng: number; altitud_gps: number | null; presion_hpa: number | null; accuracy_m?: number }) => {
      if (!grabandoRef.current || pausadoRef.current) {
        return false;
      }
      if (params.altitud_gps !== null) {
        setAltitudGpsM(params.altitud_gps);
      }
      if (params.presion_hpa !== null) {
        presionRef.current = params.presion_hpa;
        setPresionActualHpa(params.presion_hpa);
      }

      const ultimo = puntos.length > 0 ? puntos[puntos.length - 1]! : null;
      const baseTimeMs = ultimo ? Date.parse(ultimo.t) + 6000 : Date.now();

      const punto: PuntoCrudo = {
        t: new Date(baseTimeMs).toISOString(),
        lat: params.lat,
        lng: params.lng,
        altitud_gps: params.altitud_gps,
        presion_hpa: params.presion_hpa,
        accuracy_m: params.accuracy_m ?? 5,
      };

      registrarPuntoManualOSensor(punto);
      return true;
    },
    [puntos, registrarPuntoManualOSensor]
  );

  const metricas = calcularMetricasRuta(puntos);
  const contraste = contrastarAltitudBarometroConGps(presionActualHpa, altitudGpsM);

  const estado: EstadoSensoresGrabacion = {
    grabando,
    pausado,
    barometroDisponible,
    podometroDisponible,
    gpsDisponible,
    avisoSinBarometro,
    avisoPermisoGps,
    presionActualHpa,
    altitudRelativaIos,
    altitudBarometricaM: contraste.altitudBarometrica,
    altitudGpsM,
    diferenciaAltitudM: contraste.diferenciaM,
    pasos,
    puntos,
    metros: metricas.metros,
    desnivel_pos_m: metricas.desnivel_pos_m,
    altitud_max_m: metricas.altitud_max_m,
  };

  return {
    estado,
    iniciarGrabacion,
    pausarGrabacion,
    reanudarGrabacion,
    detenerGrabacion,
    agregarPuntoManual,
  };
}

/**
 * Sección 5: Magnetometer — Rumbo en el resumen (Alternativa si no está disponible: Omitir).
 * Reglas: (1) llamar siempre isAvailableAsync() antes de usar, (3) subscription.remove() al salir.
 */
export function useHeadingMagnetometer() {
  const [disponible, setDisponible] = useState(false);
  const [grados, setGrados] = useState<number | null>(null);
  const [puntoCardinal, setPuntoCardinal] = useState<string | null>(null);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let desmontado = false;

    async function iniciar() {
      try {
        const avail = await Magnetometer.isAvailableAsync();
        if (desmontado || !avail) {
          setDisponible(false);
          return;
        }
        setDisponible(true);
        Magnetometer.setUpdateInterval(800);
        sub = Magnetometer.addListener((data) => {
          const { x, y } = data;
          let angle = Math.atan2(y, x) * (180 / Math.PI);
          if (angle < 0) {
            angle += 360;
          }
          const redondeado = Math.round(angle);
          setGrados(redondeado);
          const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
          const idx = Math.round(redondeado / 45) % 8;
          setPuntoCardinal(dirs[idx] ?? "N");
        });
      } catch {
        setDisponible(false);
      }
    }

    iniciar();

    return () => {
      desmontado = true;
      try {
        sub?.remove();
      } catch {
        // Ignorar
      }
    };
  }, []);

  return { disponible, grados, puntoCardinal };
}
