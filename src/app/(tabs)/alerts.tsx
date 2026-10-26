import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text } from 'react-native';

import { AlertCard } from '@/components/alert-card';
import { fetchAlerts, type AlertRow } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/lib/theme';

export default function AlertsScreen() {
  const { session } = useAuth();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAlerts(await fetchAlerts());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <FlatList
      data={alerts}
      keyExtractor={(a) => a.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
      renderItem={({ item }) => <AlertCard alert={item} myId={session!.user.id} onChanged={load} />}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {error ?? 'No prayer requests yet. When someone in your circles asks for help, it will show up here.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.md },
  empty: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl, fontSize: 15, lineHeight: 22 },
});
