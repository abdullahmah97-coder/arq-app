import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { Button, Card, Loading, Row, Screen, SectionTitle, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { applyReportToPlan, deleteReport, getReport, listReports, type InBodyReport } from '@/lib/inbody';
import { analyzeInBody } from '@/lib/inbody/analyze';
import type { InBodyAnalysis, InsightLevel, Segment } from '@/lib/inbody/types';
import { useLocalized } from '@/lib/i18n';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';
import { goBackOrHome, openHref } from '@/lib/nav';

const LEVEL: Record<InsightLevel, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  alert: { icon: 'warning', color: brand.orange, bg: '#FDEBDD' },
  watch: { icon: 'eye', color: '#B9763E', bg: '#FBEBD3' },
  good: { icon: 'checkmark-circle', color: brand.green, bg: '#EAF0E6' },
};

const SEGS: Segment[] = ['right_arm', 'left_arm', 'trunk', 'right_leg', 'left_leg'];

export default function ReportResult() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId, health, refreshPlan, refreshProfile } = useUser();
  const [r, setR] = useState<InBodyReport | null>(null);
  const [prev, setPrev] = useState<InBodyReport | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const rep = await getReport(id);
    if (!rep) { goBackOrHome(); return; }
    setR(rep);
    const all = await listReports(userId);
    const i = all.findIndex((x) => x.id === id);
    setPrev(i >= 0 ? all[i + 1] ?? null : null);
  }, [id, userId]);

  useEffect(() => { load(); }, [load]);

  if (!r) return <Loading />;
  const m = r.metrics;
  const a: InBodyAnalysis = r.analysis ?? analyzeInBody(m);

  const apply = async () => {
    setBusy(true);
    try {
      const res = await applyReportToPlan(userId, r, health);
      await Promise.all([refreshPlan(), refreshProfile()]);
      Alert.alert(t('inbody.appliedDone'), res.source === 'rules' ? undefined : '✨');
      openHref('/(tabs)/plan');
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => Alert.alert(t('inbody.deleteConfirm'), '', [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteReport(r); goBackOrHome(); } },
  ]);

  const insightText = (key: string, params?: Record<string, string | number>) => {
    const p = { ...params };
    if (key === 'weak_segments' && typeof p.list === 'string') {
      p.list = p.list.split(',').map((s) => t(`inbody.seg.${s}`)).join(lng === 'ar' ? '، ' : ', ');
    }
    if (key === 'target') {
      // المدة بالأسابيع بصيغة الجمع الصحيحة، أو بدونها لو ما فيه مدة (هدف «الحفاظ»)
      const weeks = Number(p.weeks);
      return weeks > 0 ? t('inbody.insight.target', { ...p, count: weeks }) : t('inbody.insight.targetNoWeeks', p);
    }
    return t(`inbody.insight.${key}`, p);
  };

  const changes: string[] = [];
  if (a.bmr) changes.push('calories');
  if (a.ffm) changes.push('protein');
  if (a.weak_segments.length || a.imbalance.upper_lower) changes.push('segments');
  if ((a.imbalance.arms ?? 0) > 5 || (a.imbalance.legs ?? 0) > 5) changes.push('unilateral');
  if (a.extra_cardio) changes.push('cardio');
  if (a.caution_ecw) changes.push('ecw');

  const delta = (k: 'weight_kg' | 'pbf_pct' | 'smm_kg') => {
    const now = m[k]; const before = prev?.metrics[k];
    if (now == null || before == null) return null;
    return Math.round((now - before) * 10) / 10;
  };

  return (
    <Screen edges={['bottom']}>
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, padding: space.xl, overflow: 'hidden', gap: space.md }}>
        <SaduPattern variant="chevron" opacity={0.12} />
        <T size="xs" color={brand.amber} semibold>
          {[m.device_model, r.test_date].filter(Boolean).join(' · ') || t('inbody.title')}
        </T>
        <View style={{ gap: 2 }}>
          <T size="xs" color={brand.sand}>{t('inbody.bodyType')}</T>
          <T size="xl" bold color={brand.cream}>{t(`inbody.type.${a.body_type}`)}</T>
        </View>
        <Row gap={space.lg} style={{ flexWrap: 'wrap' }}>
          <HeroStat label={t('inbody.recommendedGoal')} value={t(`inbody.goal.${a.recommended_goal}`)} />
          {a.weekly_rate_kg ? <HeroStat label={t('inbody.weeklyRate')} value={`${a.weekly_rate_kg} ${t('inbody.perWeek')}`} /> : null}
          {a.weeks_to_target ? <HeroStat label={t('inbody.weeks')} value={t('inbody.weeksN', { n: a.weeks_to_target, count: a.weeks_to_target })} /> : null}
        </Row>
      </BrandGradient>

      {/* أهم الأرقام */}
      <Row gap={space.sm}>
        <Metric label={t('inbody.m_weight')} value={m.weight_kg} unit={t('common.kg')} delta={delta('weight_kg')} goodDown />
        <Metric label={t('inbody.m_fat')} value={m.pbf_pct} unit="%" delta={delta('pbf_pct')} goodDown />
        <Metric label={t('inbody.m_muscle')} value={m.smm_kg} unit={t('common.kg')} delta={delta('smm_kg')} />
      </Row>
      <Row gap={space.sm}>
        <Metric label={t('inbody.m_bmr')} value={m.bmr_kcal} unit={t('common.kcal')} />
        <Metric label={t('inbody.m_visceral')} value={m.visceral_fat_level ?? m.visceral_fat_area_cm2} unit={m.visceral_fat_level != null ? '' : `${t('common.cm')}²`} warn={a.visceral_status === 'high'} />
        <Metric label={t('inbody.m_ecw')} value={m.ecw_ratio} unit="" warn={a.caution_ecw} />
      </Row>
      {prev ? <T size="xs" muted>{t('inbody.compare')}: {prev.test_date ?? ''}</T> : null}

      {/* الملاحظات */}
      <SectionTitle title={t('inbody.insights')} />
      {a.insights.map((ins, i) => {
        const L = LEVEL[ins.level];
        return (
          <View key={i} style={{ flexDirection: 'row', gap: space.sm, backgroundColor: L.bg, borderRadius: radius.md, padding: space.md, alignItems: 'flex-start' }}>
            <Ionicons name={L.icon} size={18} color={L.color} style={{ marginTop: 3 }} />
            <T size="sm" style={{ flex: 1, lineHeight: 22 }}>{insightText(ins.key, ins.params)}</T>
          </View>
        );
      })}

      {/* توزيع العضل */}
      {m.segmental_lean ? (
        <>
          <SectionTitle title={t('inbody.segmental')} />
          <Card style={{ gap: space.md }}>
            <T size="xs" muted>{t('inbody.segmentalHint')}</T>
            {SEGS.map((s) => {
              const v = m.segmental_lean![s];
              const pct = v.pct ?? 0;
              const weak = pct > 0 && pct < 90;
              return (
                <View key={s} style={{ gap: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T size="sm">{t(`inbody.seg.${s}`)}</T>
                    <T size="sm" semibold color={weak ? brand.orange : colors.text}>{v.kg ?? '—'} {t('common.kg')} · {v.pct ?? '—'}%</T>
                  </Row>
                  <View style={{ height: 8, backgroundColor: colors.cardAlt, borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, (pct / 150) * 100)}%`, height: 8, backgroundColor: weak ? brand.orange : brand.green, borderRadius: 4 }} />
                  </View>
                </View>
              );
            })}
            <Row gap={6}>
              <View style={{ width: 2, height: 10, backgroundColor: colors.muted }} />
              <T size="xs" muted>{t('inbody.pctNormal')}</T>
            </Row>
          </Card>
        </>
      ) : null}

      {/* وش بيتغير */}
      <SectionTitle title={t('inbody.whatChanges')} />
      <Card style={{ gap: space.sm, backgroundColor: brand.deepGreen, borderColor: brand.deepGreen }}>
        {changes.map((c) => (
          <Row key={c} style={{ alignItems: 'flex-start' }}>
            <Ionicons name="checkmark-circle" size={18} color={brand.amber} style={{ marginTop: 2 }} />
            <T size="sm" color={brand.cream} style={{ flex: 1 }}>{t(`inbody.changes.${c}`)}</T>
          </Row>
        ))}
      </Card>

      {busy ? (
        <Card style={{ alignItems: 'center', gap: space.sm }}>
          <ActivityIndicator color={brand.orange} />
          <T>{t('inbody.applying')}</T>
        </Card>
      ) : (
        <Button title={r.applied ? t('inbody.applied') : t('inbody.applyPlan')} icon="flash" onPress={apply} variant={r.applied ? 'secondary' : 'primary'} />
      )}
      <Button title={t('inbody.howToRead')} variant="ghost" icon="help-circle-outline" onPress={() => router.push('/learn/inbody')} />
      <Button title={t('common.delete')} variant="ghost" icon="trash-outline" onPress={remove} small />
      <T size="xs" muted center>{t('inbody.disclaimer')}</T>
    </Screen>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <T size="xs" color={brand.sand}>{label}</T>
      <T semibold color={brand.cream}>{value}</T>
    </View>
  );
}

function Metric({ label, value, unit, delta, goodDown, warn }: {
  label: string; value: number | null; unit: string; delta?: number | null; goodDown?: boolean; warn?: boolean;
}) {
  const good = delta != null && delta !== 0 && (goodDown ? delta < 0 : delta > 0);
  return (
    <Card style={{ flex: 1, padding: space.md, gap: 2, borderColor: warn ? brand.orange : colors.border }}>
      <T size="xs" muted>{label}</T>
      <T size="lg" bold color={warn ? brand.orange : colors.text}>{value ?? '—'}<T size="xs" muted> {unit}</T></T>
      {delta != null && delta !== 0 ? (
        <T size="xs" semibold color={good ? brand.green : brand.orange}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)}</T>
      ) : null}
    </Card>
  );
}
