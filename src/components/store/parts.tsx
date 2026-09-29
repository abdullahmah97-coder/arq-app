// عناصر متجر الشركاء: شعار البراند، بطاقة المنتج، شريط «استبدال النقاط قريباً»
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Button, T } from '@/components/ui';
import { fmtPrice, offerEvent, type Brand, type BrandOffer, type Product } from '@/lib/brands';
import { useLocalized } from '@/lib/i18n';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, fonts, radius, space } from '@/theme';

export function BrandLogo({ b, size = 52 }: { b: Pick<Brand, 'name' | 'logo_path'>; size?: number }) {
  const uri = publicUrl('brands', b.logo_path);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden', backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
        : <T bold color={brand.amber} style={{ fontSize: size * 0.4 }}>{b.name.trim().charAt(0).toUpperCase()}</T>}
    </View>
  );
}

export function ProductTile({ p, width, fallbackUrl, onPress, showStock }: { p: Product; width: number | `${number}%`; fallbackUrl?: string | null; onPress?: () => void; showStock?: boolean }) {
  const { lng } = useLocalized();
  const { t } = useTranslation();
  const uri = publicUrl('brands', p.image_path);
  const link = p.url ?? fallbackUrl;
  return (
    <Pressable onPress={onPress ?? (link ? () => Linking.openURL(link) : undefined)} accessibilityRole={link || onPress ? 'link' : undefined}
      style={{ width, gap: 6 }}>
      <View style={{ aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Ionicons name={p.kcal ? 'restaurant-outline' : 'shirt-outline'} size={34} color={colors.muted} />}
        {!p.active ? <View style={{ position: 'absolute', top: 8, start: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 8 }}><Ionicons name="eye-off" size={12} color="#fff" /></View> : null}
        {p.stock === 0 ? (
          <View style={{ position: 'absolute', bottom: 8, end: 8, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
            <T size="xs" semibold color="#fff">{t('store.soldOut')}</T>
          </View>
        ) : p.stock != null && (showStock || p.stock <= 5) ? (
          <View style={{ position: 'absolute', bottom: 8, end: 8, backgroundColor: brand.orange, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
            <T size="xs" semibold color={brand.cream}>{t('store.stockLeft', { n: p.stock })}</T>
          </View>
        ) : null}
      </View>
      <T size="sm" semibold numberOfLines={2}>{p.name}</T>
      {p.kcal != null && p.kcal > 0 ? (
        <T size="xs" muted>{p.kcal} {lng === 'ar' ? 'سعرة' : 'kcal'}{p.protein_g != null ? ` · ${lng === 'ar' ? 'بروتين' : 'P'} ${+p.protein_g}${lng === 'ar' ? 'جم' : 'g'}` : ''}</T>
      ) : null}
      {p.price_sar != null ? <T size="sm" bold color={brand.orange}>{fmtPrice(p.price_sar, lng)}</T> : null}
    </Pressable>
  );
}

export function RedeemSoon({ points }: { points: number }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, transform: [{ rotate: '45deg' }], backgroundColor: 'rgba(254,169,79,0.16)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="gift" size={20} color={brand.amber} style={{ transform: [{ rotate: '-45deg' }] }} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T bold color={brand.cream}>{t('store.redeemTitle')}</T>
          <View style={{ backgroundColor: brand.orange, borderRadius: 999, paddingHorizontal: 8 }}><T size="xs" semibold color={brand.cream}>{t('store.soon')}</T></View>
        </View>
        <T size="xs" color={brand.sand} style={{ lineHeight: 19 }}>{t('store.redeemBody', { n: points })}</T>
      </View>
    </View>
  );
}

/** بطاقة عرض متجر: الخصم والتفاصيل، و«اكشف الكود» يسجّل الكشف ويعرض الكود */
export function OfferCard({ o, siteUrl, mine }: { o: BrandOffer; siteUrl?: string | null; mine?: boolean }) {
  const { t } = useTranslation();
  const [code, setCode] = useState<string | null>(mine ? o.code : null);
  const reveal = async () => {
    try { setCode((await offerEvent(o.id, 'reveal')) ?? ''); } catch (e) { Alert.alert(t(errorKey(e))); }
  };
  const visit = () => {
    const url = o.url ?? siteUrl;
    if (!url) return;
    if (!mine) offerEvent(o.id, 'visit').catch(() => {});
    Linking.openURL(url);
  };
  return (
    <View style={{ gap: 6, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1.5, borderColor: brand.orange, padding: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="pricetag" size={18} color={brand.orange} />
        <T bold style={{ flex: 1 }}>{o.title}</T>
        {o.percent ? <View style={{ backgroundColor: brand.orange, borderRadius: 999, paddingHorizontal: 10 }}><T size="sm" bold color={brand.cream}>-{o.percent}%</T></View> : null}
      </View>
      {o.details ? <T size="sm" muted style={{ lineHeight: 21 }}>{o.details}</T> : null}
      {o.ends_on ? <T size="xs" muted>{t('store.offerUntil', { d: o.ends_on })}</T> : null}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        {o.code ? (code != null ? (
          <View style={{ flex: 1, borderWidth: 1, borderStyle: 'dashed', borderColor: brand.orange, borderRadius: radius.md, paddingVertical: 8, alignItems: 'center' }}>
            <Text selectable style={{ fontFamily: fonts.title, fontSize: 18, color: brand.orange, letterSpacing: 1 }}>{code}</Text>
          </View>
        ) : <View style={{ flex: 1 }}><Button small icon="eye-outline" title={t('store.revealCode')} onPress={reveal} /></View>) : null}
        {o.url || siteUrl ? <Button small variant="secondary" icon="open-outline" title={t('store.shopNow')} onPress={visit} /> : null}
      </View>
    </View>
  );
}
