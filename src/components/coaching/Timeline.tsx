// السجل الكامل مرتب بالأيام + التقرير الشهري (يستخدمه المتدرب لنفسه والمدرب حسب الصلاحيات)
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Share, View } from 'react-native';
import { Button, Card, Empty, Row, T } from '@/components/ui';
import type { MonthReport, TimelineItem } from '@/lib/coaching';
import { brand, colors, space } from '@/theme';

const ICON: Record<TimelineItem['kind'], keyof typeof Ionicons.glyphMap> = {
  workout: 'barbell-outline', visit: 'location-outline', inbody: 'analytics-outline', health: 'pulse-outline', food: 'restaurant-outline',
  session: 'people-outline', program: 'clipboard-outline', note: 'lock-closed-outline',
};
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });

export function Timeline({ items }: { items: TimelineItem[] }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language === 'en' ? 'en' : 'ar';
  if (!items.length) return <Empty icon="document-text-outline" text={t('coaching.noRecord')} />;
  const days = new Map<string, TimelineItem[]>();
  items.forEach((it) => { const k = dayKey(it.at); days.set(k, [...(days.get(k) ?? []), it]); });
  const line = (it: TimelineItem) => {
    const d = it.detail ?? {};
    switch (it.kind) {
      case 'workout': return t('coaching.tl_workout', { title: it.title || t('coaching.workout'), sets: d.sets ?? 0, volume: Math.round(Number(d.volume ?? 0)).toLocaleString('en-US'), min: d.minutes ?? 0 });
      case 'visit': return t('coaching.tl_visit', { gym: it.title, min: d.minutes ?? 0 });
      case 'inbody': return t('coaching.tl_inbody', { w: d.weight_kg ?? '—', pbf: d.pbf_pct ?? '—', smm: d.smm_kg ?? '—' });
      case 'health': return t('coaching.tl_health', { steps: Number(d.steps ?? 0).toLocaleString('en-US'), sleep: d.sleep_min ? (d.sleep_min / 60).toFixed(1) : '—', rec: d.recovery ?? '—' });
      case 'food': return t('coaching.tl_food', { kcal: d.kcal ?? 0, p: d.protein_g ?? 0 });
      case 'session': return t('coaching.tl_session', { coach: it.title, status: t(`coaching.st_${d.status}`) });
      case 'program': return t('coaching.tl_program', { title: it.title, days: d.days_per_week });
      case 'note': return it.title;
    }
  };
  return (
    <View style={{ gap: space.sm }}>
      {[...days.entries()].map(([day, list]) => (
        <Card key={day} style={{ gap: 8 }}>
          <T size="xs" bold muted>{new Date(`${day}T12:00:00`).toLocaleDateString(lng === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })}</T>
          {list.map((it, i) => (
            <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
              <Ionicons name={ICON[it.kind]} size={16} color={it.kind === 'note' ? colors.muted : brand.deepGreen} style={{ marginTop: 3 }} />
              <T size="sm" style={{ flex: 1, lineHeight: 22 }} color={it.kind === 'note' ? colors.muted : undefined}>{line(it)}</T>
            </Row>
          ))}
        </Card>
      ))}
    </View>
  );
}

export function MonthReportCard({ r, name }: { r: MonthReport | null; name?: string }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language === 'en' ? 'en' : 'ar';
  if (!r) return <Empty icon="document-text-outline" text={t('coaching.noRecord')} />;
  const month = new Date(`${r.month}T12:00:00`).toLocaleDateString(lng === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric' });
  const delta = (a: number | null, b: number | null, unit: string) => (a != null && b != null ? `${a} → ${b} ${unit} (${b - a >= 0 ? '+' : ''}${(b - a).toFixed(1)})` : b != null ? `${b} ${unit}` : null);
  const rowsList: [string, string | null][] = [
    [t('coaching.r_workouts'), r.workouts != null ? t('coaching.r_workoutsV', { n: r.workouts, days: r.workout_days }) : null],
    [t('coaching.r_adherence'), r.adherence != null ? `${r.adherence}%` : null],
    [t('coaching.r_volume'), r.volume_kg != null ? `${Math.round(r.volume_kg).toLocaleString('en-US')} ${t('coaching.kg')}` : null],
    [t('coaching.r_visits'), r.visits != null ? String(r.visits) : null],
    [t('coaching.r_sessions'), r.sessions_done != null ? t('coaching.r_sessionsV', { done: r.sessions_done, missed: r.sessions_missed ?? 0 }) : null],
    [t('coaching.r_weight'), delta(r.weight_start, r.weight_end, t('coaching.kg'))],
    [t('coaching.r_pbf'), delta(r.pbf_start, r.pbf_end, '%')],
    [t('coaching.r_steps'), r.avg_steps != null ? r.avg_steps.toLocaleString('en-US') : null],
    [t('coaching.r_sleep'), r.avg_sleep_min != null ? t('coaching.hoursV', { h: (r.avg_sleep_min / 60).toFixed(1) }) : null],
    [t('coaching.r_food'), r.avg_kcal != null ? t('coaching.r_foodV', { kcal: r.avg_kcal, p: r.avg_protein ?? 0 }) : null],
  ];
  const shown = rowsList.filter(([, v]) => v != null) as [string, string][];
  const share = () => Share.share({ message: [`${t('coaching.monthReport')} — ${month}${name ? ` — ${name}` : ''}`, ...shown.map(([k, v]) => `• ${k}: ${v}`), 'ARQ أرك'].join('\n') });
  return (
    <Card style={{ gap: 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T semibold>{t('coaching.monthReport')} · {month}</T>
        <Button small variant="ghost" icon="share-outline" title={t('coaching.share')} onPress={share} />
      </Row>
      {shown.length ? shown.map(([k, v]) => (
        <Row key={k} style={{ justifyContent: 'space-between' }}><T size="sm" muted>{k}</T><T size="sm" semibold>{v}</T></Row>
      )) : <T size="sm" muted>{t('coaching.noRecord')}</T>}
    </Card>
  );
}
