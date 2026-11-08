// Optional daily weather from Open-Meteo (free, no account, no API key).
// Only a rough location (rounded to ~10 km) is sent. Nothing from the diary is ever sent.

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
export const POLLEN = ['grass', 'birch', 'alder', 'mugwort', 'olive', 'ragweed']; // Europe only

export const roundCoord = v => Math.round(v * 10) / 10;

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  if (!res.ok) throw new Error(`weather service replied ${res.status}`);
  return res.json();
}

// Returns one summary per day: [{ day, tMax, tMin, rain, uv, humMean, humMin, pm25, pollen }]
export async function fetchWeatherDays(lat, lon, pastDays) {
  const common = { latitude: lat, longitude: lon, timezone: 'auto', past_days: String(pastDays), forecast_days: '1' };
  const w = await getJSON(`${FORECAST}?${new URLSearchParams({
    ...common,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,relative_humidity_2m_mean,relative_humidity_2m_min',
  })}`);
  const d = w.daily;
  const byDay = new Map();
  d.time.forEach((day, i) => byDay.set(day, {
    day, tMax: d.temperature_2m_max[i], tMin: d.temperature_2m_min[i], rain: d.precipitation_sum[i],
    uv: d.uv_index_max[i], humMean: d.relative_humidity_2m_mean[i], humMin: d.relative_humidity_2m_min[i],
    pm25: null, pollen: null,
  }));

  // Air quality is a bonus: if it fails, keep the weather.
  try {
    const a = await getJSON(`${AIR}?${new URLSearchParams({ ...common, hourly: ['pm2_5', ...POLLEN.map(p => p + '_pollen')].join(',') })}`);
    const acc = new Map();
    a.hourly.time.forEach((t, i) => {
      const day = t.slice(0, 10);
      let x = acc.get(day);
      if (!x) acc.set(day, x = { pm: [], pollen: {} });
      const pm = a.hourly.pm2_5?.[i];
      if (pm != null) x.pm.push(pm);
      for (const p of POLLEN) {
        const v = a.hourly[p + '_pollen']?.[i];
        if (v != null) x.pollen[p] = Math.max(x.pollen[p] ?? 0, Math.round(v));
      }
    });
    for (const [day, x] of acc) {
      const rec = byDay.get(day);
      if (!rec) continue;
      if (x.pm.length) rec.pm25 = Math.round((x.pm.reduce((s, v) => s + v, 0) / x.pm.length) * 10) / 10;
      if (Object.keys(x.pollen).length) rec.pollen = x.pollen;
    }
  } catch (err) {
    console.info('Air quality unavailable:', err.message);
  }
  return [...byDay.values()].filter(r => r.tMax != null);
}

export async function searchPlaces(name) {
  const d = await getJSON(`${GEOCODE}?${new URLSearchParams({ name, count: '6', language: 'en', format: 'json' })}`);
  return (d.results || []).map(r => ({
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    lat: roundCoord(r.latitude),
    lon: roundCoord(r.longitude),
  }));
}
