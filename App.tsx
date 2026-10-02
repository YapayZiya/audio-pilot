import React, { useState, useCallback, Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SplashScreen } from './src/screens/SplashScreen';
import { DriveScreen } from './src/screens/DriveScreen';

// Release builds kill the app on any uncaught JS exception. Keep the app
// alive instead: log the error and let the error boundary show a retry UI.
// In development, delegate to the original handler so the red box still shows.
// ErrorUtils is a react-native runtime global (no import needed).
if (typeof ErrorUtils !== 'undefined') {
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    console.error(`[AudioPilot] uncaught ${isFatal ? 'fatal' : ''} error:`, error);
    if (__DEV__) {
      originalHandler(error, isFatal);
    }
  });
}

const ErrorBoundaryFallback: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <View style={errorStyles.container}>
    <Text style={errorStyles.title}>Bir sorun oluştu</Text>
    <Text style={errorStyles.text}>
      Uygulama beklenmedik bir hatayla karşılaştı. Tekrar deneyin.
    </Text>
    <TouchableOpacity style={errorStyles.button} onPress={onRetry}>
      <Text style={errorStyles.buttonText}>TEKRAR DENE</Text>
    </TouchableOpacity>
  </View>
);

interface BoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AudioPilot] render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorBoundaryFallback onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}

export default function App() {
  const [isReady, setIsReady] = useState(false);

  const handleSplashComplete = useCallback(() => {
    setIsReady(true);
  }, []);

  return (
    <View style={styles.container}>
      <AppErrorBoundary>
        {!isReady ? <SplashScreen onComplete={handleSplashComplete} /> : <DriveScreen />}
      </AppErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  title: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 12,
  },
  text: {
    color: '#AAA',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 50,
    borderRadius: 30,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
