import { router } from 'expo-router';
import { useEffect } from 'react';

/**
 * The service worker (public/sw.js) posts a message when a notification is
 * tapped while the app is already open; open the matching alert.
 */
export function useNotificationRouting(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'open-alert' && typeof event.data.alertId === 'string') {
        router.push(`/alert/${event.data.alertId}`);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [signedIn]);
}
