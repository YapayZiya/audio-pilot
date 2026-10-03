import { LOOKAHEAD_DISTANCE, RouteInfo, SpeedCamera, SpeedLimit, Turn } from '../models/types';
import {
  CURVE_SPEED_ALERT_DISTANCE,
  DESTINATION_APPROACH_DISTANCE,
  RADAR_NEAR_WARNING_DISTANCE,
  RADAR_WARNING_DISTANCE,
  SPEED_ALERT_OVER_LIMIT,
  SPEED_LIMIT_LOOKAHEAD,
} from '../utils/constants';
import {
  computeCumulativeDistances,
  projectOntoRoute,
  type RouteProgress,
} from './routeService';

export interface RouteEvents {
  /** New or refreshed next-turn for the cockpit display (fires at most every ~2s). */
  onTurnUpdate?: (turn: Turn | null) => void;
  /** A turn just entered the warning zone (first time) - announce it. */
  onTurnDetected?: (turn: Turn) => void;
  /** A sharp turn got close while driving faster than the recommended speed. */
  onCurveSpeedAlert?: (turn: Turn) => void;
  /** A speed camera / enforcement zone is approaching. */
  onRadarAlert?: (camera: SpeedCamera, distance: number) => void;
  /** Current speed exceeds the upcoming route speed limit. */
  onSpeedAlert?: (limit: SpeedLimit, currentSpeed: number) => void;
  /** Periodic remaining distance / ETA update. */
  onRouteProgress?: (remainingDistance: number, remainingTime: number) => void;
  /** The destination is within DESTINATION_APPROACH_DISTANCE. */
  onDestinationApproach?: (distance: number) => void;
  /** The destination was reached. */
  onArrival?: () => void;
}

export class RouteMonitor {
  private route: RouteInfo | null = null;
  private cumulative: number[] = [];
  private lastProgressIndex = 0;

  private nextTurnId: string | null = null;
  private nextTurnLastDistance = Infinity;
  private announcedTurns = new Set<string>();
  private curveAlerted = new Set<string>();
  private radarAlertLevel = new Map<string, 0 | 1 | 2>();
  private speedAlerted = new Set<string>();
  private destinationAnnounced = false;
  private arrived = false;
  private lastProgressEmit = 0;

  constructor(private events: RouteEvents) {}

  setRoute(route: RouteInfo | null): void {
    this.route = route;
    this.cumulative = route ? computeCumulativeDistances(route.coordinates) : [];
    this.lastProgressIndex = 0;
    this.nextTurnId = null;
    this.nextTurnLastDistance = Infinity;
    this.announcedTurns.clear();
    this.curveAlerted.clear();
    this.radarAlertLevel.clear();
    this.speedAlerted.clear();
    this.destinationAnnounced = false;
    this.arrived = false;
    this.events.onTurnUpdate?.(null);
  }

  get routeInfo(): RouteInfo | null {
    return this.route;
  }

  /** Feed one GPS tick (~1 Hz). */
  onTick(lat: number, lon: number, speedKmh: number): void {
    if (!this.route || this.route.coordinates.length < 2) return;

    const progress = projectOntoRoute(
      this.route.coordinates,
      this.cumulative,
      { latitude: lat, longitude: lon },
      this.lastProgressIndex,
      this.route.totalDistance,
      this.route.totalDuration
    );
    this.lastProgressIndex = progress.index;

    this.handleTurns(progress, speedKmh);
    this.handleRadar(progress);
    this.handleSpeed(progress, speedKmh);
    this.handleDestination(progress);
  }

  private handleTurns(progress: RouteProgress, speedKmh: number): void {
    const route = this.route;
    if (!route) return;

    const upcoming = route.turns
      .map((t) => ({ t, live: (t.routeDistanceAt ?? t.distance) - progress.distanceFromStart }))
      .filter(({ live }) => live > -50 && live <= LOOKAHEAD_DISTANCE)
      .sort((a, b) => a.live - b.live)[0];

    if (upcoming) {
      const turn: Turn = { ...upcoming.t, distance: Math.max(0, Math.round(upcoming.live)) };
      const isNew = this.nextTurnId !== upcoming.t.id;
      const movedEnough = Math.abs(turn.distance - this.nextTurnLastDistance) >= 25;

      if (isNew || movedEnough) {
        this.events.onTurnUpdate?.(turn);
        this.nextTurnLastDistance = turn.distance;
        this.nextTurnId = upcoming.t.id;
      }

      if (isNew && !this.announcedTurns.has(upcoming.t.id)) {
        this.announcedTurns.add(upcoming.t.id);
        this.events.onTurnDetected?.(turn);
      }

      if (
        turn.type.includes('sharp') &&
        turn.distance <= CURVE_SPEED_ALERT_DISTANCE &&
        speedKmh > turn.recommendedSpeed + 5 &&
        !this.curveAlerted.has(upcoming.t.id)
      ) {
        this.curveAlerted.add(upcoming.t.id);
        this.events.onCurveSpeedAlert?.(turn);
      }
    } else {
      if (this.nextTurnId !== null) {
        this.nextTurnId = null;
        this.nextTurnLastDistance = Infinity;
        this.events.onTurnUpdate?.(null);
      }
    }

    this.emitRouteProgress(progress);
  }

  private handleRadar(progress: RouteProgress): void {
    const route = this.route;
    if (!route || route.speedCameras.length === 0) return;

    let nearest: { camera: SpeedCamera; live: number } | null = null;
    for (const camera of route.speedCameras) {
      const live = camera.routeDistanceAt - progress.distanceFromStart;
      if (live > -50 && live <= RADAR_WARNING_DISTANCE && (nearest === null || live < nearest.live)) {
        nearest = { camera, live: Math.max(0, Math.round(live)) };
      }
    }
    if (!nearest) return;

    const level: 1 | 2 = nearest.live <= RADAR_NEAR_WARNING_DISTANCE ? 2 : 1;
    const previous = this.radarAlertLevel.get(nearest.camera.id) ?? 0;
    if (level > previous) {
      this.radarAlertLevel.set(nearest.camera.id, level);
      this.events.onRadarAlert?.(nearest.camera, nearest.live);
    }
  }

  private handleSpeed(progress: RouteProgress, speedKmh: number): void {
    const route = this.route;
    if (!route || route.speedLimits.length === 0 || speedKmh <= 0) return;

    const upcoming = route.speedLimits
      .map((l) => ({ l, live: l.routeDistanceAt - progress.distanceFromStart }))
      .filter(({ live }) => live > 0 && live <= SPEED_LIMIT_LOOKAHEAD)
      .sort((a, b) => a.live - b.live)[0];

    if (!upcoming) return;
    if (upcoming.l.speedLimit <= 0) return;
    if (speedKmh < upcoming.l.speedLimit + SPEED_ALERT_OVER_LIMIT) return;
    if (this.speedAlerted.has(upcoming.l.id)) return;

    this.speedAlerted.add(upcoming.l.id);
    this.events.onSpeedAlert?.(upcoming.l, speedKmh);
  }

  private handleDestination(progress: RouteProgress): void {
    if (!this.route) return;

    if (!this.arrived && progress.remainingDistance <= 30) {
      this.arrived = true;
      this.events.onArrival?.();
      return;
    }
    if (!this.destinationAnnounced && progress.remainingDistance <= DESTINATION_APPROACH_DISTANCE) {
      this.destinationAnnounced = true;
      this.events.onDestinationApproach?.(Math.round(progress.remainingDistance));
    }
  }

  private emitRouteProgress(progress: RouteProgress): void {
    // Throttle to ~0.5 Hz to keep state churn low.
    if (Date.now() - this.lastProgressEmit < 2000) return;
    this.lastProgressEmit = Date.now();
    this.events.onRouteProgress?.(Math.round(progress.remainingDistance), Math.round(progress.remainingTime));
  }
}
