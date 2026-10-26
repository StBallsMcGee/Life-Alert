import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { showMessage } from '@/lib/dialog';
import { fetchAlert, resolveAlert, type AlertRow } from '@/lib/alerts';
import { colors, fonts, spacing } from '@/lib/theme';

const STEPS = [
  'Get up and leave the room. Change your surroundings.',
  'Put distance between you and the temptation: phone down, door open, step outside.',
  'Pray out loud, even a single sentence. Jesus was tempted too, and he understands.',
  'Answer when your brothers reach out. Be honest with them.',
];

export default function SentScreen() {
  const { alertId, notified } = useLocalSearchParams<{ alertId: string; notified: string }>();
  const [alert, setAlert] = useState<AlertRow | null>(null);

  // Poll so the count of people praying updates while this screen is open.
  useEffect(() => {
    let active = true;
    const load = () =>
      fetchAlert(alertId)
        .then((a) => active && setAlert(a))
        .catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [alertId]);

  const praying = alert?.prayers ?? [];
  const count = Number(notified) || 0;

  const done = async () => {
    try {
      await resolveAlert(alertId);
    } catch (e) {
      showMessage('Could not update', (e as Error).message);
    }
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.cross}>✝</Text>
        <Text style={styles.title}>Help is on the way</Text>
        <Text style={styles.sub}>
          {count === 0
            ? 'Your request was saved, but no one in your circle has notifications on yet.'
            : `${count} ${count === 1 ? 'brother has' : 'brothers have'} been notified.`}
        </Text>

        <Card style={{ borderColor: colors.goldSoft }}>
          <Text style={styles.verse}>
            “God is faithful, who will not allow you to be tempted above what you are able, but will with the temptation
            also make the way of escape.”
          </Text>
          <Text style={styles.ref}>— 1 Corinthians 10:13</Text>
        </Card>

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.heading}>Take the way of escape</Text>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.step}>
              <Text style={styles.stepNum}>{i + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        {praying.length > 0 && (
          <Card>
            <Text style={styles.praying}>
              🙏 {praying.map((p) => p.profiles?.display_name || 'A brother').join(', ')}{' '}
              {praying.length === 1 ? 'is' : 'are'} praying for you
            </Text>
          </Card>
        )}

        <Button label="I made it through" onPress={done} />
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  cross: { fontSize: 44, color: colors.gold, textAlign: 'center' },
  title: { fontFamily: fonts.serifBold, fontSize: 30, color: colors.cream, textAlign: 'center' },
  sub: { fontSize: 16, color: colors.muted, textAlign: 'center' },
  verse: { fontFamily: fonts.serifItalic, fontSize: 17, lineHeight: 26, color: colors.cream },
  ref: { fontFamily: fonts.serifBold, color: colors.gold },
  heading: { fontFamily: fonts.serifBold, fontSize: 20, color: colors.cream },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum: { width: 24, fontFamily: fonts.serifBold, fontSize: 18, color: colors.gold },
  stepText: { flex: 1, fontSize: 16, lineHeight: 23, color: colors.cream },
  praying: { fontSize: 16, color: colors.gold },
});
