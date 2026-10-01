import React, { useState, useCallback } from 'react';
import { StatusBar, View, StyleSheet } from 'react-native';
import { SplashScreen } from './src/screens/SplashScreen';
import { DriveScreen } from './src/screens/DriveScreen';

export default function App() {
  const [isReady, setIsReady] = useState(false);

  const handleSplashComplete = useCallback(() => {
    setIsReady(true);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent={false} />
      {!isReady ? <SplashScreen onComplete={handleSplashComplete} /> : <DriveScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});