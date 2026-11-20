import {
  calcularAltitudDesdePresion,
  calcularMetricasRuta,
  debeGuardarPunto,
  simplificarRutaParaFirestore,
  exportarRutaGpx,
  type PuntoCrudo,
} from "../src/services/telemetria";
import { construirViajeConRutaSimplificada } from "../src/repositories/viajeRepository";

describe("Pruebas Mínimas de Bitácora de Viajes y Caminatas (Sección 10 y Sección 11)", () => {
  it("1. Lógica (RF-04): presión -> altitud con valores conocidos (1013.25 hPa -> 0 m)", () => {
    const altitudNivelMar = calcularAltitudDesdePresion(1013.25);
    expect(altitudNivelMar).toBe(0);

    // En altura (~2600 msnm, p ≈ 746.8 hPa)
    const altitudBogota = calcularAltitudDesdePresion(746.8, 1013.25);
    expect(altitudBogota).toBeGreaterThan(2450);
    expect(altitudBogota).toBeLessThan(2650);
  });

  it("2. Lógica pura y Criterio de Aceptación 1: recorrido con subida de 120 m marca desnivel positivo 120 ± 20 m y suaviza ruido < 3 m", () => {
    const rutaSimulada: PuntoCrudo[] = [];
    const baseLat = 4.6097;
    const baseLng = -74.0817;
    const baseTime = Date.parse("2026-11-19T08:00:00.000Z");

    // 25 pasos subiendo 5 m cada uno = +120 m reales, intercalando pequeñas oscilaciones de ±1.5 m (ruido < 3 m)
    for (let i = 0; i <= 24; i++) {
      const subidaAcumulada = i * 5;
      const puntosConRuido = [
        baseLat + i * 0.0002,
        baseLng + i * 0.0002,
        2000 + subidaAcumulada,
      ] as const;

      rutaSimulada.push({
        t: new Date(baseTime + i * 10000).toISOString(),
        lat: puntosConRuido[0],
        lng: puntosConRuido[1],
        altitud_gps: puntosConRuido[2],
        presion_hpa: null,
        accuracy_m: 6,
      });

      // Oscilación menor al umbral de 3 m (+1.5 m y luego regreso) que debe ser filtrada
      rutaSimulada.push({
        t: new Date(baseTime + i * 10000 + 5000).toISOString(),
        lat: puntosConRuido[0] + 0.00005,
        lng: puntosConRuido[1] + 0.00005,
        altitud_gps: puntosConRuido[2] + 1.5,
        presion_hpa: null,
        accuracy_m: 6,
      });
    }

    const metricas = calcularMetricasRuta(rutaSimulada);

    // Distancia total positiva
    expect(metricas.metros).toBeGreaterThan(500);
    // Criterio de aceptación 1: Dado un recorrido con subida de 120 m, el desnivel positivo marca 120 ± 20 m
    expect(metricas.desnivel_pos_m).toBeGreaterThanOrEqual(100);
    expect(metricas.desnivel_pos_m).toBeLessThanOrEqual(140);
    expect(metricas.altitud_max_m).toBeCloseTo(2121.5, 1);
  });

  it("3. Criterio de Aceptación 3 y Sección 7: no registra puntos cuando está en pausa o cuando la precisión GPS es peor de 30 m", () => {
    const p1: PuntoCrudo = {
      t: "2026-11-19T10:00:00.000Z",
      lat: 4.6,
      lng: -74.08,
      altitud_gps: 2600,
      presion_hpa: 746,
      accuracy_m: 8,
    };

    const p2Valido: PuntoCrudo = {
      t: "2026-11-19T10:00:07.000Z", // +7 s (>= 5 s)
      lat: 4.6002,
      lng: -74.0802,
      altitud_gps: 2605,
      presion_hpa: 745.5,
      accuracy_m: 10,
    };

    // Dado que pauso, entonces no se registran puntos
    expect(
      debeGuardarPunto({
        pausado: true,
        nuevoPunto: p2Valido,
        ultimoPuntoGuardado: p1,
      })
    ).toBe(false);

    // Cuando no está en pausa y han pasado >= 5 s, sí guarda
    expect(
      debeGuardarPunto({
        pausado: false,
        nuevoPunto: p2Valido,
        ultimoPuntoGuardado: p1,
      })
    ).toBe(true);

    // Descartar puntos con precisión peor de 30 m
    const pImpreciso: PuntoCrudo = {
      ...p2Valido,
      accuracy_m: 45,
    };
    expect(
      debeGuardarPunto({
        pausado: false,
        nuevoPunto: pImpreciso,
        ultimoPuntoGuardado: p1,
      })
    ).toBe(false);
  });

  it("4. Servicio (Sección 9.4 y Sección 11): guardar el viaje con su ruta simplificada (<= 1500 puntos)", () => {
    const puntosLargos: PuntoCrudo[] = [];
    const t0 = Date.parse("2026-11-19T06:00:00.000Z");

    // Simulamos una caminata larga de 2400 puntos
    for (let i = 0; i < 2400; i++) {
      puntosLargos.push({
        t: new Date(t0 + i * 5000).toISOString(),
        lat: 4.6 + i * 0.0001 + Math.sin(i / 10) * 0.0003,
        lng: -74.08 + i * 0.0001 + Math.cos(i / 10) * 0.0003,
        altitud_gps: 2500 + (i % 200),
        presion_hpa: null,
      });
    }

    const viajePreparado = construirViajeConRutaSimplificada({
      remoteId: "uuid-test-1500",
      nombre: "Gran Travesía Andina",
      inicio: "2026-11-19T06:00:00.000Z",
      fin: "2026-11-19T09:20:00.000Z",
      metros: 18400,
      desnivel_pos_m: 620,
      altitud_max_m: 2700,
      pasos: 24100,
      puntos: puntosLargos,
    });

    expect(viajePreparado.remote_id).toBe("uuid-test-1500");
    expect(viajePreparado.rutaSimplificada.length).toBeLessThanOrEqual(1500);
    expect(viajePreparado.rutaSimplificada.length).toBeGreaterThan(10);
    // Preserva primer y último punto del recorrido
    expect(viajePreparado.rutaSimplificada[0]!.t).toBe(puntosLargos[0]!.t);
    expect(
      viajePreparado.rutaSimplificada[viajePreparado.rutaSimplificada.length - 1]!.t
    ).toBe(puntosLargos[puntosLargos.length - 1]!.t);
  });

  it("5. Reto opcional (Sección 12): exportar la ruta en formato GPX válido", () => {
    const puntos = simplificarRutaParaFirestore([
      {
        t: "2026-11-19T07:00:00.000Z",
        lat: 4.61,
        lng: -74.08,
        altitud_gps: 2610,
        presion_hpa: null,
      },
    ]);
    const gpx = exportarRutaGpx("Sendero Quebrada La Vieja", puntos);
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain("<name>Sendero Quebrada La Vieja</name>");
    expect(gpx).toContain('<trkpt lat="4.610000" lon="-74.080000"><ele>2610.0</ele>');
  });
});
