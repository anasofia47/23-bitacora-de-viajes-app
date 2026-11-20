import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Share,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  obtenerViajePorId,
  eliminarViajeLogico,
  type ViajeCompleto,
} from "../../src/repositories/viajeRepository";
import { RutaSvg } from "../../src/components/RutaSvg";
import { PerfilAltitudSvg } from "../../src/components/PerfilAltitudSvg";
import {
  obtenerAltitudEfectiva,
  exportarRutaGpx,
  simplificarRutaParaFirestore,
} from "../../src/services/telemetria";
import { useHeadingMagnetometer } from "../../src/sensors/useRecorridoSensors";

export default function ViajeDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [viaje, setViaje] = useState<ViajeCompleto | null>(null);
  const [cargando, setCargando] = useState(true);

  // Sección 5: Magnetometer — Rumbo en el resumen (Alternativa si no está disponible: Omitir)
  const rumbo = useHeadingMagnetometer();

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      try {
        const numericId = Number(id);
        if (!Number.isNaN(numericId)) {
          const encontrado = await obtenerViajePorId(numericId);
          setViaje(encontrado);
        }
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [id]);

  if (cargando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  }

  if (!viaje) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>No se encontró el recorrido solicitado.</Text>
      </View>
    );
  }

  const puntosAltitud = viaje.puntos
    .map((p) => {
      const alt = obtenerAltitudEfectiva({
        altitud_gps: p.altitud_gps,
        presion_hpa: p.presion_hpa,
      });
      return alt !== null ? { t: p.t, alt } : null;
    })
    .filter((x): x is { t: string; alt: number } => x !== null);

  // Sección 12 (Reto opcional): Exportar la ruta en formato GPX y compartirla
  const manejarExportarGpx = async () => {
    const puntosSimplificados = simplificarRutaParaFirestore(
      viaje.puntos.map((p) => ({
        t: p.t,
        lat: p.lat,
        lng: p.lng,
        altitud_gps: p.altitud_gps,
        presion_hpa: p.presion_hpa,
      }))
    );

    const gpxXml = exportarRutaGpx(viaje.nombre, puntosSimplificados);
    try {
      await Share.share({
        title: `${viaje.nombre}.gpx`,
        message: gpxXml,
      });
    } catch {
      Alert.alert("Exportación GPX", "Archivo GPX generado correctamente.");
    }
  };

  // Sección 7: Pedir confirmación antes de eliminar un viaje con fotos
  const manejarEliminar = () => {
    const mensaje =
      viaje.fotos.length > 0
        ? `Este recorrido tiene ${viaje.fotos.length} foto(s) geolocalizada(s). ¿Desea confirmar su eliminación?`
        : "¿Desea eliminar este recorrido?";

    Alert.alert("Confirmar eliminación", mensaje, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await eliminarViajeLogico(viaje.id);
          router.replace("/(tabs)");
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Encabezado y métricas del viaje */}
      <View style={styles.card}>
        <Text style={styles.title}>{viaje.nombre}</Text>
        <Text style={styles.subtitle}>
          Inicio: {new Date(viaje.inicio).toLocaleString()}
        </Text>
        {viaje.fin && (
          <Text style={styles.subtitle}>
            Fin: {new Date(viaje.fin).toLocaleString()}
          </Text>
        )}

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{viaje.metros} m</Text>
            <Text style={styles.statLabel}>Distancia total</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>+{viaje.desnivel_pos_m} m</Text>
            <Text style={styles.statLabel}>Desnivel positivo</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>
              {viaje.altitud_max_m !== null ? `${viaje.altitud_max_m.toFixed(1)} m` : "—"}
            </Text>
            <Text style={styles.statLabel}>Altitud máxima</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>
              {viaje.pasos !== null ? viaje.pasos : "Omitido"}
            </Text>
            <Text style={styles.statLabel}>Pasos</Text>
          </View>
        </View>

        {/* Sección 5: Magnetometer — Rumbo en el resumen (si no está disponible se omite) */}
        {rumbo.disponible && rumbo.grados !== null && (
          <View style={styles.compassBadge}>
            <Text style={styles.compassText}>
              🧭 Rumbo actual (Magnetómetro): {rumbo.grados}° ({rumbo.puntoCardinal})
            </Text>
          </View>
        )}

        <View style={styles.actionsRow}>
          <Pressable
            style={styles.gpxBtn}
            onPress={manejarExportarGpx}
            accessibilityRole="button"
            accessibilityLabel="Exportar y compartir ruta en formato GPX"
          >
            <Text style={styles.gpxBtnText}>📤 Exportar GPX</Text>
          </Pressable>

          <Pressable
            style={styles.deleteBtn}
            onPress={manejarEliminar}
            accessibilityRole="button"
            accessibilityLabel="Eliminar viaje"
          >
            <Text style={styles.deleteBtnText}>🗑️ Eliminar Viaje</Text>
          </Pressable>
        </View>
      </View>

      {/* RF-06: Ruta en SVG */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Mapa de Ruta SVG ({viaje.puntos.length} puntos)
        </Text>
        <RutaSvg puntos={viaje.puntos} fotos={viaje.fotos} />
      </View>

      {/* RF-06 y Sección 4: Perfil de altitud con Pellizco, Arrastre y Botones accesibles */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Perfil de Altitud (Pellizco para Zoom · Arrastre para punto exacto)
        </Text>
        <PerfilAltitudSvg puntos={puntosAltitud} />
      </View>

      {/* Fotos geolocalizadas del recorrido */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Fotos Geolocalizadas ({viaje.fotos.length})
        </Text>
        {viaje.fotos.length === 0 ? (
          <Text style={styles.emptyPhotos}>
            No se tomaron fotos durante este recorrido.
          </Text>
        ) : (
          <View style={styles.photosGrid}>
            {viaje.fotos.map((f, index) => (
              <Pressable
                key={f.id}
                style={styles.photoThumbCard}
                onPress={() => router.push(`/foto/${f.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Abrir visor de foto geolocalizada ${index + 1} de ${viaje.fotos.length}`}
              >
                <Image source={{ uri: f.uri }} style={styles.photoThumb} />
                <Text style={styles.photoCoords}>
                  {f.lat !== null && f.lng !== null
                    ? `${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}`
                    : "Sin coordenadas"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
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
  center: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  notFoundText: {
    color: "#94A3B8",
    fontSize: 15,
  },
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  title: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 2,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  statBox: {
    width: "48%",
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  statVal: {
    color: "#22C55E",
    fontSize: 17,
    fontWeight: "800",
  },
  statLabel: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },
  compassBadge: {
    marginTop: 10,
    backgroundColor: "rgba(56, 189, 248, 0.14)",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#38BDF8",
  },
  compassText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  gpxBtn: {
    flex: 1,
    backgroundColor: "#38BDF8",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  gpxBtnText: {
    color: "#020617",
    fontWeight: "700",
    fontSize: 13,
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  deleteBtnText: {
    color: "#F87171",
    fontWeight: "700",
    fontSize: 13,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyPhotos: {
    color: "#94A3B8",
    fontSize: 13,
  },
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photoThumbCard: {
    width: "47%",
    backgroundColor: "#1E293B",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155",
  },
  photoThumb: {
    width: "100%",
    height: 115,
  },
  photoCoords: {
    color: "#CBD5E1",
    fontSize: 11,
    padding: 6,
    textAlign: "center",
  },
});
