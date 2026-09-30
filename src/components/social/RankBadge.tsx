// شارة الرتبة (مبتدئ ← نخبة) + علامة المدرب الموثّق. ومالك التطبيق (هو بس) شارته «المالك» بدل الرتبة
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { T } from '@/components/ui';
import { useIsOwnerId } from '@/lib/appOwner';
import { useLocalized } from '@/lib/i18n';
import { rankOf } from '@/lib/ranks';
import { brand } from '@/theme';

export function RankBadge({ points, coach, small, onDark, userId, owner }: {
  points: number; coach?: boolean | null; small?: boolean; onDark?: boolean;
  /** صاحب الشارة: لو هو مالك التطبيق تطلع «المالك» */
  userId?: string | null; owner?: boolean | null;
}) {
  const { L } = useLocalized();
  const isOwner = useIsOwnerId(userId) || !!owner;
  const r = rankOf(points);
  if (isOwner) return <OwnerBadge small={small} onDark={onDark} />;
  const dark = r.level === 4;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999,
        paddingHorizontal: small ? 7 : 10, paddingVertical: small ? 2 : 4,
        backgroundColor: onDark ? 'rgba(248,237,218,0.14)' : r.color + '22',
        borderWidth: 1, borderColor: dark ? brand.amber : r.color,
      }}>
        <Ionicons name={r.icon} size={small ? 11 : 13} color={onDark || dark ? brand.amber : r.color} />
        <T size="xs" semibold color={onDark ? brand.cream : dark ? brand.deepGreen : r.color} style={{ fontSize: small ? 11 : 12 }}>{L(r.name)}</T>
      </View>
      {coach ? <CoachCheck size={small ? 14 : 16} /> : null}
    </View>
  );
}

export function CoachCheck({ size = 16 }: { size?: number }) {
  const { t } = useTranslation();
  return <Ionicons name="checkmark-circle" size={size} color={brand.orange} accessibilityLabel={t('social.verifiedCoach')} />;
}

/** «المالك»: شارة مالك التطبيق بدل الرتبة (مكانها مثل شارة الرتبة بالضبط: في النص بصفحة الحساب) */
export function OwnerBadge({ small, onDark }: { small?: boolean; onDark?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View accessibilityLabel={t('social.owner')} style={{
        flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999,
        paddingHorizontal: small ? 7 : 10, paddingVertical: small ? 2 : 4,
        backgroundColor: onDark ? 'rgba(254,169,79,0.18)' : brand.deepGreen, borderWidth: 1, borderColor: brand.amber,
      }}>
        <Ionicons name="key" size={small ? 11 : 13} color={brand.amber} />
        <T size="xs" semibold color={brand.amber} style={{ fontSize: small ? 11 : 12 }}>{t('social.owner')}</T>
      </View>
    </View>
  );
}
