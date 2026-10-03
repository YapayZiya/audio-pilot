import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';
import { Turn, Notification, SpeedLimit } from '../models/types';

let cachedTurkishVoice: string | undefined;

async function resolveTurkishVoice(): Promise<string | undefined> {
  if (cachedTurkishVoice) return cachedTurkishVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const tr = voices.find((v) => /^tr(-|$)/i.test(v.identifier) || /turkish/i.test(v.name));
    if (tr) cachedTurkishVoice = tr.identifier;
  } catch {
    // ignore voice discovery errors
  }
  return cachedTurkishVoice;
}

function ttsOptions(priority: 'low' | 'medium' | 'high' = 'medium') {
  const pitch = priority === 'high' ? 1.05 : 0.95;
  const rate = priority === 'high' ? 0.82 : 0.88;
  const volume = priority === 'high' ? 1.0 : 0.95;
  return { pitch, rate, volume };
}

export class AudioService {
  private isSpeaking: boolean = false;
  private duckingLevel: number = 0.3;

  async initialize(): Promise<void> {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'duckOthers',
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
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
      const voice = await resolveTurkishVoice();
      const { pitch, rate, volume } = ttsOptions(priority);

      this.isSpeaking = true;

      await Speech.speak(text, {
        language: 'tr',
        voice,
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

  speakCurveSpeedAlert(): void {
    this.speak('Dikkat! Hızınızı azaltın. Keskin viraja çok yakınsınız.', 'high');
  }

  speakRadarAlert(speedLimit: number): void {
    this.speak(
      speedLimit > 0
        ? `Radar var! Hız sınırı ${speedLimit} kilometre.`
        : 'Radar bölgesi! Hızınıza dikkat edin.',
      'high'
    );
  }

  speakSpeedAlert(limit: number, currentSpeed: number): void {
    this.speak(`Hız sınırını aştınız. Sınır ${limit} kilometre. Mevcut hız ${Math.round(currentSpeed)}.`, 'high');
  }

  speakDestinationApproach(): void {
    this.speak('Varış noktasına yaklaşıyorsunuz.', 'high');
  }

  speakArrival(): void {
    this.speak('Varış noktasına ulaştınız. İyi günler dileriz.', 'high');
  }

  speakRouteReady(destinationName: string): void {
    this.speak(`Yola çıkılıyor. Varış: ${destinationName}. İyi yolculuklar.`, 'medium');
  }

  async stop(): Promise<void> {
    if (this.isSpeaking) {
      await Speech.stop();
      this.isSpeaking = false;
    }
  }

  setDuckingLevel(level: number): void {
    // Kept for API compatibility: expo-audio applies ducking through
    // `interruptionMode` and does not expose a numeric ducking level.
    this.duckingLevel = Math.max(0.1, Math.min(1.0, level));
  }

  isCurrentlySpeaking(): boolean {
    return this.isSpeaking;
  }
}