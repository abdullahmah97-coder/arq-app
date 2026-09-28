import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { Button, Card, Input, Row, Screen, SectionTitle, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { getDraft, saveReport } from '@/lib/inbody';
import { hasEssentials, normalizeMetrics } from '@/lib/inbody/normalize';
import type { InBodyMetrics, Segment } from '@/lib/inbody/types';
import { errorKey } from '@/lib/supabase';
import { brand, colors, font, fonts, radius, space } from '@/theme';

const SEGS: Segment[] = ['right_arm', 'left_arm', 'trunk', 'right_leg', 'left_leg'];

type NumKey = Exclude<keyof InBodyMetrics, 'device_model' | 'test_date' | 'gender' | 'segmental_lean' | 'segmental_fat' | 'ranges'>;

const ESSENTIAL: NumKey[] = ['weight_kg', 'smm_kg', 'pbf_pct'];
const MORE: NumKey[] = [
  'body_fat_mass_kg', 'bmr_kcal', 'ffm_kg', 'ecw_ratio', 'visceral_fat_area_cm2', 'visceral_fat_level',
  'target_weight_kg', 'fat_control_kg', 'muscle_control_kg', 'total_body_water_l', 'phase_angle', 'inbody_score', 'height_cm', 'age',
];

const str = (v: number | null | undefined) => (v == null ? '' : String(v));

export default function ReviewReport() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const draft = getDraft();
  const initial = draft?.metrics ?? normalizeMetrics({});

  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    [...ESSENTIAL, ...MORE].forEach((k) => { o[k] = str(initial[k] as number | null); });
    return o;
  });
  const [date, setDate] = useState(initial.test_date ?? new Date().toISOString().slice(0, 10));
  const [seg, setSeg] = useState<Record<string, { kg: string; pct: string }>>(() => {
    const o: Record<string, { kg: string; pct: string }> = {};
    SEGS.forEach((s) => { o[s] = { kg: str(initial.segmental_lean?.[s].kg), pct: str(initial.segmental_lean?.[s].pct) }; });
    return o;
  });
  const [busy, setBusy] = useState(false);

  const metrics = useMemo(() => normalizeMetrics({
    ...initial,
    ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v.trim() === '' ? null : Number(v.replace(',', '.'))])),
    test_date: date,
    segmental_lean: Object.fromEntries(SEGS.map((s) => [s, {
      kg: seg[s].kg ? Number(seg[s].kg) : null, pct: seg[s].pct ? Number(seg[s].pct) : null,
    }])),
  }), [vals, date, seg, initial]);

  const save = async () => {
    if (!hasEssentials(metrics)) return Alert.alert(t('inbody.missing'));
    setBusy(true);
    try {
      const id = await saveReport(userId, metrics, draft?.filePath ?? null, draft?.source ?? 'manual');
      router.replace({ pathname: '/inbody/[id]', params: { id } });
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const field = (k: NumKey, star = false) => (
    <Input
      key={k}
      label={`${t(`inbody.field.${k}`)}${star ? ' *' : ''}`}
      value={vals[k]}
      onChangeText={(v) => setVals((o) => ({ ...o, [k]: v }))}
      keyboardType={k.endsWith('control_kg') ? 'numbers-and-punctuation' : 'decimal-pad'}
    />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']}>
        <Card style={{ backgroundColor: brand.deepGreen, borderColor: brand.deepGreen }}>
          <T size="sm" color={brand.cream}>{t('inbody.reviewHint')}</T>
          {initial.device_model ? <T size="xs" color={brand.amber}>{initial.device_model}</T> : null}
        </Card>

        <Input label={t('inbody.field.test_date')} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        {ESSENTIAL.map((k) => field(k, true))}

        <SectionTitle title={t('inbody.segmental')} />
        <T size="xs" muted>{t('inbody.segmentalHint')}</T>
        <Card style={{ gap: space.sm }}>
          <Row>
            <View style={{ flex: 1.4 }} />
            <T size="xs" muted style={{ flex: 1, textAlign: 'center' }}>{t('common.kg')}</T>
            <T size="xs" muted style={{ flex: 1, textAlign: 'center' }}>%</T>
          </Row>
          {SEGS.map((s) => (
            <Row key={s}>
              <T size="sm" style={{ flex: 1.4, minWidth: 0 }}>{t(`inbody.seg.${s}`)}</T>
              {(['kg', 'pct'] as const).map((f) => (
                <View key={f} style={{ flex: 1, minWidth: 0 }}>
                  <TextInput value={seg[s][f]} keyboardType="decimal-pad"
                    onChangeText={(v) => setSeg((o) => ({ ...o, [s]: { ...o[s], [f]: v } }))}
                    style={{
                      width: '100%', minWidth: 0, textAlign: 'center', backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1,
                      borderColor: colors.border, paddingVertical: 8, color: colors.text, fontFamily: fonts.regular, fontSize: font.sm,
                    }} />
                </View>
              ))}
            </Row>
          ))}
        </Card>

        <SectionTitle title={t('inbody.keyNumbers')} />
        {MORE.map((k) => field(k))}

        <Button title={t('inbody.saveAnalyze')} icon="analytics" onPress={save} loading={busy} disabled={!hasEssentials(metrics)} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
