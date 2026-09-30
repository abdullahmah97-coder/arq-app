// «أظهرني في المتصدرين»: طافي من البداية — اللي ما يعرفونك ما يشوفونك في «ناديي» و«الكل» إلا إذا شغّلته
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';
import { Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

/** bare = بدون إطار (داخل بطاقة ثانية مثل «الخصوصية» في حسابي) */
export function LeaderboardVisibility({ bare, onChanged }: { bare?: boolean; onChanged?: () => void }) {
  const { t } = useTranslation();
  const { userId, profile, refreshProfile } = useUser();
  // اللي ضغطه وللحين ما رجع من الخادم؛ غير كذا من الحساب (فيتحدث لو غيّره من الصفحة الثانية)
  const [pending, setPending] = useState<boolean | null>(null);
  const on = pending ?? !!profile.show_on_leaderboard;
  const change = async (v: boolean) => {
    setPending(v);
    const { error } = await supabase.from('profiles').update({ show_on_leaderboard: v }).eq('id', userId);
    if (!error) await refreshProfile();
    setPending(null);
    if (!error) onChanged?.();
  };
  return (
    <Row gap={space.md} style={bare ? undefined : {
      backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: on ? brand.amber : colors.border,
    }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T semibold>{t('compete.showMe')}</T>
        <T size="xs" muted style={{ lineHeight: 18 }}>{t(on ? 'compete.showMeOn' : 'compete.showMeOff')}</T>
      </View>
      <Switch value={on} disabled={pending !== null} onValueChange={change} accessibilityLabel={t('compete.showMe')}
        trackColor={{ true: brand.orange, false: colors.border }} thumbColor={brand.cream} />
    </Row>
  );
}
