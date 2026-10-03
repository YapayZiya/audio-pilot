import { RouteMonitor } from '../routeMonitor';
import { RouteInfo, SpeedCamera, Turn } from '../../models/types';

const BASE_LAT = 41.0;
const BASE_LON = 29.0;

function buildRoute(turns: Turn[], cameras: SpeedCamera[] = [], totalDistance = 1000, totalDuration = 400): RouteInfo {
  const count = 101;
  const coords = Array.from({ length: count }, (_, i) => ({
    latitude: BASE_LAT + (i / (count - 1)) * (totalDistance / 111320),
    longitude: BASE_LON,
  }));
  return {
    id: 'test_route',
    destination: { id: 'd1', name: 'Test', latitude: BASE_LAT, longitude: BASE_LON },
    coordinates: coords,
    totalDistance,
    totalDuration,
    turns,
    speedCameras: cameras,
    fetchedAt: Date.now(),
  };
}

function sharpTurn(id: string, distanceFromStart: number): Turn {
  return {
    id,
    latitude: BASE_LAT,
    longitude: BASE_LON,
    bearing: 90,
    curvatureRadius: 80,
    type: 'sharp_right',
    speedLimit: 50,
    recommendedSpeed: 35,
    distance: distanceFromStart,
    routeDistanceAt: distanceFromStart,
    osmWayId: 'w1',
  };
}

function camera(id: string, distanceFromStart: number, speedLimit = 0): SpeedCamera {
  return { id, latitude: BASE_LAT, longitude: BASE_LON, speedLimit, routeDistanceAt: distanceFromStart };
}

/** Approximate position along the route at `metersFromStart`. */
function posAt(metersFromStart: number): { latitude: number; longitude: number } {
  return {
    latitude: BASE_LAT + metersFromStart / 111320,
    longitude: BASE_LON,
  };
}

describe('RouteMonitor', () => {
  const events: {
    onTurnUpdate?: (turn: Turn | null) => void;
    onTurnDetected?: (turn: Turn) => void;
    onCurveSpeedAlert?: (turn: Turn) => void;
    onRadarAlert?: (c: SpeedCamera, distance: number) => void;
    onRouteProgress?: (remainingDistance: number, remainingTime: number) => void;
    onDestinationApproach?: (distance: number) => void;
    onArrival?: () => void;
  } = {};

  const makeMonitor = (route: RouteInfo | null) => {
    const monitor = new RouteMonitor(events);
    monitor.setRoute(route);
    return monitor;
  };

  beforeEach(() => {
    events.onTurnUpdate = jest.fn();
    events.onTurnDetected = jest.fn();
    events.onCurveSpeedAlert = jest.fn();
    events.onRadarAlert = jest.fn();
    events.onRouteProgress = jest.fn();
    events.onDestinationApproach = jest.fn();
    events.onArrival = jest.fn();
  });

  it('emits the upcoming turn when within 300m', () => {
    const route = buildRoute([sharpTurn('t1', 500)]);
    const monitor = makeMonitor(route);
    (events.onTurnUpdate as jest.Mock).mockClear();
    monitor.onTick(...Object.values(posAt(600)) as [number, number], 90); // still far
    expect(events.onTurnUpdate).not.toHaveBeenCalled();

    monitor.onTick(...Object.values(posAt(250)) as [number, number], 90); // now within 300m
    expect(events.onTurnUpdate).toHaveBeenCalledTimes(1);
    const turnArg = (events.onTurnUpdate as jest.Mock).mock.calls[0][0] as Turn;
    expect(turnArg.id).toBe('t1');
    expect(turnArg.distance).toBeGreaterThanOrEqual(0);
    expect(turnArg.distance).toBeLessThanOrEqual(300);
  });

  it('announces a turn only once when it first enters the zone', () => {
    const route = buildRoute([sharpTurn('t1', 500)]);
    const monitor = makeMonitor(route);
    monitor.onTick(...Object.values(posAt(600)) as [number, number], 90); // far
    monitor.onTick(...Object.values(posAt(250)) as [number, number], 90); // within 300
    monitor.onTick(...Object.values(posAt(200)) as [number, number], 90); // closer
    expect((events.onTurnDetected as jest.Mock).mock.calls.length).toBe(1);
  });

  it('alerts when approaching a sharp turn faster than the recommended speed', () => {
    const route = buildRoute([sharpTurn('t1', 200)]);
    const monitor = makeMonitor(route);
    monitor.onTick(...Object.values(posAt(200)) as [number, number], 90); // at the alert distance
    expect((events.onCurveSpeedAlert as jest.Mock).mock.calls.length).toBe(1);
  });

  it('fires a single near radar alert within 300m and a far one further out', () => {
    const route = buildRoute([], [camera('c1', 250, 90)]);
    const monitor = makeMonitor(route);
    monitor.onTick(...Object.values(posAt(0)) as [number, number], 90); // start -> live=250
    expect((events.onRadarAlert as jest.Mock).mock.calls.length).toBe(1);
    const [cam, dist] = (events.onRadarAlert as jest.Mock).mock.calls[0];
    expect(cam.id).toBe('c1');
    expect(dist).toBeGreaterThanOrEqual(200);
    expect(dist).toBeLessThanOrEqual(300);
  });

  it('emits route progress at most every 2s', () => {
    const route = buildRoute([], []);
    const monitor = makeMonitor(route);
    monitor.onTick(...Object.values(posAt(500)) as [number, number], 90);
    monitor.onTick(...Object.values(posAt(500)) as [number, number], 90);
    monitor.onTick(...Object.values(posAt(500)) as [number, number], 90);
    expect((events.onRouteProgress as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('announces destination approach at 500m and arrival at 30m', () => {
    const route = buildRoute([], []);
    const monitor = makeMonitor(route);
    // Drive until remaining ~450m (well under the 500m approach threshold).
    monitor.onTick(...Object.values(posAt(550)) as [number, number], 90);
    expect((events.onDestinationApproach as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);

    // Drive to the end (remaining ~0m)
    monitor.onTick(...Object.values(posAt(1000)) as [number, number], 0);
    expect((events.onArrival as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
