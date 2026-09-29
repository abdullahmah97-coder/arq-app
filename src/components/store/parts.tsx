// عناصر متجر الشركاء: شعار البراند، بطاقة المنتج، شريط «استبدال النقاط قريباً»
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import { T } from '@/components/ui';
import { fmtPrice, type Brand, type Product } from '@/lib/brands';
import { useLocalized } from '@/lib/i18n';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export function BrandLogo({ b, size = 52 }: { b: Pick<Brand, 'name' | 'logo_path'>; size?: number }) {
  const uri = publicUrl('brands', b.logo_path);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden', backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
        : <T bold color={brand.amber} style={{ fontSize: size * 0.4 }}>{b.name.trim().charAt(0).toUpperCase()}</T>}
    </View>
  );
}

export function ProductTile({ p, width, fallbackUrl, onPress }: { p: Product; width: number | `${number}%`; fallbackUrl?: string | null; onPress?: () => void }) {
  const { lng } = useLocalized();
  const uri = publicUrl('brands', p.image_path);
  const link = p.url ?? fallbackUrl;
  return (
    <Pressable onPress={onPress ?? (link ? () => Linking.openURL(link) : undefined)} accessibilityRole={link || onPress ? 'link' : undefined}
      style={{ width, gap: 6 }}>
      <View style={{ aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Ionicons name={p.kcal ? 'restaurant-outline' : 'shirt-outline'} size={34} color={colors.muted} />}
        {!p.active ? <View style={{ position: 'absolute', top: 8, start: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 8 }}><Ionicons name="eye-off" size={12} color="#fff" /></View> : null}
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
