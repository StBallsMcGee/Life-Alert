import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/ui';
import { showMessage } from '@/lib/dialog';
import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing } from '@/lib/theme';

export default function SignInScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        if (!name.trim()) throw new Error('Please enter your name so your brothers know who is asking.');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim(), phone: phone.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          showMessage('Check your email', 'Confirm your email address, then sign in.');
          setMode('sign-in');
        }
      }
    } catch (e) {
      showMessage('Could not continue', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const signingUp = mode === 'sign-up';

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.cross}>✝</Text>
            <Text style={styles.title}>Stand Firm</Text>
            <Text style={styles.tagline}>
              “Watch! Stand firm in the faith! Be courageous! Be strong!”{'\n'}— 1 Corinthians 16:13
            </Text>
          </View>

          {signingUp && (
            <>
              <Field label="Your name" value={name} onChangeText={setName} placeholder="First name is fine" />
              <Field
                label="Phone (optional)"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="So your brothers can text you"
              />
            </>
          )}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />

          <Button label={signingUp ? 'Create account' : 'Sign in'} onPress={submit} loading={loading} />
          <Button
            variant="ghost"
            label={signingUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
            onPress={() => setMode(signingUp ? 'sign-in' : 'sign-up')}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  cross: { fontSize: 48, color: colors.gold },
  title: { fontFamily: fonts.serifBold, fontSize: 36, color: colors.cream },
  tagline: { fontFamily: fonts.serifItalic, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center' },
});
