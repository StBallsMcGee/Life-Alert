import { Alert, Linking, Platform, Share } from 'react-native';

// React Native Web's Alert is a no-op, so the web uses the browser's dialogs.

export function showMessage(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

/** Asks the user to confirm a destructive action. Resolves true if they agree. */
export function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/** Opens sms: and tel: links. On the web this must happen in the same window to hand off to iOS. */
export function openUrl(url: string) {
  if (Platform.OS === 'web') window.location.href = url;
  else Linking.openURL(url);
}

/** Opens the share sheet, falling back to copying the text where sharing isn't supported. */
export async function shareText(message: string) {
  if (Platform.OS === 'web' && !navigator.share) {
    await navigator.clipboard.writeText(message);
    showMessage('Copied', 'The invite was copied. Paste it into a text to your brothers.');
    return;
  }
  try {
    await Share.share({ message });
  } catch {
    // The user closed the share sheet.
  }
}
