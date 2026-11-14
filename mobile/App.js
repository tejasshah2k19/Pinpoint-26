import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { api } from "./src/api";

const BRAND = "#3157D5";
const initialRegion = {
  latitude: 23.0225, longitude: 72.5714,
  latitudeDelta: 0.08, longitudeDelta: 0.08
};

function Field({ value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline }) {
  return <TextInput
    value={value} onChangeText={onChangeText} placeholder={placeholder}
    placeholderTextColor="#8A91A0" secureTextEntry={secureTextEntry}
    keyboardType={keyboardType || "default"} multiline={multiline}
    style={[styles.input, multiline && styles.multiline]}
  />;
}

function Action({ title, onPress, secondary, disabled }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress}
    style={[styles.action, secondary && styles.secondaryAction, disabled && { opacity: 0.55 }]}>
    <Text style={[styles.actionText, secondary && styles.secondaryText]}>{title}</Text>
  </TouchableOpacity>;
}

export default function App() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [auth, setAuth] = useState({ name: "", email: "", password: "" });
  const [tab, setTab] = useState("Map");
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({ title: "", category: "Other", notes: "" });
  const [position, setPosition] = useState(null);
  const [region, setRegion] = useState(initialRegion);
  const [busy, setBusy] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);

  async function loadLocations(activeToken = token) {
    if (!activeToken) return;
    setLoadingLocations(true);
    try {
      const result = await api.getLocations(activeToken);
      setLocations(result.data || []);
    } catch (error) {
      Alert.alert("Could not load locations", error.message);
    } finally {
      setLoadingLocations(false);
    }
  }

  useEffect(() => {
    if (token) loadLocations(token);
  }, [token]);

  async function submitAuth() {
    if (!auth.email.trim() || !auth.password) return Alert.alert("Missing details", "Enter your email and password.");
    if (authMode === "register" && (!auth.name.trim() || auth.password.length < 8)) {
      return Alert.alert("Check details", "Enter your name and a password of at least 8 characters.");
    }
    setBusy(true);
    try {
      const result = authMode === "login"
        ? await api.login({ email: auth.email.trim(), password: auth.password })
        : await api.register({ name: auth.name.trim(), email: auth.email.trim(), password: auth.password });
      setToken(result.token);
      setUser(result.user);
    } catch (error) {
      Alert.alert("Authentication failed", error.message);
    } finally { setBusy(false); }
  }

  async function locateMe() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        return Alert.alert("Location permission", "Allow location access to capture a place when you choose.");
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      setPosition(point);
      setRegion({ ...point, latitudeDelta: 0.015, longitudeDelta: 0.015 });
    } catch (error) { Alert.alert("Location unavailable", error.message); }
  }

  async function saveLocation() {
    if (!form.title.trim()) return Alert.alert("Add a title", "Enter a name for this place.");
    if (!position) return Alert.alert("Choose a location", "Tap the map to place a pin or use Current GPS.");
    setBusy(true);
    try {
      await api.createLocation(token, {
        title: form.title.trim(),
        category: form.category.trim() || "Other",
        notes: form.notes.trim(),
        coordinates: { type: "Point", coordinates: [position.longitude, position.latitude] }
      });
      setForm({ title: "", category: "Other", notes: "" });
      await loadLocations();
      setTab("Locations");
      Alert.alert("Saved", "Your place has been added to Pinpoint.");
    } catch (error) { Alert.alert("Could not save", error.message); }
    finally { setBusy(false); }
  }

  async function removeLocation(id) {
    Alert.alert("Delete location?", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.deleteLocation(token, id); await loadLocations(); }
        catch (error) { Alert.alert("Delete failed", error.message); }
      }}
    ]);
  }

  if (!token) {
    return <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.authWrap}>
        <Text style={styles.logo}>pinpoint</Text>
        <Text style={styles.subtitle}>Save places. Remember what matters.</Text>
        <Text style={styles.heading}>{authMode === "login" ? "Welcome back" : "Create your account"}</Text>
        {authMode === "register" && <Field placeholder="Your name" value={auth.name} onChangeText={v => setAuth({ ...auth, name: v })} />}
        <Field placeholder="Email address" value={auth.email} onChangeText={v => setAuth({ ...auth, email: v })} keyboardType="email-address" />
        <Field placeholder="Password (minimum 8 characters)" value={auth.password} onChangeText={v => setAuth({ ...auth, password: v })} secureTextEntry />
        <Action title={busy ? "Please wait..." : authMode === "login" ? "Log in" : "Create account"} onPress={submitAuth} disabled={busy} />
        <Action secondary title={authMode === "login" ? "New to Pinpoint? Create account" : "Already registered? Log in"} onPress={() => setAuthMode(authMode === "login" ? "register" : "login")} />
      </KeyboardAvoidingView>
    </SafeAreaView>;
  }

  const renderLocation = ({ item }) => (
    <View style={styles.locationCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardMeta}>{item.category || "Other"}</Text>
        {!!item.notes && <Text style={styles.cardNotes}>{item.notes}</Text>}
        <Text style={styles.cardMeta}>{item.coordinates?.coordinates?.[1]?.toFixed(5)}, {item.coordinates?.coordinates?.[0]?.toFixed(5)}</Text>
      </View>
      <TouchableOpacity onPress={() => removeLocation(item._id)}><Text style={styles.delete}>Delete</Text></TouchableOpacity>
    </View>
  );

  return <SafeAreaView style={styles.safe}>
    <ExpoStatusBar style="dark" />
    <View style={styles.header}>
      <Text style={styles.logoSmall}>pinpoint</Text>
      <Text style={styles.headerHint}>Your places, in one place</Text>
    </View>
    {tab === "Map" && <View style={styles.fill}>
      <MapView style={styles.map} region={region} onRegionChangeComplete={setRegion}
        onPress={event => setPosition(event.nativeEvent.coordinate)} showsUserLocation>
        {position && <Marker coordinate={position} title="Selected place" />}
        {locations.map(item => <Marker key={item._id}
          coordinate={{ latitude: item.coordinates.coordinates[1], longitude: item.coordinates.coordinates[0] }}
          title={item.title} description={item.category} />)}
      </MapView>
      <View style={styles.mapButtons}>
        <Action title="Current GPS" onPress={locateMe} />
        <Action secondary title="Add selected pin" onPress={() => setTab("Add")} />
      </View>
    </View>}
    {tab === "Locations" && <View style={styles.content}>
      <Text style={styles.heading}>My saved places</Text>
      {loadingLocations ? <ActivityIndicator color={BRAND} /> :
        <FlatList data={locations} keyExtractor={item => item._id} renderItem={renderLocation}
          ListEmptyComponent={<Text style={styles.empty}>No saved places yet. Add your first location.</Text>}
          refreshing={loadingLocations} onRefresh={loadLocations} />}
    </View>}
    {tab === "Add" && <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Save a place</Text>
      <Text style={styles.helper}>Tap a point on the Map tab, or capture your current GPS location.</Text>
      <Field placeholder="Place title *" value={form.title} onChangeText={v => setForm({ ...form, title: v })} />
      <Field placeholder="Category (e.g. Restaurant)" value={form.category} onChangeText={v => setForm({ ...form, category: v })} />
      <Field placeholder="Notes, offers or useful details" value={form.notes} onChangeText={v => setForm({ ...form, notes: v })} multiline />
      <Action title="Capture current GPS" secondary onPress={locateMe} />
      <Text style={styles.helper}>{position ? `Selected: ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` : "No map point selected yet."}</Text>
      <Action title={busy ? "Saving..." : "Save location"} onPress={saveLocation} disabled={busy} />
    </ScrollView>}
    {tab === "Profile" && <View style={styles.content}>
      <Text style={styles.heading}>Profile</Text>
      <Text style={styles.cardTitle}>{user?.name || "Pinpoint user"}</Text>
      <Text style={styles.cardMeta}>{user?.email || ""}</Text>
      <Text style={styles.helper}>Your saved locations are private to your account by default.</Text>
      <Action title="Log out" secondary onPress={() => { setToken(""); setUser(null); setLocations([]); }} />
    </View>}
    <View style={styles.tabs}>
      {["Map", "Locations", "Add", "Profile"].map(name => (
        <TouchableOpacity key={name} onPress={() => setTab(name)} style={styles.tab}>
          <Text style={[styles.tabText, tab === name && styles.tabActive]}>{name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F8FA", paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0 },
  authWrap: { flex: 1, justifyContent: "center", padding: 24 },
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: "#FFFFFF" },
  logo: { fontSize: 38, fontWeight: "800", color: BRAND, letterSpacing: -1 },
  logoSmall: { fontSize: 24, fontWeight: "800", color: BRAND, letterSpacing: -0.5 },
  subtitle: { color: "#667085", fontSize: 15, marginBottom: 36, marginTop: 4 },
  headerHint: { color: "#7A8291", marginTop: 2, fontSize: 12 },
  heading: { fontSize: 25, fontWeight: "750", color: "#182230", marginBottom: 16 },
  input: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E1E5EC", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: "#182230", marginBottom: 12 },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  action: { backgroundColor: BRAND, borderRadius: 12, padding: 15, alignItems: "center", marginTop: 8, marginBottom: 8 },
  secondaryAction: { backgroundColor: "#E9EDFF" },
  actionText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  secondaryText: { color: BRAND },
  map: { flex: 1 },
  mapButtons: { padding: 12, backgroundColor: "#FFFFFF" },
  content: { flex: 1, padding: 18 },
  helper: { color: "#667085", fontSize: 14, lineHeight: 20, marginBottom: 14 },
  locationCard: { backgroundColor: "#FFFFFF", padding: 16, borderRadius: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#EAECF0" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#182230" },
  cardMeta: { color: "#667085", fontSize: 12, marginTop: 5 },
  cardNotes: { color: "#475467", fontSize: 13, marginTop: 6 },
  delete: { color: "#D92D20", fontWeight: "600" },
  empty: { color: "#667085", textAlign: "center", marginTop: 40, lineHeight: 22 },
  tabs: { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E4E7EC", paddingVertical: 12, paddingBottom: Platform.OS === "ios" ? 20 : 12 },
  tab: { flex: 1, alignItems: "center" },
  tabText: { color: "#667085", fontWeight: "600", fontSize: 13 },
  tabActive: { color: BRAND }
});
