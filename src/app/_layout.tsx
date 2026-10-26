import { Lora_400Regular, Lora_400Regular_Italic, Lora_600SemiBold, useFonts } from '@expo-google-fonts/lora';
import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth';
import { colors, fonts } from '@/lib/theme';
import { useNotificationRouting } from '@/lib/use-notification-routing';

SplashScreen.preventAutoHideAsync();

// Opening an alert straight from a notification still puts the tabs underneath it.
export const unstable_settings = { anchor: '(tabs)' };

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.cream,
    border: colors.border,
    primary: colors.gold,
  },
};

function RootNavigator() {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  useNotificationRouting(!!session);

  if (loading) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.gold,
        headerTitleStyle: { fontFamily: fonts.serifBold, color: colors.cream },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="alert/[id]" options={{ title: 'Prayer request', presentation: 'modal' }} />
        <Stack.Screen name="sent" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Lora_400Regular, Lora_400Regular_Italic, Lora_600SemiBold });
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={theme}>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
