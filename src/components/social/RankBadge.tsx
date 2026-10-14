// شارة الرتبة (مبتدئ ← نخبة) + علامة المدرب الموثّق. ومالك التطبيق (هو بس) شارته «CEO» بدل الرتبة،
// وفريق الإدارة اللي عطاهم المالك لقب (profiles.staff_title، مثل XO) يطلع لقبهم بدل الرتبة
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { T } from '@/components/ui';
import { useIsOwnerId, useStaffTitle } from '@/lib/appOwner';
import { useLocalized } from '@/lib/i18n';
import { rankOf } from '@/lib/ranks';
import { brand } from '@/theme';

export function RankBadge({ points, coach, small, onDark, userId, owner }: {
  points: number; coach?: boolean | null; small?: boolean; onDark?: boolean;
  /** صاحب الشارة: لو هو مالك التطبيق تطلع «CEO» */
  userId?: string | null; owner?: boolean | null;
}) {
  const { L } = useLocalized();
  const isOwner = useIsOwnerId(userId) || !!owner;
  const title = useStaffTitle(userId);
  const r = rankOf(points);
  if (isOwner) return <OwnerBadge small={small} onDark={onDark} />;
  if (title) return <OwnerBadge small={small} onDark={onDark} label={title} />;
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

/** «CEO»: شارة مالك التطبيق بدل الرتبة (مكانها مثل شارة الرتبة بالضبط: في النص بصفحة الحساب).
 *  ومع label: لقب عضو بفريق الإدارة (مثل XO) بنفس الشكل، وأيقونة درع بدل المفتاح */
export function OwnerBadge({ small, onDark, label }: { small?: boolean; onDark?: boolean; label?: string }) {
  const { t } = useTranslation();
  const text = label ?? t('social.owner');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View accessibilityLabel={text} style={{
        flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999,
        paddingHorizontal: small ? 7 : 10, paddingVertical: small ? 2 : 4,
        backgroundColor: onDark ? 'rgba(254,169,79,0.18)' : brand.deepGreen, borderWidth: 1, borderColor: brand.amber,
      }}>
        <Ionicons name={label ? 'shield-checkmark' : 'key'} size={small ? 11 : 13} color={brand.amber} />
        <T size="xs" semibold color={brand.amber} style={{ fontSize: small ? 11 : 12 }}>{text}</T>
      </View>
    </View>
  );
}
