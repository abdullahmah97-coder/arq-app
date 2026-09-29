// عناصر عروض النوادي: النجوم، شعار النادي، بطاقة العرض (داكنة للرئيسية وفاتحة لباقي الصفحات)
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, Text, View } from 'react-native';
import { gymName } from '@/components/GymPicker';
import { Num } from '@/components/pulse/widgets';
import { T } from '@/components/ui';
import { daysLeft, discountPct, fullPrice, isStale, monthly, type Chain, type Club, type Offer } from '@/lib/clubs';
import { useLocalized } from '@/lib/i18n';
import { LONG_PRESS_MS, useHomeLongPress } from '@/lib/homeLayout';
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

/** أحرف بديلة للشعار: PureGym → PG، Fitness Time → FT، Gold's Gym Arabia → GG */
export function initials(name: string) {
  const skip = new Set(['KSA', 'SAUDI', 'ARABIA', 'SPORT', 'CENTER', 'CLUB']);
  const words = name.replace(/['’`]/g, '').replace(/[^A-Za-z0-9\u0600-\u06FF\s_]/g, ' ').split(/[\s_]+/).filter((w) => w && !skip.has(w.toUpperCase()));
  if (!words.length) return name.slice(0, 1);
  if (words.length === 1) {
    const caps = words[0].match(/[A-Z]/g);
    return (caps && caps.length >= 2 ? caps.slice(0, 2).join('') : words[0].slice(0, 2)).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function ClubLogo({ c, size = 44 }: { c: { name: string; name_en?: string | null; chain?: string | null; logo_path?: string | null; chain_logo?: string | null }; size?: number }) {
  const uri = publicUrl('brands', c.logo_path || c.chain_logo);
  const label = initials(c.chain || c.name_en || c.name);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(254,169,79,0.35)' }}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
        : <Text style={{ color: brand.amber, fontFamily: fonts.title, fontSize: size * (label.length > 1 ? 0.34 : 0.42) }}>{label}</Text>}
    </View>
  );
}

export function periodLabel(months: number, t: (k: string, o?: any) => string) {
  if (months === 0) return t('clubs.perVisit');
  if (months === 1) return t('clubs.perMonth');
  if (months === 12) return t('clubs.perYear');
  return t('clubs.perMonths', { n: months, count: months });
}

/** مصدر السعر وتاريخه: رسمي / موقع عروض / غير مؤكد / من النادي، مع تنبيه لو قديم */
export function SourceTag({ o, dark }: { o: Pick<Offer, 'confidence' | 'seen_on' | 'source_url'>; dark?: boolean }) {
  const { t } = useTranslation();
  const stale = isStale(o);
  const muted = dark ? night.faint : colors.muted;
  const date = o.seen_on ? o.seen_on.split('-').reverse().slice(0, 2).join('/') + '/' + o.seen_on.slice(2, 4) : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <Ionicons name={o.confidence === 'official' || o.confidence === 'partner' ? 'shield-checkmark-outline' : 'newspaper-outline'} size={11} color={muted} />
      <Text style={{ color: muted, fontFamily: fonts.regular, fontSize: 10 }}>{t(`clubs.src_${o.confidence}`)}{date ? ` · ${date}` : ''}</Text>
      {stale ? <Text style={{ color: brand.orange, fontFamily: fonts.semibold, fontSize: 10 }}>· {t('clubs.mayChanged')}</Text> : null}
    </View>
  );
}

/** بطاقة عرض: السعر، الخصم، السعر الشهري المكافئ، التقييم، المصدر، والمدة المتبقية */
/** onPress: يغيّر وش يصير عند الضغط (مثلاً في صفحة السلسلة نفسها ما نفتحها مرة ثانية) */
export function OfferCard({ o, rating, dark, width, onPress }: { o: Offer; rating?: { rating: number | null; reviews: number } | null; dark?: boolean; width?: number; onPress?: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const ch = o.gym_chains; const g = o.gyms;
  const off = discountPct(o);
  const left = daysLeft(o);
  const longPress = useHomeLongPress();
  const ink = dark ? night.text : colors.text;
  const muted = dark ? night.muted : colors.muted;
  const title = ch ? (lng === 'en' && ch.name_en ? ch.name_en : ch.name) : g ? gymName(g, lng) : '';
  const sub = [t(`clubs.aud_${(ch ?? g)?.audience ?? 'mixed'}`), g?.district || g?.city].filter(Boolean).join(' · ');
  const go = () => (o.chain_id ? router.push({ pathname: '/clubs/chain/[id]', params: { id: o.chain_id } }) : router.push({ pathname: '/clubs/[id]', params: { id: o.gym_id! } }));
  return (
    <Pressable onPress={onPress ?? go} onLongPress={longPress} delayLongPress={LONG_PRESS_MS} accessibilityRole="button"
      style={({ pressed }) => ({
        width, gap: 10, padding: space.md, borderRadius: 20, opacity: pressed ? 0.85 : 1,
        backgroundColor: dark ? night.card : colors.card, borderWidth: 1, borderColor: dark ? night.line : colors.border,
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ClubLogo c={{ name: ch?.name_en || ch?.name || g?.name_en || g?.name || '?', logo_path: ch?.logo_path ?? g?.logo_path }} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: ink, fontFamily: fonts.semibold, fontSize: 14, writingDirection: 'auto' }}>{title}</Text>
          <Text numberOfLines={1} style={{ color: muted, fontFamily: fonts.regular, fontSize: 11 }}>{sub}</Text>
        </View>
        {off ? <View style={{ backgroundColor: brand.orange, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: brand.cream, fontFamily: fonts.title, fontSize: 12 }}>-{off}%</Text></View> : null}
      </View>
      <Text numberOfLines={2} style={{ color: ink, fontFamily: fonts.title, fontSize: 15, lineHeight: 22 }}>{o.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
        <Num size={28} color={dark ? brand.amber : brand.orange}>{(+o.price_sar).toLocaleString('en-US')}</Num>
        <Text style={{ color: muted, fontFamily: fonts.regular, fontSize: 12, marginBottom: 3 }}>{t('clubs.sar')} / {periodLabel(o.months, t)}</Text>
        {o.old_price_sar ? <Text style={{ color: muted, fontFamily: fonts.regular, fontSize: 12, marginBottom: 3, textDecorationLine: 'line-through' }}>{(+o.old_price_sar).toLocaleString('en-US')}</Text> : null}
      </View>
      {(() => {
        const fp = fullPrice(o);
        const bits = [
          fp.changed ? t('trust.fullPriceLine', { total: fp.total.toLocaleString('en-US') }) : null,
          o.join_fee_sar ? t('trust.inclJoin', { fee: (+o.join_fee_sar).toLocaleString('en-US') }) : null,
          o.vat_included === false ? t('trust.plusVat') : o.vat_included ? t('trust.vatIncl') : null,
          o.min_months ? t('trust.minCommit', { n: o.min_months, count: o.min_months }) : null,
        ].filter(Boolean);
        return bits.length ? <Text style={{ color: fp.changed ? ink : muted, fontFamily: fp.changed ? fonts.semibold : fonts.regular, fontSize: 11, lineHeight: 17 }}>{bits.join(' · ')}</Text> : null;
      })()}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {rating?.rating ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="star" size={13} color={STAR} />
            <Text style={{ color: ink, fontFamily: fonts.semibold, fontSize: 12 }}>{rating.rating.toFixed(1)}</Text>
            <Text style={{ color: muted, fontFamily: fonts.regular, fontSize: 11 }}>({rating.reviews})</Text>
          </View>
        ) : <Text style={{ color: muted, fontFamily: fonts.regular, fontSize: 11 }}>{t('clubs.noRatingYet')}</Text>}
        <Text style={{ color: left != null && left <= 5 ? brand.orange : muted, fontFamily: fonts.regular, fontSize: 11 }}>
          {left != null ? t('clubs.daysLeft', { n: left, count: left }) : o.months > 1 ? t('clubs.equivMonthly', { n: Math.round(monthly(o)) }) : ''}
        </Text>
      </View>
      <SourceTag o={o} dark={dark} />
    </Pressable>
  );
}

/** سطر سلسلة: الشعار، التقييم، عدد الفروع والعروض، وأقل سعر شهري */
export function ChainRow({ c, rank }: { c: Chain; rank?: number }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  return (
    <Pressable onPress={() => router.push({ pathname: '/clubs/chain/[id]', params: { id: c.id } })} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.md, opacity: pressed ? 0.85 : 1 })}>
      {rank ? <T bold color={rank <= 3 ? brand.orange : colors.muted} style={{ width: 20, textAlign: 'center' }}>{rank}</T> : null}
      <ClubLogo c={{ name: c.name_en || c.name, logo_path: c.logo_path }} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T semibold numberOfLines={1}>{lng === 'en' && c.name_en ? c.name_en : c.name}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {c.rating ? <><Stars value={c.rating} size={11} /><T size="xs" semibold>{c.rating.toFixed(1)}</T><T size="xs" muted>({c.reviews})</T></> : <T size="xs" muted>{t('clubs.noRatingYet')}</T>}
        </View>
        <T size="xs" muted numberOfLines={1}>{[t(`clubs.aud_${c.audience}`), c.branches ? t('clubs.branchesN', { n: c.branches, count: c.branches }) : null, c.nearest_m != null ? t('clubs.nearestKm', { n: (c.nearest_m / 1000).toFixed(1) }) : null].filter(Boolean).join(' · ')}</T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {c.best_monthly != null ? (
          <>
            <T size="xs" muted>{t('clubs.from')}</T>
            <T bold color={brand.orange}>{Math.round(c.best_monthly)} <T size="xs" muted>{t('clubs.sarMonth')}</T></T>
          </>
        ) : null}
        <T size="xs" color={c.offers ? colors.primary : colors.muted}>{c.offers ? t('clubs.offersN', { n: c.offers, count: c.offers }) : t('clubs.noPricesYet')}</T>
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
          {c.offers ? <T size="xs" color={colors.primary}>{t('clubs.offersN', { n: c.offers, count: c.offers })}</T> : null}
        </View>
      ) : null}
    </Pressable>
  );
}
