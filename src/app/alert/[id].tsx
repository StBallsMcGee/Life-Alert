import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { AlertCard } from '@/components/alert-card';
import { fetchAlert, type AlertRow } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/lib/theme';

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [alert, setAlert] = useState<AlertRow | null | undefined>(undefined);

  const load = useCallback(() => {
    fetchAlert(id)
      .then(setAlert)
      .catch(() => setAlert(null));
  }, [id]);

  useEffect(load, [load]);

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md }}>
      {alert ? (
        <AlertCard alert={alert} myId={session!.user.id} onChanged={load} showPrayers />
      ) : alert === null ? (
        <Text style={{ color: colors.muted, textAlign: 'center' }}>This request is no longer available.</Text>
      ) : null}
    </ScrollView>
  );
}
