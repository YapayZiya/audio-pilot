import {
  computeCumulativeDistances,
  computeRouteTurns,
  haversineDistance,
  bearingBetween,
  mapNominatimResults,
  mapOverpassCameras,
  projectOntoRoute,
  routeBoundingBox,
} from '../routeService';
import { RoutePoint } from '../../models/types';

const BASE_LAT = 41.0;
const BASE_LON = 29.0;

/** Local ENU meters -> lat/lon around the base point. */
function toLatLng(xMeters: number, yMeters: number): RoutePoint {
  return {
    latitude: BASE_LAT + yMeters / 111320,
    longitude: BASE_LON + xMeters / (111320 * Math.cos((BASE_LAT * Math.PI) / 180)),
  };
}

/** Polyline points in meters, then converted to lat/lon. */
function routeFromMeters(points: Array<[number, number]>): RoutePoint[] {
  return points.map(([x, y]) => toLatLng(x, y));
}

describe('haversineDistance', () => {
  it('computes the known Istanbul distance', () => {
    const d = haversineDistance(41.0, 29.0, 41.01, 29.0);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1130);
  });

  it('returns zero for identical points', () => {
    expect(haversineDistance(41.0, 29.0, 41.0, 29.0)).toBe(0);
  });
});

describe('bearingBetween', () => {
  it('north is 0, east is 90', () => {
    expect(bearingBetween(41, 29, 41.01, 29)).toBeCloseTo(0, 0);
    expect(bearingBetween(41, 29, 41, 29.01)).toBeCloseTo(90, 0);
  });
});

describe('computeCumulativeDistances', () => {
  it('accumulates segment lengths', () => {
    const coords = routeFromMeters([
      [0, 0],
      [0, 100],
      [0, 200],
    ]);
    const cum = computeCumulativeDistances(coords);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeGreaterThan(95);
    expect(cum[1]).toBeLessThan(105);
    expect(cum[2]).toBeGreaterThan(195);
    expect(cum[2]).toBeLessThan(205);
  });
});

describe('computeRouteTurns', () => {
  it('finds no turns on a straight line', () => {
    const coords = routeFromMeters(
      Array.from({ length: 20 }, (_, i) => [0, i * 40])
    );
    expect(computeRouteTurns(coords)).toHaveLength(0);
  });

  it('detects a sharp right 90 degree corner', () => {
    const coords: Array<[number, number]> = [
      ...Array.from({ length: 8 }, (_, i): [number, number] => [0, i * 45]),
      ...Array.from({ length: 7 }, (_, i): [number, number] => [(i + 1) * 45, 315]),
    ];
    const turns = computeRouteTurns(routeFromMeters(coords));
    expect(turns.length).toBe(1);
    expect(turns[0].type).toBe('sharp_right');
    expect(turns[0].curvatureRadius).toBeLessThan(150);
    expect(turns[0].routeDistanceAt).toBeGreaterThanOrEqual(250);
    expect(turns[0].routeDistanceAt).toBeLessThanOrEqual(360);
    expect(turns[0].recommendedSpeed).toBeLessThanOrEqual(50);
  });

  it('detects a gentle curve on an arc', () => {
    // Arc of radius 300m, 40 degrees to the right, with straight approach
    // and a straight continuation in the exit heading.
    const radius = 300;
    const totalDeg = 40;
    const arc: Array<[number, number]> = [];
    let x = 0;
    let y = 0;
    let heading = 0; // radians, 0 = north, right turns increase it
    const steps = 12;
    const stepAngle = (totalDeg * Math.PI) / 180 / steps;
    for (let s = 0; s <= steps; s++) {
      arc.push([x, y]);
      const stepLen = radius * stepAngle;
      x += Math.sin(heading) * stepLen;
      y += Math.cos(heading) * stepLen;
      heading += stepAngle;
    }
    const lastArc = arc[arc.length - 1];
    const continuation: Array<[number, number]> = Array.from({ length: 4 }, (_, s): [number, number] => [
      lastArc[0] + Math.sin(heading) * (s + 1) * 40,
      lastArc[1] + Math.cos(heading) * (s + 1) * 40,
    ]);
    const coords: Array<[number, number]> = [
      [0, -120],
      [0, -60],
      ...arc.map(([ax, ay]): [number, number] => [ax, ay + 60]),
      ...continuation.map(([cx, cy]): [number, number] => [cx, cy + 60]),
    ];
    const turns = computeRouteTurns(routeFromMeters(coords));
    expect(turns.length).toBe(1);
    expect(turns[0].type).toBe('gentle_right');
    expect(turns[0].curvatureRadius).toBeGreaterThan(150);
    expect(turns[0].curvatureRadius).toBeLessThan(500);
  });

  it('returns empty for too-short routes', () => {
    expect(computeRouteTurns(routeFromMeters([[0, 0], [0, 10], [0, 20]]))).toHaveLength(0);
  });
});

describe('projectOntoRoute', () => {
  const coords = routeFromMeters(
    Array.from({ length: 101 }, (_, i) => [0, i * 10])
  );
  const cumulative = computeCumulativeDistances(coords);
  const total = cumulative[cumulative.length - 1];

  it('projects onto the nearest route point', () => {
    const pos = toLatLng(0, 250);
    const p = projectOntoRoute(coords, cumulative, pos, 0, total, 400);
    expect(p.index).toBeGreaterThanOrEqual(24);
    expect(p.index).toBeLessThanOrEqual(26);
    expect(p.distanceFromStart).toBeGreaterThan(240);
    expect(p.distanceFromStart).toBeLessThan(260);
    expect(p.offRoute).toBe(false);
    expect(p.remainingDistance).toBeGreaterThan(740);
    expect(p.remainingDistance).toBeLessThan(760);
  });

  it('flags points far from the route as off-route', () => {
    const pos = toLatLng(400, 500); // 400m east of the route
    const p = projectOntoRoute(coords, cumulative, pos, 50, total, 400);
    expect(p.offRoute).toBe(true);
    expect(p.offRouteMeters).toBeGreaterThan(350);
  });

  it('searches forward from the last index', () => {
    const pos = toLatLng(0, 990);
    const p = projectOntoRoute(coords, cumulative, pos, 90, total, 400);
    expect(p.index).toBeGreaterThanOrEqual(98);
    expect(p.index).toBeLessThanOrEqual(100);
  });
});

describe('routeBoundingBox', () => {
  it('pads the route extent', () => {
    const coords = routeFromMeters([
      [0, 0],
      [0, 1000],
    ]);
    const b = routeBoundingBox(coords, 500);
    expect(b.minLat).toBeLessThan(BASE_LAT);
    expect(b.maxLat).toBeGreaterThan(BASE_LAT + 1000 / 111320);
    expect(b.minLon).toBeLessThan(BASE_LON);
    expect(b.maxLon).toBeGreaterThan(BASE_LON);
  });
});

describe('mapNominatimResults', () => {
  it('maps display results to destinations', () => {
    const out = mapNominatimResults([
      { place_id: '1', display_name: 'Karaköy, İstanbul', lat: '41.02', lon: '28.97', addresstype: 'neighbourhood' },
      { place_id: '2', name: 'IETT Durak', lat: '41.03', lon: '28.98' },
      { display_name: 'geçersiz', lat: 'abc', lon: '28.98' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('Karaköy, İstanbul');
    expect(out[0].kind).toBe('neighbourhood');
    expect(out[0].latitude).toBeCloseTo(41.02);
    expect(out[1].name).toBe('IETT Durak');
    expect(out[1].kind).toBeUndefined();
  });
});

describe('mapOverpassCameras', () => {
  const coords = routeFromMeters(
    Array.from({ length: 101 }, (_, i) => [0, i * 10])
  );
  const cumulative = computeCumulativeDistances(coords);

  it('maps cameras near the route and drops far ones', () => {
    const near = toLatLng(10, 500);
    const far = toLatLng(3000, 500);
    const out = mapOverpassCameras(
      [
        {
          type: 'node',
          id: 1,
          lat: near.latitude,
          lon: near.longitude,
          tags: { highway: 'traffic_sign', traffic_sign: 'max_speed', max_speed: '90' },
        },
        {
          type: 'node',
          id: 2,
          lat: far.latitude,
          lon: far.longitude,
          tags: { highway: 'traffic_sign', traffic_sign: 'max_speed', max_speed: '50' },
        },
        { type: 'node', id: 3, lat: near.latitude, lon: near.longitude, tags: {} },
      ],
      coords,
      cumulative
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('camera_node_1');
    expect(out[0].speedLimit).toBe(90);
    expect(out[0].routeDistanceAt).toBeGreaterThan(450);
    expect(out[0].routeDistanceAt).toBeLessThan(550);
  });

  it('parses speed_controlled zones and detect_car_speed cameras', () => {
    const near = toLatLng(-8, 200);
    const out = mapOverpassCameras(
      [
        { type: 'node', id: 10, lat: near.latitude, lon: near.longitude, tags: { traffic_sign: 'speed_controlled' } },
        { type: 'node', id: 11, lat: near.latitude, lon: near.longitude, tags: { detect_car_speed: 'traffic_sign', max_speed: '70' } },
      ],
      coords,
      cumulative
    );
    expect(out.map((c) => c.id).sort()).toEqual(['camera_node_10', 'camera_node_11']);
    expect(out.find((c) => c.id === 'camera_node_10')?.speedLimit).toBe(0);
    expect(out.find((c) => c.id === 'camera_node_11')?.speedLimit).toBe(70);
  });
});
