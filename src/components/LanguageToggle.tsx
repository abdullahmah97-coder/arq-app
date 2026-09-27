// اختيار اللغة: خياران واضحان بالحروف (ع / En) مع علامة ✓ على اللغة الحالية — مو بالألوان فقط
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, View } from 'react-native';
import { setLocale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Locale } from '@/lib/types';
import { brand, colors, font, fonts, radius, space } from '@/theme';

const OPTIONS: { value: Locale; letter: string; label: string }[] = [
  { value: 'ar', letter: 'ع', label: 'العربية' },
  { value: 'en', letter: 'En', label: 'English' },
];

export function LanguageToggle({ userId, compact }: { userId?: string; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const value: Locale = i18n.language === 'en' ? 'en' : 'ar';

  const change = async (lng: Locale) => {
    if (lng === value) return;
    const { needsRestart } = await setLocale(lng);
    if (userId) await supabase.from('profiles').update({ locale: lng }).eq('id', userId);
    if (needsRestart) Alert.alert(t('profile.restartTitle'), t('profile.restartBody'));
  };

  return (
    <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => change(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            style={({ pressed }) => ({
              flex: compact ? undefined : 1,
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingVertical: compact ? 6 : 10, paddingHorizontal: compact ? 10 : 12,
              borderRadius: radius.pill, borderWidth: 2,
              borderColor: active ? colors.primary : colors.border,
              backgroundColor: colors.card,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{
              minWidth: compact ? 26 : 32, height: compact ? 26 : 32, borderRadius: 16, paddingHorizontal: 4,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: active ? colors.primary : colors.cardAlt,
            }}>
              <Text style={{ color: active ? brand.cream : colors.text, fontFamily: o.value === 'ar' ? fonts.title : 'Noah-Bold', fontSize: compact ? 13 : 15 }}>
                {o.letter}
              </Text>
            </View>
            <Text style={{ color: colors.text, fontFamily: active ? fonts.semibold : fonts.regular, fontSize: font.sm, flexShrink: 1 }}>{o.label}</Text>
            {active ? <Ionicons name="checkmark-circle" size={compact ? 16 : 18} color={colors.primary} style={compact ? undefined : { marginStart: 'auto' }} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
