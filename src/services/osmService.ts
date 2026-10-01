import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Turn, RoadSegment, CachedRoute } from '../models/types';

const LOCATION_TASK_NAME = 'background-location-task';
const OSM_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export class OSMService {
  static buildOverpassQuery(lat: number, lon: number, radiusMeters: number = 500): string {
    const latMin = lat - radiusMeters / 111320;
    const latMax = lat + radiusMeters / 111320;
    const lonMin = lon - radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
    const lonMax = lon + radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));

    return `[out:json];
      (
        way["highway"](${latMin},${lonMin},${latMax},${lonMax});
      );
      out body;
      >;
      out skel qt;`;
  }

  static async fetchRoadData(lat: number, lon: number, radiusMeters: number = 500): Promise<RoadSegment[]> {
    const query = this.buildOverpassQuery(lat, lon, radiusMeters);
    const url = `${OSM_OVERPASS_URL}?data=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseOSMData(data);
    } catch (error) {
      console.error('Failed to fetch OSM data:', error);
      return [];
    }
  }

  private static parseOSMData(data: any): RoadSegment[] {
    const nodes = new Map<number, { lat: number; lon: number }>();
    const ways: any[] = [];
    const segments: RoadSegment[] = [];

    for (const element of data.elements) {
      if (element.type === 'node') {
        nodes.set(element.id, { lat: element.lat, lon: element.lon });
      } else if (element.type === 'way') {
        ways.push(element);
      }
    }

    for (const way of ways) {
      if (!way.nodes || way.nodes.length < 2) continue;

      const speedLimit = this.extractSpeedLimit(way.tags);
      const coordinates = way.nodes.map((nodeId: number) => nodes.get(nodeId)).filter(Boolean) as {
        lat: number;
        lon: number;
      }[];

      for (let i = 0; i < coordinates.length - 1; i++) {
        const curr = coordinates[i];
        const next = coordinates[i + 1];
        const bearing = this.calculateBearing(curr.lat, curr.lon, next.lat, next.lon);

        segments.push({
          id: `${way.id}_${i}`,
          latitude: curr.lat,
          longitude: curr.lon,
          bearing,
          speedLimit,
          curvatureRadius: Infinity,
          osmWayId: String(way.id),
        });
      }
    }

    return segments;
  }

  private static extractSpeedLimit(tags: Record<string, string>): number {
    const highwayTypes: Record<string, number> = {
      motorway: 120,
      trunk: 100,
      primary: 80,
      secondary: 60,
      tertiary: 50,
      residential: 30,
      living_street: 20,
    };

    if (tags.maxspeed) {
      const parsed = parseInt(tags.maxspeed, 10);
      if (!isNaN(parsed)) return parsed;
    }

    return highwayTypes[tags.highway || 'residential'] || 50;
  }

  private static calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
    const x =
      Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  }

  static async cacheRoute(routeId: string, wayId: string, coordinates: { latitude: number; longitude: number }[]): Promise<void> {
    const route: CachedRoute = {
      wayId,
      coordinates,
      turns: [],
      downloadedAt: Date.now(),
    };

    try {
      const MMKV = (await import('react-native-mmkv')).MMKV;
      const storage = new MMKV();
      storage.set(`route_${routeId}`, JSON.stringify(route));
    } catch (error) {
      console.error('Failed to cache route:', error);
    }
  }

  static async getCachedRoute(routeId: string): Promise<CachedRoute | null> {
    try {
      const MMKV = (await import('react-native-mmkv')).MMKV;
      const storage = new MMKV();
      const data = storage.getString(`route_${routeId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get cached route:', error);
      return null;
    }
  }

  static isCacheValid(cachedRoute: CachedRoute, maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): boolean {
    return Date.now() - cachedRoute.downloadedAt < maxAgeMs;
  }
}