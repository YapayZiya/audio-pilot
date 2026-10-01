import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { AudioService } from '../services/audioService';
import { HapticService } from '../services/hapticService';
import { LocationService, LocationServiceCallbacks } from '../services/locationService';
import { Turn, Notification } from '../models/types';

interface HeadDownScreenProps {
  onExitHeadDown: () => void;
}

export const HeadDownScreen: React.FC<HeadDownScreenProps> = ({ onExitHeadDown }) => {
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [speedLimit, setSpeedLimit] = useState(50);
  const [recommendedSpeed, setRecommendedSpeed] = useState(50);
  const [upcomingTurn, setUpcomingTurn] = useState<Turn | null>(null);
  const [distanceToTurn, setDistanceToTurn] = useState<number | null>(null);
  const [region, setRegion] = useState({
    latitude: 41.0082,
    longitude: 28.9784,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [showWarning, setShowWarning] = useState(false);

  const audioService = new AudioService();
  const hapticService = new HapticService();
  const locationService = new LocationService();

  useEffect(() => {
    audioService.initialize();
    hapticService.initialize();

    const callbacks: LocationServiceCallbacks = {
      onLocationUpdate: handleLocationUpdate,
      onTurnDetected: handleTurnDetected,
      onSpeedChange: handleSpeedChange,
      onError: (error) => console.error('Location error:', error),
    };

    locationService.startTracking(callbacks);

    return () => {
      locationService.stopTracking();
      audioService.stop();
    };
  }, []);

  const handleLocationUpdate = (location: Location.LocationObject) => {
    setRegion({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  };

  const handleTurnDetected = (turn: Turn) => {
    setUpcomingTurn(turn);
    setDistanceToTurn(turn.distance);

    if (turn.distance < 200) {
      setShowWarning(true);
      audioService.speakTurn(turn);
      hapticService.triggerTurnHaptic(turn);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setCurrentSpeed(speed);
  };

  const handleExit = () => {
    hapticService.triggerConfirmationHaptic();
    onExitHeadDown();
  };

  const reportPolice = async () => {
    await hapticService.triggerConfirmationHaptic();
    const notification: Notification = {
      id: Date.now().toString(),
      type: 'police',
      message: 'Polis kontrolü bildirildi.',
      priority: 'high',
      distance: 0,
      timestamp: Date.now(),
    };
    audioService.speakNotification(notification);
  };

  const reportAccident = async () => {
    await hapticService.triggerConfirmationHaptic();
    const notification: Notification = {
      id: Date.now().toString(),
      type: 'accident',
      message: 'Kaza bildirildi. Dikkatli olun.',
      priority: 'high',
      distance: 0,
      timestamp: Date.now(),
    };
    audioService.speakNotification(notification);
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={region}
        showsUserLocation
        rotateEnabled={false}
        pitchEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        toolbarEnabled={false}
      />

      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
            <Text style={styles.exitText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.statusIndicators}>
            <View style={[styles.statusDot, { backgroundColor: '#34C759' }]} />
            <Text style={styles.statusText}>GPS Aktif</Text>
          </View>
        </View>

        <View style={styles.centerContent}>
          <Text style={styles.speedText}>{Math.round(currentSpeed)}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>

        {showWarning && upcomingTurn && (
          <Animated.View style={styles.warningBox}>
            <Text style={styles.warningText}>VİRAJ!</Text>
            <Text style={styles.warningDistance}>{distanceToTurn}m</Text>
          </Animated.View>
        )}

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.reportButton} onPress={reportPolice}>
            <Text style={styles.reportButtonText}>Radar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reportButton} onPress={reportAccident}>
            <Text style={styles.reportButtonText}>Kaza</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.2,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  exitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 59, 48, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.5)',
  },
  exitText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statusIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  speedText: {
    fontSize: 120,
    fontWeight: '200',
    color: '#FFF',
    fontFamily: 'monospace',
    lineHeight: 120,
  },
  speedUnit: {
    color: '#666',
    fontSize: 18,
    fontFamily: 'monospace',
    marginTop: -10,
  },
  warningBox: {
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  warningText: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  warningDistance: {
    color: '#FFF',
    fontSize: 18,
    marginTop: 8,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  reportButton: {
    backgroundColor: 'rgba(255, 149, 0, 0.9)',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 30,
  },
  reportButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
});