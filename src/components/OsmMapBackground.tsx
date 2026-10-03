import React, { useMemo } from 'react';
import { View, Image, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../utils/constants';
import { Turn } from '../models/types';

const ZOOM = 13;
const TILE_PX = 256;
const TILES_PER_SIDE = 3;
const TILE_DISPLAY = 320;

const clampLat = (lat: number) => Math.max(-85.05112878, Math.min(85.05112878, lat));

function tilePosition(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const cl = clampLat(lat);
  const latRad = (cl * Math.PI) / 180;
  const numX = ((lon + 180) / 360) * n;
  const numY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(numX);
  const y = Math.floor(numY);
  return {
    x: ((x % n) + n) % n,
    y: Math.max(0, Math.min(n - 1, y)),
    fx: numX - x,
    fy: numY - y,
  };
}

function tileUrl(z: number, x: number, y: number): string {
  return MAP_TILE_URL.replace('{s}', 'a')
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/** Inverse Mercator: fractional tile Y -> latitude. */
function latFromNumY(numY: number, z: number): number {
  const n = 2 ** z;
  const f = numY / n;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * f)));
  return clampLat(lat);
}

interface OsmMapBackgroundProps {
  latitude: number;
  longitude: number;
  upcomingTurn?: Turn | null;
  /** Extra marker (e.g. a selected destination). */
  marker?: { latitude: number; longitude: number } | null;
  opacity?: number;
  /** Enables tap-to-pick: reports the tapped map coordinate. */
  onMapTap?: (lat: number, lon: number) => void;
}

// Pure-JS OpenStreetMap tile background (3x3 tiles, user pinned to screen
// center). No native map dependency, so it cannot crash the app.
export const OsmMapBackground: React.FC<OsmMapBackgroundProps> = ({
  latitude,
  longitude,
  upcomingTurn,
  marker,
  opacity = 0.3,
  onMapTap,
}) => {
  const { width: screenW, height: screenH } = Dimensions.get('window');

  const model = useMemo(() => {
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      (latitude === 0 && longitude === 0)
    ) {
      return null;
    }

    const user = tilePosition(latitude, longitude, ZOOM);
    const scale = TILE_DISPLAY / TILE_PX;
    const gridW = TILES_PER_SIDE * TILE_DISPLAY;

    // Where the user sits inside the 3x3 grid, in display points.
    const userGridX = (TILE_PX + user.fx * TILE_PX) * scale;
    const userGridY = (TILE_PX + user.fy * TILE_PX) * scale;

    const n = 2 ** ZOOM;
    const wrapX = (tx: number) => ((tx % n) + n) % n;
    const tiles: string[] = [];
    for (let row = 0; row < TILES_PER_SIDE; row++) {
      for (let col = 0; col < TILES_PER_SIDE; col++) {
        tiles.push(tileUrl(ZOOM, wrapX(user.x + col - 1), user.y + row - 1));
      }
    }

    const project = (
      lat: number,
      lon: number
    ): { left: number; top: number } | null => {
      const t = tilePosition(lat, lon, ZOOM);
      let dxTiles = t.x - user.x;
      const dyTiles = t.y - user.y;
      // Handle the antipodal wrap so points near the date line still show.
      if (Math.abs(dxTiles + 1) < Math.abs(dxTiles)) dxTiles = dxTiles + 1;
      if (Math.abs(dxTiles - 1) < Math.abs(dxTiles)) dxTiles = dxTiles - 1;
      if (Math.abs(dxTiles) <= 1 && Math.abs(dyTiles) <= 1) {
        const gx = (TILE_PX + dxTiles * TILE_PX + t.fx * TILE_PX) * scale;
        const gy = (TILE_PX + dyTiles * TILE_PX + t.fy * TILE_PX) * scale;
        return { left: gx - userGridX, top: gy - userGridY };
      }
      return null;
    };

    let turn: { left: number; top: number; color: string } | null = null;
    if (upcomingTurn && Number.isFinite(upcomingTurn.latitude) && Number.isFinite(upcomingTurn.longitude)) {
      const p = project(upcomingTurn.latitude, upcomingTurn.longitude);
      if (p) {
        turn = { ...p, color: upcomingTurn.type.includes('sharp') ? '#FF3B30' : '#FFCC00' };
      }
    }

    let markerPos: { left: number; top: number } | null = null;
    if (marker && Number.isFinite(marker.latitude) && Number.isFinite(marker.longitude)) {
      markerPos = project(marker.latitude, marker.longitude);
    }

    return {
      gridLeft: screenW / 2 - userGridX,
      gridTop: screenH / 2 - userGridY,
      gridW,
      tiles,
      turn,
      markerPos,
      user,
      n,
    };
  }, [latitude, longitude, upcomingTurn, marker, screenW, screenH]);

  if (!model) {
    return <View style={[StyleSheet.absoluteFill, { opacity, backgroundColor: '#000' }]} />;
  }

  const handleTap = onMapTap
    ? (e: { nativeEvent: { locationX: number; locationY: number } }) => {
        const gx = e.nativeEvent.locationX - model.gridLeft;
        const gy = e.nativeEvent.locationY - model.gridTop;
        if (gx < 0 || gy < 0 || gx > model.gridW || gy > model.gridW) return;
        const numX = model.user.x - 1 + gx / TILE_DISPLAY;
        const numY = model.user.y - 1 + gy / TILE_DISPLAY;
        const lon = (numX / model.n) * 360 - 180;
        const lat = latFromNumY(numY, ZOOM);
        onMapTap(lat, lon);
      }
    : undefined;

  const dots: React.ReactNode[] = [];
  dots.push(
    <View
      key="user-dot"
      style={[
        styles.dot,
        {
          left: model.gridW / 2 - 6,
          top: model.gridW / 2 - 6,
          backgroundColor: '#007AFF',
          borderColor: '#FFF',
        },
      ]}
    />
  );
  if (model.turn) {
    dots.push(
      <View
        key="turn-dot"
        style={[
          styles.dot,
          {
            left: model.turn.left - 5,
            top: model.turn.top - 5,
            backgroundColor: model.turn.color,
            borderColor: '#000',
          },
        ]}
      />
    );
  }
  if (model.markerPos) {
    dots.push(
      <View
        key="marker-dot"
        style={[
          styles.dot,
          {
            left: model.markerPos.left - 8,
            top: model.markerPos.top - 8,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: '#FF3B30',
            borderColor: '#FFF',
          },
        ]}
      />
    );
  }

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, { opacity, backgroundColor: '#0A0A0C', overflow: 'hidden' }]}
      onPress={handleTap}
      onLongPress={handleTap}
    >
      <View
        style={{
          position: 'absolute',
          left: model.gridLeft,
          top: model.gridTop,
          width: model.gridW,
          height: model.gridW,
          flexDirection: 'row',
          flexWrap: 'wrap',
        }}
      >
        {model.tiles.map((uri) => (
          <Image
            key={uri}
            source={{ uri }}
            style={{ width: TILE_DISPLAY, height: TILE_DISPLAY }}
            resizeMode="cover"
          />
        ))}
      </View>

      <View
        style={{
          position: 'absolute',
          left: model.gridLeft,
          top: model.gridTop,
          width: model.gridW,
          height: model.gridW,
        }}
      >
        {dots}
      </View>

      <Text style={styles.attribution}>{MAP_ATTRIBUTION}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  attribution: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    color: '#555',
    fontSize: 9,
  },
});
