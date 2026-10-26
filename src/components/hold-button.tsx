import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/lib/theme';

const HOLD_MS = 1500;
const SIZE = 220;

type Props = { onConfirm: () => void; busy?: boolean; disabled?: boolean };

/**
 * The panic button. It must be held for a moment so it can't be sent by a
 * stray tap; a gold fill grows from the centre while it's held.
 */
export function HoldButton({ onConfirm, busy, disabled }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);

  const start = () => {
    if (busy || disabled) return;
    setHolding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      setHolding(false);
      progress.setValue(0);
      if (finished) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onConfirm();
      }
    });
  };

  const cancel = () => {
    progress.stopAnimation();
    progress.setValue(0);
    setHolding(false);
  };

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      accessibilityRole="button"
      accessibilityLabel="Hold to ask your circle for prayer"
      style={[styles.outer, disabled && { opacity: 0.5 }]}>
      <View style={styles.inner}>
        <Animated.View style={[styles.fill, { transform: [{ scale: progress }] }]} />
        {busy ? (
          <ActivityIndicator color={colors.cream} size="large" />
        ) : (
          <>
            <Text style={styles.cross}>✝</Text>
            <Text style={styles.label}>{holding ? 'Keep holding…' : 'I need help'}</Text>
            <Text style={styles.hint}>Hold to alert your brothers</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: SIZE + 24,
    height: SIZE + 24,
    borderRadius: (SIZE + 24) / 2,
    padding: 12,
    borderWidth: 2,
    borderColor: colors.gold,
    alignSelf: 'center',
    shadowColor: colors.crimson,
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  inner: {
    flex: 1,
    borderRadius: SIZE / 2,
    backgroundColor: colors.crimson,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: 4,
  },
  fill: {
    ...StyleSheet.absoluteFill,
    borderRadius: SIZE / 2,
    backgroundColor: colors.crimsonDeep,
  },
  cross: { fontSize: 34, color: colors.gold },
  label: { fontFamily: fonts.serifBold, fontSize: 26, color: colors.cream },
  hint: { fontSize: 13, color: colors.cream, opacity: 0.85 },
});
