import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import Svg, { Circle, Line, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Speech from 'expo-speech';
import { Turn } from '../models/types';

export interface RouteStatus {
  destinationName: string;
  remainingKm: number;
  remainingMin: number;
}

interface MinimalCockpitProps {
  currentSpeed: number;
  speedLimit: number;
  recommendedSpeed: number;
  upcomingTurn: Turn | null;
  distanceToTurn: number | null;
  isHeadDown: boolean;
  routeStatus?: RouteStatus | null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const MinimalCockpit: React.FC<MinimalCockpitProps> = ({
  currentSpeed,
  speedLimit,
  recommendedSpeed,
  upcomingTurn,
  distanceToTurn,
  isHeadDown,
  routeStatus,
}) => {
  const [pulseAnim] = useState(new Animated.Value(1));
  const [warningOpacity] = useState(new Animated.Value(0));

  useEffect(() => {
    if (upcomingTurn && upcomingTurn.type.includes('sharp') && distanceToTurn !== null && distanceToTurn < 200) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 300, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        ])
      ).start();

      Animated.timing(warningOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      pulseAnim.setValue(1);
      warningOpacity.setValue(0);
    }
  }, [upcomingTurn, distanceToTurn, pulseAnim, warningOpacity]);

  const getTurnDirection = (type: Turn['type']): 'left' | 'right' | 'straight' => {
    if (type.includes('left')) return 'left';
    if (type.includes('right')) return 'right';
    return 'straight';
  };

  const getTurnIntensity = (type: Turn['type']): 'sharp' | 'gentle' | 'none' => {
    if (type.includes('sharp')) return 'sharp';
    if (type.includes('gentle')) return 'gentle';
    return 'none';
  };

  const renderCompass = () => {
    const direction = upcomingTurn ? getTurnDirection(upcomingTurn.type) : 'straight';
    const intensity = upcomingTurn ? getTurnIntensity(upcomingTurn.type) : 'none';

    const arrowRotation = direction === 'left' ? -90 : direction === 'right' ? 90 : 0;
    const arrowColor = intensity === 'sharp' ? '#FF3B30' : '#FFCC00';
    const arrowScale = intensity === 'sharp' ? pulseAnim : 1;

    return (
      <Animated.View style={{ transform: [{ rotate: `${arrowRotation}deg` }, { scale: arrowScale }] }}>
        <Svg width={120} height={120} viewBox="0 0 120 120">
          <Defs>
            <LinearGradient id="arrowGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={arrowColor} stopOpacity="1" />
              <Stop offset="100%" stopColor={arrowColor} stopOpacity="0.6" />
            </LinearGradient>
          </Defs>
          <Circle cx={60} cy={60} r={55} fill="none" stroke="#333" strokeWidth="2" />
          <Path
            d="M60 20 L80 80 L60 65 L40 80 Z"
            fill="url(#arrowGradient)"
            stroke={arrowColor}
            strokeWidth="2"
          />
        </Svg>
      </Animated.View>
    );
  };

  const renderSpeedometer = () => {
    const isOverSpeed = currentSpeed > speedLimit;
    const isRecommended = recommendedSpeed < speedLimit && currentSpeed > recommendedSpeed;
    const speedColor = isOverSpeed ? '#FF3B30' : isRecommended ? '#FFCC00' : '#34C759';

    return (
      <View style={styles.speedometerContainer}>
        <Text style={[styles.currentSpeed, { color: speedColor }]}>
          {Math.round(currentSpeed)}
        </Text>
        <Text style={styles.speedUnit}>km/h</Text>
        {speedLimit < 200 && (
          <View style={styles.speedLimitContainer}>
            <Text style={styles.speedLimitText}>{speedLimit}</Text>
          </View>
        )}
        {recommendedSpeed < speedLimit && (
          <View style={styles.recommendedContainer}>
            <Text style={styles.recommendedText}>{recommendedSpeed}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderTurnIndicator = () => {
    if (!upcomingTurn || distanceToTurn === null) {
      return (
        <View style={styles.noTurnContainer}>
          <Text style={styles.noTurnText}>Yol Boş</Text>
        </View>
      );
    }

    const direction = getTurnDirection(upcomingTurn.type);
    const intensity = getTurnIntensity(upcomingTurn.type);
    const isWarning = distanceToTurn < 200 && intensity === 'sharp';

    return (
      <Animated.View style={[styles.turnContainer, { opacity: warningOpacity }]}>
        <View style={[styles.turnIndicator, isWarning && styles.turnWarning]}>
          <Svg width={80} height={80} viewBox="0 0 80 80">
            <Path
              d={direction === 'left'
                ? 'M60 10 Q20 40 60 70'
                : direction === 'right'
                  ? 'M20 10 Q60 40 20 70'
                  : 'M40 10 L40 70'}
              fill="none"
              stroke={intensity === 'sharp' ? '#FF3B30' : '#FFCC00'}
              strokeWidth="6"
              strokeLinecap="round"
            />
          </Svg>
        </View>
        <Text style={styles.distanceText}>{distanceToTurn}m</Text>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, isHeadDown && styles.headDownContainer]}>
      <View style={styles.topBar}>
        <View style={styles.statusIndicators}>
          <View style={[styles.statusDot, { backgroundColor: '#34C759' }]} />
          <Text style={styles.statusText}>GPS Aktif</Text>
        </View>
        {routeStatus ? (
          <View style={styles.routeStatusPill}>
            <Text style={styles.routeStatusText} numberOfLines={1}>
              ⚑ {routeStatus.destinationName} • {routeStatus.remainingKm} km • {routeStatus.remainingMin} dk
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.mainContent}>
        {renderCompass()}
        {renderSpeedometer()}
        {renderTurnIndicator()}
      </View>

      {upcomingTurn && distanceToTurn !== null && distanceToTurn < 100 && (
        <Animated.View style={[styles.urgentWarning, { opacity: warningOpacity }]}>
          <Text style={styles.urgentText}>VİRAJ!</Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  headDownContainer: {
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  routeStatusPill: {
    backgroundColor: 'rgba(0, 122, 255, 0.25)',
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 10,
    maxWidth: '55%',
  },
  routeStatusText: {
    color: '#DDEBFF',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedometerContainer: {
    alignItems: 'center',
    marginVertical: 30,
  },
  currentSpeed: {
    fontSize: 96,
    fontWeight: '200',
    fontFamily: 'monospace',
    lineHeight: 100,
  },
  speedUnit: {
    color: '#666',
    fontSize: 16,
    fontFamily: 'monospace',
    marginTop: -10,
  },
  speedLimitContainer: {
    position: 'absolute',
    right: -40,
    top: 0,
    width: 50,
    height: 70,
    borderRadius: 8,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FF3B30',
  },
  speedLimitText: {
    color: '#000',
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  recommendedContainer: {
    position: 'absolute',
    right: -70,
    top: 80,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFCC00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommendedText: {
    color: '#000',
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  turnContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  turnIndicator: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  turnWarning: {
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  distanceText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '600',
    fontFamily: 'monospace',
    marginTop: 10,
  },
  noTurnContainer: {
    paddingVertical: 20,
  },
  noTurnText: {
    color: '#666',
    fontSize: 18,
    fontFamily: 'monospace',
  },
  urgentWarning: {
    backgroundColor: '#FF3B30',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  urgentText: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});