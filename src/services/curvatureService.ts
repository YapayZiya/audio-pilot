import { Turn, RoadSegment, TURN_DETECTION_THRESHOLD, CURVATURE_RADIUS_SHARP, CURVATURE_RADIUS_GENTLE, LOOKAHEAD_DISTANCE } from '../models/types';

export class CurvatureService {
  static calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x =
      Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
      Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  }

  static calculateCurvatureRadius(points: Array<{ lat: number; lon: number; bearing: number }>): number {
    if (points.length < 3) return Infinity;

    const p1 = points[points.length - 3];
    const p2 = points[points.length - 2];
    const p3 = points[points.length - 1];

    const bearing1 = p1.bearing;
    const bearing2 = p3.bearing;
    let angleDiff = Math.abs(bearing2 - bearing1);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;

    if (angleDiff < 1) return Infinity;

    const segmentLength = this.haversineDistance(p1.lat, p1.lon, p3.lat, p3.lon);
    const radius = segmentLength / (2 * Math.sin((angleDiff * Math.PI) / 360));

    return Math.max(radius, 10);
  }

  static haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static classifyTurn(curvatureRadius: number, bearingChange: number): Turn['type'] {
    const absChange = Math.abs(bearingChange);
    const isLeft = bearingChange > 0;

    if (curvatureRadius < CURVATURE_RADIUS_SHARP && absChange > TURN_DETECTION_THRESHOLD) {
      return isLeft ? 'sharp_left' : 'sharp_right';
    }
    if (curvatureRadius < CURVATURE_RADIUS_GENTLE && absChange > TURN_DETECTION_THRESHOLD) {
      return isLeft ? 'gentle_left' : 'gentle_right';
    }
    return 'straight';
  }

  static calculateSafeSpeed(curvatureRadius: number, speedLimit: number): number {
    if (curvatureRadius === Infinity) return speedLimit;

    const lateralAccel = 3.5;
    const theoreticalSpeed = Math.sqrt(lateralAccel * curvatureRadius) * 3.6;
    return Math.min(Math.round(theoreticalSpeed), speedLimit);
  }

  static findUpcomingTurns(
    currentLat: number,
    currentLon: number,
    currentBearing: number,
    segments: RoadSegment[],
    lookaheadMeters: number = LOOKAHEAD_DISTANCE
  ): Turn[] {
    const turns: Turn[] = [];
    const points: Array<{ lat: number; lon: number; bearing: number }> = [
      { lat: currentLat, lon: currentLon, bearing: currentBearing },
    ];

    let accumulatedDistance = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const prevPoint = points[points.length - 1];
      const dist = this.haversineDistance(prevPoint.lat, prevPoint.lon, segment.latitude, segment.longitude);
      accumulatedDistance += dist;

      if (accumulatedDistance > lookaheadMeters) break;

      const bearing = this.calculateBearing(prevPoint.lat, prevPoint.lon, segment.latitude, segment.longitude);
      points.push({ lat: segment.latitude, lon: segment.longitude, bearing });

      if (points.length >= 3) {
        const curvature = this.calculateCurvatureRadius(points);
        const bearingChange = points[points.length - 1].bearing - points[points.length - 3].bearing;
        const turnType = this.classifyTurn(curvature, bearingChange);

        if (turnType !== 'straight') {
          turns.push({
            id: `turn_${segment.osmWayId}_${i}`,
            latitude: segment.latitude,
            longitude: segment.longitude,
            bearing: segment.bearing,
            curvatureRadius: curvature,
            type: turnType,
            speedLimit: segment.speedLimit,
            recommendedSpeed: this.calculateSafeSpeed(curvature, segment.speedLimit),
            distance: Math.round(accumulatedDistance),
            osmWayId: segment.osmWayId,
          });
        }
      }
    }

    return turns;
  }
}