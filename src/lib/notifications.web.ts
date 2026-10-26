import { supabase } from './supabase';

// Web Push for the home-screen web app. On iPhone this only works once the
// app has been added to the Home Screen (iOS 16.4+), and permission can only
// be requested from a tap, so registration is split into a silent refresh
// (registerForPushNotifications) and a user-initiated enableWebPush().

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;

export type WebPushState =
  | 'needs-install' // iPhone/iPad Safari tab: must Add to Home Screen first
  | 'unsupported'
  | 'default' // can ask
  | 'denied'
  | 'granted';

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function getWebPushState(): WebPushState {
  if (typeof window === 'undefined') return 'unsupported';
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!supported || !VAPID_PUBLIC_KEY) return 'unsupported';
  return Notification.permission;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

function base64UrlToBytes(base64Url: string) {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function saveSubscription(userId: string, sub: PushSubscription) {
  const { endpoint, keys } = sub.toJSON();
  if (!endpoint || !keys?.p256dh || !keys?.auth) return;
  const { error } = await supabase
    .from('web_push_subscriptions')
    .upsert({ endpoint, user_id: userId, p256dh: keys.p256dh, auth: keys.auth });
  if (error) throw error;
}

async function subscribe(userId: string) {
  const registration = await registerServiceWorker();
  if (!registration) return null;
  const sub =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY!),
    }));
  await saveSubscription(userId, sub);
  return sub.endpoint;
}

/** Must be called from a tap. Returns the resulting permission state. */
export async function enableWebPush(userId: string): Promise<WebPushState> {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') await subscribe(userId);
  return permission;
}

/** Called after sign-in: refreshes the subscription if permission was already given. */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  await registerServiceWorker();
  if (getWebPushState() !== 'granted') return null;
  return subscribe(userId);
}

/** Called before sign-out so this browser stops getting the user's alerts. */
export async function unregisterPushNotifications(_userId: string) {
  const registration = await navigator.serviceWorker?.getRegistration();
  const sub = await registration?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
