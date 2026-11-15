import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Platform,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View
} from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MapView, { Marker } from "react-native-maps";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { api } from "./src/api";

const C = { paper:"#FAFAF5", white:"#FFFFFF", ink:"#20211F", muted:"#85857F", line:"#E8E7DF", coral:"#D97855", coralPale:"#F8E8DF", dark:"#20211F", red:"#B65C4D" };
const DEFAULT_CATEGORIES = ["Food","Travel","Shopping","Nature","Work","Other"];

function Field(p) {
  return <TextInput value={p.value} onChangeText={p.onChangeText} placeholder={p.placeholder}
    placeholderTextColor="#9B9B94" secureTextEntry={p.secureTextEntry} keyboardType={p.keyboardType || "default"}
    multiline={p.multiline} autoCapitalize={p.keyboardType === "email-address" ? "none" : "sentences"}
    style={[s.input, p.multiline && s.multiline]} />;
}
function Button(p) {
  return <TouchableOpacity activeOpacity={0.85} disabled={p.disabled} onPress={p.onPress} style={[s.button,p.disabled && {opacity:0.55}]}>
    {!!p.icon && <Text style={s.buttonIcon}>{p.icon}</Text>}<Text style={s.buttonText}>{p.title}</Text>
  </TouchableOpacity>;
}
function TabButton(p) {
  return <TouchableOpacity onPress={p.onPress} style={s.tabButton}>
    <Text style={[s.tabIcon,p.active && s.active]}>{p.icon}</Text><Text style={[s.tabLabel,p.active && s.active]}>{p.label}</Text>
  </TouchableOpacity>;
}
function PlaceCard(p) {
  const coords = p.item.coordinates && p.item.coordinates.coordinates || [];
  const lat = Number(coords[1]), lng = Number(coords[0]);
  async function openInMaps() {
    const query = Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat},${lng}`
      : p.item.address;
    if (!query) return Alert.alert("Location unavailable","This place has no coordinates or address yet.");
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    try { await Linking.openURL(url); }
    catch(e) { Alert.alert("Could not open Google Maps","Please try again."); }
  }
  return <View style={s.placeCard}>
    <View style={s.pin}><Text style={s.pinText}>⌖</Text></View>
    <View style={s.placeInfo}>
      <Text style={s.placeTitle} numberOfLines={1}>{p.item.title}</Text>
      <Text style={s.placeCategory}>{p.item.category || "Other"}</Text>
      {p.item.isOwner === false && <Text style={s.communityTag}>PUBLIC COMMUNITY PLACE · VIEW ONLY</Text>}
      {!!p.item.address && <Text style={s.notes} numberOfLines={2}>{p.item.address}</Text>}
      {!!p.item.notes && <Text style={s.notes} numberOfLines={2}>{p.item.notes}</Text>}
      {Number.isFinite(lat) && Number.isFinite(lng) && <Text style={s.coords}>{lat.toFixed(5)}, {lng.toFixed(5)}</Text>}
    </View>
    <View style={s.actions}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open place in Google Maps" onPress={openInMaps} style={s.action}><Text style={s.mapAction}>⌖</Text></TouchableOpacity>
      {p.showActions !== false && <><TouchableOpacity onPress={() => p.onEdit(p.item)} style={s.action}><Text style={s.edit}>↗</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => p.onDelete(p.item._id)} style={s.action}><Text style={s.delete}>×</Text></TouchableOpacity></>}
    </View>
  </View>;
}

export default function App() {
  const [token,setToken] = useState("");
  const [sessionChecking,setSessionChecking] = useState(true);
  const [user,setUser] = useState(null);
  const [authMode,setAuthMode] = useState("login");
  const [auth,setAuth] = useState({name:"",email:"",password:""});
  const [loginMethod,setLoginMethod] = useState("password");
  const [loginMpin,setLoginMpin] = useState("");
  const [loginMpinEmail,setLoginMpinEmail] = useState("");
  const [mpinForm,setMpinForm] = useState({mpin:"",confirmMpin:"",currentPassword:""});
  const [showMpinForm,setShowMpinForm] = useState(false);
  const [tab,setTab] = useState("Home");
  const [locations,setLocations] = useState([]);
  const [nearbyLocations,setNearbyLocations] = useState([]);
  const [nearbyRadius,setNearbyRadius] = useState(5000);
  const [nearbyCustomKm,setNearbyCustomKm] = useState("");
  const [nearbyLoading,setNearbyLoading] = useState(false);
  const [form,setForm] = useState({title:"",category:"Food",address:"",notes:"",isPublic:false});
  const [categories,setCategories] = useState([]);
  const [categoryLoading,setCategoryLoading] = useState(false);
  const [categoryDropdownOpen,setCategoryDropdownOpen] = useState(false);
  const [customCategoryName,setCustomCategoryName] = useState("");
  const [position,setPosition] = useState(null);
  const [mapInteracting,setMapInteracting] = useState(false);
  const mapRef = useRef(null);
  function selectPosition(coordinate) {
    if (!coordinate || !Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude)) return;
    const next = { latitude: coordinate.latitude, longitude: coordinate.longitude };
    setPosition(next);
    if (mapRef.current) mapRef.current.animateToRegion({ ...next, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 350);
  }
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [search,setSearch] = useState("");
  const [category,setCategory] = useState("All");
  const [editingId,setEditingId] = useState(null);
  const [showCustomCategory,setShowCustomCategory] = useState(false);

  async function loadCategories(t) {
    const active = t || token;
    if (!active) return;
    setCategoryLoading(true);
    try {
      const result = await api.getCategories(active);
      setCategories(result.data || []);
    } catch(e) { Alert.alert("Could not load categories",e.message); }
    finally { setCategoryLoading(false); }
  }
  async function loadLocations(t) {
    const active = t || token;
    if (!active) return;
    setLoading(true);
    try { const result = await api.getLocations(active); setLocations(result.locations || result.data || []); }
    catch(e) { Alert.alert("Could not load places",e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let mounted = true;
    async function restoreSession() {
      try {
        const savedToken = await AsyncStorage.getItem("pinpoint_session_token");
        if (!savedToken) return;
        const result = await api.me(savedToken);
        if (!mounted) return;
        if (!result.user) throw new Error("Session is no longer valid");
        setUser(result.user);
        setToken(savedToken);
      } catch (_) {
        await AsyncStorage.multiRemove(["pinpoint_session_token"]);
        if (mounted) {
          setToken("");
          setUser(null);
        }
      } finally {
        if (mounted) setSessionChecking(false);
      }
    }
    restoreSession();
    return () => { mounted = false; };
  }, []);
  useEffect(() => { if(token) { loadLocations(token); loadCategories(token); } },[token]);

  async function submitAuth() {
    if(!auth.email.trim() || !auth.password) return Alert.alert("Missing details","Enter your email and password.");
    if(authMode === "register" && (!auth.name.trim() || auth.password.length < 8)) return Alert.alert("Check details","Enter your name and a password of at least 8 characters.");
    setBusy(true);
    try {
      const result = authMode === "login" ? await api.login({email:auth.email.trim(),password:auth.password}) : await api.register({name:auth.name.trim(),email:auth.email.trim(),password:auth.password});
      await AsyncStorage.setItem("pinpoint_session_token", result.token);
      setToken(result.token); setUser(result.user); setTab("Home");
    } catch(e) { Alert.alert("Authentication failed",e.message); }
    finally { setBusy(false); }
  }
  async function submitMpinLogin() {
    if (!loginMpinEmail.trim()) return Alert.alert("Email required","Enter the email linked to your Pinpoint account.");
    if (!/^\d{6}$/.test(loginMpin)) return Alert.alert("Invalid MPIN","Enter your 6-digit MPIN.");
    setBusy(true);
    try {
      const result = await api.loginWithMpin(loginMpinEmail.trim(),loginMpin);
      await AsyncStorage.setItem("pinpoint_session_token", result.token);
      setToken(result.token); setUser(result.user); setTab("Home"); setLoginMpin(""); setLoginMpinEmail("");
    } catch(e) { Alert.alert("MPIN sign-in failed",e.message); }
    finally { setBusy(false); }
  }
  async function saveMpin() {
    if (!/^\d{6}$/.test(mpinForm.mpin)) return Alert.alert("Invalid MPIN","Choose exactly 6 digits.");
    if (mpinForm.mpin !== mpinForm.confirmMpin) return Alert.alert("MPIN mismatch","Both MPIN entries must match.");
    if (!mpinForm.currentPassword) return Alert.alert("Password required","Enter your current account password.");
    setBusy(true);
    try {
      const result = await api.setMpin(token,mpinForm);
      setUser(current=>({...current,hasMpin:true}));
      setMpinForm({mpin:"",confirmMpin:"",currentPassword:""});
      setShowMpinForm(false);
      Alert.alert("MPIN saved",result.message || "You can now sign in using your MPIN.");
    } catch(e) { Alert.alert("Could not save MPIN",e.message); }
    finally { setBusy(false); }
  }
  async function loadNearby() {
    setNearbyLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if(permission.status !== "granted") { Alert.alert("Location permission","Allow location access to find places near you."); return; }
      const current = await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
      const result = await api.getNearbyLocations(token,current.coords.latitude,current.coords.longitude,nearbyRadius);
      setNearbyLocations(result.locations || []);
    } catch(e) { Alert.alert("Nearby places unavailable",e.message); }
    finally { setNearbyLoading(false); }
  }
  async function locateMe() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if(permission.status !== "granted") return Alert.alert("Location permission","Allow location access to capture a place when you choose.");
      const current = await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
      selectPosition({latitude:current.coords.latitude,longitude:current.coords.longitude});
    } catch(e) { Alert.alert("Location unavailable",e.message); }
  }
  function newPlace() {
    setEditingId(null);
    setForm({title:"",category:(categories[0] && categories[0].name) || "Food",address:"",notes:"",isPublic:false});
    setShowCustomCategory(false); setCustomCategoryName(""); setCategoryDropdownOpen(false);
    setPosition(null); setTab("Capture");
  }
  function editPlace(item) {
    const coords = item.coordinates && item.coordinates.coordinates || [];
    setEditingId(item._id); setForm({title:item.title || "",category:item.category || "Other",address:item.address || "",notes:item.notes || "",isPublic:item.isPublic === true});
    setShowCustomCategory(false); setCustomCategoryName(""); setCategoryDropdownOpen(false);
    const existingPosition = coords.length === 2 ? {latitude:coords[1],longitude:coords[0]} : null;
    setPosition(existingPosition); setTab("Capture");
  }
  async function addCustomCategory() {
    const name = customCategoryName.trim().replace(/\s+/g, " ");
    if (!name) return Alert.alert("Enter a category","Type a category name first.");
    if (name.length > 50) return Alert.alert("Category too long","Use 50 characters or fewer.");
    setBusy(true);
    try {
      const result = await api.createCategory(token,{name});
      const saved = result.data || {name};
      await loadCategories(token);
      setForm(current=>({...current,category:saved.name || name}));
      setShowCustomCategory(false); setCategoryDropdownOpen(false); setCustomCategoryName("");
      Alert.alert(result.alreadyExists ? "Category already available" : "Category added",result.alreadyExists ? "An existing category with the same name has been selected." : "This category is now available in the category dropdown.");
    } catch(e) { Alert.alert("Could not add category",e.message); }
    finally { setBusy(false); }
  }
  async function geocodeAddress() {
    const address = form.address.trim();
    if(!address) return Alert.alert("Enter an address","Add a full address before finding its coordinates.");
    setBusy(true);
    try {
      const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=5`, {
        headers: { Accept: "application/json" }
      });
      if(!response.ok) throw new Error("Address search service is temporarily unavailable.");
      const data = await response.json();
      const feature = data && data.features && data.features[0];
      const coordinates = feature && feature.geometry && feature.geometry.coordinates;
      if(!coordinates || coordinates.length < 2) {
        return Alert.alert("Address not found","Try adding the area, city, state and PIN code, then search again.");
      }
      const [longitude, latitude] = coordinates;
      if(!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return Alert.alert("Address not found","We couldn't get valid coordinates for this address. Please try a more complete address.");
      }
      selectPosition({ latitude, longitude });
      Alert.alert("Address located","The map has moved to the matching location. Drag the pin to fine-tune it.");
    } catch(e) {
      Alert.alert("Address search failed",e.message || "Check your internet connection and try again.");
    } finally { setBusy(false); }
  }
  async function savePlace() {
    if(!form.title.trim()) return Alert.alert("Add a title","Enter a name for this place.");
    if(!position) return Alert.alert("Choose a location","Use current GPS or find coordinates from the address.");
    setBusy(true);
    const details = {title:form.title.trim(),category:form.category.trim() || "Other",address:form.address.trim(),notes:form.notes.trim(),isPublic:form.isPublic,coordinates:{type:"Point",coordinates:[position.longitude,position.latitude]}};
    try {
      if(editingId) await api.updateLocation(token,editingId,details); else await api.createLocation(token,details);
      await loadLocations(token); setForm({title:"",category:(categories[0] && categories[0].name) || "Food",address:"",notes:"",isPublic:false}); setPosition(null); setShowCustomCategory(false); setCategoryDropdownOpen(false); setEditingId(null); setTab("Places");
      Alert.alert(editingId ? "Place updated" : "Place saved","Your place is safely stored in Pinpoint.");
    } catch(e) { Alert.alert("Could not save",e.message); }
    finally { setBusy(false); }
  }
  function deletePlace(id) {
    Alert.alert("Delete place?","This action cannot be undone.",[
      {text:"Cancel",style:"cancel"},
      {text:"Delete",style:"destructive",onPress:async()=>{try{await api.deleteLocation(token,id);await loadLocations(token);}catch(e){Alert.alert("Delete failed",e.message);}}}
    ]);
  }

  function requestAccountDeletion() {
    Alert.alert(
      "⚠️ Permanently delete your account?",
      "Your account will be permanently disabled. You will lose access to Pinpoint and will not be able to sign in again. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate account", style: "destructive", onPress: async () => {
          setBusy(true);
          try {
            await api.deleteAccount(token);
            await AsyncStorage.multiRemove(["pinpoint_session_token"]);
            setToken(""); setUser(null); setLocations([]); setNearbyLocations([]);
            setTab("Home"); setAuth({name:"",email:"",password:""});
            Alert.alert("Account deactivated","Your Pinpoint account has been deactivated. You can no longer sign in.");
          } catch (e) {
            Alert.alert("Could not deactivate account",e.message);
          } finally { setBusy(false); }
        }}
      ]
    );
  }
  const categoryNames = useMemo(() => {
    const names = [...categories.map(item=>typeof item === "string" ? item : item.name), ...locations.map(item=>item.category), ...DEFAULT_CATEGORIES].filter(Boolean);
    const seen = new Set();
    return names.filter(name=>{
      const key=String(name).trim().toLocaleLowerCase();
      if(!key || seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a,b)=>String(a).localeCompare(String(b)));
  },[categories,locations]);
  const categoryOptions = useMemo(() => ["All", ...new Set([...DEFAULT_CATEGORIES, ...locations.map(item => item.category).filter(Boolean)])], [locations]);
  const filtered = useMemo(() => locations.filter(item => {
    const matchCat = category === "All" || (item.category || "Other").toLowerCase() === category.toLowerCase();
    const q = search.trim().toLowerCase();
    const matchText = !q || [item.title,item.category,item.address,item.notes].some(v => String(v || "").toLowerCase().includes(q));
    return matchCat && matchText;
  }),[locations,category,search]);

  if(sessionChecking) return <SafeAreaView style={[s.safe,{alignItems:"center",justifyContent:"center"}]}><ActivityIndicator size="large" color={C.coral}/><Text style={{color:C.muted,marginTop:12,fontSize:12}}>Restoring your session…</Text></SafeAreaView>;

  if(!token) return <SafeAreaView style={s.safe}>
    <ExpoStatusBar style="dark" />
    <KeyboardAvoidingView style={s.authScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.authContent} keyboardShouldPersistTaps="handled">
        <View style={s.brandMark}><Text style={s.brandMarkText}>➤</Text></View>
        <Text style={s.brandWord}>PINPOINT</Text>
        <Text style={s.authTitle}>Your places,{"\n"}remembered.</Text>
        <Text style={s.authSub}>Capture the spots worth coming back to, with exact GPS coordinates.</Text>
        {authMode === "login" && <View style={s.categoryChoices}>
          <TouchableOpacity style={[s.categoryChoice,loginMethod==="password" && s.categoryChoiceActive]} onPress={()=>setLoginMethod("password")}><Text style={[s.categoryChoiceText,loginMethod==="password" && s.categoryChoiceTextActive]}>Email & Password</Text></TouchableOpacity>
          <TouchableOpacity style={[s.categoryChoice,loginMethod==="mpin" && s.categoryChoiceActive]} onPress={()=>setLoginMethod("mpin")}><Text style={[s.categoryChoiceText,loginMethod==="mpin" && s.categoryChoiceTextActive]}>MPIN</Text></TouchableOpacity>
        </View>}
        {authMode === "register" || loginMethod === "password" ? <>
          {authMode === "register" && <View><Text style={s.label}>Your name</Text><Field placeholder="Your name" value={auth.name} onChangeText={v=>setAuth({...auth,name:v})}/></View>}
          <Text style={s.label}>Email address</Text>
          <Field placeholder="you@example.com" value={auth.email} onChangeText={v=>setAuth({...auth,email:v})} keyboardType="email-address"/>
          <Text style={s.label}>Password</Text>
          <Field placeholder="At least 8 characters" value={auth.password} onChangeText={v=>setAuth({...auth,password:v})} secureTextEntry/>
          <Button title={busy ? "Please wait..." : authMode === "login" ? "Sign in" : "Create account"} onPress={submitAuth} disabled={busy}/>
        </> : <>
          <Text style={s.label}>Email address</Text>
          <Field placeholder="you@example.com" value={loginMpinEmail} onChangeText={setLoginMpinEmail} keyboardType="email-address"/>
          <Text style={s.label}>6-digit MPIN</Text>
          <Field placeholder="Enter your MPIN" value={loginMpin} onChangeText={v=>setLoginMpin(v.replace(/\D/g,"").slice(0,6))} keyboardType="numeric" secureTextEntry/>
          <Button title={busy ? "Please wait..." : "Sign in with MPIN"} onPress={submitMpinLogin} disabled={busy}/>
        </>}
        <TouchableOpacity style={s.authSwitch} onPress={()=>setAuthMode(authMode === "login" ? "register" : "login")}>
          <Text style={s.authSwitchText}>{authMode === "login" ? "New to Pinpoint? Create an account" : "Already have an account? Sign in"}</Text>
        </TouchableOpacity>
        <Text style={s.privacy}>♙  Your saved places stay connected to your account.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;

  const firstName = user && user.name ? user.name.trim().split(" ")[0] : "there";
  const recent = locations.slice(0,3);
  return <SafeAreaView style={s.safe}>
    <ExpoStatusBar style="dark"/>
    {tab === "Home" && <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.eyebrow}>YOUR LOGBOOK</Text>
      <Text style={s.homeTitle}>Good to see you, {firstName}.</Text>
      <View style={s.logCard}>
        <Text style={s.logLabel}>PLACES IN YOUR LOG</Text><Text style={s.logCount}>{locations.length}</Text>
        <Text style={s.logHint}>{locations.length === 0 ? "Your first pin is waiting" : "Memories, mapped and remembered."}</Text>
        <View style={s.orbitOne}/><View style={s.orbitTwo}/><View style={s.compass}><Text style={s.compassText}>➤</Text></View>
      </View>
      <Button title="Capture current location" icon="＋" onPress={()=>{newPlace();locateMe();}}/>
      <View style={s.sectionHead}><Text style={s.sectionTitle}>Recently saved</Text><TouchableOpacity onPress={()=>setTab("Places")}><Text style={s.viewAll}>View all</Text></TouchableOpacity></View>
      {loading ? <ActivityIndicator color={C.coral} style={{marginTop:24}}/> : recent.length ? recent.map(item=><PlaceCard key={item._id} item={item} showActions={item.isOwner === true} onEdit={editPlace} onDelete={deletePlace}/>) : <View style={s.empty}><Text style={s.emptyIcon}>◫</Text><Text style={s.emptyText}>No locations logged yet</Text></View>}
    </ScrollView>}

    {tab === "Places" && <View style={s.screen}>
      <Text style={s.placesTitle}>Places</Text><Text style={s.placesSub}>Your saved places and public places shared by the Pinpoint community.</Text>
      <View style={s.searchBox}><Text style={s.searchIcon}>⌕</Text><TextInput value={search} onChangeText={setSearch} placeholder="Search places or offers" placeholderTextColor={C.muted} style={s.searchInput}/></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipRow}>
        {categoryOptions.map(item=><TouchableOpacity key={item} onPress={()=>setCategory(item)} style={[s.chip,category===item && s.chipActive]}><Text style={[s.chipText,category===item && s.chipTextActive]}>{item}</Text></TouchableOpacity>)}
      </ScrollView>
      <Text style={s.resultCount}>{filtered.length} {filtered.length === 1 ? "place" : "places"}</Text>
      {loading ? <ActivityIndicator color={C.coral} style={{marginTop:24}}/> : <FlatList data={filtered} keyExtractor={item=>item._id} renderItem={({item})=><PlaceCard item={item} showActions={item.isOwner === true} onEdit={editPlace} onDelete={deletePlace}/>} ListEmptyComponent={<View style={s.empty}><Text style={s.emptyIcon}>◫</Text><Text style={s.emptyText}>No places found. Save your first place.</Text></View>} refreshing={loading} onRefresh={()=>loadLocations(token)}/>}
      <TouchableOpacity style={s.fab} onPress={newPlace}><Text style={s.fabText}>＋</Text></TouchableOpacity>
    </View>}

    {tab === "Capture" && <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" scrollEnabled={!mapInteracting}>
        <TouchableOpacity onPress={()=>setTab("Home")}><Text style={s.back}>‹  Back</Text></TouchableOpacity>
        <Text style={s.placesTitle}>{editingId ? "Edit place" : "Save a place"}</Text><Text style={s.placesSub}>Keep the details you want to remember.</Text>
        <Text style={s.label}>Place name</Text><Field placeholder="e.g. Hidden Gem Cafe" value={form.title} onChangeText={v=>setForm({...form,title:v})}/>
        <Text style={s.label}>Choose a category</Text>
        <TouchableOpacity style={s.categoryDropdown} onPress={()=>{setCategoryDropdownOpen(!categoryDropdownOpen);if(!categories.length)loadCategories(token);}}>
          <Text style={s.categoryDropdownText}>{form.category || "Select category"}</Text>
          <Text style={s.categoryDropdownArrow}>{categoryDropdownOpen ? "⌃" : "⌄"}</Text>
        </TouchableOpacity>
        {categoryDropdownOpen && <View style={s.categoryDropdownMenu}>
          <ScrollView nestedScrollEnabled style={s.categoryDropdownScroll}>
            {categoryLoading && !categoryNames.length && <Text style={s.categoryLoadingText}>Loading saved categories…</Text>}
            {categoryNames.map(item=><TouchableOpacity key={item} onPress={()=>{setForm({...form,category:item});setCategoryDropdownOpen(false);setShowCustomCategory(false);}} style={s.categoryDropdownOption}>
              <Text style={[s.categoryDropdownOptionText,form.category.toLowerCase()===String(item).toLowerCase() && s.categoryDropdownSelected]}>{item}</Text>
              {form.category.toLowerCase()===String(item).toLowerCase() && <Text style={s.categoryDropdownCheck}>✓</Text>}
            </TouchableOpacity>)}
          </ScrollView>
          <TouchableOpacity style={s.addCategoryOption} onPress={()=>setShowCustomCategory(!showCustomCategory)}>
            <Text style={s.addCategoryText}>＋ Add custom category</Text>
          </TouchableOpacity>
          {showCustomCategory && <View style={s.customCategoryBox}>
            <Field placeholder="Enter new category name" value={customCategoryName} onChangeText={setCustomCategoryName}/>
            <Button title={busy ? "Saving category..." : "Save category"} onPress={addCustomCategory} disabled={busy}/>
          </View>}
        </View>}
        <Text style={s.label}>Who can see this place?</Text>
        <View style={s.categoryChoices}>
          <TouchableOpacity onPress={()=>setForm({...form,isPublic:false})} style={[s.categoryChoice,!form.isPublic && s.categoryChoiceActive]}><Text style={[s.categoryChoiceText,!form.isPublic && s.categoryChoiceTextActive]}>🔒 Private</Text></TouchableOpacity>
          <TouchableOpacity onPress={()=>setForm({...form,isPublic:true})} style={[s.categoryChoice,form.isPublic && s.categoryChoiceActive]}><Text style={[s.categoryChoiceText,form.isPublic && s.categoryChoiceTextActive]}>🌐 Public</Text></TouchableOpacity>
        </View>
        <Text style={s.privacyBody}>{form.isPublic ? "Anyone using Pinpoint can discover this place in Nearby. Your account details are not displayed as part of the place card." : "Only you can see this place. It will not appear in other users’ Nearby results."}</Text>
        <Text style={s.label}>Full address (optional)</Text><Field placeholder="Building, street, area, city, state, PIN code" value={form.address} onChangeText={v=>setForm({...form,address:v})} multiline/>
        <Button title={busy ? "Finding address..." : "Find location from address"} icon="⌖" onPress={geocodeAddress} disabled={busy}/>
        <Text style={s.label}>Select the exact point on the map</Text>
        <Text style={s.mapHint}>Tap anywhere on the map to place the pin. You can also drag the pin to fine-tune its position.</Text>
        <View style={s.mapFrame}>
          <MapView
            ref={mapRef}
            style={s.map}
            initialRegion={{
              latitude: position ? position.latitude : 23.0225,
              longitude: position ? position.longitude : 72.5714,
              latitudeDelta: position ? 0.012 : 0.08,
              longitudeDelta: position ? 0.012 : 0.08
            }}
            onPress={event=>selectPosition(event.nativeEvent.coordinate)}
            onTouchStart={()=>setMapInteracting(true)}
            onTouchEnd={()=>setMapInteracting(false)}
            showsCompass
            showsScale
            toolbarEnabled
            zoomEnabled
            scrollEnabled
            nestedScrollEnabled
          >
            {position && <Marker
              coordinate={position}
              draggable
              title={form.title || "Selected place"}
              description="Drag to adjust this exact location"
              onDragEnd={event=>selectPosition(event.nativeEvent.coordinate)}
              pinColor={C.coral}
            />}
          </MapView>
          {!position && <View pointerEvents="none" style={s.mapOverlay}><Text style={s.mapOverlayText}>Tap the map to drop a pin</Text></View>}
        </View>
        <Text style={s.locationStatus}>{position ? "Selected pin: "+position.latitude.toFixed(6)+", "+position.longitude.toFixed(6) : "No pin selected yet."}</Text>
        <View style={s.mapButtons}>
          <View style={s.mapButtonCell}><Button title="Use current GPS" icon="◎" onPress={locateMe}/></View>
        </View>
        <Button title={busy ? "Saving..." : editingId ? "Update place" : "Save place"} onPress={savePlace} disabled={busy}/>
      </ScrollView>
    </KeyboardAvoidingView>}

    {tab === "Nearby" && <View style={s.screen}>
      <Text style={s.placesTitle}>Nearby places</Text><Text style={s.placesSub}>Discover places around your current location.</Text>
      <View style={s.categoryChoices}>{[{label:"1 km",value:1000},{label:"5 km",value:5000},{label:"10 km",value:10000},{label:"25 km",value:25000}].map(r=><TouchableOpacity key={r.value} onPress={()=>setNearbyRadius(r.value)} style={[s.categoryChoice,nearbyRadius===r.value && s.categoryChoiceActive]}><Text style={[s.categoryChoiceText,nearbyRadius===r.value && s.categoryChoiceTextActive]}>{r.label}</Text></TouchableOpacity>)}</View>
      <Text style={s.label}>Custom distance (km)</Text>
      <View style={s.customRadiusRow}>
        <TextInput
          value={nearbyCustomKm}
          onChangeText={value=>setNearbyCustomKm(value.replace(/[^0-9.]/g,""))}
          placeholder="Enter any distance, e.g. 60 or 70"
          placeholderTextColor={C.muted}
          keyboardType="decimal-pad"
          style={s.customRadiusInput}
        />
        <TouchableOpacity style={s.customRadiusApply} onPress={()=>{
          const km=Number(nearbyCustomKm);
          if(!nearbyCustomKm.trim() || !Number.isFinite(km) || km<1 || km>1000) return Alert.alert("Invalid distance","Enter a distance from 1 to 1,000 km.");
          setNearbyRadius(Math.round(km*1000));
        }}>
          <Text style={s.customRadiusApplyText}>Apply</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.locationStatus}>Choose 1–25 km above or enter a custom distance up to 1,000 km.</Text>
      <Button title={nearbyLoading ? "Finding nearby places..." : "⌖  Find places near me"} onPress={loadNearby} disabled={nearbyLoading}/>
      <Text style={s.resultCount}>{nearbyLocations.length} {nearbyLocations.length===1 ? "place" : "places"} within {nearbyRadius/1000} km</Text>
      {nearbyLoading ? <ActivityIndicator color={C.coral} style={{marginTop:24}}/> : <FlatList data={nearbyLocations} keyExtractor={item=>item._id} renderItem={({item})=><PlaceCard item={item} showActions={false}/>} ListEmptyComponent={<View style={s.empty}><Text style={s.emptyIcon}>⌖</Text><Text style={s.emptyText}>Tap “Find places near me” to discover nearby saved places.</Text></View>} refreshing={nearbyLoading} onRefresh={loadNearby}/>}
    </View>}

    {tab === "Reminders" && <View style={s.screen}><Text style={s.placesTitle}>Reminders</Text><Text style={s.placesSub}>A little nudge to revisit the places that matter.</Text><View style={s.empty}><Text style={s.emptyIcon}>♧</Text><Text style={s.emptyText}>No reminders yet</Text><Text style={s.reminderHint}>Reminder scheduling is coming soon.</Text></View></View>}

    {tab === "Profile" && <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}><ScrollView contentContainerStyle={{paddingBottom:32}} keyboardShouldPersistTaps="handled"><Text style={s.placesTitle}>Profile</Text><Text style={s.placesSub}>Your Pinpoint account and preferences.</Text>
      <View style={s.profileCard}><View style={s.avatar}><Text style={s.avatarText}>{firstName.charAt(0).toUpperCase()}</Text></View><Text style={s.profileName}>{user && user.name || "Pinpoint user"}</Text><Text style={s.profileEmail}>{user && user.email || ""}</Text></View>
      <View style={s.privacyCard}><Text style={s.privacyTitle}>Your places are private</Text><Text style={s.privacyBody}>Your saved locations stay connected to your account. You choose when to share them.</Text></View>
      <View style={s.mpinCard}>
        <Text style={s.privacyTitle}>Mobile MPIN</Text>
        <Text style={s.privacyBody}>{user && user.hasMpin ? "Your unique 6-digit MPIN is active. You can change it anytime." : "Create a unique 6-digit MPIN to sign in faster on mobile."}</Text>
        {!showMpinForm ? <TouchableOpacity style={s.mpinAction} onPress={()=>setShowMpinForm(true)}><Text style={s.mpinActionText}>{user && user.hasMpin ? "Change MPIN" : "Set up MPIN"}</Text></TouchableOpacity> : <>
          <Text style={s.label}>New 6-digit MPIN</Text>
          <Field placeholder="Enter 6 digits" value={mpinForm.mpin} onChangeText={v=>setMpinForm({...mpinForm,mpin:v.replace(/\D/g,"").slice(0,6)})} keyboardType="numeric" secureTextEntry/>
          <Text style={s.label}>Confirm MPIN</Text>
          <Field placeholder="Re-enter MPIN" value={mpinForm.confirmMpin} onChangeText={v=>setMpinForm({...mpinForm,confirmMpin:v.replace(/\D/g,"").slice(0,6)})} keyboardType="numeric" secureTextEntry/>
          <Text style={s.label}>Current account password</Text>
          <Field placeholder="Verify your password" value={mpinForm.currentPassword} onChangeText={v=>setMpinForm({...mpinForm,currentPassword:v})} secureTextEntry/>
          <Button title={busy ? "Saving..." : "Save MPIN"} onPress={saveMpin} disabled={busy}/>
          <TouchableOpacity style={s.authSwitch} onPress={()=>{setShowMpinForm(false);setMpinForm({mpin:"",confirmMpin:"",currentPassword:""});}}><Text style={s.authSwitchText}>Cancel</Text></TouchableOpacity>
        </>}
      </View>
      <TouchableOpacity style={s.logout} onPress={async()=>{await AsyncStorage.multiRemove(["pinpoint_session_token"]);setToken("");setUser(null);setLocations([]);setNearbyLocations([]);setTab("Home");setAuth({name:"",email:"",password:""});}}><Text style={s.logoutText}>Sign out</Text></TouchableOpacity>
      <View style={s.dangerZone}>
        <Text style={s.dangerTitle}>Danger zone</Text>
        <Text style={s.dangerDescription}>Permanently disable your Pinpoint account. You will lose access and will not be able to sign in again.</Text>
        <TouchableOpacity style={s.deleteAccountButton} onPress={requestAccountDeletion} disabled={busy}>
          <Text style={s.deleteAccountText}>{busy ? "Please wait…" : "⚠️  Delete my account"}</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>}
    <View style={s.tabs}>
      <TabButton icon="⌂" label="Home" active={tab==="Home"} onPress={()=>setTab("Home")}/>
      <TabButton icon="◫" label="Places" active={tab==="Places"} onPress={()=>setTab("Places")}/>
      <TabButton icon="⌖" label="Nearby" active={tab==="Nearby"} onPress={()=>setTab("Nearby")}/>
      <TabButton icon="♧" label="Reminders" active={tab==="Reminders"} onPress={()=>setTab("Reminders")}/>
      <TabButton icon="♙" label="Profile" active={tab==="Profile"} onPress={()=>setTab("Profile")}/>
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
 safe:{flex:1,backgroundColor:C.paper,paddingTop:Platform.OS==="android"?StatusBar.currentHeight:0},
 authScreen:{flex:1},authContent:{flexGrow:1,justifyContent:"center",paddingHorizontal:27,paddingVertical:36},
 brandMark:{width:54,height:54,borderRadius:17,backgroundColor:C.coral,alignItems:"center",justifyContent:"center",marginBottom:18},
 brandMarkText:{color:C.white,fontSize:30,fontWeight:"800",transform:[{rotate:"-15deg"}]},
 brandWord:{color:"#A86C52",fontSize:12,letterSpacing:1.5,fontWeight:"800",marginBottom:12},
 authTitle:{color:C.ink,fontSize:31,lineHeight:37,fontWeight:"800",letterSpacing:-0.7,marginBottom:10},
 authSub:{color:C.muted,fontSize:15,lineHeight:22,marginBottom:28},
 label:{color:"#393A35",fontSize:12,fontWeight:"700",marginBottom:7,marginTop:8},
 input:{backgroundColor:"#F2F1EB",borderWidth:1,borderColor:"#E6E4DC",borderRadius:14,paddingHorizontal:14,paddingVertical:14,fontSize:14,color:C.ink,marginBottom:10},
 multiline:{minHeight:105,textAlignVertical:"top"},
 button:{backgroundColor:C.coral,borderRadius:15,minHeight:49,paddingHorizontal:18,paddingVertical:14,alignItems:"center",justifyContent:"center",flexDirection:"row",marginTop:10,marginBottom:8},
 buttonText:{color:C.white,fontSize:14,fontWeight:"800"},buttonIcon:{color:C.white,fontSize:19,marginRight:8},
 authSwitch:{alignItems:"center",paddingVertical:18},authSwitchText:{color:"#A95F45",fontSize:13,fontWeight:"700"},
 privacy:{textAlign:"center",color:C.muted,fontSize:11,marginTop:12},
 screen:{flex:1,paddingHorizontal:18,paddingTop:17,paddingBottom:10},
 eyebrow:{color:C.muted,fontSize:11,letterSpacing:1,fontWeight:"800",marginBottom:7},
 homeTitle:{color:C.ink,fontSize:25,fontWeight:"800",letterSpacing:-0.5,marginBottom:24},
 logCard:{height:218,borderRadius:23,backgroundColor:C.dark,padding:20,overflow:"hidden",marginBottom:13},
 logLabel:{color:"#F3F1E9",fontSize:11,fontWeight:"800",letterSpacing:0.6},logCount:{color:C.white,fontSize:42,fontWeight:"800",marginTop:7},
 logHint:{color:"#B8B8B0",fontSize:12,marginTop:1},
 orbitOne:{position:"absolute",width:245,height:170,borderRadius:120,borderWidth:1,borderColor:"rgba(255,255,255,0.09)",right:-8,top:35},
 orbitTwo:{position:"absolute",width:180,height:180,borderRadius:100,borderWidth:1,borderColor:"rgba(255,255,255,0.08)",right:55,top:28},
 compass:{position:"absolute",width:32,height:32,borderRadius:16,backgroundColor:C.coral,alignItems:"center",justifyContent:"center",top:107,right:"43%"},
 compassText:{color:C.white,fontSize:17,transform:[{rotate:"-15deg"}]},
 sectionHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:27,marginBottom:14},
 sectionTitle:{color:C.ink,fontSize:17,fontWeight:"800"},viewAll:{color:"#A9674F",fontSize:12,fontWeight:"700"},
 empty:{alignItems:"center",justifyContent:"center",paddingVertical:35},emptyIcon:{color:"#A5A69E",fontSize:34,marginBottom:8},emptyText:{color:C.muted,fontSize:13,textAlign:"center"},
 placesTitle:{color:C.ink,fontSize:27,fontWeight:"800",letterSpacing:-0.6},placesSub:{color:C.muted,fontSize:13,marginTop:4,marginBottom:16},
 searchBox:{height:46,borderRadius:14,backgroundColor:"#F2F1EB",borderWidth:1,borderColor:C.line,flexDirection:"row",alignItems:"center",paddingHorizontal:13},
 searchIcon:{fontSize:23,color:C.muted,marginRight:8},searchInput:{flex:1,color:C.ink,fontSize:13,paddingVertical:8},
 chipScroll:{height:56,flexGrow:0,marginTop:13,marginBottom:13},chipRow:{height:56,alignItems:"center",paddingRight:12},
 chip:{height:40,minWidth:64,justifyContent:"center",alignItems:"center",backgroundColor:"#EEEDE6",borderRadius:20,paddingHorizontal:16,marginRight:7},chipActive:{backgroundColor:C.coral},
 chipText:{color:"#55564F",fontSize:12,lineHeight:16,fontWeight:"700",includeFontPadding:false},chipTextActive:{color:C.white},resultCount:{color:C.muted,fontSize:11,marginBottom:11},
 placeCard:{backgroundColor:"#F5F4EE",borderRadius:17,borderWidth:1,borderColor:"#E9E7DE",padding:13,flexDirection:"row",alignItems:"center",marginBottom:10,minHeight:82},
 pin:{width:36,height:36,borderRadius:18,backgroundColor:C.coralPale,alignItems:"center",justifyContent:"center",marginRight:10},pinText:{color:C.coral,fontSize:22},
 placeInfo:{flex:1},placeTitle:{color:C.ink,fontSize:13,fontWeight:"800"},placeCategory:{color:"#B36F53",fontSize:11,fontWeight:"700",marginTop:3},communityTag:{color:"#5A8066",fontSize:8,fontWeight:"800",letterSpacing:0.35,marginTop:4},
 notes:{color:"#67675F",fontSize:11,marginTop:4},coords:{color:C.muted,fontSize:10,marginTop:7},
 actions:{flexDirection:"row",marginLeft:5},action:{padding:6,marginLeft:3},mapAction:{color:C.coral,fontSize:20,fontWeight:"800"},edit:{color:"#8A8D83",fontSize:18,fontWeight:"700"},delete:{color:C.red,fontSize:22},
 fab:{position:"absolute",right:23,bottom:18,width:52,height:52,borderRadius:26,backgroundColor:C.coral,alignItems:"center",justifyContent:"center",elevation:4},fabText:{color:C.white,fontSize:28,lineHeight:32},
 tabs:{flexDirection:"row",backgroundColor:C.paper,borderTopWidth:1,borderTopColor:C.line,paddingTop:9,paddingBottom:Platform.OS==="ios"?18:10},
 tabButton:{flex:1,alignItems:"center",justifyContent:"center"},tabIcon:{color:"#96978F",fontSize:22,marginBottom:2},tabLabel:{color:"#96978F",fontSize:10},active:{color:C.coral,fontWeight:"800"},
 back:{color:"#A9674F",fontWeight:"700",marginBottom:17,fontSize:14},locationStatus:{color:C.muted,fontSize:11,textAlign:"center",marginVertical:8},
 customRadiusRow:{flexDirection:"row",alignItems:"center",gap:8,marginBottom:3},
 customRadiusInput:{flex:1,backgroundColor:"#F2F1EB",borderWidth:1,borderColor:"#E6E4DC",borderRadius:14,paddingHorizontal:14,paddingVertical:13,fontSize:13,color:C.ink},
 customRadiusApply:{backgroundColor:C.dark,borderRadius:13,paddingHorizontal:20,paddingVertical:14,alignItems:"center",justifyContent:"center"},
 customRadiusApplyText:{color:C.white,fontSize:12,fontWeight:"800"},
 reminderHint:{color:C.muted,fontSize:11,marginTop:8},profileCard:{backgroundColor:C.white,borderRadius:18,borderWidth:1,borderColor:C.line,alignItems:"center",padding:24,marginTop:12},
 avatar:{width:58,height:58,borderRadius:29,backgroundColor:C.coralPale,alignItems:"center",justifyContent:"center",marginBottom:10},avatarText:{color:C.coral,fontSize:24,fontWeight:"800"},
 profileName:{color:C.ink,fontSize:16,fontWeight:"800"},profileEmail:{color:C.muted,fontSize:12,marginTop:4},
 privacyCard:{backgroundColor:"#F2F1EB",borderRadius:16,padding:16,marginTop:14},mpinCard:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:16,padding:16,marginTop:14},mpinAction:{borderRadius:12,backgroundColor:C.coralPale,padding:12,alignItems:"center",marginTop:12},mpinActionText:{color:C.coral,fontSize:12,fontWeight:"800"},privacyTitle:{color:C.ink,fontSize:13,fontWeight:"800",marginBottom:5},
 privacyBody:{color:C.muted,fontSize:12,lineHeight:18},dangerZone:{backgroundColor:"#FFF3F0",borderWidth:1,borderColor:"#EBC5BD",borderRadius:16,padding:16,marginTop:18},dangerTitle:{color:"#9F3F35",fontSize:13,fontWeight:"800",marginBottom:5},dangerDescription:{color:"#8D5B55",fontSize:11,lineHeight:17},deleteAccountButton:{borderWidth:1,borderColor:"#B7443C",borderRadius:12,padding:13,alignItems:"center",marginTop:12,backgroundColor:"#FFF9F7"},deleteAccountText:{color:"#B7443C",fontSize:12,fontWeight:"800"},logout:{borderWidth:1,borderColor:C.line,borderRadius:14,padding:14,alignItems:"center",marginTop:18},logoutText:{color:C.red,fontSize:13,fontWeight:"800"},
 categoryDropdown:{backgroundColor:"#F2F1EB",borderWidth:1,borderColor:"#E6E4DC",borderRadius:14,paddingHorizontal:14,paddingVertical:14,marginBottom:8,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 categoryDropdownText:{color:C.ink,fontSize:14,fontWeight:"600"},categoryDropdownArrow:{color:C.muted,fontSize:18},
 categoryDropdownMenu:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:14,marginBottom:12,overflow:"hidden"},
 categoryDropdownScroll:{maxHeight:210},
 categoryLoadingText:{color:C.muted,fontSize:11,padding:13},
 categoryDropdownOption:{paddingHorizontal:15,paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#F0EFE9",flexDirection:"row",justifyContent:"space-between"},
 categoryDropdownOptionText:{color:C.ink,fontSize:13},categoryDropdownSelected:{color:C.coral,fontWeight:"800"},categoryDropdownCheck:{color:C.coral,fontWeight:"800"},
 addCategoryOption:{padding:13,backgroundColor:"#FBF3EF"},addCategoryText:{color:C.coral,fontWeight:"800",fontSize:12},
 customCategoryBox:{padding:12,borderTopWidth:1,borderTopColor:C.line},
 categoryChoices:{flexDirection:"row",flexWrap:"wrap",marginBottom:8},categoryChoice:{backgroundColor:"#EEEDE6",borderRadius:18,paddingHorizontal:14,paddingVertical:10,marginRight:7,marginBottom:8,borderWidth:1,borderColor:"transparent"},categoryChoiceActive:{backgroundColor:C.coral,borderColor:C.coral},categoryChoiceText:{color:"#55564F",fontSize:12,fontWeight:"700"},categoryChoiceTextActive:{color:C.white},

 mapHint:{color:C.muted,fontSize:11,lineHeight:16,marginTop:-2,marginBottom:9},
 mapFrame:{height:275,borderRadius:17,overflow:"hidden",borderWidth:1,borderColor:C.line,backgroundColor:"#EEEDE6"},
 map:{flex:1},
 mapOverlay:{position:"absolute",top:12,left:12,right:12,alignItems:"center"},
 mapOverlayText:{backgroundColor:"rgba(32,33,31,0.82)",color:C.white,fontSize:11,fontWeight:"700",paddingHorizontal:13,paddingVertical:8,borderRadius:18},
 mapButtons:{flexDirection:"row",gap:9},
 mapButtonCell:{flex:1}

});
