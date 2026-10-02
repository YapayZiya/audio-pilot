import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  AppState,
  AppStateStatus,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as KeepAwake from 'expo-keep-awake';
import { AudioService } from '../services/audioService';
import { HapticService } from '../services/hapticService';
import { LocationService, LocationServiceCallbacks } from '../services/locationService';
import { Turn, Notification } from '../models/types';
import { MinimalCockpit } from '../components/MinimalCockpit';
import { OsmMapBackground } from '../components/OsmMapBackground';

type ScreenMode = 'splash' | 'drive' | 'head-down';

export const DriveScreen: React.FC = () => {
  const [screenMode, setScreenMode] = useState<ScreenMode>('splash');
  const [isHeadDown, setIsHeadDown] = useState(false);
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const audioService = new AudioService();
  const hapticService = new HapticService();
  const locationService = new LocationService();

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active' && !isHeadDown) {
      KeepAwake.deactivateKeepAwake();
    } else if (nextAppState === 'background' && isHeadDown) {
      KeepAwake.activateKeepAwake();
    }
  };

  const initializeApp = async () => {
    try {
      await audioService.initialize();
      await hapticService.initialize();

      const callbacks: LocationServiceCallbacks = {
        onLocationUpdate: handleLocationUpdate,
        onTurnDetected: handleTurnDetected,
        onSpeedChange: handleSpeedChange,
        onError: handleLocationError,
      };

      const trackingStarted = await locationService.startTracking(callbacks);
      if (trackingStarted) {
        setIsInitialized(true);
        setScreenMode('drive');
        KeepAwake.activateKeepAwake();
      } else {
        setPermissionDenied(true);
        audioService.speak(
          'Konum izni verilmedi. Sürüş modu için konum izinlerini açmalısınız.',
          'high'
        );
      }
    } catch (error) {
      console.error('App initialization failed:', error);
      Alert.alert('Hata', 'Uygulama başlatılamadı.');
    }
  };

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
    audioService.speakTurn(turn);
    hapticService.triggerTurnHaptic(turn);
  };

  const handleSpeedChange = (speed: number) => {
    setCurrentSpeed(speed);
    if (speed > 80) {
      locationService.stopTracking();
      setTimeout(async () => {
        await locationService.startTracking({
          onLocationUpdate: handleLocationUpdate,
          onTurnDetected: handleTurnDetected,
          onSpeedChange: handleSpeedChange,
          onError: handleLocationError,
        });
      }, 1000);
    }
  };

  const handleLocationError = (error: Error) => {
    console.error('Location error:', error);
    Alert.alert('Konum Hatası', 'GPS sinyali zayıf. Lütfen konum ayarlarınızı kontrol edin.');
  };

  const toggleHeadDownMode = useCallback(() => {
    const newMode = !isHeadDown;
    setIsHeadDown(newMode);

    if (newMode) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      KeepAwake.activateKeepAwake();
      audioService.speak('Kafa aşağı modu aktif', 'medium');
    } else {
      KeepAwake.deactivateKeepAwake();
    }
  }, [isHeadDown, audioService]);

  const toggleScreen = useCallback(() => {
    if (screenMode === 'drive') {
      setScreenMode('head-down');
      setIsHeadDown(true);
      KeepAwake.activateKeepAwake();
    } else if (screenMode === 'head-down') {
      setScreenMode('drive');
      setIsHeadDown(false);
      KeepAwake.deactivateKeepAwake();
    }
  }, [screenMode]);

  const reportPolice = useCallback(async () => {
    await hapticService.triggerConfirmationHaptic();
    const notification: Notification = {
      id: Date.now().toString(),
      type: 'police',
      message: 'Polis kontrolü bildirildi.',
      priority: 'high',
      distance: 0,
      timestamp: Date.now(),
    };
    setNotifications((prev) => [...prev, notification]);
    audioService.speakNotification(notification);
  }, [audioService, hapticService]);

  const reportAccident = useCallback(async () => {
    await hapticService.triggerConfirmationHaptic();
    const notification: Notification = {
      id: Date.now().toString(),
      type: 'accident',
      message: 'Kaza bildirildi. Dikkatli olun.',
      priority: 'high',
      distance: 0,
      timestamp: Date.now(),
    };
    setNotifications((prev) => [...prev, notification]);
    audioService.speakNotification(notification);
  }, [audioService, hapticService]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    // initializeApp() is async and awaits audio/haptics/location setup before any
    // setState call, so there is no synchronous state update inside this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initializeApp();
    return () => {
      locationService.stopTracking();
      audioService.stop();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isHeadDown]);

  const renderSplashScreen = () => (
    <View style={styles.splashContainer}>
      <Text style={styles.splashTitle}>AudioPilot</Text>
      <Text style={styles.splashSubtitle}>Görünmez Sürüş Asistanı</Text>
      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerTitle}>UYARI</Text>
        <Text style={styles.disclaimerText}>
          Bu bir oyun değildir. Direksiyon başında sorumluluk sizdedir.
        </Text>
        <Text style={styles.disclaimerText}>
          Ekrana bakmadan sürüşünüz tehlikedir. Sadece sesli ve haptik uyarılara güvenin.
        </Text>
      </View>
      {permissionDenied ? (
        <View style={styles.permissionBox}>
          <Text style={styles.permissionText}>
            Konum izni verilmedi. Sürüş modu başlatılamaz.
          </Text>
          <TouchableOpacity style={styles.startButton} onPress={() => {
            setPermissionDenied(false);
            initializeApp();
          }}>
            <Text style={styles.startButtonText}>TEKRAR DENE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsButton} onPress={() => Linking.openSettings()}>
            <Text style={styles.settingsButtonText}>Telefonda İzinleri Aç</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.startButton} onPress={() => setScreenMode('drive')}>
          <Text style={styles.startButtonText}>ANLADIĞIM</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderDriveScreen = () => (
    <View style={styles.driveContainer}>
      {!isHeadDown && (
        <OsmMapBackground
          latitude={region.latitude}
          longitude={region.longitude}
          upcomingTurn={upcomingTurn}
          opacity={0.3}
        />
      )}

      <MinimalCockpit
        currentSpeed={currentSpeed}
        speedLimit={speedLimit}
        recommendedSpeed={recommendedSpeed}
        upcomingTurn={upcomingTurn}
        distanceToTurn={distanceToTurn}
        isHeadDown={isHeadDown}
      />

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.controlButton} onPress={toggleHeadDownMode}>
          <Text style={styles.controlButtonText}>
            {isHeadDown ? 'Ekranı Aç' : 'Kafa Aşağı'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.controlButton, styles.reportButton]} onPress={reportPolice}>
          <Text style={styles.controlButtonText}>Radar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.controlButton, styles.reportButton]} onPress={reportAccident}>
          <Text style={styles.controlButtonText}>Kaza</Text>
        </TouchableOpacity>
      </View>

      {notifications.map((notification) => (
        <View key={notification.id} style={styles.notificationBanner}>
          <Text style={styles.notificationText}>{notification.message}</Text>
          <TouchableOpacity onPress={() => dismissNotification(notification.id)}>
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  return <SafeAreaView style={styles.container}>{screenMode === 'splash' ? renderSplashScreen() : renderDriveScreen()}</SafeAreaView>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    backgroundColor: '#000',
  },
  splashTitle: {
    fontSize: 48,
    fontWeight: '200',
    color: '#FFF',
    marginBottom: 10,
    letterSpacing: 4,
  },
  splashSubtitle: {
    fontSize: 18,
    color: '#888',
    marginBottom: 60,
  },
  disclaimerBox: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  disclaimerTitle: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  disclaimerText: {
    color: '#FFF',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 8,
  },
  startButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    paddingHorizontal: 60,
    borderRadius: 30,
  },
  startButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  permissionBox: {
    alignItems: 'center',
  },
  permissionText: {
    color: '#FF3B30',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  settingsButton: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  settingsButtonText: {
    color: '#CCC',
    fontSize: 14,
    fontWeight: '600',
  },
  driveContainer: {
    flex: 1,
  },
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  controlButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  reportButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.3)',
    borderColor: 'rgba(255, 59, 48, 0.5)',
  },
  notificationBanner: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 149, 0, 0.9)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  dismissText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
});