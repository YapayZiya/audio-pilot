export interface Turn {
  id: string;
  latitude: number;
  longitude: number;
  bearing: number;
  curvatureRadius: number;
  type: 'sharp_left' | 'sharp_right' | 'gentle_left' | 'gentle_right' | 'straight';
  speedLimit: number;
  recommendedSpeed: number;
  distance: number;
  osmWayId: string;
}

export interface RoadSegment {
  id: string;
  latitude: number;
  longitude: number;
  bearing: number;
  speedLimit: number;
  curvatureRadius: number;
  osmWayId: string;
}

export interface Notification {
  id: string;
  type: 'turn' | 'speed' | 'police' | 'accident';
  message: string;
  priority: 'low' | 'medium' | 'high';
  distance: number;
  timestamp: number;
}

export interface CachedRoute {
  wayId: string;
  coordinates: Array<{ latitude: number; longitude: number }>;
  turns: Turn[];
  downloadedAt: number;
}

export const TURN_DETECTION_THRESHOLD = 15;
export const CURVATURE_RADIUS_SHARP = 150;
export const CURVATURE_RADIUS_GENTLE = 500;
export const LOOKAHEAD_DISTANCE = 300;
export const GPS_UPDATE_INTERVAL_HIGHWAY = 500;
export const GPS_UPDATE_INTERVAL_CITY = 50;
export const AUDIO_DUCKING_LEVEL = 0.3;
export const SPLASH_DISCLAIMER = "This is not a game. You are responsible for your own safety while driving.";