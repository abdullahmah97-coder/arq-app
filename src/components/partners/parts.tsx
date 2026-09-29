// عناصر مشتركة للوحات الشركاء ولوحة المالك
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, View } from 'react-native';
import { Row, T } from '@/components/ui';
import { brand, colors, radius, space } from '@/theme';

type Icon = keyof typeof Ionicons.glyphMap;

/** شريط «أنت تعدّل كمالك التطبيق» */
export function AdminBanner() {
  const { t } = useTranslation();
  return (
    <Row style={{ backgroundColor: brand.deepGreen, borderRadius: radius.md, padding: space.sm }}>
      <Ionicons name="shield-checkmark" size={18} color={brand.amber} />
      <T size="xs" semibold color={brand.cream} style={{ flex: 1 }}>{t('partners.adminMode')}</T>
    </Row>
  );
}

export function Metric({ icon, n, label }: { icon: Icon; n: number | string; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.sm, gap: 2, alignItems: 'center' }}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <T bold size="lg">{n}</T>
      <T size="xs" muted center numberOfLines={2}>{label}</T>
    </View>
  );
}

export const STATUS_TONE: Record<string, string> = {
  pending: brand.amber, approved: '#2E9E6A', listed: '#5B8DEF', rejected: '#C0392B', suspended: '#8A8A8A', requested: brand.amber,
  confirmed: '#2E9E6A', declined: '#C0392B', cancelled: '#8A8A8A', done: '#5B8DEF',
};

export function StatusPill({ status, label }: { status: string; label: string }) {
  const c = STATUS_TONE[status] ?? colors.muted;
  return (
    <View style={{ backgroundColor: c + '22', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
      <T size="xs" semibold color={c}>{label}</T>
    </View>
  );
}

/** زر صف في لوحة التحكم: أيقونة وعنوان ووصف قصير */
export function DashLink({ icon, title, sub, onPress, badge }: { icon: Icon; title: string; sub?: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({
      flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, opacity: pressed ? 0.7 : 1,
    })}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <T semibold>{title}</T>
        {sub ? <T size="xs" muted numberOfLines={2}>{sub}</T> : null}
      </View>
      {badge ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
        <T size="xs" bold color={brand.cream}>{badge}</T>
      </View> : null}
      <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.muted} />
    </Pressable>
  );
}
