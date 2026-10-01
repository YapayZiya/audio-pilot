import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import * as Speech from 'expo-speech';
import { AudioService } from '../services/audioService';

export const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    const initialize = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();

      const audioService = new AudioService();
      await audioService.initialize();
      await audioService.speak(
        'Bu bir oyun değildir. Direksiyon başında sorumluluk sizdedir. Ekrana bakmadan sürüşünüz tehlikedir.',
        'high'
      );

      await new Promise((resolve) => setTimeout(resolve, 5000));

      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        onComplete();
      });
    };

    initialize();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
        <Text style={styles.logo}>🎙️</Text>
        <Text style={styles.title}>AudioPilot</Text>
        <Text style={styles.subtitle}>Görünmez Sürüş Asistanı</Text>
        <View style={styles.loadingBar}>
          <View style={styles.loadingFill} />
        </View>
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 42,
    fontWeight: '200',
    color: '#FFF',
    letterSpacing: 6,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 60,
    letterSpacing: 2,
  },
  loadingBar: {
    width: 200,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    marginBottom: 20,
    overflow: 'hidden',
  },
  loadingFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  loadingText: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'monospace',
  },
});