import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

/** Opens the matching alert when the user taps a prayer-alert notification. */
export function useNotificationRouting(signedIn: boolean) {
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const alertId = lastResponse?.notification.request.content.data?.alertId;
    if (signedIn && typeof alertId === 'string') router.push(`/alert/${alertId}`);
  }, [lastResponse, signedIn]);
}
