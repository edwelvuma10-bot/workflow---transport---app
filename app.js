const $=id=>document.getElementById(id);
const defaults={fuelPrice:24,consumption:12,runningCost:1.5,margin:25,minimumFare:10};
let settings={...defaults,...JSON.parse(localStorage.getItem("workflow-settings")||"{}")};
let rides=JSON.parse(localStorage.getItem("workflow-rides")||"[]");
let drivers=JSON.parse(localStorage.getItem("workflow-drivers")||"[]");
let googleKey=localStorage.getItem("workflow-google-key")||"";
let current=null, mapPlaces={pickup:null,destination:null}, mapsReady=false, mapsLoading=null;

function money(n){return "R"+Number(n).toFixed(2)}
function setStatus(t){$("status").textContent=t}
function saveSettings(){localStorage.setItem("workflow-settings",JSON.stringify(settings));updateAdmin()}
function saveRides(){localStorage.setItem("workflow-rides",JSON.stringify(rides))}
function saveDrivers(){localStorage.setItem("workflow-drivers",JSON.stringify(drivers))}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

function renderRides(){
  $("rideCount").textContent=rides.length;
  $("rides").innerHTML=rides.length?rides.map(r=>`<div class="ride"><strong>${escapeHtml(r.date)} • ${escapeHtml(r.time)} • ${r.passengers} passenger${r.passengers==1?"":"s"}</strong><small>${escapeHtml(r.pickup)} → ${escapeHtml(r.destination)} • ${Number(r.distance).toFixed(1)} km • ${money(r.total)}${r.driverId?` • Driver: ${escapeHtml(driverName(r.driverId))}`:""}</small></div>`).join(""):'<p class="muted">No rides scheduled yet.</p>';
}

function driverName(id){const d=drivers.find(x=>x.id===id);return d?d.name:"Unassigned"}

function renderDrivers(){
  const select=$("driverSelect");
  select.innerHTML=drivers.length?drivers.map(d=>`<option value="${d.id}">${escapeHtml(d.name)} — ${escapeHtml(d.vehicle)}</option>`).join(""):'<option value="">No drivers added</option>';
  $("driverList").innerHTML=drivers.length?drivers.map(d=>`<div class="driver-row"><div><strong>${escapeHtml(d.name)}</strong><small>${escapeHtml(d.phone)} • ${escapeHtml(d.vehicle)} • ${d.seats} seats</small></div><button class="small-btn" onclick="removeDriver('${d.id}')">Remove</button></div>`).join(""):'<p class="muted">No drivers added yet.</p>';
  renderDriverRides();
}

window.removeDriver=id=>{drivers=drivers.filter(d=>d.id!==id);rides=rides.map(r=>r.driverId===id?({...r,driverId:null}):r);saveDrivers();saveRides();renderDrivers();renderRides();renderAdminRides();updateAdmin()};

function renderAdminRides(){
  $("adminRides").innerHTML=rides.length?rides.map(r=>`<div class="ride admin-ride"><div><strong>${escapeHtml(r.date)} • ${escapeHtml(r.time)} • ${r.passengers} pax</strong><small>${escapeHtml(r.pickup)} → ${escapeHtml(r.destination)} • ${Number(r.distance).toFixed(1)} km • ${money(r.total)}</small></div><select class="assign-select" onchange="assignDriver('${r.id}',this.value)"><option value="">Unassigned</option>${drivers.map(d=>`<option value="${d.id}" ${r.driverId===d.id?"selected":""}>${escapeHtml(d.name)}</option>`).join("")}</select></div>`).join(""):'<p class="muted">No rides yet.</p>';
}
window.assignDriver=(rideId,driverId)=>{const r=rides.find(x=>String(x.id)===String(rideId));if(r){r.driverId=driverId||null;saveRides();renderAdminRides();renderDriverRides();renderRides();updateAdmin()}};

function renderDriverRides(){
  const id=$("driverSelect").value;
  const mine=rides.filter(r=>String(r.driverId)===String(id));
  $("driverRides").innerHTML=mine.length?mine.map(r=>`<div class="ride"><strong>${escapeHtml(r.date)} • ${escapeHtml(r.time)} • ${r.passengers} passengers</strong><small>${escapeHtml(r.pickup)} → ${escapeHtml(r.destination)} • ${Number(r.distance).toFixed(1)} km</small><a class="secondary compact" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(r.pickup)}&destination=${encodeURIComponent(r.destination)}">Open route</a></div>`).join(""):'<p class="muted">No rides assigned yet.</p>';
  const d=drivers.find(x=>String(x.id)===String(id));
  $("driverSummary").innerHTML=d?`<strong>${escapeHtml(d.name)}</strong><span>${escapeHtml(d.phone)} • ${escapeHtml(d.vehicle)} • ${d.seats} seats</span>`:'<span>Add a driver in Administration first.</span>';
}

function updateAdmin(){
  $("adminRideCount").textContent=rides.length;
  $("adminDriverCount").textContent=drivers.length;
  $("adminPassengerCount").textContent=rides.reduce((n,r)=>n+Number(r.passengers||0),0);
  $("adminFuel").textContent=Number(settings.fuelPrice).toFixed(2);
  $("adminConsumption").textContent=Number(settings.consumption).toFixed(1);
  $("adminRunning").textContent=Number(settings.runningCost).toFixed(2);
  $("adminMargin").textContent=Number(settings.margin).toFixed(0);
  renderAdminRides();
}

function showRole(role){
  $("workerDashboard").classList.toggle("hidden",role!=="worker");
  $("driverDashboard").classList.toggle("hidden",role!=="driver");
  $("adminDashboard").classList.toggle("hidden",role!=="admin");
  if(role==="driver")renderDrivers();
  if(role==="admin"){updateAdmin();$("googleKey").value=googleKey}
}

function openSettings(){
  $("fuelPrice").value=settings.fuelPrice;$("consumption").value=settings.consumption;$("runningCost").value=settings.runningCost;$("margin").value=settings.margin;$("minimumFare").value=settings.minimumFare;
  $("settingsModal").classList.remove("hidden");
}

function calculateFare(distance){
  const fuel=distance*(Number(settings.consumption)/100)*Number(settings.fuelPrice);
  const operating=distance*Number(settings.runningCost);
  const totalVehicle=(fuel+operating)*(1+Number(settings.margin)/100);
  const p=Number($("passengers").value);
  const per=Math.max(Number(settings.minimumFare),totalVehicle/p);
  return {per,total:per*p};
}

function loadGoogleMaps(){
  if(mapsReady)return Promise.resolve(true);
  if(!googleKey)return Promise.resolve(false);
  if(mapsLoading)return mapsLoading;
  mapsLoading=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-google-maps]');
    if(existing){existing.addEventListener("load",()=>resolve(true));existing.addEventListener("error",()=>reject(new Error("Google Maps could not load")));return}
    const s=document.createElement("script");
    s.dataset.googleMaps="1";
    s.src="https://maps.googleapis.com/maps/api/js?key="+encodeURIComponent(googleKey)+"&libraries=places";
    s.async=true;s.defer=true;
    s.onload=()=>{mapsReady=true;initAutocomplete();resolve(true)};
    s.onerror=()=>reject(new Error("Google Maps could not load. Check the API key and restrictions."));
    document.head.appendChild(s);
  });
  return mapsLoading;
}

function initAutocomplete(){
  if(!window.google?.maps?.places)return;
  ["pickup","destination"].forEach(id=>{
    const ac=new google.maps.places.Autocomplete($(id),{componentRestrictions:{country:"za"},fields:["formatted_address","geometry","name"],types:["address"]});
    ac.addListener("place_changed",()=>{
      const p=ac.getPlace();
      if(p.geometry?.location){
        mapPlaces[id]={lat:p.geometry.location.lat(),lng:p.geometry.location.lng(),address:p.formatted_address||$(id).value};
        $(id).value=p.formatted_address||$(id).value;
      }
    });
  });
}

async function googleDistance(a,b){
  await loadGoogleMaps();
  if(!window.google?.maps)throw new Error("Google Maps is not configured");
  const origin=a||$("pickup").value.trim(), destination=b||$("destination").value.trim();
  const service=new google.maps.DirectionsService();
  return new Promise((resolve,reject)=>{
    service.route({origin,destination,travelMode:google.maps.TravelMode.DRIVING,unitSystem:google.maps.UnitSystem.METRIC},(res,status)=>{
      if(status==="OK"&&res?.routes?.[0]?.legs?.[0])resolve(res.routes[0].legs[0].distance.value/1000);
      else reject(new Error("Google Maps could not calculate this route."));
    });
  });
}

async function fallbackDistance(pickup,destination){
  const u="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=za&q="+encodeURIComponent(pickup);
  const v="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=za&q="+encodeURIComponent(destination);
  const [ra,rb]=await Promise.all([fetch(u,{headers:{Accept:"application/json"}}),fetch(v,{headers:{Accept:"application/json"}})]);
  const [a,b]=await Promise.all([ra.json(),rb.json()]);
  if(!a[0]||!b[0])throw new Error("Address not found. Use Google Maps suggestions or enter the route distance.");
  const routeUrl=`https://router.project-osrm.org/route/v1/driving/${a[0].lon},${a[0].lat};${b[0].lon},${b[0].lat}?overview=false`;
  const rr=await fetch(routeUrl);const d=await rr.json();
  if(d.code!=="Ok")throw new Error("Route could not be calculated.");
  return d.routes[0].distance/1000;
}

$("calculateBtn").onclick=async()=>{
  const pickup=$("pickup").value.trim(),destination=$("destination").value.trim();
  if(!pickup||!destination){setStatus("Enter both addresses.");return}
  setStatus("Calculating route and fare…");$("calculateBtn").disabled=true;
  try{
    let distance;
    const useGoogle=!!googleKey;
    if(useGoogle){
      distance=await googleDistance(mapPlaces.pickup?.address||pickup,mapPlaces.destination?.address||destination);
    }else if(Number($("manualDistance").value)>0){
      distance=Number($("manualDistance").value);
    }else{
      distance=await fallbackDistance(pickup,destination);
    }
    if($("tripType").value==="return")distance*=2;
    const p=Number($("passengers").value),fare=calculateFare(distance);
    current={pickup,destination,date:$("date").value,time:$("time").value,passengers:p,distance,total:fare.total,per:fare.per,driverId:null};
    $("resultPickup").textContent=pickup;$("resultDestination").textContent=destination;
    $("distance").textContent=distance.toFixed(1)+" km";$("fare").textContent=money(fare.per);$("total").textContent=money(fare.total);
    $("mapsLink").href="https://www.google.com/maps/dir/?api=1&origin="+encodeURIComponent(pickup)+"&destination="+encodeURIComponent(destination);
    $("result").classList.remove("hidden");setStatus("Fare calculated successfully.");
  }catch(e){
    $("manualDistanceWrap").classList.remove("hidden");
    setStatus((e.message||"Could not calculate route.")+" You can enter the distance manually as a fallback.");
  }finally{$("calculateBtn").disabled=false}
};

$("confirmBtn").onclick=()=>{
  if(!current)return;
  rides.push({...current,id:Date.now()});saveRides();renderRides();updateAdmin();renderDriverRides();
  $("result").classList.add("hidden");setStatus("Ride confirmed and saved on this phone.");current=null;
};

$("roleSelect").onchange=e=>showRole(e.target.value);
$("settingsBtn").onclick=openSettings;
$("closeSettings").onclick=()=>$("settingsModal").classList.add("hidden");
$("saveSettings").onclick=()=>{
  settings={fuelPrice:+$("fuelPrice").value||defaults.fuelPrice,consumption:+$("consumption").value||defaults.consumption,runningCost:+$("runningCost").value||defaults.runningCost,margin:+$("margin").value||0,minimumFare:+$("minimumFare").value||defaults.minimumFare};
  saveSettings();$("settingsModal").classList.add("hidden");setStatus("Pricing settings saved.");
};
$("adminPricingBtn").onclick=openSettings;
$("addDriverBtn").onclick=()=>$("driverModal").classList.remove("hidden");
$("closeDriverModal").onclick=()=>$("driverModal").classList.add("hidden");
$("saveDriver").onclick=()=>{
  const name=$("driverName").value.trim();
  if(!name){alert("Enter the driver's name.");return}
  drivers.push({id:"d"+Date.now(),name,phone:$("driverPhone").value.trim(),vehicle:$("driverVehicle").value.trim()||"Suzuki 7-seater",seats:+$("driverSeats").value||7});
  saveDrivers();renderDrivers();updateAdmin();$("driverModal").classList.add("hidden");
  $("driverName").value="";$("driverPhone").value="";$("driverVehicle").value="";
};
$("driverSelect").onchange=renderDriverRides;
$("saveGoogleKey").onclick=async()=>{
  googleKey=$("googleKey").value.trim();
  if(!googleKey){localStorage.removeItem("workflow-google-key");mapsReady=false;mapsLoading=null;setStatus("Google Maps key cleared.");return}
  localStorage.setItem("workflow-google-key",googleKey);mapsReady=false;mapsLoading=null;
  try{await loadGoogleMaps();setStatus("Google Maps connected. Address suggestions are now enabled.");}
  catch(e){setStatus(e.message)}
};

const today=new Date();$("date").value=today.toISOString().slice(0,10);$("time").value="06:00";
renderRides();renderDrivers();updateAdmin();
if(googleKey)loadGoogleMaps().catch(()=>{});
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
