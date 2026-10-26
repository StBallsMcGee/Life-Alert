import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, spacing } from '@/lib/theme';
import { verses } from '@/lib/verses';

const ROTATE_MS = 9000;

/** Rotating scripture card. Tap to skip to the next verse. */
export function VerseCarousel() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * verses.length));
  const opacity = useRef(new Animated.Value(1)).current;

  const advance = () => {
    Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
      setIndex((i) => (i + 1) % verses.length);
      Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    });
  };

  useEffect(() => {
    const timer = setInterval(advance, ROTATE_MS);
    return () => clearInterval(timer);
    // Restart the timer whenever the verse changes so a tap resets the clock.
  }, [index]);

  const verse = verses[index];
  return (
    <Pressable onPress={advance} style={styles.card} accessibilityHint="Shows the next verse">
      <Animated.View style={{ opacity, gap: spacing.sm }}>
        <Text style={styles.text}>“{verse.text}”</Text>
        <Text style={styles.ref}>— {verse.ref}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 170,
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.goldSoft,
  },
  text: { fontFamily: fonts.serifItalic, fontSize: 18, lineHeight: 27, color: colors.cream, textAlign: 'center' },
  ref: { fontFamily: fonts.serifBold, fontSize: 14, color: colors.gold, textAlign: 'center', letterSpacing: 0.5 },
});
