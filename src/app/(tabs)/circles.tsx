import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createCircle, fetchCircles, joinCircle, leaveCircle, type CircleWithMembers } from '@/lib/circles';
import { colors, fonts, spacing } from '@/lib/theme';

export default function CirclesScreen() {
  const { session } = useAuth();
  const myId = session!.user.id;
  const [circles, setCircles] = useState<CircleWithMembers[]>([]);
  const [newName, setNewName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setCircles(await fetchCircles());
    } catch (e) {
      Alert.alert('Could not load circles', (e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (kind: 'create' | 'join', action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
      await load();
    } catch (e) {
      Alert.alert('Something went wrong', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const invite = (c: CircleWithMembers) =>
    Share.share({
      message: `Join my accountability circle "${c.name}" on Stand Firm. Use invite code: ${c.invite_code}`,
    });

  const leave = (c: CircleWithMembers) =>
    Alert.alert(`Leave ${c.name}?`, 'You will stop getting and sending alerts with this circle.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => run('join', () => leaveCircle(c.id, myId)) },
    ]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.gold}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }>
      <Body muted>
        A circle is a group of brothers you trust. When you hold the button, everyone in your circle is asked to pray
        and reach out.
      </Body>

      {circles.map((c) => (
        <Card key={c.id}>
          <Text style={styles.name}>{c.name}</Text>
          <Text style={styles.members}>
            {c.circle_members
              .map((m) => (m.user_id === myId ? 'You' : m.profiles?.display_name || 'Unnamed'))
              .join(' · ')}
          </Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeLabel}>Invite code</Text>
            <Text style={styles.code}>{c.invite_code}</Text>
          </View>
          <View style={styles.row}>
            <Button
              label="Invite"
              icon={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
              onPress={() => invite(c)}
              style={{ flex: 1 }}
            />
            <Button label="Leave" variant="outline" onPress={() => leave(c)} />
          </View>
        </Card>
      ))}

      <Card>
        <Field
          label="Start a new circle"
          placeholder="e.g. Tuesday Men’s Group"
          value={newName}
          onChangeText={setNewName}
        />
        <Button
          label="Create circle"
          loading={busy === 'create'}
          disabled={!newName.trim()}
          onPress={() => run('create', () => createCircle(newName).then(() => setNewName('')))}
        />
      </Card>

      <Card>
        <Field
          label="Join with a code"
          placeholder="ABC123"
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
        />
        <Button
          label="Join circle"
          variant="outline"
          loading={busy === 'join'}
          disabled={!code.trim()}
          onPress={() => run('join', () => joinCircle(code).then(() => setCode('')))}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  name: { fontFamily: fonts.serifBold, fontSize: 20, color: colors.cream },
  members: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeLabel: { fontSize: 13, color: colors.muted },
  code: { fontSize: 22, fontWeight: '700', letterSpacing: 4, color: colors.gold },
  row: { flexDirection: 'row', gap: spacing.sm },
});
