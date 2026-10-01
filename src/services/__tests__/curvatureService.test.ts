import { CurvatureService } from '../curvatureService';
import {
  RoadSegment,
  Turn,
  CURVATURE_RADIUS_SHARP,
  CURVATURE_RADIUS_GENTLE,
  TURN_DETECTION_THRESHOLD,
  LOOKAHEAD_DISTANCE,
} from '../../models/types';

// Mean radius used by haversineDistance in the implementation.
const EARTH_RADIUS_M = 6371000;
const METERS_PER_DEGREE_LAT = (Math.PI / 180) * EARTH_RADIUS_M; // ~111194.93

/** Builds a point roughly `meters` due north of the reference latitude/longitude. */
function northOf(lat: number, lon: number, meters: number): { lat: number; lon: number } {
  return { lat: lat + meters / METERS_PER_DEGREE_LAT, lon };
}

/**
 * Produces RoadSegments that follow a circular arc of `radiusM`, starting due
 * north of the centre. Increasing `sweepDeg` rotates the heading towards the
 * west, i.e. it produces a left turn under standard compass conventions.
 *
 * The initial heading is returned alongside the segments because the caller has
 * to pass a `currentBearing` that is consistent with the road geometry, other
 * than the first point looks like a 265 degree turn.
 */
function arcSegments(
  radiusM: number,
  sweepDeg: number,
  stepDeg: number,
  speedLimit = 50,
  osmWayId = 'arc'
): { segments: RoadSegment[]; start: { lat: number; lon: number }; initialBearing: number } {
  const centerLat = 41.0082;
  const centerLon = 28.9784;
  const dLat = radiusM / METERS_PER_DEGREE_LAT;
  const dLon = radiusM / (METERS_PER_DEGREE_LAT * Math.cos((centerLat * Math.PI) / 180));
  const steps = Math.round(sweepDeg / stepDeg);

  const start = {
    lat: centerLat + dLat * Math.sin(Math.PI / 2),
    lon: centerLon + dLon * Math.cos(Math.PI / 2),
  };

  const segments: RoadSegment[] = [];
  for (let i = 1; i <= steps; i++) {
    const theta = ((90 + i * stepDeg) * Math.PI) / 180;
    const point = {
      lat: centerLat + dLat * Math.sin(theta),
      lon: centerLon + dLon * Math.cos(theta),
    };
    segments.push({
      id: `${osmWayId}_${i}`,
      latitude: point.lat,
      longitude: point.lon,
      bearing: 0,
      speedLimit,
      curvatureRadius: radiusM,
      osmWayId,
    });
  }

  const initialBearing = CurvatureService.calculateBearing(
    start.lat,
    start.lon,
    segments[0].latitude,
    segments[0].longitude
  );

  return { segments, start, initialBearing };
}

/** Produces RoadSegments running due north, i.e. a perfectly straight road. */
function straightSegments(count: number, stepM: number, speedLimit = 50): RoadSegment[] {
  const startLat = 41.0082;
  const startLon = 28.9784;
  const segments: RoadSegment[] = [];
  for (let i = 1; i <= count; i++) {
    const point = northOf(startLat, startLon, stepM * i);
    segments.push({
      id: `straight_${i}`,
      latitude: point.lat,
      longitude: point.lon,
      bearing: 0,
      speedLimit,
      curvatureRadius: Infinity,
      osmWayId: 'straight',
    });
  }
  return segments;
}

describe('CurvatureService.calculateBearing', () => {
  it('returns 0 for due north', () => {
    expect(CurvatureService.calculateBearing(0, 0, 1, 0)).toBeCloseTo(0, 6);
  });

  it('returns 90 for due east', () => {
    expect(CurvatureService.calculateBearing(0, 0, 0, 1)).toBeCloseTo(90, 6);
  });

  it('returns 180 for due south', () => {
    expect(CurvatureService.calculateBearing(0, 0, -1, 0)).toBeCloseTo(180, 6);
  });

  it('returns 270 for due west', () => {
    expect(CurvatureService.calculateBearing(0, 0, 0, -1)).toBeCloseTo(270, 6);
  });

  it('always returns a bearing in [0, 360)', () => {
    const bearings = [
      CurvatureService.calculateBearing(41.0, 29.0, 41.1, 28.9),
      CurvatureService.calculateBearing(41.0, 29.0, 40.9, 29.1),
      CurvatureService.calculateBearing(41.0, 29.0, 41.05, 29.05),
      CurvatureService.calculateBearing(-33.9, 151.2, -33.85, 151.25),
    ];
    for (const bearing of bearings) {
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThan(360);
    }
  });

  it('is symmetric: reversing the points mirrors the bearing across 180', () => {
    const forward = CurvatureService.calculateBearing(41.0, 29.0, 41.05, 29.03);
    const backward = CurvatureService.calculateBearing(41.05, 29.03, 41.0, 29.0);
    // The two directions are half a turn apart. They are not exactly 180 deg
    // because great-circle initial bearings converge by a small amount.
    expect(Math.abs(CurvatureService.normalizeBearingDelta(backward - forward))).toBeCloseTo(180, 1);
  });

  it('returns 0 for identical points', () => {
    expect(CurvatureService.calculateBearing(41.0, 29.0, 41.0, 29.0)).toBeCloseTo(0, 6);
  });
});

describe('CurvatureService.haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(CurvatureService.haversineDistance(41.0082, 28.9784, 41.0082, 28.9784)).toBe(0);
  });

  it('measures one degree of latitude as the sphere circumference allows', () => {
    const distance = CurvatureService.haversineDistance(0, 0, 1, 0);
    expect(distance).toBeCloseTo(METERS_PER_DEGREE_LAT, 0);
    expect(distance).toBeGreaterThan(111000);
    expect(distance).toBeLessThan(111400);
  });

  it('scales linearly with the degree offset', () => {
    const oneTenth = CurvatureService.haversineDistance(0, 0, 0.1, 0);
    expect(oneTenth).toBeCloseTo(METERS_PER_DEGREE_LAT / 10, 0);
  });

  it('matches the known great-circle distance between Istanbul and Ankara', () => {
    const distance = CurvatureService.haversineDistance(41.0082, 28.9784, 39.9334, 32.8597);
    expect(distance).toBeGreaterThan(349000);
    expect(distance).toBeLessThan(350000);
  });

  it('is symmetric', () => {
    const forward = CurvatureService.haversineDistance(41.0082, 28.9784, 41.05, 29.02);
    const backward = CurvatureService.haversineDistance(41.05, 29.02, 41.0082, 28.9784);
    expect(forward).toBeCloseTo(backward, 6);
  });

  it('is never negative', () => {
    expect(CurvatureService.haversineDistance(41.0, 29.0, 40.9, 28.9)).toBeGreaterThan(0);
  });
});

describe('CurvatureService.normalizeBearingDelta', () => {
  it.each([
    [0, 0],
    [90, 90],
    [-90, -90],
    [180, 180],
    [360, 0],
    [370, 10],
    [-370, -10],
  ])('normalises %p to %p', (input, expected) => {
    expect(CurvatureService.normalizeBearingDelta(input)).toBeCloseTo(expected, 6);
  });

  it('wraps a turn across north into the opposite sign', () => {
    // 350° -> 10° is +20° of rotation, not -340°.
    expect(CurvatureService.normalizeBearingDelta(10 - 350)).toBeCloseTo(20, 6);
    expect(CurvatureService.normalizeBearingDelta(350 - 10)).toBeCloseTo(-20, 6);
  });

  it('always produces a value in (-180, 180]', () => {
    for (const delta of [0, 45, 179, 180, 181, 270, 359, 360, 540, -45, -180, -181, -359, -720]) {
      const normalized = CurvatureService.normalizeBearingDelta(delta);
      expect(normalized).toBeGreaterThan(-180);
      expect(normalized).toBeLessThanOrEqual(180);
    }
  });
});

describe('CurvatureService.calculateCurvatureRadius', () => {
  it('returns Infinity when fewer than three points are given', () => {
    expect(CurvatureService.calculateCurvatureRadius([])).toBe(Infinity);
    expect(
      CurvatureService.calculateCurvatureRadius([{ lat: 0, lon: 0, bearing: 0 }])
    ).toBe(Infinity);
    expect(
      CurvatureService.calculateCurvatureRadius([
        { lat: 0, lon: 0, bearing: 0 },
        { lat: 0.001, lon: 0, bearing: 5 },
      ])
    ).toBe(Infinity);
  });

  it('returns Infinity when the heading does not change', () => {
    const p = northOf(41, 29, 0);
    expect(
      CurvatureService.calculateCurvatureRadius([
        { ...p, bearing: 90 },
        { lat: p.lat + 0.001, lon: p.lon, bearing: 90 },
        { lat: p.lat + 0.002, lon: p.lon, bearing: 90 },
      ])
    ).toBe(Infinity);
  });

  it('treats a sub-1 degree heading change as straight', () => {
    const p = northOf(41, 29, 0);
    expect(
      CurvatureService.calculateCurvatureRadius([
        { ...p, bearing: 90 },
        { lat: p.lat + 0.001, lon: p.lon, bearing: 90.4 },
        { lat: p.lat + 0.002, lon: p.lon, bearing: 90.8 },
      ])
    ).toBe(Infinity);
  });

  it('derives the radius of a circular arc: chord / (2 * sin(angle / 2))', () => {
    // 100 m chord with a 60 degree heading change => 100 / (2 * sin(30 deg)) = 100 m
    const p = northOf(41, 29, 0);
    const q = northOf(41, 29, 100);
    const radius = CurvatureService.calculateCurvatureRadius([
      { ...p, bearing: 0 },
      { lat: (p.lat + q.lat) / 2, lon: p.lon, bearing: 30 },
      { ...q, bearing: 60 },
    ]);
    expect(radius).toBeCloseTo(100, 0);
  });

  it('derives a wider radius for a shallower arc', () => {
    // 200 m chord with a 40 degree heading change => 200 / (2 * sin(20 deg)) ~= 292 m
    const p = northOf(41, 29, 0);
    const q = northOf(41, 29, 200);
    const radius = CurvatureService.calculateCurvatureRadius([
      { ...p, bearing: 0 },
      { lat: (p.lat + q.lat) / 2, lon: p.lon, bearing: 20 },
      { ...q, bearing: 40 },
    ]);
    expect(radius).toBeCloseTo(292, 0);
  });

  it('handles a heading change that wraps across north', () => {
    // 350 deg -> 10 deg is a 20 degree change, so the radius must be the same as
    // an unwrapped 0 deg -> 20 deg turn.
    const p = northOf(41, 29, 0);
    const q = northOf(41, 29, 100);
    const wrapped = CurvatureService.calculateCurvatureRadius([
      { ...p, bearing: 350 },
      { lat: (p.lat + q.lat) / 2, lon: p.lon, bearing: 0 },
      { ...q, bearing: 10 },
    ]);
    expect(wrapped).toBeCloseTo(100 / (2 * Math.sin((20 * Math.PI) / 360)), 0);
  });

  it('never returns a radius below the 10 m floor', () => {
    // A 5 m chord with a 170 degree heading change is geometrically ~2.5 m.
    const p = northOf(41, 29, 0);
    const q = northOf(41, 29, 5);
    const radius = CurvatureService.calculateCurvatureRadius([
      { ...p, bearing: 0 },
      { lat: (p.lat + q.lat) / 2, lon: p.lon, bearing: 85 },
      { ...q, bearing: 170 },
    ]);
    expect(radius).toBe(10);
  });

  it('uses only the last three points', () => {
    const p = northOf(41, 29, 0);
    const q = northOf(41, 29, 100);
    const points = [
      { lat: 0, lon: 0, bearing: 200 },
      { lat: 1, lon: 1, bearing: 300 },
      { ...p, bearing: 0 },
      { lat: (p.lat + q.lat) / 2, lon: p.lon, bearing: 30 },
      { ...q, bearing: 60 },
    ];
    const radius = CurvatureService.calculateCurvatureRadius(points);
    const radiusWithoutNoise = CurvatureService.calculateCurvatureRadius(points.slice(-3));
    expect(radius).toBe(radiusWithoutNoise);
  });
});

describe('CurvatureService.classifyTurn', () => {
  // Compass bearings grow clockwise, so a negative delta rotates left.
  it('classifies a tight left turn', () => {
    expect(CurvatureService.classifyTurn(100, -30)).toBe<Turn['type']>('sharp_left');
  });

  it('classifies a tight right turn', () => {
    expect(CurvatureService.classifyTurn(100, 30)).toBe<Turn['type']>('sharp_right');
  });

  it('classifies a wide left turn as gentle', () => {
    expect(CurvatureService.classifyTurn(300, -30)).toBe<Turn['type']>('gentle_left');
  });

  it('classifies a wide right turn as gentle', () => {
    expect(CurvatureService.classifyTurn(300, 30)).toBe<Turn['type']>('gentle_right');
  });

  it('classifies a nearly straight road as straight', () => {
    expect(CurvatureService.classifyTurn(2000, -5)).toBe<Turn['type']>('straight');
  });

  it('requires a heading change above the detection threshold', () => {
    // Radius is sharp but the heading barely changes.
    expect(CurvatureService.classifyTurn(50, -(TURN_DETECTION_THRESHOLD - 1))).toBe<Turn['type']>(
      'straight'
    );
    expect(CurvatureService.classifyTurn(50, -TURN_DETECTION_THRESHOLD)).toBe<Turn['type']>('straight');
    expect(CurvatureService.classifyTurn(50, -(TURN_DETECTION_THRESHOLD + 1))).toBe<Turn['type']>(
      'sharp_left'
    );
  });

  it('treats the curvature thresholds as exclusive bounds', () => {
    expect(CurvatureService.classifyTurn(CURVATURE_RADIUS_SHARP, -30)).toBe<Turn['type']>('gentle_left');
    expect(CurvatureService.classifyTurn(CURVATURE_RADIUS_GENTLE, -30)).toBe<Turn['type']>('straight');
  });

  it('classifies a right turn that wraps across north as right', () => {
    // Heading 350 deg -> 10 deg rotates clockwise through north, i.e. right.
    // The raw delta is -340, which normalises to +20.
    expect(CurvatureService.classifyTurn(100, 10 - 350)).toBe<Turn['type']>('sharp_right');
  });

  it('classifies a left turn that wraps across north as left', () => {
    // Heading 10 deg -> 350 deg rotates counter-clockwise, i.e. left.
    // The raw delta is +340, which normalises to -20.
    expect(CurvatureService.classifyTurn(100, 350 - 10)).toBe<Turn['type']>('sharp_left');
  });
});

describe('CurvatureService.calculateSafeSpeed', () => {
  it('returns the speed limit for a straight road', () => {
    expect(CurvatureService.calculateSafeSpeed(Infinity, 50)).toBe(50);
    expect(CurvatureService.calculateSafeSpeed(Infinity, 120)).toBe(120);
  });

  it('never recommends more than the posted limit', () => {
    for (const radius of [10, 50, 150, 500, 5000]) {
      for (const limit of [30, 50, 90, 120]) {
        expect(CurvatureService.calculateSafeSpeed(radius, limit)).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('applies v = sqrt(a * R) with a = 3.5 m/s^2 lateral acceleration', () => {
    // sqrt(3.5 * 150) m/s = 22.91 m/s = 82.5 km/h
    expect(CurvatureService.calculateSafeSpeed(150, 200)).toBe(82);
    // sqrt(3.5 * 10) = 5.92 m/s = 21.3 km/h
    expect(CurvatureService.calculateSafeSpeed(10, 200)).toBe(21);
  });

  it('increases monotonically with the radius', () => {
    let previous = 0;
    for (const radius of [10, 25, 50, 100, 150, 300, 500, 1000, 5000]) {
      const safeSpeed = CurvatureService.calculateSafeSpeed(radius, 250);
      expect(safeSpeed).toBeGreaterThan(previous);
      previous = safeSpeed;
    }
  });

  it('is capped by the speed limit rather than exceeding it', () => {
    expect(CurvatureService.calculateSafeSpeed(10000, 50)).toBe(50);
  });
});

describe('CurvatureService.findUpcomingTurns', () => {
  it('returns no turns for a straight road', () => {
    const start = northOf(41.0082, 28.9784, 0);
    const turns = CurvatureService.findUpcomingTurns(
      start.lat,
      start.lon,
      0,
      straightSegments(10, 30)
    );
    expect(turns).toHaveLength(0);
  });

  it('detects a sharp left turn on an arc curving west', () => {
    const { segments, start, initialBearing } = arcSegments(100, 60, 10);
    const turns = CurvatureService.findUpcomingTurns(
      start.lat,
      start.lon,
      initialBearing,
      segments
    );

    expect(turns.length).toBeGreaterThan(0);
    for (const turn of turns) {
      expect(turn.type).toBe<Turn['type']>('sharp_left');
      expect(turn.curvatureRadius).toBeCloseTo(100, 0);
    }
  });

  it('detects a gentle left turn on a wider arc', () => {
    const { segments, start, initialBearing } = arcSegments(300, 60, 10);
    const turns = CurvatureService.findUpcomingTurns(
      start.lat,
      start.lon,
      initialBearing,
      segments
    );

    expect(turns.length).toBeGreaterThan(0);
    for (const turn of turns) {
      expect(turn.type).toBe<Turn['type']>('gentle_left');
      expect(turn.curvatureRadius).toBeCloseTo(300, 0);
    }
  });

  it('reports monotonically increasing distance from the driver', () => {
    const { segments, start, initialBearing } = arcSegments(100, 60, 10);
    const turns = CurvatureService.findUpcomingTurns(
      start.lat,
      start.lon,
      initialBearing,
      segments
    );

    expect(turns.length).toBeGreaterThan(1);
    for (let i = 1; i < turns.length; i++) {
      expect(turns[i].distance).toBeGreaterThan(turns[i - 1].distance);
    }
  });

  it('never returns a turn beyond the lookahead distance', () => {
    const { segments, start, initialBearing } = arcSegments(100, 200, 5);
    const lookahead = 120;
    const turns = CurvatureService.findUpcomingTurns(
      start.lat,
      start.lon,
      initialBearing,
      segments,
      lookahead
    );

    for (const turn of turns) {
      expect(turn.distance).toBeLessThanOrEqual(lookahead);
    }
  });

  it('defaults the lookahead to LOOKAHEAD_DISTANCE', () => {
    const { segments, start, initialBearing } = arcSegments(100, 200, 5);
    const turns = CurvatureService.findUpcomingTurns(start.lat, start.lon, initialBearing, segments);
    for (const turn of turns) {
      expect(turn.distance).toBeLessThanOrEqual(LOOKAHEAD_DISTANCE);
    }
  });

  it('carries the OSM way id and speed limit through to the turn', () => {
    const { segments, start, initialBearing } = arcSegments(100, 60, 10, 90, 'way-42');
    const turns = CurvatureService.findUpcomingTurns(
      start.lat,
      start.lon,
      initialBearing,
      segments
    );

    expect(turns.length).toBeGreaterThan(0);
    for (const turn of turns) {
      expect(turn.osmWayId).toBe('way-42');
      expect(turn.speedLimit).toBe(90);
      expect(turn.recommendedSpeed).toBeLessThanOrEqual(90);
      expect(turn.id).toMatch(/^turn_way-42_\d+$/);
    }
  });

  it('returns an empty array when there are no segments', () => {
    expect(CurvatureService.findUpcomingTurns(41.0082, 28.9784, 0, [])).toHaveLength(0);
  });
});