import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { showMessage } from '@/lib/dialog';
import { enableWebPush, getWebPushState, isIOS, type WebPushState } from '@/lib/notifications.web';
import { colors, fonts } from '@/lib/theme';

import { Button, Card } from './ui';

/**
 * Walks web users through getting alerts: Add to Home Screen on iPhone, then
 * allow notifications (which iOS only lets us ask for from a tap).
 */
export function NotificationPrompt({ showWhenOn }: { showWhenOn?: boolean }) {
  const { session } = useAuth();
  const [state, setState] = useState<WebPushState>('unsupported');
  const [busy, setBusy] = useState(false);

  useEffect(() => setState(getWebPushState()), []);

  const enable = async () => {
    setBusy(true);
    try {
      setState(await enableWebPush(session!.user.id));
    } catch (e) {
      showMessage('Could not turn on notifications', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (state === 'granted') {
    return showWhenOn ? (
      <Card>
        <Text style={styles.heading}>Notifications are on ✓</Text>
        <Text style={styles.body}>You’ll be notified when a brother asks for prayer.</Text>
      </Card>
    ) : null;
  }

  return (
    <Card style={{ borderColor: colors.gold }}>
      {state === 'needs-install' && (
        <>
          <Text style={styles.heading}>Add Stand Firm to your Home Screen</Text>
          <Text style={styles.body}>iPhone only delivers alerts to web apps on your Home Screen.</Text>
          <Step n={1} icon="ios_share" text="Tap the Share button in Safari" />
          <Step n={2} icon="add_box" text="Choose “Add to Home Screen”" />
          <Step n={3} icon="notifications" text="Open Stand Firm from your Home Screen and turn on notifications" />
        </>
      )}
      {state === 'default' && (
        <>
          <Text style={styles.heading}>Turn on notifications</Text>
          <Text style={styles.body}>
            So you know the moment a brother needs you, and when someone is praying for you.
          </Text>
          <Button label="Turn on notifications" onPress={enable} loading={busy} />
        </>
      )}
      {state === 'denied' && (
        <>
          <Text style={styles.heading}>Notifications are blocked</Text>
          <Text style={styles.body}>
            {isIOS()
              ? 'Turn them back on in your iPhone’s Settings → Notifications → Stand Firm, then reopen the app.'
              : 'Allow notifications for this site in your browser’s settings, then reload the page.'}
          </Text>
        </>
      )}
      {state === 'unsupported' && (
        <>
          <Text style={styles.heading}>This browser can’t receive alerts</Text>
          <Text style={styles.body}>
            You can still send alerts, but to receive them use Safari on iPhone (iOS 16.4 or newer) and add Stand Firm
            to your Home Screen, or use Chrome on Android or a computer.
          </Text>
        </>
      )}
    </Card>
  );
}

function Step({ n, icon, text }: { n: number; icon: AndroidSymbol; text: string }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepNum}>{n}</Text>
      <SymbolView name={{ web: icon }} size={22} tintColor={colors.gold} />
      <Text style={[styles.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: fonts.serifBold, fontSize: 18, color: colors.cream },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum: { width: 14, fontFamily: fonts.serifBold, fontSize: 16, color: colors.gold },
});
