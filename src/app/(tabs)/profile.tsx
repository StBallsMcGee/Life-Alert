import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { NotificationPrompt } from '@/components/notification-prompt';
import { Body, Button, Card, Field } from '@/components/ui';
import { showMessage } from '@/lib/dialog';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/lib/theme';

export default function ProfileScreen() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile?.display_name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), phone: phone.trim() || null })
      .eq('id', session!.user.id);
    setSaving(false);
    if (error) showMessage('Could not save', error.message);
    else {
      await refreshProfile();
      showMessage('Saved');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card>
        <Field label="Your name" value={name} onChangeText={setName} placeholder="First name is fine" />
        <Field
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="So your brothers can text or call you"
          keyboardType="phone-pad"
        />
        <Body muted>Only people in your circles can see your name and number.</Body>
        <Button label="Save" onPress={save} loading={saving} />
      </Card>

      <NotificationPrompt showWhenOn />

      <Body muted>Signed in as {session?.user.email}</Body>
      <Button label="Sign out" variant="outline" onPress={signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
});
