/**
 * Servicio de lógica pura de telemetría, altitud barométrica, distancia,
 * suavizado de desnivel, simplificación de ruta (<= 1500 puntos) y exportación GPX.
 * Separado de los sensores físicos para permitir pruebas unitarias deterministas (Sección 11).
 */

export const PRESION_NIVEL_MAR_HPA = 1013.25;
export const UMBRAL_PRECISION_MAX_M = 30;
export const INTERVALO_MIN_SEG = 5;
export const DISTANCIA_MIN_M = 10;
export const UMBRAL_SUAVIZADO_DESNIVEL_M = 3;
export const MAX_PUNTOS_FIRESTORE = 1500;

export interface PuntoCrudo {
  t: string; // ISO 8601
  lat: number;
  lng: number;
  altitud_gps: number | null;
  presion_hpa: number | null;
  accuracy_m?: number | null;
}

export interface PuntoSimplificado {
  t: string;
  lat: number;
  lng: number;
  alt: number | null;
}

export interface ResumenMetricasRuta {
  metros: number;
  desnivel_pos_m: number;
  altitud_max_m: number | null;
}

/**
 * RF-04: Estimar la altitud con presión: h = 44330 * (1 - (p / p0)^0.1903)
 * Para 1013.25 hPa con p0 = 1013.25 hPa devuelve exactamente 0 m.
 */
export function calcularAltitudDesdePresion(
  presionHpa: number,
  p0Hpa: number = PRESION_NIVEL_MAR_HPA
): number {
  if (!Number.isFinite(presionHpa) || presionHpa <= 0 || !Number.isFinite(p0Hpa) || p0Hpa <= 0) {
    return 0;
  }
  const h = 44330 * (1 - Math.pow(presionHpa / p0Hpa, 0.1903));
  return Math.abs(h) < 1e-9 ? 0 : Number(h.toFixed(2));
}

/**
 * Contrasta la altitud estimada por barómetro con la altitud GPS (RF-04).
 */
export function contrastarAltitudBarometroConGps(
  presionHpa: number | null,
  altitudGps: number | null,
  p0Hpa: number = PRESION_NIVEL_MAR_HPA
): {
  altitudPreferida: number | null;
  altitudBarometrica: number | null;
  diferenciaM: number | null;
  fuente: "barometro" | "gps" | "ninguna";
} {
  const altBaro =
    typeof presionHpa === "number" && presionHpa > 0
      ? calcularAltitudDesdePresion(presionHpa, p0Hpa)
      : null;

  const altGpsValida =
    typeof altitudGps === "number" && Number.isFinite(altitudGps) ? Number(altitudGps.toFixed(2)) : null;

  if (altBaro !== null && altGpsValida !== null) {
    return {
      altitudPreferida: altBaro,
      altitudBarometrica: altBaro,
      diferenciaM: Number(Math.abs(altBaro - altGpsValida).toFixed(2)),
      fuente: "barometro",
    };
  }

  if (altBaro !== null) {
    return {
      altitudPreferida: altBaro,
      altitudBarometrica: altBaro,
      diferenciaM: null,
      fuente: "barometro",
    };
  }

  if (altGpsValida !== null) {
    return {
      altitudPreferida: altGpsValida,
      altitudBarometrica: null,
      diferenciaM: null,
      fuente: "gps",
    };
  }

  return {
    altitudPreferida: null,
    altitudBarometrica: null,
    diferenciaM: null,
    fuente: "ninguna",
  };
}

/**
 * Calcula la distancia Haversine en metros entre dos coordenadas WGS84.
 */
export function calcularDistanciaHaversineMetros(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Radio medio de la Tierra en metros
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Sección 7: Descartar puntos con precisión peor de 30 m.
 */
export function esPrecisionGpsAceptable(
  accuracyM: number | null | undefined,
  umbralMaxM: number = UMBRAL_PRECISION_MAX_M
): boolean {
  if (accuracyM === null || accuracyM === undefined) {
    return true;
  }
  return Number.isFinite(accuracyM) && accuracyM >= 0 && accuracyM <= umbralMaxM;
}

/**
 * RF-02, Sección 7 y Criterio de aceptación 3:
 * Determina si se debe guardar un nuevo punto:
 * - Si está en pausa -> NO registra puntos.
 * - Si la precisión es peor de 30 m -> NO registra el punto.
 * - Si es el primer punto -> SÍ registra.
 * - Si han pasado >= 5 s o se ha desplazado >= 10 m -> SÍ registra.
 */
export function debeGuardarPunto(params: {
  pausado: boolean;
  nuevoPunto: PuntoCrudo;
  ultimoPuntoGuardado: PuntoCrudo | null;
}): boolean {
  const { pausado, nuevoPunto, ultimoPuntoGuardado } = params;

  if (pausado) {
    return false;
  }

  if (!esPrecisionGpsAceptable(nuevoPunto.accuracy_m)) {
    return false;
  }

  if (!ultimoPuntoGuardado) {
    return true;
  }

  const tNuevo = Date.parse(nuevoPunto.t);
  const tAnterior = Date.parse(ultimoPuntoGuardado.t);
  const deltaSeg =
    !Number.isNaN(tNuevo) && !Number.isNaN(tAnterior) ? (tNuevo - tAnterior) / 1000 : 0;

  const distanciaM = calcularDistanciaHaversineMetros(
    ultimoPuntoGuardado.lat,
    ultimoPuntoGuardado.lng,
    nuevoPunto.lat,
    nuevoPunto.lng
  );

  return deltaSeg >= INTERVALO_MIN_SEG || distanciaM >= DISTANCIA_MIN_M;
}

/**
 * Resuelve la altitud efectiva de un punto priorizando la altitud barométrica
 * (que suaviza el desnivel) y usando la altitud GPS como respaldo (Sección 5 y Criterio 2).
 */
export function obtenerAltitudEfectiva(
  punto: Pick<PuntoCrudo, "altitud_gps" | "presion_hpa">,
  p0Hpa: number = PRESION_NIVEL_MAR_HPA
): number | null {
  if (typeof punto.presion_hpa === "number" && punto.presion_hpa > 0) {
    return calcularAltitudDesdePresion(punto.presion_hpa, p0Hpa);
  }
  if (typeof punto.altitud_gps === "number" && Number.isFinite(punto.altitud_gps)) {
    return punto.altitud_gps;
  }
  return null;
}

/**
 * RF-03, Sección 7 y Criterio de aceptación 1:
 * Calcula distancia total (metros), desnivel positivo suavizado con umbral de 3 m
 * y altitud máxima del recorrido.
 */
export function calcularMetricasRuta(
  puntos: PuntoCrudo[],
  umbralDesnivelM: number = UMBRAL_SUAVIZADO_DESNIVEL_M,
  p0Hpa: number = PRESION_NIVEL_MAR_HPA
): ResumenMetricasRuta {
  if (!puntos || puntos.length === 0) {
    return {
      metros: 0,
      desnivel_pos_m: 0,
      altitud_max_m: null,
    };
  }

  let distanciaAcumulada = 0;
  let desnivelPositivoAcumulado = 0;
  let altitudMaxima: number | null = null;
  let altitudReferenciaUmbral: number | null = null;

  for (let i = 0; i < puntos.length; i++) {
    const actual = puntos[i]!;
    if (i > 0) {
      const previo = puntos[i - 1]!;
      distanciaAcumulada += calcularDistanciaHaversineMetros(
        previo.lat,
        previo.lng,
        actual.lat,
        actual.lng
      );
    }

    const alt = obtenerAltitudEfectiva(actual, p0Hpa);
    if (alt !== null) {
      altitudMaxima = altitudMaxima === null ? alt : Math.max(altitudMaxima, alt);

      if (altitudReferenciaUmbral === null) {
        altitudReferenciaUmbral = alt;
      } else {
        const diff = alt - altitudReferenciaUmbral;
        // Sección 7: Suavizar el desnivel con un umbral de 3 m para evitar ruido
        if (diff >= umbralDesnivelM) {
          desnivelPositivoAcumulado += diff;
          altitudReferenciaUmbral = alt;
        } else if (diff <= -umbralDesnivelM) {
          altitudReferenciaUmbral = alt;
        }
      }
    }
  }

  return {
    metros: Math.round(distanciaAcumulada),
    desnivel_pos_m: Math.round(desnivelPositivoAcumulado),
    altitud_max_m: altitudMaxima !== null ? Number(altitudMaxima.toFixed(1)) : null,
  };
}

/**
 * Distancia perpendicular desde un punto P a la línea AB para Ramer-Douglas-Peucker.
 */
function distanciaPerpendicular(
  pt: PuntoSimplificado,
  lineStart: PuntoSimplificado,
  lineEnd: PuntoSimplificado
): number {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;

  if (dx === 0 && dy === 0) {
    return Math.hypot(pt.lng - lineStart.lng, pt.lat - lineStart.lat);
  }

  const num = Math.abs(
    dy * pt.lng - dx * pt.lat + lineEnd.lng * lineStart.lat - lineEnd.lat * lineStart.lng
  );
  const den = Math.hypot(dy, dx);
  return num / den;
}

function rdpRecursivo(puntos: PuntoSimplificado[], epsilon: number): PuntoSimplificado[] {
  if (puntos.length <= 2) {
    return puntos;
  }

  let dmax = 0;
  let index = 0;
  const primero = puntos[0]!;
  const ultimo = puntos[puntos.length - 1]!;

  for (let i = 1; i < puntos.length - 1; i++) {
    const d = distanciaPerpendicular(puntos[i]!, primero, ultimo);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const rec1 = rdpRecursivo(puntos.slice(0, index + 1), epsilon);
    const rec2 = rdpRecursivo(puntos.slice(index), epsilon);
    return [...rec1.slice(0, -1), ...rec2];
  }

  return [primero, ultimo];
}

/**
 * Sección 9.4 y Sección 11:
 * Simplifica la ruta garantizando como máximo 1500 puntos para Firestore (límite de 1 MiB).
 */
export function simplificarRutaParaFirestore(
  puntos: PuntoCrudo[],
  maxPuntos: number = MAX_PUNTOS_FIRESTORE,
  p0Hpa: number = PRESION_NIVEL_MAR_HPA
): PuntoSimplificado[] {
  const normalizados: PuntoSimplificado[] = puntos.map((p) => {
    const alt = obtenerAltitudEfectiva(p, p0Hpa);
    return {
      t: p.t,
      lat: Number(p.lat.toFixed(6)),
      lng: Number(p.lng.toFixed(6)),
      alt: alt !== null ? Number(alt.toFixed(1)) : null,
    };
  });

  if (normalizados.length <= maxPuntos) {
    return normalizados;
  }

  let actual = normalizados;
  let epsilon = 0.00002;
  for (let iter = 0; iter < 8 && actual.length > maxPuntos; iter++) {
    actual = rdpRecursivo(normalizados, epsilon);
    epsilon *= 2.2;
  }

  // Si aún supera maxPuntos (por ejemplo ruido sintético extremo), muestreo uniforme preservando inicio y fin
  if (actual.length > maxPuntos) {
    const resultado: PuntoSimplificado[] = [];
    const step = (actual.length - 1) / (maxPuntos - 1);
    for (let i = 0; i < maxPuntos - 1; i++) {
      resultado.push(actual[Math.round(i * step)]!);
    }
    resultado.push(actual[actual.length - 1]!);
    return resultado;
  }

  return actual;
}

/**
 * Sección 12 (Reto opcional): Exportar la ruta en formato GPX 1.1 estándar.
 */
export function exportarRutaGpx(nombreViaje: string, puntos: PuntoSimplificado[]): string {
  const safeName = nombreViaje
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const trkpts = puntos
    .map((p) => {
      const eleTag = p.alt !== null ? `<ele>${p.alt.toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${eleTag}<time>${p.t}</time></trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="23-bitacora-de-viajes-app" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}
