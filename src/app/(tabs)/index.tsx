import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HoldButton } from '@/components/hold-button';
import { Button, Field } from '@/components/ui';
import { VerseCarousel } from '@/components/verse-carousel';
import { sendAlert } from '@/lib/alerts';
import { fetchCircles } from '@/lib/circles';
import type { Circle } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';

export default function HomeScreen() {
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchCircles()
        .then((list) => {
          setCircles(list);
          // Default to alerting every circle.
          setSelected(new Set(list.map((c) => c.id)));
        })
        .catch((e) => Alert.alert('Could not load circles', e.message));
    }, []),
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    if (selected.size === 0) {
      Alert.alert('Choose a circle', 'Select at least one circle to alert.');
      return;
    }
    setSending(true);
    try {
      const { alert_id, notified } = await sendAlert([...selected], note);
      setNote('');
      router.push({ pathname: '/sent', params: { alertId: alert_id, notified: String(notified) } });
    } catch (e) {
      Alert.alert('Alert not sent', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const noCircles = circles !== null && circles.length === 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <VerseCarousel />

        <HoldButton onConfirm={send} busy={sending} disabled={noCircles} />

        {noCircles ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.empty}>
              You aren’t in a circle yet. Create one and invite the brothers you trust, or join one with a code.
            </Text>
            <Button label="Set up a circle" onPress={() => router.navigate('/circles')} />
          </View>
        ) : (
          <>
            {circles && circles.length > 1 && (
              <View style={styles.chips}>
                {circles.map((c) => {
                  const on = selected.has(c.id);
                  return (
                    <Pressable key={c.id} onPress={() => toggle(c.id)} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && { color: colors.background }]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Field
              label="Add a note (optional)"
              placeholder="Only your circle sees this"
              value={note}
              onChangeText={setNote}
              maxLength={280}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xl },
  empty: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.goldSoft,
  },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.gold, fontWeight: '600' },
});
