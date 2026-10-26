import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { openUrl, showMessage } from '@/lib/dialog';
import { pray, timeAgo, type AlertRow } from '@/lib/alerts';
import { colors, fonts, spacing } from '@/lib/theme';

import { Button, Card } from './ui';

type Props = { alert: AlertRow; myId: string; onChanged: () => void; showPrayers?: boolean };

export function AlertCard({ alert, myId, onChanged, showPrayers }: Props) {
  const [busy, setBusy] = useState(false);
  const mine = alert.user_id === myId;
  const name = mine ? 'You' : alert.profiles?.display_name || 'A brother';
  const phone = alert.profiles?.phone;
  const iPrayed = alert.prayers.some((p) => p.user_id === myId);
  const prayerCount = alert.prayers.length;

  const onPray = async () => {
    setBusy(true);
    try {
      await pray(alert.id);
      onChanged();
    } catch (e) {
      showMessage('Could not send', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={!alert.resolved_at && { borderColor: colors.crimson }}>
      <View style={styles.header}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.time}>{timeAgo(alert.created_at)}</Text>
      </View>

      <Text style={styles.status}>
        {alert.resolved_at
          ? '🙌 Made it through — praise God'
          : mine
            ? 'You asked for prayer'
            : 'Is asking for prayer right now'}
      </Text>
      {alert.note ? <Text style={styles.note}>“{alert.note}”</Text> : null}

      <Text style={styles.prayers}>
        {prayerCount === 0
          ? 'No one has prayed yet'
          : `🙏 ${prayerCount} ${prayerCount === 1 ? 'brother is' : 'brothers are'} praying`}
      </Text>
      {showPrayers && prayerCount > 0 && (
        <Text style={styles.prayerNames}>
          {alert.prayers.map((p) => (p.user_id === myId ? 'You' : p.profiles?.display_name || 'A brother')).join(', ')}
        </Text>
      )}

      {!mine && (
        <View style={styles.actions}>
          {!alert.resolved_at && (
            <Button
              label={iPrayed ? 'Praying' : 'Pray'}
              icon={{ ios: 'hands.sparkles.fill', android: 'volunteer_activism', web: 'volunteer_activism' }}
              onPress={onPray}
              loading={busy}
              disabled={iPrayed}
              style={{ flex: 1 }}
            />
          )}
          {phone ? (
            <>
              <Button
                label="Text"
                variant="outline"
                icon={{ ios: 'message.fill', android: 'sms', web: 'sms' }}
                onPress={() => openUrl(`sms:${phone}`)}
              />
              <Button
                label="Call"
                variant="outline"
                icon={{ ios: 'phone.fill', android: 'call', web: 'call' }}
                onPress={() => openUrl(`tel:${phone}`)}
              />
            </>
          ) : null}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontFamily: fonts.serifBold, fontSize: 19, color: colors.cream },
  time: { fontSize: 13, color: colors.muted },
  status: { fontSize: 15, color: colors.cream },
  note: { fontFamily: fonts.serifItalic, fontSize: 15, color: colors.cream, opacity: 0.9 },
  prayers: { fontSize: 14, color: colors.gold },
  prayerNames: { fontSize: 13, color: colors.muted },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
});
