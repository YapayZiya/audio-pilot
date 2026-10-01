import * as Haptics from 'expo-haptics';
import { Turn, Notification } from '../models/types';

export class HapticService {
  async initialize(): Promise<void> {
    console.log('Haptic service initialized');
  }

  async triggerTurnHaptic(turn: Turn): Promise<void> {
    const isLeft = turn.type.includes('left');
    const isSharp = turn.type.includes('sharp');

    if (isSharp) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }

  async triggerNotificationHaptic(notification: Notification): Promise<void> {
    switch (notification.priority) {
      case 'high':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case 'medium':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'low':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
    }
  }

  async triggerConfirmationHaptic(): Promise<void> {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async triggerErrorHaptic(): Promise<void> {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  async triggerGentlePulse(): Promise<void> {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}