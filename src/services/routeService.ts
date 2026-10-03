import {
  CURVATURE_RADIUS_GENTLE,
  CURVATURE_RADIUS_SHARP,
  Destination,
  RouteInfo,
  RoutePoint,
  SpeedCamera,
  SpeedLimit,
  Turn,
  TURN_DETECTION_THRESHOLD,
} from '../models/types';
import {
  DEFAULT_SPEED_LIMIT,
  NOMINATIM_SEARCH_URL,
  OSM_API_USER_AGENT,
  OSRM_ROUTE_URL,
  OVERPASS_ENDPOINT,
  ROUTE_DEVIATION_LIMIT,
} from '../utils/constants';

// ---------------------------------------------------------------------------
// Pure geo helpers
// ---------------------------------------------------------------------------

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function bearingBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI + (Math.atan2(y, x) < 0 ? 360 : 0);
}

export function normalizeBearingDelta(delta: number): number {
  let normalized = delta % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return normalized;
}

/** Chord (degrees) of `meters` at the given latitude. */
function metersToDegrees(meters: number, latitude: number): number {
  return meters / (111320 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)));
}

// ---------------------------------------------------------------------------
// Route geometry
// ---------------------------------------------------------------------------

/** Cumulative distance (meters from route start) for every route point. */
export function computeCumulativeDistances(coords: RoutePoint[]): number[] {
  const out = new Array<number>(coords.length).fill(0);
  for (let i = 1; i < coords.length; i++) {
    out[i] = out[i - 1] + haversineDistance(coords[i - 1].latitude, coords[i - 1].longitude, coords[i].latitude, coords[i].longitude);
  }
  return out;
}

export interface RouteProgress {
  index: number;
  distanceFromStart: number;
  offRoute: boolean;
  offRouteMeters: number;
  remainingDistance: number;
  remainingTime: number;
}

/**
 * Incremental projection of a GPS fix onto the route. `lastIndex` is the
 * previous projection, so only a forward window (plus a small rewind for GPS
 * jitter) is searched.
 */
export function projectOntoRoute(
  coords: RoutePoint[],
  cumulative: number[],
  pos: { latitude: number; longitude: number },
  lastIndex: number,
  totalDistance: number,
  totalDuration: number
): RouteProgress {
  const n = coords.length;
  const start = Math.max(0, lastIndex - 10);
  const end = Math.min(n - 1, lastIndex + 300);

  let best = start;
  let bestD = Infinity;
  for (let i = start; i <= end; i++) {
    const d = haversineDistance(pos.latitude, pos.longitude, coords[i].latitude, coords[i].longitude);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }

  const distanceFromStart = cumulative[best] ?? 0;
  const remainingDistance = Math.max(0, totalDistance - distanceFromStart);
  const remainingTime = totalDuration > 0 ? totalDuration * (remainingDistance / Math.max(1, totalDistance)) : 0;

  return {
    index: best,
    distanceFromStart,
    offRoute: bestD > ROUTE_DEVIATION_LIMIT,
    offRouteMeters: bestD,
    remainingDistance,
    remainingTime,
  };
}

/**
 * Detects sustained curves along a route polyline. A curve is a span where
 * the heading keeps turning in the same direction by at least
 * TURN_DETECTION_THRESHOLD degrees total.
 */
export function computeRouteTurns(coords: RoutePoint[], speedLimit: number = DEFAULT_SPEED_LIMIT): Turn[] {
  const turns: Turn[] = [];
  if (coords.length < 10) return turns;

  const cumulative = computeCumulativeDistances(coords);
  const total = cumulative[cumulative.length - 1];
  if (total < 60) return turns;

  // Heading samples on a ~30m chord to smooth per-vertex noise.
  const CHORD = 30;
  const headings: number[] = new Array(coords.length).fill(0);
  let back = 0;
  for (let i = 0; i < coords.length; i++) {
    while (back < i - 1 && cumulative[i] - cumulative[back + 1] >= CHORD) back++;
    const j = Math.max(0, back);
    headings[i] =
      cumulative[i] - cumulative[j] >= 8
        ? bearingBetween(coords[j].latitude, coords[j].longitude, coords[i].latitude, coords[i].longitude)
        : headings[Math.max(0, i - 1)];
  }

  let curveSign = 0;
  let curveAngle = 0;
  let curveStartDist = 0;

  const finalize = (endDist: number) => {
    const span = Math.max(1, endDist - curveStartDist);
    const angle = Math.abs(curveAngle);
    const radius = span / ((angle * Math.PI) / 180);
    const isLeft = curveAngle < 0;
    const type: Turn['type'] =
      radius < CURVATURE_RADIUS_SHARP
        ? isLeft
          ? 'sharp_left'
          : 'sharp_right'
        : radius < CURVATURE_RADIUS_GENTLE
          ? isLeft
            ? 'gentle_left'
            : 'gentle_right'
          : 'straight';
    if (type !== 'straight') {
      const midDist = curveStartDist + span / 2;
      let midIdx = 0;
      for (let i = 0; i < coords.length; i++) {
        if (cumulative[i] >= midDist) {
          midIdx = i;
          break;
        }
      }
      const theoreticalSpeed = Math.sqrt(3.5 * radius) * 3.6;
      turns.push({
        id: `route_turn_${Math.round(midDist)}`,
        latitude: coords[midIdx].latitude,
        longitude: coords[midIdx].longitude,
        bearing: headings[midIdx],
        curvatureRadius: Math.round(radius),
        type,
        speedLimit,
        recommendedSpeed: Math.min(Math.round(theoreticalSpeed), speedLimit),
        distance: Math.round(curveStartDist),
        routeDistanceAt: Math.round(curveStartDist),
        osmWayId: 'route',
      });
    }
  };

  for (let i = 1; i < coords.length; i++) {
    const dist = cumulative[i];
    const delta = normalizeBearingDelta(headings[i] - headings[i - 1]);

    if (Math.abs(delta) < 2) {
      // Straight (or noise). End the current curve if it accumulated enough.
      if (curveSign !== 0 && curveAngle !== 0 && Math.abs(delta) < 0.5) {
        if (Math.abs(curveAngle) >= TURN_DETECTION_THRESHOLD) finalize(dist);
        curveSign = 0;
        curveAngle = 0;
      }
      continue;
    }

    const sign: number = delta > 0 ? 1 : -1;
    if (sign === curveSign) {
      if (curveSign === 0) {
        curveSign = sign;
        curveStartDist = dist - CHORD;
      }
      curveAngle += delta;
    } else {
      // Direction reversed: close the previous curve, open a new one.
      if (Math.abs(curveAngle) >= TURN_DETECTION_THRESHOLD) finalize(dist - CHORD);
      curveSign = sign;
      curveAngle = delta;
      curveStartDist = dist - CHORD;
    }
  }
  if (curveSign !== 0 && Math.abs(curveAngle) >= TURN_DETECTION_THRESHOLD) finalize(total);

  return turns;
}

// ---------------------------------------------------------------------------
// Speed cameras (OSM)
// ---------------------------------------------------------------------------

export interface CameraBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export function routeBoundingBox(coords: RoutePoint[], padMeters = 1500): CameraBounds {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const c of coords) {
    minLat = Math.min(minLat, c.latitude);
    minLon = Math.min(minLon, c.longitude);
    maxLat = Math.max(maxLat, c.latitude);
    maxLon = Math.max(maxLon, c.longitude);
  }
  if (!Number.isFinite(minLat)) {
    return { minLat: 0, minLon: 0, maxLat: 0, maxLon: 0 };
  }
  const midLat = (minLat + maxLat) / 2;
  const padLat = padMeters / 111320;
  const padLon = metersToDegrees(padMeters, midLat);
  return {
    minLat: minLat - padLat,
    minLon: minLon - padLon,
    maxLat: maxLat + padLat,
    maxLon: maxLon + padLon,
  };
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function parseSpeedLimit(tags: Record<string, string>): number {
  const raw = tags['max_speed'] ?? tags['maxspeed'] ?? '';
  const value = raw.split(/[;,\s]/)[0] ?? '';
  const num = parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/** Maps raw Overpass elements to speed cameras positioned along the route. */
export function mapOverpassCameras(
  elements: OverpassElement[],
  coords: RoutePoint[],
  cumulative: number[],
  maxOffRouteMeters = 800
): SpeedCamera[] {
  const cameras: SpeedCamera[] = [];
  const seen = new Set<string>();
  if (coords.length < 2) return cameras;

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const tags = el.tags ?? {};
    const isCamera =
      (tags['traffic_sign'] === 'max_speed' && tags['detection'] !== 'no') ||
      tags['detect_car_speed'] !== undefined ||
      tags['traffic_sign'] === 'speed_controlled' ||
      tags['highway'] === 'traffic_sign';
    if (!isCamera) continue;

    // Distance from the camera to the route (incremental scan is fine for
    // a few hundred candidates).
    let bestD = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < coords.length; i += 2) {
      const d = haversineDistance(lat, lon, coords[i].latitude, coords[i].longitude);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestD > maxOffRouteMeters) continue;

    const id = `camera_${el.type}_${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    cameras.push({
      id,
      latitude: lat,
      longitude: lon,
      speedLimit: parseSpeedLimit(tags),
      routeDistanceAt: Math.round(cumulative[bestIdx] ?? 0),
    });
  }

  return cameras;
}

/** Maps raw Overpass elements to speed-limit signs positioned along the route. */
export function mapOverpassSpeedLimits(
  elements: OverpassElement[],
  coords: RoutePoint[],
  cumulative: number[],
  maxOffRouteMeters = 120
): SpeedLimit[] {
  const limits: SpeedLimit[] = [];
  const seen = new Set<string>();
  if (coords.length < 2) return limits;

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const tags = el.tags ?? {};
    const raw = tags['max_speed'] ?? tags['maxspeed'] ?? '';
    const value = raw.split(/[;,\s]/)[0] ?? '';
    const limit = parseInt(value, 10);
    if (!Number.isFinite(limit) || limit <= 0) continue;

    let bestD = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < coords.length; i += 2) {
      const d = haversineDistance(lat, lon, coords[i].latitude, coords[i].longitude);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestD > maxOffRouteMeters) continue;

    const id = `limit_${el.type}_${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    limits.push({
      id,
      latitude: lat,
      longitude: lon,
      speedLimit: limit,
      routeDistanceAt: Math.round(cumulative[bestIdx] ?? 0),
    });
  }

  return limits.sort((a, b) => a.routeDistanceAt - b.routeDistanceAt);
}

export function buildSpeedLimitOverpassQuery(bounds: CameraBounds): string {
  const bbox = `${bounds.minLat.toFixed(5)},${bounds.minLon.toFixed(5)},${bounds.maxLat.toFixed(5)},${bounds.maxLon.toFixed(5)}`;
  return [
    '[out:json][timeout:25];',
    '(',
    `node["traffic_sign"~"^(max_speed|speed_controlled)$"]["max_speed"](${bbox});`,
    `node["traffic_sign"~"^(max_speed|speed_controlled)$"]["maxspeed"](${bbox});`,
    ');',
    'out tags 500;',
  ].join('\n');
}

export function buildCameraOverpassQuery(bounds: CameraBounds): string {
  const bbox = `${bounds.minLat.toFixed(5)},${bounds.minLon.toFixed(5)},${bounds.maxLat.toFixed(5)},${bounds.maxLon.toFixed(5)}`;
  return [
    '[out:json][timeout:25];',
    '(',
    `node["highway"="traffic_sign"]["traffic_sign"~"^(max_speed|speed_controlled)$"](${bbox});`,
    `node["detect_car_speed"~"^(yes|true|traffic_sign|average|spot)$"](${bbox});`,
    ');',
    'out tags 500;',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Network access
// ---------------------------------------------------------------------------

export function mapNominatimResults(results: Record<string, unknown>[]): Destination[] {
  const out: Destination[] = [];
  for (const r of results) {
    const latitude = parseFloat(String(r.lat));
    const longitude = parseFloat(String(r.lon));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const destination: Destination = {
      id: String(r.place_id ?? `${latitude},${longitude}`),
      name: String(r.display_name ?? r.name ?? 'Bilinmeyen'),
      latitude,
      longitude,
    };
    if (typeof r.addresstype === 'string') destination.kind = r.addresstype;
    out.push(destination);
  }
  return out;
}

export class RouteService {
  static async searchDestinations(query: string, limit = 5): Promise<Destination[]> {
    const url = `${NOMINATIM_SEARCH_URL}?format=jsonv2&limit=${limit}&countrycodes=tr&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': OSM_API_USER_AGENT } });
    if (!res.ok) throw new Error(`Nominatim hatası: ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>[];
    return mapNominatimResults(data);
  }

  static async fetchSpeedCameras(route: RouteInfo): Promise<SpeedCamera[]> {
    try {
      const cumulative = computeCumulativeDistances(route.coordinates);
      const bounds = routeBoundingBox(route.coordinates);
      if (bounds.minLat === 0 && bounds.minLon === 0 && bounds.maxLat === 0 && bounds.maxLon === 0) return [];
      const query = buildCameraOverpassQuery(bounds);
      const res = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': OSM_API_USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { elements?: OverpassElement[] };
      return mapOverpassCameras(data.elements ?? [], route.coordinates, cumulative);
    } catch {
      return [];
    }
  }

  static async fetchSpeedLimits(route: RouteInfo): Promise<SpeedLimit[]> {
    try {
      const cumulative = computeCumulativeDistances(route.coordinates);
      const bounds = routeBoundingBox(route.coordinates);
      if (bounds.minLat === 0 && bounds.minLon === 0 && bounds.maxLat === 0 && bounds.maxLon === 0) return [];
      const query = buildSpeedLimitOverpassQuery(bounds);
      const res = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': OSM_API_USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { elements?: OverpassElement[] };
      return mapOverpassSpeedLimits(data.elements ?? [], route.coordinates, cumulative);
    } catch {
      return [];
    }
  }

  static async fetchRoute(start: RoutePoint, destination: Destination): Promise<RouteInfo> {
    const url = `${OSRM_ROUTE_URL}/${start.longitude},${start.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&alternatives=false`;
    const res = await fetch(url, { headers: { 'User-Agent': OSM_API_USER_AGENT } });
    if (!res.ok) throw new Error(`Rota servisi hatası: ${res.status}`);
    const data = (await res.json()) as {
      code?: string;
      routes?: {
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }[];
    };
    if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('Rota bulunamadı');

    const route = data.routes[0];
    const coordinates: RoutePoint[] = route.geometry.coordinates.map(([lon, lat]) => ({
      latitude: lat,
      longitude: lon,
    }));

    const info: RouteInfo = {
      id: `route_${destination.id}_${Date.now()}`,
      destination,
      coordinates,
      totalDistance: Math.round(route.distance),
      totalDuration: Math.round(route.duration),
      turns: computeRouteTurns(coordinates),
      speedCameras: [],
      speedLimits: [],
      fetchedAt: Date.now(),
    };

    info.speedCameras = await RouteService.fetchSpeedCameras(info);
    info.speedLimits = await RouteService.fetchSpeedLimits(info);
    return info;
  }
}
