// أجزاء الاستشفاء المشتركة: العضلات اللي اشتغلت اليوم، روتين الإطالة، وبطاقة مركز العلاج الطبيعي
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { PromptModal } from '@/components/PromptModal';
import { ExerciseThumb } from '@/components/exercise/ExercisePhotos';
import { Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { todayIndex } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import {
  callCenter, isPartner, openCenterInstagram, openCenterSite, requestAppointment, stretchRoutine, takesAppointments, whatsappCenter, type RecoveryCenter, type RoutineItem,
} from '@/lib/recovery';
import { errorKey, publicUrl } from '@/lib/supabase';
import { loadHistory } from '@/lib/training';
import { findExercise, MUSCLE_NAMES, musclesOf } from '@/three/catalog';
import type { Muscle } from '@/three/rig';
import { brand, colors, radius, space } from '@/theme';

/** العضلات اللي اشتغلت اليوم: من تمرين مسجّل اليوم، وإلا من تمرين خطة اليوم. source يوضح من وين */
export function useWorkedToday(): { muscles: Muscle[]; source: 'logged' | 'plan' | 'none' } {
  const { plan } = useUser();
  const [logged, setLogged] = useState<Muscle[] | null>(null);
  useFocusEffect(useCallback(() => {
    loadHistory(6).then((sessions) => {
      const today = new Date().toDateString();
      const ids = sessions.filter((s) => new Date(s.started_at).toDateString() === today).flatMap((s) => s.sets.map((x) => x.exercise_id));
      setLogged([...new Set(ids.flatMap((id) => musclesOf(id).primary))]);
    }).catch(() => setLogged([]));
  }, []));
  return useMemo(() => {
    if (logged?.length) return { muscles: logged, source: 'logged' as const };
    const day = plan?.data.days.find((d) => d.day === todayIndex());
    if (day && !day.rest) {
      const ms = [...new Set(day.exercises.flatMap((e) => {
        const g = findExercise(e.exercise_id ?? e.name.en);
        return g ? musclesOf(g.id).primary : [];
      }))];
      if (ms.length) return { muscles: ms, source: 'plan' as const };
    }
    return { muscles: [], source: 'none' as const };
  }, [logged, plan]);
}

export function useRoutine(roll: boolean) {
  const worked = useWorkedToday();
  const items = useMemo(() => stretchRoutine(worked.muscles, { roll }), [worked.muscles, roll]);
  return { ...worked, items };
}

export function RoutineList({ items }: { items: RoutineItem[] }) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  return (
    <View style={{ gap: 2 }}>
      {items.map(({ ex, muscle, roll }, i) => (
        <Pressable key={ex.id} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } })}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8, opacity: pressed ? 0.7 : 1,
            borderTopWidth: i ? 1 : 0, borderTopColor: colors.border })}>
          <ExerciseThumb photo={ex.photos?.[0]} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <T semibold numberOfLines={1}>{L(ex.name)}</T>
            <T size="xs" muted>{L(MUSCLE_NAMES[muscle])} · {t(roll ? 'recovery.rollHold' : 'recovery.stretchHold')}</T>
          </View>
          <Ionicons name="play-circle-outline" size={22} color={colors.primary} />
        </Pressable>
      ))}
    </View>
  );
}

const KIND_ICON: Record<RecoveryCenter['kind'], keyof typeof Ionicons.glyphMap> = {
  physio: 'body-outline', recovery: 'snow-outline', sports_medicine: 'medkit-outline', hospital: 'business-outline',
};

export function CenterCard({ c }: { c: RecoveryCenter }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [asking, setAsking] = useState(false);
  const partner = isPartner(c);
  const canBook = takesAppointments(c) && c.owner !== userId;
  const offerLive = !!c.offer_text && (!c.offer_ends || c.offer_ends >= new Date().toISOString().slice(0, 10));
  const name = lng === 'en' && c.name_en ? c.name_en : c.name;
  return (
    <View style={{ gap: space.sm, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: partner ? brand.orange : colors.border, padding: space.md }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {c.logo_path ? <Image source={{ uri: publicUrl('brands', c.logo_path) }} style={{ width: 46, height: 46 }} contentFit="cover" />
            : <Ionicons name={KIND_ICON[c.kind]} size={22} color={colors.primary} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T bold numberOfLines={2}>{name}</T>
          <T size="xs" muted numberOfLines={1}>{t(`recovery.kind_${c.kind}`)} · {c.cities.slice(0, 3).join('، ')}{c.cities.length > 3 ? ` +${c.cities.length - 3}` : ''}</T>
          <Row gap={4}>
            <Ionicons name={partner ? 'checkmark-circle' : 'globe-outline'} size={13} color={partner ? colors.success : colors.muted} />
            <T size="xs" color={partner ? colors.success : colors.muted}>{t(partner ? 'recovery.partner' : 'recovery.fromSite')}</T>
          </Row>
        </View>
      </Row>
      {c.description ? <T size="sm" muted>{c.description}</T> : null}
      {c.services.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {c.services.slice(0, 6).map((s) => (
            <View key={s} style={{ backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
              <T size="xs">{t(`recovery.svc_${s}`)}</T>
            </View>
          ))}
        </View>
      ) : null}
      {offerLive ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: brand.orange + '1A', borderRadius: radius.md, padding: 8 }}>
          <Ionicons name="pricetag" size={15} color={brand.orange} />
          <T size="xs" semibold style={{ flex: 1 }}>{c.offer_text}{c.offer_code ? ` · ${t('partners.code')}: ${c.offer_code}` : ''}</T>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {canBook ? <Act icon="calendar-outline" label={t('partners.requestAppt')} onPress={() => setAsking(true)} /> : null}
        {c.whatsapp ? <Act icon="logo-whatsapp" label={t('recovery.whatsapp')} onPress={() => whatsappCenter(c, t('recovery.waText'))} /> : null}
        {c.phone ? <Act icon="call-outline" label={t('recovery.call')} onPress={() => callCenter(c)} /> : null}
        {c.website ? <Act icon="globe-outline" label={t('recovery.site')} onPress={() => openCenterSite(c)} /> : null}
        {c.instagram ? <Act icon="logo-instagram" label="Instagram" onPress={() => openCenterInstagram(c)} /> : null}
      </View>
      <PromptModal visible={asking} title={t('partners.requestAppt')} message={t('partners.requestApptHint', { name })} onClose={() => setAsking(false)}
        confirm={t('partners.sendRequest')}
        fields={[{ key: 'pref', label: t('partners.preferredTime'), placeholder: t('partners.preferredPh') }, { key: 'note', label: t('partners.apptNote'), multiline: true, placeholder: t('partners.apptNotePh') }]}
        onSubmit={async (v) => {
          try {
            await requestAppointment(c.id, v.pref, v.note);
            setAsking(false);
            Alert.alert(t('partners.apptSent'), t('partners.apptSentBody', { name }), [
              { text: t('common.ok') }, { text: t('partners.myAppointments'), onPress: () => router.push('/recovery/appointments') },
            ]);
          } catch (e) { Alert.alert(t(errorKey(e))); }
        }} />
    </View>
  );
}

function Act({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({
      flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
      backgroundColor: colors.cardAlt, opacity: pressed ? 0.7 : 1,
    })}>
      <Ionicons name={icon} size={15} color={colors.primary} />
      <T size="xs" semibold>{label}</T>
    </Pressable>
  );
}
