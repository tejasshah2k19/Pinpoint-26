import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Platform,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View
} from "react-native";
import * as Location from "expo-location";
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
  const [user,setUser] = useState(null);
  const [authMode,setAuthMode] = useState("login");
  const [auth,setAuth] = useState({name:"",email:"",password:""});
  const [tab,setTab] = useState("Home");
  const [locations,setLocations] = useState([]);
  const [nearbyLocations,setNearbyLocations] = useState([]);
  const [nearbyRadius,setNearbyRadius] = useState(5000);
  const [nearbyCustomKm,setNearbyCustomKm] = useState("");
  const [nearbyLoading,setNearbyLoading] = useState(false);
  const [form,setForm] = useState({title:"",category:"Food",address:"",notes:"",isPublic:false});
  const [position,setPosition] = useState(null);
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

  async function loadLocations(t) {
    const active = t || token;
    if (!active) return;
    setLoading(true);
    try { const result = await api.getLocations(active); setLocations(result.locations || result.data || []); }
    catch(e) { Alert.alert("Could not load places",e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if(token) loadLocations(token); },[token]);

  async function submitAuth() {
    if(!auth.email.trim() || !auth.password) return Alert.alert("Missing details","Enter your email and password.");
    if(authMode === "register" && (!auth.name.trim() || auth.password.length < 8)) return Alert.alert("Check details","Enter your name and a password of at least 8 characters.");
    setBusy(true);
    try {
      const result = authMode === "login" ? await api.login({email:auth.email.trim(),password:auth.password}) : await api.register({name:auth.name.trim(),email:auth.email.trim(),password:auth.password});
      setToken(result.token); setUser(result.user); setTab("Home");
    } catch(e) { Alert.alert("Authentication failed",e.message); }
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
  function newPlace() { setEditingId(null); setForm({title:"",category:"Food",address:"",notes:"",isPublic:false}); setShowCustomCategory(false); setPosition(null); setTab("Capture"); }
  function editPlace(item) {
    const coords = item.coordinates && item.coordinates.coordinates || [];
    setEditingId(item._id); setForm({title:item.title || "",category:item.category || "Other",address:item.address || "",notes:item.notes || "",isPublic:item.isPublic === true});
    setShowCustomCategory(!DEFAULT_CATEGORIES.includes(item.category || "Other"));
    const existingPosition = coords.length === 2 ? {latitude:coords[1],longitude:coords[0]} : null;
    setPosition(existingPosition); setTab("Capture");
  }
  async function geocodeAddress() {
    const address = form.address.trim();
    if(!address) return Alert.alert("Enter an address","Add a full address before finding its coordinates.");
    setBusy(true);
    try {
      const results = await Location.geocodeAsync(address);
      if(!results || !results.length) return Alert.alert("Address not found","Please check the address and include area, city, state and PIN code.");
      const match = results[0];
      selectPosition({latitude:match.latitude,longitude:match.longitude});
      Alert.alert("Address located","Coordinates found. Review the address and save your place.");
    } catch(e) {
      Alert.alert("Could not find address","Please check your internet connection or try a more complete address.");
    } finally { setBusy(false); }
  }
  async function savePlace() {
    if(!form.title.trim()) return Alert.alert("Add a title","Enter a name for this place.");
    if(!position) return Alert.alert("Choose a location","Use current GPS or find coordinates from the address.");
    setBusy(true);
    const details = {title:form.title.trim(),category:form.category.trim() || "Other",address:form.address.trim(),notes:form.notes.trim(),isPublic:form.isPublic,coordinates:{type:"Point",coordinates:[position.longitude,position.latitude]}};
    try {
      if(editingId) await api.updateLocation(token,editingId,details); else await api.createLocation(token,details);
      await loadLocations(token); setForm({title:"",category:"Food",address:"",notes:"",isPublic:false}); setPosition(null); setEditingId(null); setTab("Places");
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
  const categoryOptions = useMemo(() => ["All", ...new Set([...DEFAULT_CATEGORIES, ...locations.map(item => item.category).filter(Boolean)])], [locations]);
  const filtered = useMemo(() => locations.filter(item => {
    const matchCat = category === "All" || (item.category || "Other").toLowerCase() === category.toLowerCase();
    const q = search.trim().toLowerCase();
    const matchText = !q || [item.title,item.category,item.address,item.notes].some(v => String(v || "").toLowerCase().includes(q));
    return matchCat && matchText;
  }),[locations,category,search]);

  if(!token) return <SafeAreaView style={s.safe}>
    <ExpoStatusBar style="dark" />
    <KeyboardAvoidingView style={s.authScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.authContent} keyboardShouldPersistTaps="handled">
        <View style={s.brandMark}><Text style={s.brandMarkText}>➤</Text></View>
        <Text style={s.brandWord}>PINPOINT</Text>
        <Text style={s.authTitle}>Your places,{"\n"}remembered.</Text>
        <Text style={s.authSub}>Capture the spots worth coming back to, with exact GPS coordinates.</Text>
        {authMode === "register" && <View><Text style={s.label}>Your name</Text><Field placeholder="Your name" value={auth.name} onChangeText={v=>setAuth({...auth,name:v})}/></View>}
        <Text style={s.label}>Email address</Text>
        <Field placeholder="you@example.com" value={auth.email} onChangeText={v=>setAuth({...auth,email:v})} keyboardType="email-address"/>
        <Text style={s.label}>Password</Text>
        <Field placeholder="At least 8 characters" value={auth.password} onChangeText={v=>setAuth({...auth,password:v})} secureTextEntry/>
        <Button title={busy ? "Please wait..." : authMode === "login" ? "Sign in" : "Create account"} onPress={submitAuth} disabled={busy}/>
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
      {loading ? <ActivityIndicator color={C.coral} style={{marginTop:24}}/> : recent.length ? recent.map(item=><PlaceCard key={item._id} item={item} onEdit={editPlace} onDelete={deletePlace}/>) : <View style={s.empty}><Text style={s.emptyIcon}>◫</Text><Text style={s.emptyText}>No locations logged yet</Text></View>}
    </ScrollView>}

    {tab === "Places" && <View style={s.screen}>
      <Text style={s.placesTitle}>Your places</Text><Text style={s.placesSub}>Every spot, offer, and note in one view.</Text>
      <View style={s.searchBox}><Text style={s.searchIcon}>⌕</Text><TextInput value={search} onChangeText={setSearch} placeholder="Search places or offers" placeholderTextColor={C.muted} style={s.searchInput}/></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipRow}>
        {categoryOptions.map(item=><TouchableOpacity key={item} onPress={()=>setCategory(item)} style={[s.chip,category===item && s.chipActive]}><Text style={[s.chipText,category===item && s.chipTextActive]}>{item}</Text></TouchableOpacity>)}
      </ScrollView>
      <Text style={s.resultCount}>{filtered.length} {filtered.length === 1 ? "place" : "places"}</Text>
      {loading ? <ActivityIndicator color={C.coral} style={{marginTop:24}}/> : <FlatList data={filtered} keyExtractor={item=>item._id} renderItem={({item})=><PlaceCard item={item} onEdit={editPlace} onDelete={deletePlace}/>} ListEmptyComponent={<View style={s.empty}><Text style={s.emptyIcon}>◫</Text><Text style={s.emptyText}>No places found. Save your first place.</Text></View>} refreshing={loading} onRefresh={()=>loadLocations(token)}/>}
      <TouchableOpacity style={s.fab} onPress={newPlace}><Text style={s.fabText}>＋</Text></TouchableOpacity>
    </View>}

    {tab === "Capture" && <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={()=>setTab("Home")}><Text style={s.back}>‹  Back</Text></TouchableOpacity>
        <Text style={s.placesTitle}>{editingId ? "Edit place" : "Save a place"}</Text><Text style={s.placesSub}>Keep the details you want to remember.</Text>
        <Text style={s.label}>Place name</Text><Field placeholder="e.g. Hidden Gem Cafe" value={form.title} onChangeText={v=>setForm({...form,title:v})}/>
        <Text style={s.label}>Choose a category</Text>
        <View style={s.categoryChoices}>{DEFAULT_CATEGORIES.map(item=><TouchableOpacity key={item} onPress={()=>{setForm({...form,category:item});setShowCustomCategory(false);}} style={[s.categoryChoice,form.category===item && !showCustomCategory && s.categoryChoiceActive]}><Text style={[s.categoryChoiceText,form.category===item && !showCustomCategory && s.categoryChoiceTextActive]}>{item}</Text></TouchableOpacity>)}
        <TouchableOpacity onPress={()=>{setShowCustomCategory(true);setForm({...form,category:DEFAULT_CATEGORIES.includes(form.category) ? "" : form.category});}} style={[s.categoryChoice,showCustomCategory && s.categoryChoiceActive]}><Text style={[s.categoryChoiceText,showCustomCategory && s.categoryChoiceTextActive]}>＋ Custom</Text></TouchableOpacity></View>
        {showCustomCategory && <><Text style={s.label}>Your custom category</Text><Field placeholder="e.g. Hidden gems, Events, Favourite spots" value={form.category} onChangeText={v=>setForm({...form,category:v})}/></>}
        <Text style={s.label}>Who can see this place?</Text>
        <View style={s.categoryChoices}>
          <TouchableOpacity onPress={()=>setForm({...form,isPublic:false})} style={[s.categoryChoice,!form.isPublic && s.categoryChoiceActive]}><Text style={[s.categoryChoiceText,!form.isPublic && s.categoryChoiceTextActive]}>🔒 Private</Text></TouchableOpacity>
          <TouchableOpacity onPress={()=>setForm({...form,isPublic:true})} style={[s.categoryChoice,form.isPublic && s.categoryChoiceActive]}><Text style={[s.categoryChoiceText,form.isPublic && s.categoryChoiceTextActive]}>🌐 Public</Text></TouchableOpacity>
        </View>
        <Text style={s.privacyBody}>{form.isPublic ? "Anyone using Pinpoint can discover this place in Nearby. Your account details are not displayed as part of the place card." : "Only you can see this place. It will not appear in other users’ Nearby results."}</Text>
        <Text style={s.label}>Full address (optional)</Text><Field placeholder="Building, street, area, city, state, PIN code" value={form.address} onChangeText={v=>setForm({...form,address:v})} multiline/>
        <Button title={busy ? "Finding address..." : "Find coordinates from address"} icon="⌖" onPress={geocodeAddress} disabled={busy}/>
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
          <View style={s.mapButtonCell}><Button title="Find by address" icon="⌖" onPress={geocodeAddress} disabled={busy}/></View>
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

    {tab === "Profile" && <View style={s.screen}><Text style={s.placesTitle}>Profile</Text><Text style={s.placesSub}>Your Pinpoint account and preferences.</Text>
      <View style={s.profileCard}><View style={s.avatar}><Text style={s.avatarText}>{firstName.charAt(0).toUpperCase()}</Text></View><Text style={s.profileName}>{user && user.name || "Pinpoint user"}</Text><Text style={s.profileEmail}>{user && user.email || ""}</Text></View>
      <View style={s.privacyCard}><Text style={s.privacyTitle}>Your places are private</Text><Text style={s.privacyBody}>Your saved locations stay connected to your account. You choose when to share them.</Text></View>
      <TouchableOpacity style={s.logout} onPress={()=>{setToken("");setUser(null);setLocations([]);setTab("Home");}}><Text style={s.logoutText}>Sign out</Text></TouchableOpacity>
    </View>}
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
 chipScroll:{flexGrow:0,marginTop:13,marginBottom:13},chipRow:{alignItems:"center",paddingRight:12},
 chip:{backgroundColor:"#EEEDE6",borderRadius:18,paddingHorizontal:16,paddingVertical:9,marginRight:7},chipActive:{backgroundColor:C.coral},
 chipText:{color:"#55564F",fontSize:11,fontWeight:"700"},chipTextActive:{color:C.white},resultCount:{color:C.muted,fontSize:11,marginBottom:11},
 placeCard:{backgroundColor:"#F5F4EE",borderRadius:17,borderWidth:1,borderColor:"#E9E7DE",padding:13,flexDirection:"row",alignItems:"center",marginBottom:10,minHeight:82},
 pin:{width:36,height:36,borderRadius:18,backgroundColor:C.coralPale,alignItems:"center",justifyContent:"center",marginRight:10},pinText:{color:C.coral,fontSize:22},
 placeInfo:{flex:1},placeTitle:{color:C.ink,fontSize:13,fontWeight:"800"},placeCategory:{color:"#B36F53",fontSize:11,fontWeight:"700",marginTop:3},
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
 privacyCard:{backgroundColor:"#F2F1EB",borderRadius:16,padding:16,marginTop:14},privacyTitle:{color:C.ink,fontSize:13,fontWeight:"800",marginBottom:5},
 privacyBody:{color:C.muted,fontSize:12,lineHeight:18},logout:{borderWidth:1,borderColor:C.line,borderRadius:14,padding:14,alignItems:"center",marginTop:18},logoutText:{color:C.red,fontSize:13,fontWeight:"800"},
 categoryChoices:{flexDirection:"row",flexWrap:"wrap",marginBottom:8},categoryChoice:{backgroundColor:"#EEEDE6",borderRadius:18,paddingHorizontal:14,paddingVertical:10,marginRight:7,marginBottom:8,borderWidth:1,borderColor:"transparent"},categoryChoiceActive:{backgroundColor:C.coral,borderColor:C.coral},categoryChoiceText:{color:"#55564F",fontSize:12,fontWeight:"700"},categoryChoiceTextActive:{color:C.white},

 mapHint:{color:C.muted,fontSize:11,lineHeight:16,marginTop:-2,marginBottom:9},
 mapFrame:{height:275,borderRadius:17,overflow:"hidden",borderWidth:1,borderColor:C.line,backgroundColor:"#EEEDE6"},
 map:{flex:1},
 mapOverlay:{position:"absolute",top:12,left:12,right:12,alignItems:"center"},
 mapOverlayText:{backgroundColor:"rgba(32,33,31,0.82)",color:C.white,fontSize:11,fontWeight:"700",paddingHorizontal:13,paddingVertical:8,borderRadius:18},
 mapButtons:{flexDirection:"row",gap:9},
 mapButtonCell:{flex:1}

});
