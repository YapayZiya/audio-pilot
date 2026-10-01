import * as Speech from 'expo-speech';
import * as Audio from 'expo-av';
import { Turn, Notification } from '../models/types';

export class AudioService {
  private isSpeaking: boolean = false;
  private duckingLevel: number = 0.3;

  async initialize(): Promise<void> {
    try {
      await Audio.Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: 2, // DuckOthers
        interruptionModeAndroid: 2, // DuckOthers
        shouldDuckAndroid: true,
      });

      console.log('Audio service initialized');
    } catch (error) {
      console.error('Failed to initialize audio service:', error);
    }
  }

  async speak(text: string, priority: 'low' | 'medium' | 'high' = 'medium'): Promise<void> {
    if (this.isSpeaking && priority !== 'high') {
      this.stop();
    }

    try {
      const pitch = priority === 'high' ? 1.1 : 1.0;
      const rate = priority === 'high' ? 0.85 : 0.9;
      const volume = priority === 'high' ? 1.0 : 0.9;

      this.isSpeaking = true;

      await Speech.speak(text, {
        language: 'tr-TR',
        pitch,
        rate,
        volume,
        onDone: () => {
          this.isSpeaking = false;
        },
        onError: (error: Error) => {
          console.error('Speech error:', error);
          this.isSpeaking = false;
        },
      });
    } catch (error) {
      console.error('Failed to speak:', error);
      this.isSpeaking = false;
    }
  }

  speakTurn(turn: Turn): void {
    const directionText = turn.type.includes('left') ? 'sol' : 'sağ';
    const sharpness = turn.type.includes('sharp') ? 'keskin' : 'hafif';
    const message = `${turn.distance} metre sonra, ${sharpness} ${directionText} viraj. Hızı ${turn.recommendedSpeed}'ye düşürün.`;
    this.speak(message, 'high');
  }

  speakNotification(notification: Notification): void {
    const priority = notification.priority === 'high' ? 'high' : 'medium';
    this.speak(notification.message, priority);
  }

  async stop(): Promise<void> {
    if (this.isSpeaking) {
      await Speech.stop();
      this.isSpeaking = false;
    }
  }

  setDuckingLevel(level: number): void {
    this.duckingLevel = Math.max(0.1, Math.min(1.0, level));
  }

  isCurrentlySpeaking(): boolean {
    return this.isSpeaking;
  }
}