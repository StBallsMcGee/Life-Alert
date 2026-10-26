import { Tabs } from 'expo-router/js-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { colors, fonts } from '@/lib/theme';

const icon =
  (name: SymbolViewProps['name']) =>
  ({ color }: { color: ColorValue }) => <SymbolView name={name} size={24} tintColor={color} />;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: fonts.serifBold, color: colors.cream },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Stand Firm',
          tabBarLabel: 'Home',
          tabBarIcon: icon({ ios: 'shield.lefthalf.filled', android: 'shield', web: 'shield' }),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Prayer Requests',
          tabBarLabel: 'Requests',
          tabBarIcon: icon({ ios: 'hands.sparkles', android: 'volunteer_activism', web: 'volunteer_activism' }),
        }}
      />
      <Tabs.Screen
        name="circles"
        options={{
          title: 'My Circles',
          tabBarLabel: 'Circles',
          tabBarIcon: icon({ ios: 'person.3.fill', android: 'groups', web: 'groups' }),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: icon({ ios: 'person.crop.circle', android: 'person', web: 'person' }),
        }}
      />
    </Tabs>
  );
}
