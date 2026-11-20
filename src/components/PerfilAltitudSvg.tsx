import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Svg, { Path, Line, Circle, Text as SvgText } from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

export interface PuntoAltitud {
  t: string;
  alt: number;
}

interface PerfilAltitudSvgProps {
  puntos: PuntoAltitud[];
  width?: number;
  height?: number;
}

/**
 * RF-06 y Sección 4:
 * Dibuja el perfil de altitud con SVG e implementa dos gestos obligatorios con su alternativa accesible por botón:
 * 1. Pellizco (Gesture.Pinch): Zoom del perfil de altitud + botones [+ Zoom] / [- Zoom].
 * 2. Arrastre sobre el perfil (Gesture.Pan): Mostrar el punto exacto con su altitud + botones [< Punto anterior] / [Punto siguiente >].
 */
export function PerfilAltitudSvg({ puntos, width = 340, height = 200 }: PerfilAltitudSvgProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  if (!puntos || puntos.length === 0) {
    return (
      <View style={[styles.emptyBox, { width, height }]}>
        <Text style={styles.emptyText}>Sin datos de altitud registrados</Text>
      </View>
    );
  }

  const padding = 28;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  let minAlt = puntos[0]!.alt;
  let maxAlt = puntos[0]!.alt;
  for (const p of puntos) {
    if (p.alt < minAlt) minAlt = p.alt;
    if (p.alt > maxAlt) maxAlt = p.alt;
  }

  const span = Math.max(maxAlt - minAlt, 10);
  const safeIdx = Math.min(Math.max(selectedIndex, 0), puntos.length - 1);
  const puntoSeleccionado = puntos[safeIdx]!;

  const updateZoomFromPinch = (scale: number) => {
    const clamped = Math.min(Math.max(Number(scale.toFixed(2)), 1), 3);
    setZoom(clamped);
  };

  const updateIndexFromX = (x: number) => {
    const ratio = Math.min(Math.max((x - padding) / Math.max(innerW, 1), 0), 1);
    const idx = Math.round(ratio * (puntos.length - 1));
    setSelectedIndex(idx);
  };

  // Gesto 1: Pellizco para zoom del perfil de altitud
  const pinchGesture = Gesture.Pinch().onUpdate((e) => {
    runOnJS(updateZoomFromPinch)(e.scale);
  });

  // Gesto 2: Arrastre sobre el perfil para inspeccionar punto exacto con su altitud
  const panGesture = Gesture.Pan()
    .onBegin((e) => {
      runOnJS(updateIndexFromX)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(updateIndexFromX)(e.x);
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  // Construir coordenadas SVG aplicando el factor de zoom alrededor del punto seleccionado
  const getCoordinates = (idx: number) => {
    const ratio = puntos.length > 1 ? idx / (puntos.length - 1) : 0.5;
    const x = padding + ratio * innerW;
    const normAlt = (puntos[idx]!.alt - minAlt) / span;
    const scaledNorm = Math.min(Math.max(0.5 + (normAlt - 0.5) * zoom, 0), 1);
    const y = padding + (1 - scaledNorm) * innerH;
    return { x, y };
  };

  const coords = puntos.map((_, idx) => getCoordinates(idx));
  const linePath = coords
    .map((c, idx) => `${idx === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1]!.x.toFixed(1)} ${(height - padding).toFixed(1)} L ${coords[0]!.x.toFixed(1)} ${(height - padding).toFixed(1)} Z`
      : "";

  const selCoord = coords[safeIdx]!;

  return (
    <View style={styles.wrapper}>
      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          Punto #{safeIdx + 1}/{puntos.length} · Altitud:{" "}
          <Text style={styles.infoHighlight}>{puntoSeleccionado.alt.toFixed(1)} m</Text> · Zoom:{" "}
          {zoom.toFixed(1)}x
        </Text>
      </View>

      <GestureDetector gesture={composedGesture}>
        <View
          style={styles.svgContainer}
          accessible
          accessibilityLabel={`Perfil de altitud SVG. Punto seleccionado ${safeIdx + 1} de ${puntos.length} con altitud ${puntoSeleccionado.alt.toFixed(1)} metros.`}
        >
          <Svg width={width} height={height}>
            {/* Líneas de cota */}
            <Line
              x1={padding}
              y1={padding}
              x2={width - padding}
              y2={padding}
              stroke="#334155"
              strokeDasharray="3,3"
              strokeWidth={1}
            />
            <SvgText x={4} y={padding + 4} fill="#94A3B8" fontSize="10">
              {maxAlt.toFixed(0)}m
            </SvgText>

            <Line
              x1={padding}
              y1={height - padding}
              x2={width - padding}
              y2={height - padding}
              stroke="#334155"
              strokeWidth={1}
            />
            <SvgText x={4} y={height - padding} fill="#94A3B8" fontSize="10">
              {minAlt.toFixed(0)}m
            </SvgText>

            {/* Área sombreada bajo la curva */}
            {areaPath !== "" && <Path d={areaPath} fill="rgba(34, 197, 94, 0.18)" />}

            {/* Curva de altitud */}
            {linePath !== "" && (
              <Path d={linePath} fill="none" stroke="#22C55E" strokeWidth={2.8} />
            )}

            {/* Cursor vertical del punto inspeccionado por gesto de arrastre o botón */}
            <Line
              x1={selCoord.x}
              y1={padding}
              x2={selCoord.x}
              y2={height - padding}
              stroke="#FACC15"
              strokeWidth={1.5}
              strokeDasharray="4,2"
            />
            <Circle
              cx={selCoord.x}
              cy={selCoord.y}
              r={6}
              fill="#FACC15"
              stroke="#0F172A"
              strokeWidth={2}
            />
          </Svg>
        </View>
      </GestureDetector>

      {/* Alternativa accesible por botones para ambos gestos (Sección 4) */}
      <View style={styles.accessibilityRow}>
        <Pressable
          style={styles.a11yButton}
          onPress={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
          accessibilityRole="button"
          accessibilityLabel="Inspeccionar punto anterior del perfil de altitud"
        >
          <Text style={styles.a11yButtonText}>◀ Punto ant.</Text>
        </Pressable>

        <Pressable
          style={styles.a11yButton}
          onPress={() => setSelectedIndex((prev) => Math.min(puntos.length - 1, prev + 1))}
          accessibilityRole="button"
          accessibilityLabel="Inspeccionar siguiente punto del perfil de altitud"
        >
          <Text style={styles.a11yButtonText}>Punto sig. ▶</Text>
        </Pressable>

        <Pressable
          style={styles.a11yButton}
          onPress={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
          accessibilityRole="button"
          accessibilityLabel="Alejar zoom del perfil de altitud"
        >
          <Text style={styles.a11yButtonText}>- Zoom</Text>
        </Pressable>

        <Pressable
          style={styles.a11yButton}
          onPress={() => setZoom((z) => Math.min(3, Number((z + 0.5).toFixed(1))))}
          accessibilityRole="button"
          accessibilityLabel="Acercar zoom del perfil de altitud"
        >
          <Text style={styles.a11yButtonText}>+ Zoom</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  infoBanner: {
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#1E293B",
    borderRadius: 8,
  },
  infoText: {
    color: "#E2E8F0",
    fontSize: 12,
    textAlign: "center",
  },
  infoHighlight: {
    color: "#FACC15",
    fontWeight: "bold",
  },
  svgContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  accessibilityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 6,
  },
  a11yButton: {
    flex: 1,
    minWidth: 72,
    backgroundColor: "#1E293B",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  a11yButtonText: {
    color: "#38BDF8",
    fontSize: 11,
    fontWeight: "600",
  },
  emptyBox: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 16,
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 13,
  },
});
