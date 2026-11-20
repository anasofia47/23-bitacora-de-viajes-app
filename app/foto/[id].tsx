import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Gesture, GestureDetector, Directions } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import {
  obtenerFotoPorId,
  type FotoRow,
} from "../../src/repositories/viajeRepository";

/**
 * Sección 3 y Sección 4:
 * Ruta `foto/[id]` — Visor de foto geolocalizada.
 * Implementa:
 * 1. Pellizco (Gesture.Pinch): Zoom de las fotos + botones accesibles [- Zoom] y [+ Zoom].
 * 2. Deslizar horizontal (Gesture.Fling / Gesture.Pan): Pasar entre fotos + botones accesibles [◀ Foto anterior] y [Siguiente foto ▶].
 */
export default function FotoVisorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cargando, setCargando] = useState(true);
  const [viajeNombre, setViajeNombre] = useState("");
  const [fotos, setFotos] = useState<FotoRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      try {
        const numericId = Number(id);
        if (!Number.isNaN(numericId)) {
          const data = await obtenerFotoPorId(numericId);
          if (data) {
            setFotos(data.hermanas);
            setViajeNombre(data.viajeNombre);
            const idx = data.hermanas.findIndex((f) => f.id === data.foto.id);
            setCurrentIndex(idx >= 0 ? idx : 0);
          }
        }
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [id]);

  const irAnterior = () => {
    setZoom(1);
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const irSiguiente = () => {
    setZoom(1);
    setCurrentIndex((prev) => Math.min(fotos.length - 1, prev + 1));
  };

  const actualizarZoom = (scale: number) => {
    const clamped = Math.min(Math.max(Number(scale.toFixed(2)), 1), 3.5);
    setZoom(clamped);
  };

  // Gesto 1: Pellizco para zoom de la foto
  const pinchGesture = Gesture.Pinch().onUpdate((e) => {
    runOnJS(actualizarZoom)(e.scale);
  });

  // Gesto 2: Deslizar horizontal (Fling izquierda / derecha) para pasar entre fotos
  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      runOnJS(irSiguiente)();
    });

  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      runOnJS(irAnterior)();
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(flingLeft, flingRight)
  );

  if (cargando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  }

  const fotoActual = fotos[currentIndex];
  if (!fotoActual) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No se encontró la fotografía.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBox}>
        <Text style={styles.tripTitle}>{viajeNombre}</Text>
        <Text style={styles.counterText}>
          Foto {currentIndex + 1} de {fotos.length} · Zoom: {zoom.toFixed(1)}x
        </Text>
      </View>

      <GestureDetector gesture={composedGesture}>
        <View
          style={styles.viewerStage}
          accessible
          accessibilityLabel={`Fotografía geolocalizada ${currentIndex + 1} de ${fotos.length}. Pellizque para zoom o deslice horizontalmente para cambiar de foto.`}
        >
          <Image
            source={{ uri: fotoActual.uri }}
            style={[
              styles.image,
              {
                transform: [{ scale: zoom }],
              },
            ]}
            resizeMode="contain"
          />
        </View>
      </GestureDetector>

      <View style={styles.metaCard}>
        <Text style={styles.metaLine}>
          📍 Coordenadas GPS:{" "}
          {fotoActual.lat !== null && fotoActual.lng !== null
            ? `${fotoActual.lat.toFixed(5)}, ${fotoActual.lng.toFixed(5)}`
            : "No registradas"}
        </Text>
        <Text style={styles.metaLine}>
          🕒 Capturada: {new Date(fotoActual.t).toLocaleString()}
        </Text>
      </View>

      {/* Alternativas por botón con accessibilityLabel para ambos gestos (Sección 4) */}
      <View style={styles.controlsGrid}>
        <Pressable
          style={[styles.a11yBtn, currentIndex === 0 && styles.btnDisabled]}
          onPress={irAnterior}
          disabled={currentIndex === 0}
          accessibilityRole="button"
          accessibilityLabel="Ver foto anterior"
        >
          <Text style={styles.a11yBtnText}>◀ Foto anterior</Text>
        </Pressable>

        <Pressable
          style={[
            styles.a11yBtn,
            currentIndex >= fotos.length - 1 && styles.btnDisabled,
          ]}
          onPress={irSiguiente}
          disabled={currentIndex >= fotos.length - 1}
          accessibilityRole="button"
          accessibilityLabel="Ver siguiente foto"
        >
          <Text style={styles.a11yBtnText}>Siguiente foto ▶</Text>
        </Pressable>

        <Pressable
          style={styles.a11yBtn}
          onPress={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
          accessibilityRole="button"
          accessibilityLabel="Alejar zoom de la fotografía"
        >
          <Text style={styles.a11yBtnText}>🔍 - Zoom</Text>
        </Pressable>

        <Pressable
          style={styles.a11yBtn}
          onPress={() => setZoom((z) => Math.min(3.5, Number((z + 0.5).toFixed(1))))}
          accessibilityRole="button"
          accessibilityLabel="Acercar zoom de la fotografía"
        >
          <Text style={styles.a11yBtnText}>🔍 + Zoom</Text>
        </Pressable>
      </View>
    </View>
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
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 15,
  },
  headerBox: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    alignItems: "center",
  },
  tripTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
  },
  counterText: {
    color: "#38BDF8",
    fontSize: 12,
    marginTop: 2,
  },
  viewerStage: {
    flex: 1,
    backgroundColor: "#0F172A",
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E293B",
    marginBottom: 10,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  metaCard: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  metaLine: {
    color: "#CBD5E1",
    fontSize: 12,
    marginBottom: 3,
  },
  controlsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  a11yBtn: {
    width: "48%",
    backgroundColor: "#1E293B",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  btnDisabled: {
    opacity: 0.4,
  },
  a11yBtnText: {
    color: "#38BDF8",
    fontSize: 13,
    fontWeight: "700",
  },
});
