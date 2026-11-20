import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  listarViajes,
  eliminarViajeLogico,
  type ViajeRow,
} from "../../src/repositories/viajeRepository";
import {
  sincronizarConApi,
  consultarEstadisticasAnualesRemotas,
} from "../../src/services/syncService";
import { useSession } from "../../src/components/SessionContext";

export default function ViajesScreen() {
  const router = useRouter();
  const { email, autenticado, iniciarSesion, registrarse, cerrarSesion } = useSession();

  const [viajes, setViajes] = useState<Array<ViajeRow & { total_fotos: number; total_puntos: number }>>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState<string | null>(null);

  // Panel de autenticación mediada por la API
  const [mostrarAuth, setMostrarAuth] = useState(false);
  const [modoRegistro, setModoRegistro] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [statsRemotas, setStatsRemotas] = useState<{
    anio: number;
    kilometros_totales: number;
    desnivel_pos_acumulado_m: number;
  } | null>(null);

  const cargarViajes = useCallback(async (filtroActual: string) => {
    setCargando(true);
    try {
      const lista = await listarViajes(filtroActual);
      setViajes(lista);
    } catch {
      setMensajeEstado("Error al leer la base de datos SQLite local.");
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarViajes(busqueda);
    }, [cargarViajes, busqueda])
  );

  // Sección 7: Pedir confirmación antes de eliminar un viaje con fotos
  const confirmarEliminacion = (viaje: ViajeRow & { total_fotos: number }) => {
    if (viaje.total_fotos > 0) {
      Alert.alert(
        "Confirmar eliminación de viaje con fotos",
        `El viaje "${viaje.nombre}" contiene ${viaje.total_fotos} foto(s) geolocalizada(s). ¿Está seguro de que desea eliminarlo?`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Eliminar viaje y fotos",
            style: "destructive",
            onPress: async () => {
              await eliminarViajeLogico(viaje.id);
              await cargarViajes(busqueda);
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      "Eliminar recorrido",
      `¿Desea eliminar el recorrido "${viaje.nombre}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            await eliminarViajeLogico(viaje.id);
            await cargarViajes(busqueda);
          },
        },
      ]
    );
  };

  const manejarSincronizacion = async () => {
    setSincronizando(true);
    setMensajeEstado(null);
    try {
      const res = await sincronizarConApi();
      const stats = await consultarEstadisticasAnualesRemotas();
      if (stats) {
        setStatsRemotas(stats);
      }
      await cargarViajes(busqueda);
      setMensajeEstado(
        `Sincronización completada: ${res.subidos} subido(s), ${res.descargados} recibido(s).`
      );
    } catch (err) {
      setMensajeEstado(err instanceof Error ? err.message : "No fue posible sincronizar.");
    } finally {
      setSincronizando(false);
    }
  };

  const manejarSubmitAuth = async () => {
    setAuthError(null);
    const correoLimpio = authEmail.trim();
    if (!correoLimpio.includes("@")) {
      setAuthError("Ingrese un correo electrónico válido.");
      return;
    }
    if (authPassword.length < 8) {
      setAuthError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    try {
      if (modoRegistro) {
        await registrarse(correoLimpio, authPassword);
      } else {
        await iniciarSesion(correoLimpio, authPassword);
      }
      setAuthPassword("");
      setMostrarAuth(false);
      setMensajeEstado("Sesión iniciada y guardada en expo-secure-store.");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Error de autenticación");
    }
  };

  // Estadísticas anuales calculadas en SQLite local (funciona sin conexión)
  const anioActual = new Date().getFullYear();
  const viajesDelAnio = viajes.filter((v) => v.inicio.startsWith(String(anioActual)));
  const kmLocalesAnio = (
    viajesDelAnio.reduce((acc, v) => acc + (v.metros || 0), 0) / 1000
  ).toFixed(2);
  const desnivelLocalAnio = viajesDelAnio.reduce(
    (acc, v) => acc + (v.desnivel_pos_m || 0),
    0
  );

  return (
    <View style={styles.container}>
      {/* Tarjeta de Estadísticas Anuales (Local + Remota) */}
      <View style={styles.statsCard}>
        <View style={styles.statsHeaderRow}>
          <Text style={styles.statsTitle}>Acumulado {anioActual}</Text>
          <Pressable
            style={styles.authBadgeButton}
            onPress={() => setMostrarAuth((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={
              autenticado ? `Cuenta activa ${email}` : "Abrir inicio de sesión para sincronizar"
            }
          >
            <Text style={styles.authBadgeText}>
              {autenticado ? `👤 ${email}` : "🔐 Iniciar sesión"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricValue}>
              {statsRemotas ? statsRemotas.kilometros_totales : kmLocalesAnio} km
            </Text>
            <Text style={styles.metricLabel}>Distancia anual</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricValue}>
              +{statsRemotas ? statsRemotas.desnivel_pos_acumulado_m : desnivelLocalAnio} m
            </Text>
            <Text style={styles.metricLabel}>Desnivel positivo</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricValue}>{viajes.length}</Text>
            <Text style={styles.metricLabel}>Salidas</Text>
          </View>
        </View>

        <View style={styles.syncRow}>
          <Pressable
            style={[styles.syncButton, sincronizando && { opacity: 0.6 }]}
            onPress={manejarSincronizacion}
            disabled={sincronizando}
            accessibilityRole="button"
            accessibilityLabel="Sincronizar recorridos pendientes con la API en Vercel"
          >
            <Text style={styles.syncButtonText}>
              {sincronizando ? "Sincronizando..." : "☁️ Sincronizar con API"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.newTripButton}
            onPress={() => router.push("/(tabs)/grabar")}
            accessibilityRole="button"
            accessibilityLabel="Ir a pantalla de grabación en vivo"
          >
            <Text style={styles.newTripButtonText}>+ Grabar salida</Text>
          </Pressable>
        </View>

        {mensajeEstado && <Text style={styles.statusMsg}>{mensajeEstado}</Text>}
      </View>

      {/* Formulario de Login / Registro mediado por la API */}
      {mostrarAuth && (
        <View style={styles.authCard}>
          {autenticado ? (
            <View style={styles.loggedBox}>
              <Text style={styles.authTitle}>Sesión activa: {email}</Text>
              <Text style={styles.authSubtitle}>
                Tokens almacenados de forma segura en expo-secure-store.
              </Text>
              <Pressable
                style={styles.logoutButton}
                onPress={cerrarSesion}
                accessibilityRole="button"
                accessibilityLabel="Cerrar sesión"
              >
                <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.authTitle}>
                {modoRegistro ? "Crear cuenta en la API" : "Iniciar sesión en la API"}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Correo electrónico"
                placeholderTextColor="#64748B"
                keyboardType="email-address"
                autoCapitalize="none"
                value={authEmail}
                onChangeText={setAuthEmail}
                accessibilityLabel="Campo de correo electrónico"
              />
              <TextInput
                style={styles.input}
                placeholder="Contraseña (mínimo 8 caracteres)"
                placeholderTextColor="#64748B"
                secureTextEntry
                value={authPassword}
                onChangeText={setAuthPassword}
                accessibilityLabel="Campo de contraseña"
              />
              {authError && <Text style={styles.errorText}>{authError}</Text>}
              <View style={styles.authActionsRow}>
                <Pressable
                  style={styles.primaryAuthBtn}
                  onPress={manejarSubmitAuth}
                  accessibilityRole="button"
                  accessibilityLabel={modoRegistro ? "Confirmar registro" : "Confirmar inicio de sesión"}
                >
                  <Text style={styles.primaryAuthBtnText}>
                    {modoRegistro ? "Registrarme" : "Entrar"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryAuthBtn}
                  onPress={() => setModoRegistro((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel="Alternar entre login y registro"
                >
                  <Text style={styles.secondaryAuthBtnText}>
                    {modoRegistro ? "Ya tengo cuenta" : "Crear cuenta"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}

      {/* Barra de búsqueda SQLite (Hito 2) */}
      <TextInput
        style={styles.searchInput}
        placeholder="Buscar viaje por nombre (sin conexión)..."
        placeholderTextColor="#64748B"
        value={busqueda}
        onChangeText={(txt) => {
          setBusqueda(txt);
          cargarViajes(txt);
        }}
        accessibilityLabel="Buscar recorridos por nombre"
      />

      {cargando ? (
        <ActivityIndicator color="#22C55E" size="large" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={viajes}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No hay viajes registrados aún</Text>
              <Text style={styles.emptySub}>
                Inicie una grabación en la pestaña "Grabar" para registrar su ruta GPS, altitud barométrica, pasos y fotos geolocalizadas.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.tripCard}>
              <Pressable
                style={styles.tripMainArea}
                onPress={() => router.push(`/viaje/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Ver resumen del viaje ${item.nombre}, distancia ${item.metros} metros, desnivel positivo ${item.desnivel_pos_m} metros`}
              >
                <View style={styles.tripTitleRow}>
                  <Text style={styles.tripName}>{item.nombre}</Text>
                  <View
                    style={[
                      styles.syncBadge,
                      item.pending === 1 ? styles.syncPending : styles.syncOk,
                    ]}
                  >
                    <Text style={styles.syncBadgeText}>
                      {item.pending === 1 ? "Pendiente sync" : "Sincronizado"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.tripDate}>
                  {new Date(item.inicio).toLocaleString()}
                </Text>

                <View style={styles.tripStatsRow}>
                  <Text style={styles.tripStatPill}>📏 {item.metros} m</Text>
                  <Text style={styles.tripStatPill}>⛰️ +{item.desnivel_pos_m} m</Text>
                  {item.altitud_max_m !== null && (
                    <Text style={styles.tripStatPill}>
                      🔝 {item.altitud_max_m.toFixed(0)} msnm
                    </Text>
                  )}
                  {item.pasos !== null && (
                    <Text style={styles.tripStatPill}>👣 {item.pasos} pasos</Text>
                  )}
                  <Text style={styles.tripStatPill}>📷 {item.total_fotos} fotos</Text>
                </View>
              </Pressable>

              <Pressable
                style={styles.deleteBtn}
                onPress={() => confirmarEliminacion(item)}
                accessibilityRole="button"
                accessibilityLabel={`Eliminar recorrido ${item.nombre}`}
              >
                <Text style={styles.deleteBtnText}>Eliminar</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
    padding: 14,
  },
  statsCard: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  statsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  statsTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
  },
  authBadgeButton: {
    backgroundColor: "#1E293B",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
  },
  authBadgeText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    alignItems: "center",
  },
  metricValue: {
    color: "#22C55E",
    fontSize: 18,
    fontWeight: "800",
  },
  metricLabel: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },
  syncRow: {
    flexDirection: "row",
    gap: 8,
  },
  syncButton: {
    flex: 1,
    backgroundColor: "#1E293B",
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  syncButtonText: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "600",
  },
  newTripButton: {
    flex: 1,
    backgroundColor: "#22C55E",
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
  },
  newTripButtonText: {
    color: "#020617",
    fontSize: 13,
    fontWeight: "700",
  },
  statusMsg: {
    color: "#38BDF8",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  authCard: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  loggedBox: {
    alignItems: "center",
  },
  authTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  authSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#1E293B",
    color: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  errorText: {
    color: "#F87171",
    fontSize: 12,
    marginBottom: 8,
  },
  authActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  primaryAuthBtn: {
    flex: 1,
    backgroundColor: "#38BDF8",
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryAuthBtnText: {
    color: "#020617",
    fontWeight: "700",
  },
  secondaryAuthBtn: {
    flex: 1,
    backgroundColor: "#1E293B",
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryAuthBtnText: {
    color: "#94A3B8",
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  searchInput: {
    backgroundColor: "#0F172A",
    color: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  emptyBox: {
    padding: 24,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptySub: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
  },
  tripCard: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tripMainArea: {
    flex: 1,
    paddingRight: 10,
  },
  tripTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  tripName: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 1,
  },
  syncBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  syncPending: {
    backgroundColor: "rgba(250, 204, 21, 0.2)",
  },
  syncOk: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
  },
  syncBadgeText: {
    color: "#E2E8F0",
    fontSize: 10,
    fontWeight: "600",
  },
  tripDate: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 8,
  },
  tripStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tripStatPill: {
    backgroundColor: "#1E293B",
    color: "#E2E8F0",
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  deleteBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  deleteBtnText: {
    color: "#F87171",
    fontSize: 12,
    fontWeight: "700",
  },
});
