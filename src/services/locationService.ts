import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Turn, RoadSegment, RouteInfo, SpeedCamera, SpeedLimit } from '../models/types';
import { OSMService } from './osmService';
import { CurvatureService } from './curvatureService';
import { RouteMonitor } from './routeMonitor';

const GPS_UPDATE_INTERVAL_MS = 1000;
const CORRIDOR_FETCH_MIN_INTERVAL_MS = 8000;
const CORRIDOR_FETCH_MIN_MOVEMENT_M = 30;

export interface LocationServiceCallbacks {
  onLocationUpdate: (location: Location.LocationObject) => void;
  onTurnDetected: (turn: Turn) => void;
  onSpeedChange: (speed: number) => void;
  onError: (error: Error) => void;
  /** Refreshed next-turn for the cockpit display. */
  onTurnUpdate?: (turn: Turn | null) => void;
  /** Approaching a sharp curve faster than the recommended speed. */
  onCurveSpeedAlert?: (turn: Turn) => void;
  /** A speed camera / enforcement zone is approaching. */
  onRadarAlert?: (camera: SpeedCamera, distance: number) => void;
  /** Current speed exceeds the upcoming route speed limit. */
  onSpeedAlert?: (limit: SpeedLimit, currentSpeed: number) => void;
  /** Remaining route distance (m) and ETA (s). */
  onRouteProgress?: (remainingDistance: number, remainingTime: number) => void;
  /** Destination within 500m. */
  onDestinationApproach?: (distance: number) => void;
  /** Destination reached. */
  onArrival?: () => void;
}

export class LocationService {
  private callbacks: LocationServiceCallbacks | null = null;
  private lastKnownLocation: Location.LocationObject | null = null;
  private currentSpeed: number = 0;
  private isTracking: boolean = false;
  private subscription: Location.LocationSubscription | null = null;
  private locationTask: string | null = null;

  private monitor: RouteMonitor | null = null;
  private activeRoute: RouteInfo | null = null;

  private lastCorridorFetchAt = 0;
  private lastCorridorFetchPos: { latitude: number; longitude: number } | null = null;

  async requestPermissions(): Promise<boolean> {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        console.warn('Foreground location permission denied');
        return false;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        console.warn('Background location permission denied');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }

  async startTracking(callbacks: LocationServiceCallbacks): Promise<boolean> {
    if (this.isTracking) return true;

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return false;

    this.callbacks = callbacks;

    this.monitor = new RouteMonitor({
      onTurnUpdate: (turn) => this.callbacks?.onTurnUpdate?.(turn),
      onTurnDetected: (turn) => this.callbacks?.onTurnDetected(turn),
      onCurveSpeedAlert: (turn) => this.callbacks?.onCurveSpeedAlert?.(turn),
      onRadarAlert: (camera, distance) => this.callbacks?.onRadarAlert?.(camera, distance),
      onSpeedAlert: (limit, currentSpeed) => this.callbacks?.onSpeedAlert?.(limit, currentSpeed),
      onRouteProgress: (remainingDistance, remainingTime) =>
        this.callbacks?.onRouteProgress?.(remainingDistance, remainingTime),
      onDestinationApproach: (distance) => this.callbacks?.onDestinationApproach?.(distance),
      onArrival: () => this.callbacks?.onArrival?.(),
    });
    this.monitor.setRoute(this.activeRoute);

    try {
      // Highest accuracy at the fastest rate the device allows (~1 Hz): the
      // speedometer must update in real time, never on a 5-10s cycle.
      this.subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: GPS_UPDATE_INTERVAL_MS,
          distanceInterval: 0,
          mayShowUserSettingsDialog: true,
        },
        (location) => this.handleLocationUpdate(location)
      );

      this.isTracking = true;
      console.log('Location tracking started');
      return true;
    } catch (error) {
      console.error('Failed to start location tracking:', error);
      this.callbacks?.onError(error as Error);
      return false;
    }
  }

  stopTracking(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }

    if (this.locationTask) {
      TaskManager.unregisterTaskAsync(this.locationTask).catch(console.error);
      this.locationTask = null;
    }

    this.isTracking = false;
    console.log('Location tracking stopped');
  }

  /** Attach (or clear) the active route for live turn/radar/ETA monitoring. */
  setRoute(route: RouteInfo | null): void {
    this.activeRoute = route;
    this.monitor?.setRoute(route);
    if (route) {
      // The first tick of the monitor will re-emit the initial state.
      this.lastCorridorFetchAt = 0;
      this.lastCorridorFetchPos = null;
    }
  }

  getRoute(): RouteInfo | null {
    return this.activeRoute;
  }

  private async handleLocationUpdate(location: Location.LocationObject): Promise<void> {
    this.lastKnownLocation = location;

    // GPS speed can be null at standstill / cold start; keep the last value
    // instead of blinking back to 0 on every such fix.
    const speedMs = location.coords.speed;
    if (typeof speedMs === 'number' && Number.isFinite(speedMs) && speedMs >= 0) {
      this.currentSpeed = speedMs * 3.6;
    }

    this.callbacks?.onLocationUpdate(location);
    this.callbacks?.onSpeedChange(this.currentSpeed);

    if (this.activeRoute) {
      // Route-based monitoring is pure local math - run it on every tick.
      this.monitor?.onTick(location.coords.latitude, location.coords.longitude, this.currentSpeed);
      return;
    }

    // No route: fall back to nearby road analysis, throttled so the Overpass
    // API is not hammered at 1 Hz.
    const now = Date.now();
    const last = this.lastCorridorFetchPos;
    const moved =
      !last ||
      CurvatureService.haversineDistance(last.latitude, last.longitude, location.coords.latitude, location.coords.longitude) >=
        CORRIDOR_FETCH_MIN_MOVEMENT_M;
    if (now - this.lastCorridorFetchAt < CORRIDOR_FETCH_MIN_INTERVAL_MS || !moved) return;
    this.lastCorridorFetchAt = now;
    this.lastCorridorFetchPos = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };

    try {
      const roadSegments: RoadSegment[] = await OSMService.fetchRoadData(
        location.coords.latitude,
        location.coords.longitude,
        this.currentSpeed > 80 ? 1000 : 500
      );

      if (roadSegments.length > 0) {
        const bearing = location.coords.heading || 0;
        const upcomingTurns = CurvatureService.findUpcomingTurns(
          location.coords.latitude,
          location.coords.longitude,
          bearing,
          roadSegments
        );

        for (const turn of upcomingTurns) {
          if (turn.distance <= 300 && turn.distance > 0) {
            this.callbacks?.onTurnDetected(turn);
          }
        }
      }
    } catch (error) {
      console.error('Error processing location update:', error);
    }
  }

  getCurrentLocation(): Location.LocationObject | null {
    return this.lastKnownLocation;
  }

  getCurrentSpeed(): number {
    return this.currentSpeed;
  }

  isCurrentlyTracking(): boolean {
    return this.isTracking;
  }
}
