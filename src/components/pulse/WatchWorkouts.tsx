// تمارين ساعتك: اللي سجّلتها في Apple Watch (جري، مشي، دراجة…) تظهر هنا، مع ملخص الأسبوع
// ونبض وسعرات الساعة أثناء جلسة أرك (في ملخص التمرين)
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { NCard, NSection, NT, Num } from '@/components/pulse/widgets';
import { WORKOUT_ICON, watchWorkouts, weekSummary, type ExternalWorkout, type SessionWatchStats } from '@/lib/health';
import { useLocalized } from '@/lib/i18n';
import { brand, night } from '@/theme';

type Icon = keyof typeof Ionicons.glyphMap;

export function WatchWorkoutsCard() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [rows, setRows] = useState<ExternalWorkout[] | null>(null);
  useFocusEffect(useCallback(() => { watchWorkouts(14).then(setRows).catch(() => setRows([])); }, []));
  if (!rows) return null;
  const wk = weekSummary(rows);
  const when = (iso: string) => new Date(iso).toLocaleString(lng === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const km = (m: number) => (m / 1000).toFixed(m >= 10_000 ? 0 : 1);

  return (
    <>
      <NSection title={t('watch.workoutsTitle')} />
      <NCard>
        {rows.length ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Mini label={t('watch.weekCount')} value={String(wk.count)} />
              <Mini label={t('watch.weekMinutes')} value={String(wk.minutes)} />
              <Mini label={t('health.kcal')} value={String(wk.kcal)} />
              {wk.distance_m ? <Mini label={t('watch.km')} value={km(wk.distance_m)} /> : null}
            </View>
            {rows.slice(0, 6).map((w) => (
              <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: night.line, paddingTop: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(254,169,79,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={WORKOUT_ICON[w.kind] as Icon} size={17} color={brand.amber} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <NT size={14} semibold>{t(`watch.kind_${w.kind}`)}</NT>
                  <NT size={11} faint numberOfLines={1}>{when(w.start)}{w.source ? ` · ${w.source}` : ''}{w.from_watch ? ' ⌚' : ''}</NT>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Num size={15}>{w.minutes}<NT size={10} faint> {t('coach.min')}</NT></Num>
                  <NT size={10} faint>{[w.kcal != null ? `${w.kcal} ${t('health.kcal')}` : null, w.distance_m ? `${km(w.distance_m)} ${t('watch.km')}` : null].filter(Boolean).join(' · ')}</NT>
                </View>
              </View>
            ))}
          </>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="watch-outline" size={22} color={brand.amber} />
            <NT size={12} muted style={{ flex: 1, lineHeight: 19 }}>{t('watch.workoutsEmpty')}</NT>
          </View>
        )}
      </NCard>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2, flex: 1 }}>
      <Num size={20}>{value}</Num>
      <NT size={10} faint>{label}</NT>
    </View>
  );
}

/** في ملخص التمرين: نبض وسعرات الساعة أثناء الجلسة، وهل انحفظت في Apple Health */
export function SessionWatchCard({ stats, saved }: { stats: SessionWatchStats | null; saved: boolean }) {
  const { t } = useTranslation();
  if (!stats && !saved) return null;
  return (
    <NCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="watch" size={18} color={brand.amber} />
        <NT size={14} bold style={{ flex: 1 }}>{t('watch.sessionTitle')}</NT>
        {saved ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="checkmark-circle" size={14} color={brand.amber} />
            <NT size={11} semibold color={brand.amber}>{t('watch.savedToHealth')}</NT>
          </View>
        ) : null}
      </View>
      {stats ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Mini label={t('watch.avgHr')} value={stats.avg_hr != null ? String(stats.avg_hr) : '—'} />
          <Mini label={t('watch.maxHr')} value={stats.max_hr != null ? String(stats.max_hr) : '—'} />
          <Mini label={t('health.kcal')} value={stats.kcal != null ? String(stats.kcal) : '—'} />
        </View>
      ) : <NT size={12} muted>{t('watch.noSessionData')}</NT>}
    </NCard>
  );
}
