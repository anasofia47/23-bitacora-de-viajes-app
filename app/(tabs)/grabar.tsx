import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useRecorridoSensors } from "../../src/sensors/useRecorridoSensors";
import { crearViajeGrabado } from "../../src/repositories/viajeRepository";
import { RutaSvg } from "../../src/components/RutaSvg";
import { PerfilAltitudSvg } from "../../src/components/PerfilAltitudSvg";
import { obtenerAltitudEfectiva } from "../../src/services/telemetria";

export default function GrabarScreen() {
  const router = useRouter();
  const {
    estado,
    iniciarGrabacion,
    pausarGrabacion,
    reanudarGrabacion,
    detenerGrabacion,
    agregarPuntoManual,
  } = useRecorridoSensors();

  const [nombreViaje, setNombreViaje] = useState("Caminata Sendero Alto");
  const [inicioIso, setInicioIso] = useState<string | null>(null);
  const [fotosCapturadas, setFotosCapturadas] = useState<
    Array<{ uri: string; lat: number | null; lng: number | null; t: string }>
  >([]);

  // Cámara y alternativa por galería (Sección 5: expo-camera | Alternativa: Galería)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mostrarCamara, setMostrarCamara] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  // Entrada manual de punto cuando no hay sensor disponible (Sección 5)
  const [manualLat, setManualLat] = useState("4.6097");
  const [manualLng, setManualLng] = useState("-74.0817");
  const [manualAltGps, setManualAltGps] = useState("2600");
  const [manualPresion, setManualPresion] = useState("746.8");

  const manejarIniciar = async () => {
    if (!nombreViaje.trim()) {
      Alert.alert("Nombre requerido", "Escriba un nombre para el viaje o caminata.");
      return;
    }
    setInicioIso(new Date().toISOString());
    setFotosCapturadas([]);
    await iniciarGrabacion();
  };

  const obtenerCoordenadaActual = () => {
    const ultimo =
      estado.puntos.length > 0 ? estado.puntos[estado.puntos.length - 1]! : null;
    return {
      lat: ultimo?.lat ?? Number(manualLat) ?? null,
      lng: ultimo?.lng ?? Number(manualLng) ?? null,
    };
  };

  // RF-05: Tomar fotos geolocalizadas durante el recorrido
  const abrirCamaraOTomarFotoRapida = async () => {
    if (!estado.grabando) {
      Alert.alert("Inicie la grabación", "Primero inicie el recorrido para tomar fotos geolocalizadas.");
      return;
    }
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Ignorar si no hay motor háptico
    }

    if (mostrarCamara && cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.75 });
        if (photo?.uri) {
          const coords = obtenerCoordenadaActual();
          setFotosCapturadas((prev) => [
            ...prev,
            {
              uri: photo.uri,
              lat: coords.lat,
              lng: coords.lng,
              t: new Date().toISOString(),
            },
          ]);
          setMostrarCamara(false);
          return;
        }
      } catch {
        // Si el emulador no soporta takePictureAsync, caer a galería
      }
    }

    if (!cameraPermission?.granted) {
      const perm = await requestCameraPermission();
      if (!perm.granted) {
        Alert.alert(
          "Cámara no disponible",
          "Se abrirá la galería como alternativa para adjuntar la foto geolocalizada."
        );
        await seleccionarFotoDesdeGaleria();
        return;
      }
    }

    setMostrarCamara(true);
  };

  const seleccionarFotoDesdeGaleria = async () => {
    if (!estado.grabando) {
      Alert.alert("Inicie la grabación", "Primero inicie el recorrido para adjuntar fotos.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.75,
    });

    if (!res.canceled && res.assets && res.assets.length > 0) {
      const coords = obtenerCoordenadaActual();
      setFotosCapturadas((prev) => [
        ...prev,
        {
          uri: res.assets[0]!.uri,
          lat: coords.lat,
          lng: coords.lng,
          t: new Date().toISOString(),
        },
      ]);
    }
  };

  // Sección 4: Gesto obligatorio — Pulsación larga (Gesture.LongPress) para tomar foto rápida
  const longPressFotoGesture = Gesture.LongPress()
    .minDuration(550)
    .onStart(() => {
      runOnJS(abrirCamaraOTomarFotoRapida)();
    });

  const manejarAgregarPuntoManual = () => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    const altGps = manualAltGps.trim() ? Number(manualAltGps) : null;
    const presion = manualPresion.trim() ? Number(manualPresion) : null;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      Alert.alert("Coordenadas inválidas", "Ingrese latitud y longitud numéricas válidas.");
      return;
    }

    const agregado = agregarPuntoManual({
      lat,
      lng,
      altitud_gps: altGps,
      presion_hpa: presion,
      accuracy_m: 5,
    });

    if (!agregado && estado.pausado) {
      Alert.alert("Recorrido en pausa", "Mientras está en pausa no se registran puntos (Criterio 3).");
    } else if (agregado) {
      // Incrementar ligeramente lat/lng para el siguiente punto manual
      setManualLat((lat + 0.00025).toFixed(5));
      setManualLng((lng + 0.00025).toFixed(5));
      if (altGps !== null) {
        setManualAltGps(String(altGps + 12));
      }
    }
  };

  /**
   * Simulador de tramo de subida de +120 m para demostrar el Criterio de Aceptación 1 en vivo:
   * "Dado un recorrido con subida de 120 m, entonces el desnivel positivo marca 120 ± 20 m."
   */
  const simularSubida120m = () => {
    if (!estado.grabando) {
      Alert.alert("Inicie la grabación", "Primero pulse 'Iniciar Grabación'.");
      return;
    }
    if (estado.pausado) {
      Alert.alert("En pausa", "Reanude la grabación para registrar puntos.");
      return;
    }

    const baseLat = 4.61;
    const baseLng = -74.08;
    const baseAlt = 2500;
    // 11 puntos subiendo de 12 m en 12 m = +120 m de subida total
    for (let i = 0; i <= 10; i++) {
      agregarPuntoManual({
        lat: baseLat + i * 0.0003,
        lng: baseLng + i * 0.0003,
        altitud_gps: baseAlt + i * 12,
        presion_hpa: null,
        accuracy_m: 5,
      });
    }
  };

  const manejarFinalizarYGuardar = async () => {
    const puntosFinales = [...estado.puntos];
    const pasosFinales = estado.pasos;
    const metrosFinales = estado.metros;
    const desnivelFinal = estado.desnivel_pos_m;
    const altMaxFinal = estado.altitud_max_m;

    detenerGrabacion();

    try {
      const viajeId = await crearViajeGrabado({
        nombre: nombreViaje.trim() || "Recorrido sin título",
        inicio: inicioIso || new Date().toISOString(),
        fin: new Date().toISOString(),
        metros: metrosFinales,
        desnivel_pos_m: desnivelFinal,
        altitud_max_m: altMaxFinal,
        pasos: pasosFinales,
        puntos: puntosFinales,
        fotos: fotosCapturadas,
      });

      router.push(`/viaje/${viajeId}`);
    } catch {
      Alert.alert("Error", "No fue posible guardar el viaje en SQLite.");
    }
  };

  const puntosAltitud = estado.puntos
    .map((p) => {
      const alt = obtenerAltitudEfectiva(p);
      return alt !== null ? { t: p.t, alt } : null;
    })
    .filter((x): x is { t: string; alt: number } => x !== null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Avisos de disponibilidad de sensores (Criterio de Aceptación 2 y Sección 5) */}
      {estado.avisoSinBarometro && (
        <View style={styles.warningBanner} accessibilityRole="alert">
          <Text style={styles.warningTitle}>⚠️ Aviso de precisión de altitud</Text>
          <Text style={styles.warningText}>{estado.avisoSinBarometro}</Text>
        </View>
      )}

      {estado.avisoPermisoGps && (
        <View style={styles.infoBanner} accessibilityRole="alert">
          <Text style={styles.infoBannerText}>{estado.avisoPermisoGps}</Text>
        </View>
      )}

      {/* Nombre del recorrido */}
      <View style={styles.card}>
        <Text style={styles.label}>Nombre del viaje o caminata</Text>
        <TextInput
          style={styles.input}
          value={nombreViaje}
          onChangeText={setNombreViaje}
          placeholder="Ej. Ascenso Cerro de Monserrate"
          placeholderTextColor="#64748B"
          editable={!estado.grabando}
          accessibilityLabel="Nombre del recorrido a grabar"
        />

        {/* RF-01: Iniciar, pausar y finalizar la grabación */}
        {!estado.grabando ? (
          <Pressable
            style={styles.startBtn}
            onPress={manejarIniciar}
            accessibilityRole="button"
            accessibilityLabel="Iniciar grabación del recorrido"
          >
            <Text style={styles.startBtnText}>▶ Iniciar Grabación</Text>
          </Pressable>
        ) : (
          <View style={styles.controlsRow}>
            {!estado.pausado ? (
              <Pressable
                style={styles.pauseBtn}
                onPress={pausarGrabacion}
                accessibilityRole="button"
                accessibilityLabel="Pausar grabación del recorrido"
              >
                <Text style={styles.pauseBtnText}>⏸ Pausar</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.resumeBtn}
                onPress={reanudarGrabacion}
                accessibilityRole="button"
                accessibilityLabel="Reanudar grabación del recorrido"
              >
                <Text style={styles.resumeBtnText}>▶ Reanudar</Text>
              </Pressable>
            )}

            <Pressable
              style={styles.stopBtn}
              onPress={manejarFinalizarYGuardar}
              accessibilityRole="button"
              accessibilityLabel="Finalizar y guardar recorrido en SQLite"
            >
              <Text style={styles.stopBtnText}>⏹ Finalizar y Guardar</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Telemetría en vivo: RF-03 y RF-04 */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>Telemetría en Vivo</Text>
          <View
            style={[
              styles.stateBadge,
              !estado.grabando
                ? styles.badgeIdle
                : estado.pausado
                ? styles.badgePaused
                : styles.badgeActive,
            ]}
          >
            <Text style={styles.stateBadgeText}>
              {!estado.grabando ? "Inactivo" : estado.pausado ? "PAUSADO (No registra)" : "GRABANDO"}
            </Text>
          </View>
        </View>

        <View style={styles.telemetryGrid}>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryValue}>{estado.metros} m</Text>
            <Text style={styles.telemetryLabel}>Distancia total</Text>
          </View>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryValue}>+{estado.desnivel_pos_m} m</Text>
            <Text style={styles.telemetryLabel}>Desnivel pos. (suavizado 3m)</Text>
          </View>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryValue}>
              {estado.altitud_max_m !== null ? `${estado.altitud_max_m} m` : "—"}
            </Text>
            <Text style={styles.telemetryLabel}>Altitud máx.</Text>
          </View>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryValue}>
              {estado.pasos !== null ? estado.pasos : "Omitido"}
            </Text>
            <Text style={styles.telemetryLabel}>Pasos (Podómetro)</Text>
          </View>
        </View>

        {/* RF-04: Contraste entre Altitud por Presión Barométrica y Altitud GPS */}
        <View style={styles.contrastBox}>
          <Text style={styles.contrastTitle}>
            RF-04 · Contraste Barómetro vs. GPS (h = 44330·(1 − (p/p0)^0,1903))
          </Text>
          <Text style={styles.contrastLine}>
            • Presión barométrica:{" "}
            {estado.presionActualHpa !== null ? `${estado.presionActualHpa} hPa` : "Sin sensor"}
          </Text>
          <Text style={styles.contrastLine}>
            • Altitud estimada por presión:{" "}
            {estado.altitudBarometricaM !== null ? `${estado.altitudBarometricaM} m` : "—"}
          </Text>
          <Text style={styles.contrastLine}>
            • Altitud reportada por GPS:{" "}
            {estado.altitudGpsM !== null ? `${estado.altitudGpsM} m` : "—"}
          </Text>
          {estado.diferenciaAltitudM !== null && (
            <Text style={styles.contrastHighlight}>
              Δ Diferencia Barómetro vs GPS: {estado.diferenciaAltitudM} m
            </Text>
          )}
        </View>
      </View>

      {/* Sección 4 y RF-05: Captura de Fotos Geolocalizadas con Pulsación Larga + Botones Accesibles */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Fotos Geolocalizadas ({fotosCapturadas.length})
        </Text>
        <Text style={styles.helperText}>
          Gesto: Mantenga presionada la zona inferior (pulsación larga) para tomar una foto rápida, o use los botones accesibles.
        </Text>

        <GestureDetector gesture={longPressFotoGesture}>
          <View
            style={styles.longPressZone}
            accessible
            accessibilityLabel="Zona de gesto de pulsación larga para tomar foto geolocalizada rápida"
          >
            <Text style={styles.longPressTitle}>📸 Mantenga presionado aquí (LongPress)</Text>
            <Text style={styles.longPressSub}>Para capturar foto rápida geolocalizada</Text>
          </View>
        </GestureDetector>

        {/* Alternativa accesible por botón para el gesto LongPress (Sección 4) */}
        <View style={styles.photoButtonsRow}>
          <Pressable
            style={styles.cameraBtn}
            onPress={abrirCamaraOTomarFotoRapida}
            accessibilityRole="button"
            accessibilityLabel="Tomar foto geolocalizada con la cámara"
          >
            <Text style={styles.cameraBtnText}>📷 Botón Tomar Foto</Text>
          </Pressable>

          <Pressable
            style={styles.galleryBtn}
            onPress={seleccionarFotoDesdeGaleria}
            accessibilityRole="button"
            accessibilityLabel="Adjuntar foto geolocalizada desde la galería"
          >
            <Text style={styles.galleryBtnText}>🖼️ Galería (Alternativa)</Text>
          </Pressable>
        </View>

        {mostrarCamara && (
          <View style={styles.cameraPreviewBox}>
            <CameraView ref={cameraRef} style={styles.cameraView} facing="back" />
            <View style={styles.cameraActions}>
              <Pressable
                style={styles.shutterBtn}
                onPress={abrirCamaraOTomarFotoRapida}
                accessibilityRole="button"
                accessibilityLabel="Disparar obturador de cámara"
              >
                <Text style={styles.shutterBtnText}>● Capturar Ahora</Text>
              </Pressable>
              <Pressable
                style={styles.closeCamBtn}
                onPress={() => setMostrarCamara(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar vista de cámara"
              >
                <Text style={styles.closeCamBtnText}>Cerrar</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* RF-06: Vista previa SVG en vivo de la ruta y perfil de altitud */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Ruta GPS en Vivo ({estado.puntos.length} puntos)
        </Text>
        <RutaSvg puntos={estado.puntos} fotos={fotosCapturadas} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Perfil de Altitud en Vivo (Pellizco y Arrastre)</Text>
        <PerfilAltitudSvg puntos={puntosAltitud} />
      </View>

      {/* Sección 5: Flujo alternativo / Entrada manual cuando el sensor no está disponible */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Entrada Manual / Simulación (Alternativa sin sensor físico)
        </Text>
        <Text style={styles.helperText}>
          Permite registrar puntos en emuladores o dispositivos sin GPS/Barómetro y comprobar los Criterios de Aceptación en vivo.
        </Text>

        <View style={styles.manualRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.miniLabel}>Latitud</Text>
            <TextInput
              style={styles.miniInput}
              value={manualLat}
              onChangeText={setManualLat}
              keyboardType="numeric"
              accessibilityLabel="Latitud manual"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.miniLabel}>Longitud</Text>
            <TextInput
              style={styles.miniInput}
              value={manualLng}
              onChangeText={setManualLng}
              keyboardType="numeric"
              accessibilityLabel="Longitud manual"
            />
          </View>
        </View>

        <View style={styles.manualRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.miniLabel}>Altitud GPS (m)</Text>
            <TextInput
              style={styles.miniInput}
              value={manualAltGps}
              onChangeText={setManualAltGps}
              keyboardType="numeric"
              accessibilityLabel="Altitud GPS manual en metros"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.miniLabel}>Presión (hPa, opcional)</Text>
            <TextInput
              style={styles.miniInput}
              value={manualPresion}
              onChangeText={setManualPresion}
              keyboardType="numeric"
              accessibilityLabel="Presión barométrica manual en hectopascales"
            />
          </View>
        </View>

        <View style={styles.manualActionsRow}>
          <Pressable
            style={styles.manualBtn}
            onPress={manejarAgregarPuntoManual}
            accessibilityRole="button"
            accessibilityLabel="Agregar punto manual al recorrido"
          >
            <Text style={styles.manualBtnText}>+ Agregar Punto Manual</Text>
          </Pressable>

          <Pressable
            style={styles.sim120Btn}
            onPress={simularSubida120m}
            accessibilityRole="button"
            accessibilityLabel="Simular recorrido con subida de 120 metros para criterio de aceptación 1"
          >
            <Text style={styles.sim120BtnText}>⛰️ Simular Subida +120 m</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
    padding: 14,
  },
  warningBanner: {
    backgroundColor: "rgba(250, 204, 21, 0.14)",
    borderColor: "#FACC15",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  warningTitle: {
    color: "#FACC15",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 2,
  },
  warningText: {
    color: "#FEF08A",
    fontSize: 12,
  },
  infoBanner: {
    backgroundColor: "rgba(56, 189, 248, 0.14)",
    borderColor: "#38BDF8",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  infoBannerText: {
    color: "#BAE6FD",
    fontSize: 12,
  },
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  label: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#1E293B",
    color: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  startBtn: {
    backgroundColor: "#22C55E",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  startBtnText: {
    color: "#020617",
    fontWeight: "800",
    fontSize: 15,
  },
  controlsRow: {
    flexDirection: "row",
    gap: 8,
  },
  pauseBtn: {
    flex: 1,
    backgroundColor: "#FACC15",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  pauseBtnText: {
    color: "#020617",
    fontWeight: "800",
  },
  resumeBtn: {
    flex: 1,
    backgroundColor: "#38BDF8",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  resumeBtnText: {
    color: "#020617",
    fontWeight: "800",
  },
  stopBtn: {
    flex: 1,
    backgroundColor: "#EF4444",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  stopBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
  },
  stateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeIdle: {
    backgroundColor: "#334155",
  },
  badgePaused: {
    backgroundColor: "rgba(250, 204, 21, 0.25)",
  },
  badgeActive: {
    backgroundColor: "rgba(34, 197, 94, 0.25)",
  },
  stateBadgeText: {
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: "700",
  },
  telemetryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  telemetryItem: {
    width: "48%",
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  telemetryValue: {
    color: "#38BDF8",
    fontSize: 18,
    fontWeight: "800",
  },
  telemetryLabel: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },
  contrastBox: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  contrastTitle: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  contrastLine: {
    color: "#CBD5E1",
    fontSize: 12,
    marginBottom: 2,
  },
  contrastHighlight: {
    color: "#22C55E",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  helperText: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 10,
  },
  longPressZone: {
    backgroundColor: "#1E293B",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#38BDF8",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  longPressTitle: {
    color: "#38BDF8",
    fontSize: 14,
    fontWeight: "700",
  },
  longPressSub: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },
  photoButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  cameraBtn: {
    flex: 1,
    backgroundColor: "#38BDF8",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  cameraBtnText: {
    color: "#020617",
    fontWeight: "700",
    fontSize: 13,
  },
  galleryBtn: {
    flex: 1,
    backgroundColor: "#1E293B",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  galleryBtnText: {
    color: "#E2E8F0",
    fontWeight: "600",
    fontSize: 13,
  },
  cameraPreviewBox: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155",
  },
  cameraView: {
    width: "100%",
    height: 220,
  },
  cameraActions: {
    flexDirection: "row",
    backgroundColor: "#020617",
    padding: 8,
    gap: 8,
  },
  shutterBtn: {
    flex: 1,
    backgroundColor: "#22C55E",
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  shutterBtnText: {
    color: "#020617",
    fontWeight: "800",
  },
  closeCamBtn: {
    backgroundColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  closeCamBtnText: {
    color: "#F8FAFC",
    fontWeight: "600",
  },
  manualRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  miniLabel: {
    color: "#94A3B8",
    fontSize: 11,
    marginBottom: 3,
  },
  miniInput: {
    backgroundColor: "#1E293B",
    color: "#F8FAFC",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    borderWidth: 1,
    borderColor: "#334155",
  },
  manualActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  manualBtn: {
    flex: 1,
    backgroundColor: "#1E293B",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#38BDF8",
  },
  manualBtnText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "700",
  },
  sim120Btn: {
    flex: 1,
    backgroundColor: "rgba(34, 197, 94, 0.18)",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#22C55E",
  },
  sim120BtnText: {
    color: "#86EFAC",
    fontSize: 12,
    fontWeight: "700",
  },
});
