// عناصر عروض النوادي: النجوم، شعار النادي، بطاقة العرض (داكنة للرئيسية وفاتحة لباقي الصفحات)
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, Text, View } from 'react-native';
import { gymName } from '@/components/GymPicker';
import { Num } from '@/components/pulse/widgets';
import { T } from '@/components/ui';
import { daysLeft, discountPct, monthly, type Club, type Offer } from '@/lib/clubs';
import { useLocalized } from '@/lib/i18n';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, fonts, night, radius, space } from '@/theme';

export const STAR = '#F5B400';

export function Stars({ value, size = 13, color = STAR, empty }: { value: number; size?: number; color?: string; empty?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${value.toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={value >= i - 0.25 ? 'star' : value >= i - 0.75 ? 'star-half' : 'star-outline'} size={size}
          color={value >= i - 0.75 ? color : empty ?? colors.muted} style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }} />
      ))}
    </View>
  );
}

export function ClubLogo({ c, size = 44 }: { c: Pick<Club, 'name' | 'name_en' | 'chain' | 'logo_path'>; size?: number }) {
  const uri = publicUrl('brands', c.logo_path);
  const label = (c.chain || c.name_en || c.name).trim();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(254,169,79,0.35)' }}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
        : <Text style={{ color: brand.amber, fontFamily: fonts.title, fontSize: size * 0.34 }}>{label.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</Text>}
    </View>
  );
}

export function periodLabel(months: number, t: (k: string, o?: any) => string) {
  if (months === 0) return t('clubs.perVisit');
  if (months === 1) return t('clubs.perMonth');
  if (months === 12) return t('clubs.perYear');
  return t('clubs.perMonths', { n: months });
}

/** بطاقة عرض: السعر، الخصم، السعر الشهري المكافئ، التقييم، والمدة المتبقية */
export function OfferCard({ o, club, dark, width }: { o: Offer; club?: Pick<Club, 'rating' | 'reviews'> | null; dark?: boolean; width?: number }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const g = o.gyms;
  const off = discountPct(o);
  const left = daysLeft(o);
  const ink = dark ? night.text : colors.text;
  const muted = dark ? night.muted : colors.muted;
  return (
    <Pressable onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: o.gym_id } })} accessibilityRole="button"
      style={({ pressed }) => ({
        width, gap: 10, padding: space.md, borderRadius: 20, opacity: pressed ? 0.85 : 1,
        backgroundColor: dark ? night.card : colors.card, borderWidth: 1, borderColor: dark ? night.line : colors.border,
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {g ? <ClubLogo c={g} size={38} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: ink, fontFamily: fonts.semibold, fontSize: 14, writingDirection: 'auto' }}>{g ? (g.chain || gymName(g, lng)) : ''}</Text>
          <Text numberOfLines={1} style={{ color: muted, fontFamily: fonts.regular, fontSize: 11 }}>{g ? [g.district || g.city, t(`clubs.aud_${g.audience}`)].filter(Boolean).join(' · ') : ''}</Text>
        </View>
        {off ? <View style={{ backgroundColor: brand.orange, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: brand.cream, fontFamily: fonts.title, fontSize: 12 }}>-{off}%</Text></View> : null}
      </View>
      <Text numberOfLines={2} style={{ color: ink, fontFamily: fonts.title, fontSize: 15, lineHeight: 22 }}>{o.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
        <Num size={28} color={dark ? brand.amber : brand.orange}>{+o.price_sar}</Num>
        <Text style={{ color: muted, fontFamily: fonts.regular, fontSize: 12, marginBottom: 3 }}>{t('clubs.sar')} / {periodLabel(o.months, t)}</Text>
        {o.old_price_sar ? <Text style={{ color: muted, fontFamily: fonts.regular, fontSize: 12, marginBottom: 3, textDecorationLine: 'line-through' }}>{+o.old_price_sar}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {club?.rating ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="star" size={13} color={STAR} />
            <Text style={{ color: ink, fontFamily: fonts.semibold, fontSize: 12 }}>{club.rating.toFixed(1)}</Text>
            <Text style={{ color: muted, fontFamily: fonts.regular, fontSize: 11 }}>({club.reviews})</Text>
          </View>
        ) : <Text style={{ color: muted, fontFamily: fonts.regular, fontSize: 11 }}>{t('clubs.noRatingYet')}</Text>}
        <Text style={{ color: left != null && left <= 5 ? brand.orange : muted, fontFamily: fonts.regular, fontSize: 11 }}>
          {o.months > 1 ? t('clubs.equivMonthly', { n: Math.round(monthly(o)) }) : left != null ? t('clubs.daysLeft', { n: left }) : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/** سطر نادي في القائمة: الاسم، التقييم، أقل سعر شهري، المسافة */
export function ClubRow({ c, rank }: { c: Club; rank?: number }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  return (
    <Pressable onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: c.id } })} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.md, opacity: pressed ? 0.85 : 1 })}>
      {rank ? <T bold color={rank <= 3 ? brand.orange : colors.muted} style={{ width: 20, textAlign: 'center' }}>{rank}</T> : null}
      <ClubLogo c={c} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T semibold numberOfLines={1}>{gymName(c, lng)}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {c.rating ? <><Stars value={c.rating} size={11} /><T size="xs" semibold>{c.rating.toFixed(1)}</T><T size="xs" muted>({c.reviews})</T></> : <T size="xs" muted>{t('clubs.noRatingYet')}</T>}
        </View>
        <T size="xs" muted numberOfLines={1}>{[t(`clubs.aud_${c.audience}`), c.district || c.city, c.distance_m != null ? t('clubs.km', { n: (c.distance_m / 1000).toFixed(1) }) : null].filter(Boolean).join(' · ')}</T>
      </View>
      {c.best_monthly != null ? (
        <View style={{ alignItems: 'flex-end' }}>
          <T size="xs" muted>{t('clubs.from')}</T>
          <T bold color={brand.orange}>{Math.round(c.best_monthly)} <T size="xs" muted>{t('clubs.sarMonth')}</T></T>
          {c.offers ? <T size="xs" color={colors.primary}>{t('clubs.offersN', { n: c.offers })}</T> : null}
        </View>
      ) : null}
    </Pressable>
  );
}
