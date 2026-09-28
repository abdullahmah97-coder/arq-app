// أجزاء مشتركة للمدربين: بطاقة مدرب، شارة التوثيق، حالة مراجعة الملف، شرائح التخصص، ومنتقي الصلاحيات
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { STAR } from '@/components/clubs/parts';
import { Avatar, Button, Card, Row, T } from '@/components/ui';
import { SCOPES, type CoachCard, type CoachStatus, type Scope } from '@/lib/coaching';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export function VerifiedBadge({ small }: { small?: boolean }) {
  const { t } = useTranslation();
  return (
    <Row gap={3}>
      <Ionicons name="checkmark-circle" size={small ? 13 : 16} color={colors.success} />
      {!small ? <T size="xs" semibold color={colors.success}>{t('coaching.verified')}</T> : null}
    </Row>
  );
}

/** حالة ملف المدرب عند إدارة أرك: قيد المراجعة / يحتاج تعديل (مع السبب) / موقوف / معتمد وظاهر */
export function ReviewStatus({ status, note, onEdit }: { status: CoachStatus; note?: string | null; onEdit?: () => void }) {
  const { t } = useTranslation();
  const look = {
    pending: { icon: 'time-outline', color: brand.amber },
    approved: { icon: 'checkmark-circle', color: colors.success },
    rejected: { icon: 'alert-circle-outline', color: colors.danger },
    suspended: { icon: 'pause-circle-outline', color: colors.danger },
  }[status] as { icon: keyof typeof Ionicons.glyphMap; color: string };
  return (
    <Card style={{ gap: space.sm, borderColor: look.color, borderWidth: 1 }}>
      <Row gap={8}>
        <Ionicons name={look.icon} size={20} color={look.color} />
        <T semibold style={{ flex: 1 }}>{t(`coaching.rs_${status}`)}</T>
      </Row>
      <T size="sm" muted>{t(`coaching.rsBody_${status}`)}</T>
      {note && status !== 'approved' ? <T size="sm">{t('coaching.reviewNote')}: {note}</T> : null}
      {onEdit && status === 'rejected' ? <Button small icon="create-outline" title={t('coaching.fixAndResubmit')} onPress={onEdit} /> : null}
    </Card>
  );
}

export function Chip({ label, on, onPress, icon }: { label: string; on?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityState={onPress ? { selected: !!on } : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
        backgroundColor: on ? brand.deepGreen : colors.cardAlt }}>
      {icon ? <Ionicons name={icon} size={13} color={on ? brand.cream : colors.text} /> : null}
      <T size="xs" semibold color={on ? brand.cream : colors.text}>{label}</T>
    </Pressable>
  );
}

export function CoachRow({ c }: { c: CoachCard }) {
  const { t } = useTranslation();
  const name = c.full_name || c.username;
  return (
    <Pressable onPress={() => router.push({ pathname: '/coaches/[id]', params: { id: c.user_id } })} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card,
        borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 })}>
      <Avatar size={54} uri={publicUrl('avatars', c.avatar_url)} name={name} />
      <View style={{ flex: 1, gap: 3 }}>
        <Row gap={6}>
          <T semibold numberOfLines={1} style={{ flexShrink: 1 }}>{name}</T>
          {c.verified ? <VerifiedBadge small /> : null}
        </Row>
        {c.headline ? <T size="sm" muted numberOfLines={1}>{c.headline}</T> : null}
        <Row gap={10} style={{ flexWrap: 'wrap' }}>
          {c.rating ? <Row gap={3}><Ionicons name="star" size={12} color={STAR} /><T size="xs" semibold>{c.rating.toFixed(1)}</T><T size="xs" muted>({c.reviews})</T></Row> : null}
          {c.years_exp ? <T size="xs" muted>{t('coaching.yearsN', { count: c.years_exp })}</T> : null}
          {c.city ? <T size="xs" muted>{c.city}</T> : null}
          {c.online ? <T size="xs" muted>{t('coaching.online')}</T> : null}
          {c.price_from_sar ? <T size="xs" semibold color={colors.primary}>{t('coaching.fromPrice', { n: Math.round(c.price_from_sar) })}</T> : null}
        </Row>
        {c.specialties.length ? <T size="xs" muted numberOfLines={1}>{c.specialties.map((s) => t(`coaching.sp_${s}`)).join(' · ')}</T> : null}
      </View>
      {!c.accepting ? <T size="xs" muted>{t('coaching.full')}</T> : null}
    </Pressable>
  );
}

/** منتقي الصلاحيات: المتدرب يختار وش يشوف المدرب (كل نوع لحاله) */
export function ScopePicker({ value, onChange }: { value: Scope[]; onChange: (v: Scope[]) => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 6 }}>
      {SCOPES.map((s) => {
        const on = value.includes(s);
        return (
          <Pressable key={s} onPress={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])} accessibilityRole="switch" accessibilityState={{ checked: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.md,
              backgroundColor: on ? 'rgba(46,125,50,0.08)' : colors.card, borderWidth: 1, borderColor: on ? colors.success : colors.border }}>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.success : colors.muted} />
            <View style={{ flex: 1 }}>
              <T size="sm" semibold>{t(`coaching.scope_${s}`)}</T>
              <T size="xs" muted>{t(`coaching.scopeHint_${s}`)}</T>
            </View>
          </Pressable>
        );
      })}
      <T size="xs" muted>{t('coaching.scopeNote')}</T>
    </View>
  );
}
