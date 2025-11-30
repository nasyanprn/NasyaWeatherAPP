/* NasyaWeatherApp - final script
   - Uses Tomorrow.io realtime & forecast endpoints with lat,lon
   - Uses Open-Meteo geocoding for autocomplete
   - Favorites saved in localStorage
   - Unit toggles and theme persistence
*/

const API_KEY = "U6bW9JECRFQXoUrjBJqNwWqU4olzzq3n";
const geocodeBase = "https://geocoding-api.open-meteo.com/v1/search?name=";
const realtimeBase = "https://api.tomorrow.io/v4/weather/realtime";
const forecastBase = "https://api.tomorrow.io/v4/weather/forecast";

let useMetric = true;     // Celsius (metric) vs Fahrenheit (imperial)
let useSpeedKmh = true;   // km/h vs mph
let currentCity = null;
let currentCoords = null;
let favorites = JSON.parse(localStorage.getItem("nasya_favs") || "[]");

// ELEMENTS
const searchInput = document.getElementById("searchInput");
const searchBtn   = document.getElementById("searchBtn");
const suggestions = document.getElementById("suggestions");
const favoriteList = document.getElementById("favoriteList");

const cityName = document.getElementById("cityName");
const localTime = document.getElementById("localTime");
const currentIcon = document.getElementById("currentIcon");
const temperature = document.getElementById("temperature");
const condition = document.getElementById("condition");
const feelsLike = document.getElementById("feelsLike");
const humidity = document.getElementById("humidity");
const wind = document.getElementById("wind");
const visibility = document.getElementById("visibility");
const uvIndex = document.getElementById("uvIndex");
const pressure = document.getElementById("pressure");
const precipProb = document.getElementById("precipProb");
const visibilityMeters = document.getElementById("visibilityMeters");
const statusMsg = document.getElementById("statusMsg");
const favToggle = document.getElementById("favToggle");
const forecastList = document.getElementById("forecastList");

const themeBtn = document.getElementById("themeBtn");
const unitBtn = document.getElementById("unitBtn");
const speedBtn = document.getElementById("speedBtn");
const unitToggleSmall = document.getElementById("unitToggleSmall");

// INIT
loadTheme();
renderFavorites();
attachEvents();

function attachEvents(){
  searchBtn.addEventListener("click", onSearchClicked);
  searchInput.addEventListener("input", debounce(onType, 300));
  searchInput.addEventListener("keydown", (e) => {
    if(e.key === "Enter") onSearchClicked();
  });

  suggestions.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if(!li) return;
    const lat = li.dataset.lat, lon = li.dataset.lon;
    const name = li.dataset.query;
    searchInput.value = name;
    clearSuggestions();
    loadCity(name, lat, lon);
  });

  themeBtn.addEventListener("click", toggleTheme);
  unitBtn.addEventListener("click", toggleUnits);
  speedBtn.addEventListener("click", toggleSpeed);
  unitToggleSmall.addEventListener("click", toggleUnits);
  favToggle.addEventListener("click", toggleFavorite);

  // initial load: last favorite or Jakarta
  if(favorites.length) {
    const f = favorites[0];
    loadCity(f.name, f.lat, f.lon);
  } else {
    geocodeAndLoad("Jakarta");
  }
}

/* ---------- AUTOCOMPLETE (Open-Meteo geocoding) ---------- */
async function onType(e){
  const q = e.target.value.trim();
  if(!q) { clearSuggestions(); return; }
  try {
    const res = await fetch(geocodeBase + encodeURIComponent(q) + "&count=8");
    const data = await res.json();
    if(!data.results) { clearSuggestions(); return; }
    const list = data.results.map(r => ({
      name: `${r.name}${r.admin1 ? ", " + r.admin1 : ""}${r.country ? ", " + r.country : ""}`,
      lat: r.latitude, lon: r.longitude
    }));
    showSuggestions(list);
  } catch(err) {
    console.error(err);
    clearSuggestions();
  }
}

function showSuggestions(list){
  suggestions.innerHTML = "";
  list.forEach(it => {
    const li = document.createElement("li");
    li.tabIndex = 0;
    li.dataset.lat = it.lat;
    li.dataset.lon = it.lon;
    li.dataset.query = it.name;
    li.textContent = it.name;
    suggestions.appendChild(li);
  });
  suggestions.classList.remove("hidden");
}

function clearSuggestions(){
  suggestions.innerHTML = "";
  suggestions.classList.add("hidden");
}

/* ---------- SEARCH HANDLER ---------- */
function onSearchClicked(){
  const q = searchInput.value.trim();
  if(!q) return showStatus("Masukkan nama kota...", true);
  // try to find matching suggestion first
  const sel = Array.from(suggestions.children).find(li => li.dataset.query === q);
  if(sel){
    loadCity(q, sel.dataset.lat, sel.dataset.lon);
    clearSuggestions();
  } else {
    geocodeAndLoad(q);
  }
}

async function geocodeAndLoad(q){
  try {
    showStatus("Mencari koordinat...");
    const res = await fetch(geocodeBase + encodeURIComponent(q) + "&count=1");
    const data = await res.json();
    if(!data.results || !data.results.length) { showStatus("Kota tidak ditemukan", true); return; }
    const r = data.results[0];
    const display = `${r.name}${r.admin1 ? ", " + r.admin1 : ""}${r.country ? ", " + r.country : ""}`;
    loadCity(display, r.latitude, r.longitude);
  } catch(err) {
    console.error(err);
    showStatus("Gagal mencari kota", true);
  }
}

/* ---------- LOAD CITY, FETCH REALTIME + FORECAST ---------- */
async function loadCity(displayName, lat, lon){
  currentCity = displayName;
  currentCoords = { lat, lon };
  cityName.textContent = displayName;
  clearStatus();
  try {
    showStatus("Memuat data cuaca...");
    await Promise.all([fetchRealtime(lat, lon), fetchForecast(lat, lon)]);
    showStatus("Data diperbarui", false);
    updateFavButton();
    localTime.textContent = new Date().toLocaleString("id-ID");
  } catch(err) {
    console.error(err);
    showStatus("Gagal memuat data", true);
  }
}

async function fetchRealtime(lat, lon){
  const units = useMetric ? "metric" : "imperial";
  const url = `${realtimeBase}?location=${lat},${lon}&units=${units}&apikey=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if(!data?.data?.values) throw new Error("Realtime data kosong");

  const d = data.data.values;
  // Temperature
  temperature.textContent = Math.round(d.temperature) + "°" + (useMetric ? "C" : "F");
  feelsLike.textContent = Math.round(d.temperatureApparent) + "°";
  humidity.textContent = Math.round(d.humidity) + "%";

  // Wind - TBD: assume Tomorrow returns in km/h for metric
  let windVal = d.windSpeed ?? 0;
  if(!useSpeedKmh && useMetric) {
    // convert km/h -> mph
    wind.textContent = (windVal/1.609).toFixed(1) + " mph";
  } else if(!useSpeedKmh && !useMetric) {
    // if imperial & asking mph, assume API returned mph already
    wind.textContent = Math.round(windVal) + " mph";
  } else {
    // show km/h
    wind.textContent = Math.round(windVal) + " km/h";
  }

  visibility.textContent = (d.visibility !== undefined && d.visibility !== null) ? (useMetric ? d.visibility + " km" : (d.visibility/1.609).toFixed(2) + " mi") : "--";
  visibilityMeters.textContent = (d.visibility !== undefined && d.visibility !== null) ? Math.round(d.visibility*1000) : "--";

  condition.textContent = weatherTextFromCode(d.weatherCode);
  currentIcon.textContent = weatherEmojiFromCode(d.weatherCode);

  uvIndex.textContent = d.uvIndex ?? "--";
  pressure.textContent = d.pressureSeaLevel ? Math.round(d.pressureSeaLevel) + " hPa" : "--";
  precipProb.textContent = (d.precipitationProbability !== undefined) ? Math.round(d.precipitationProbability) + "%" : "--";
}

async function fetchForecast(lat, lon){
  const units = useMetric ? "metric" : "imperial";
  const url = `${forecastBase}?location=${lat},${lon}&timesteps=1d&units=${units}&apikey=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if(!data?.timelines?.daily) throw new Error("Forecast kosong");

  const days = data.timelines.daily.slice(0,5);
  forecastList.innerHTML = "";
  days.forEach(day => {
    const dateStr = new Date(day.time).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
    const max = Math.round(day.values.temperatureMax);
    const min = Math.round(day.values.temperatureMin);
    const code = day.values.weatherCode ?? 1000;
    const item = document.createElement("div");
    item.className = "forecast-item";
    item.innerHTML = `
      <h4>${dateStr}</h4>
      <div class="f-icon">${weatherEmojiFromCode(code)}</div>
      <p>${min}° / ${max}°</p>
    `;
    forecastList.appendChild(item);
  });
}

/* ---------- FAVORITES ---------- */
function renderFavorites(){
  favoriteList.innerHTML = "";
  if(!favorites.length){
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Belum ada favorit";
    favoriteList.appendChild(li);
    return;
  }
  favorites.forEach((f, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${f.name}</span><span><button class="fav-open" data-idx="${idx}">➡</button> <button class="fav-del" data-idx="${idx}">✖</button></span>`;
    li.querySelector(".fav-open").addEventListener("click", ()=> loadCity(f.name, f.lat, f.lon));
    li.querySelector(".fav-del").addEventListener("click", ()=> {
      favorites.splice(idx,1);
      localStorage.setItem("nasya_favs", JSON.stringify(favorites));
      renderFavorites();
    });
    favoriteList.appendChild(li);
  });
}

function toggleFavorite(){
  if(!currentCoords || !currentCity) return;
  const exists = favorites.find(f => f.name === currentCity);
  if(exists){
    favorites = favorites.filter(f => f.name !== currentCity);
    showStatus("Dihapus dari favorit");
  } else {
    favorites.unshift({ name: currentCity, lat: currentCoords.lat, lon: currentCoords.lon });
    showStatus("Disimpan ke favorit");
  }
  localStorage.setItem("nasya_favs", JSON.stringify(favorites));
  renderFavorites();
  updateFavButton();
}

function updateFavButton(){
  if(!currentCity) return;
  const exists = favorites.find(f => f.name === currentCity);
  favToggle.textContent = exists ? "⭐ Tersimpan" : "⭐ Simpan";
}

/* ---------- THEME & UNITS ---------- */
function loadTheme(){
  const t = localStorage.getItem("nasya_theme") || "light-pink";
  if(t === "dark-pink") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}
function toggleTheme(){
  document.documentElement.classList.toggle("dark");
  const isDark = document.documentElement.classList.contains("dark");
  localStorage.setItem("nasya_theme", isDark ? "dark-pink" : "light-pink");
}

function toggleUnits(){
  useMetric = !useMetric;
  showStatus(useMetric ? "Unit: Metrik (°C)" : "Unit: Imperial (°F)");
  if(currentCoords) { fetchRealtime(currentCoords.lat, currentCoords.lon).catch(()=>{}); fetchForecast(currentCoords.lat, currentCoords.lon).catch(()=>{}); }
}
function toggleSpeed(){
  useSpeedKmh = !useSpeedKmh;
  showStatus(useSpeedKmh ? "Kecepatan: km/h" : "Kecepatan: mph");
  if(currentCoords) fetchRealtime(currentCoords.lat, currentCoords.lon).catch(()=>{});
}

/* ---------- HELPERS ---------- */
function showStatus(msg, isError=false){
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? "#e54646" : "var(--muted)";
}
function clearStatus(){ statusMsg.textContent = ""; }
function debounce(fn, wait=300){
  let t;
  return function(...args){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), wait) }
}

function weatherEmojiFromCode(code){
  const map = {
    1000: "☀️",1100:"🌤",1101:"⛅",1102:"☁️",
    2000:"🌫️",3000:"🌬️",4000:"🌦️",4200:"🌦️",4201:"🌧️",
    5000:"🌧️",5001:"⛈️",6000:"🌨️",6200:"🌨️",7000:"❄️",7101:"🌨️",8000:"🌩️"
  };
  return map[code] ?? "🌈";
}
function weatherTextFromCode(code){
  const t = {
    1000:"Cerah",1100:"Cerah Berawan",1101:"Berawan Ringan",1102:"Berawan",
    2000:"Berkabut",3000:"Berasap",3001:"Berangin",4000:"Gerimis",4200:"Gerimis",
    4201:"Hujan",5000:"Hujan",5001:"Hujan Lebat",6000:"Hujan Salju",6200:"Hujan Salju",
    7000:"Awan Sangat Dingin",8000:"Badai Petir"
  };
  return t[code] ?? "Tidak diketahui";
}
