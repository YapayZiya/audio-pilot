import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Turn, RoadSegment } from '../models/types';
import { OSMService } from './osmService';
import { CurvatureService } from './curvatureService';

const LOCATION_TASK_NAME = 'background-location-task';
const GPS_UPDATE_INTERVAL_CITY = 5000;
const GPS_UPDATE_INTERVAL_HIGHWAY = 10000;
const DISTANCE_FILTER_CITY = 50;
const DISTANCE_FILTER_HIGHWAY = 500;

export interface LocationServiceCallbacks {
  onLocationUpdate: (location: Location.LocationObject) => void;
  onTurnDetected: (turn: Turn) => void;
  onSpeedChange: (speed: number) => void;
  onError: (error: Error) => void;
}

export class LocationService {
  private callbacks: LocationServiceCallbacks | null = null;
  private lastKnownLocation: Location.LocationObject | null = null;
  private currentSpeed: number = 0;
  private isTracking: boolean = false;
  private subscription: Location.LocationSubscription | null = null;
  private locationTask: string | null = null;

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

    try {
      const isHighway = this.currentSpeed > 80;
      const accuracy = Location.Accuracy.BestForNavigation;
      const distanceInterval = isHighway ? DISTANCE_FILTER_HIGHWAY : DISTANCE_FILTER_CITY;
      const timeInterval = isHighway ? GPS_UPDATE_INTERVAL_HIGHWAY : GPS_UPDATE_INTERVAL_CITY;

      this.subscription = await Location.watchPositionAsync(
        {
          accuracy,
          distanceInterval,
          timeInterval,
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

  private async handleLocationUpdate(location: Location.LocationObject): Promise<void> {
    this.lastKnownLocation = location;
    this.currentSpeed = location.coords.speed || 0;
    this.callbacks?.onLocationUpdate(location);
    this.callbacks?.onSpeedChange(this.currentSpeed);

    try {
      const roadSegments = await OSMService.fetchRoadData(
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