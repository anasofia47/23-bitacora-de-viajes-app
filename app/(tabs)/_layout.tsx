import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0F172A" },
        headerTintColor: "#F8FAFC",
        headerTitleStyle: { fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: "#0F172A",
          borderTopColor: "#1E293B",
        },
        tabBarActiveTintColor: "#22C55E",
        tabBarInactiveTintColor: "#94A3B8",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Viajes",
          tabBarLabel: "Viajes",
          tabBarAccessibilityLabel: "Pestaña de Viajes registrados",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trail-sign-outline" size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="grabar"
        options={{
          title: "Grabación en Vivo",
          tabBarLabel: "Grabar",
          tabBarAccessibilityLabel: "Pestaña de Grabación de recorrido en vivo",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="radio-button-on-outline" size={size} color={String(color)} />
          ),
        }}
      />
    </Tabs>
  );
}
