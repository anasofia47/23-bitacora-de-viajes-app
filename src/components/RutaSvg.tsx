import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";

export interface CoordenadaRuta {
  lat: number;
  lng: number;
}

interface RutaSvgProps {
  puntos: CoordenadaRuta[];
  fotos?: Array<{ lat: number | null; lng: number | null }>;
  width?: number;
  height?: number;
}

/**
 * RF-06: Dibujar la ruta con SVG (sin mapas con llave).
 */
export function RutaSvg({ puntos, fotos = [], width = 340, height = 210 }: RutaSvgProps) {
  if (!puntos || puntos.length === 0) {
    return (
      <View style={[styles.emptyBox, { width, height }]}>
        <Text style={styles.emptyText}>Sin puntos GPS registrados en la ruta</Text>
      </View>
    );
  }

  const padding = 24;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  let minLat = puntos[0]!.lat;
  let maxLat = puntos[0]!.lat;
  let minLng = puntos[0]!.lng;
  let maxLng = puntos[0]!.lng;

  for (const p of puntos) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const latSpan = Math.max(maxLat - minLat, 0.0002);
  const lngSpan = Math.max(maxLng - minLng, 0.0002);

  const project = (lat: number, lng: number) => {
    const x = padding + ((lng - minLng) / lngSpan) * innerW;
    const y = padding + (1 - (lat - minLat) / latSpan) * innerH;
    return { x, y };
  };

  const polyPoints = puntos
    .map((p) => {
      const { x, y } = project(p.lat, p.lng);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const startPt = project(puntos[0]!.lat, puntos[0]!.lng);
  const endPt = project(puntos[puntos.length - 1]!.lat, puntos[puntos.length - 1]!.lng);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`Mapa vectorial SVG de la ruta con ${puntos.length} puntos registrados.`}
    >
      <Svg width={width} height={height}>
        {/* Cuadrícula de referencia */}
        <Line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#334155" strokeDasharray="4,4" strokeWidth={1} />
        <Line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#334155" strokeDasharray="4,4" strokeWidth={1} />
        <Line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#334155" strokeDasharray="4,4" strokeWidth={1} />

        {/* Trazo de la ruta */}
        {puntos.length > 1 && (
          <Polyline
            points={polyPoints}
            fill="none"
            stroke="#38BDF8"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Marcadores de fotos geolocalizadas */}
        {fotos
          .filter((f) => typeof f.lat === "number" && typeof f.lng === "number")
          .map((f, idx) => {
            const pos = project(f.lat!, f.lng!);
            return (
              <Circle
                key={`foto-marker-${idx}`}
                cx={pos.x}
                cy={pos.y}
                r={5}
                fill="#FACC15"
                stroke="#0F172A"
                strokeWidth={1.5}
              />
            );
          })}

        {/* Punto inicial (Verde) */}
        <Circle cx={startPt.x} cy={startPt.y} r={6} fill="#22C55E" stroke="#0F172A" strokeWidth={2} />
        <SvgText x={startPt.x + 8} y={startPt.y + 4} fill="#86EFAC" fontSize="10" fontWeight="bold">
          Inicio
        </SvgText>

        {/* Punto final (Naranja) */}
        {puntos.length > 1 && (
          <>
            <Circle cx={endPt.x} cy={endPt.y} r={6} fill="#F97316" stroke="#0F172A" strokeWidth={2} />
            <SvgText x={endPt.x + 8} y={endPt.y - 6} fill="#FDBA74" fontSize="10" fontWeight="bold">
              Fin
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E293B",
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
    textAlign: "center",
  },
});
