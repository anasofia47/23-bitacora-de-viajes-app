import React from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/components/SessionContext";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#0F172A" },
            headerTintColor: "#F8FAFC",
            headerTitleStyle: { fontWeight: "700" },
            contentStyle: { backgroundColor: "#020617" },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="viaje/[id]"
            options={{ title: "Resumen del Recorrido" }}
          />
          <Stack.Screen
            name="foto/[id]"
            options={{ title: "Visor de Foto Geolocalizada" }}
          />
        </Stack>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}
