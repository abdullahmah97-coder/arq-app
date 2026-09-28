import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { BrandGradient, Logo, SaduPattern } from '@/brand/Brand';
import { Card, Empty, Row, Screen, SectionTitle, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { pickImage } from '@/lib/images';
import { extractReport, listReports, pickPdf, setDraft, uploadReport, type InBodyReport } from '@/lib/inbody';
import { emptyMetrics } from '@/lib/inbody/normalize';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';
import type { IconName } from '@/components/ui';

export default function InBodyHub() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [reports, setReports] = useState<InBodyReport[]>([]);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { listReports(userId).then(setReports); }, [userId]));

  const start = async (kind: 'camera' | 'gallery' | 'pdf' | 'manual') => {
    if (kind === 'manual') {
      setDraft({ metrics: emptyMetrics(), filePath: null, source: 'manual' });
      return router.push('/inbody/review');
    }
    const file = kind === 'pdf' ? await pickPdf() : await pickImage(kind === 'camera' ? 'camera' : 'library');
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadReport(userId, file.uri, file.mimeType);
      const { metrics, error } = await extractReport(path);
      if (metrics) {
        setDraft({ metrics, filePath: path, source: 'ai' });
      } else if (error === 'not_inbody') {
        return Alert.alert(t('inbody.notInbody'));
      } else {
        Alert.alert(t('inbody.aiUnavailable'));
        setDraft({ metrics: emptyMetrics(), filePath: path, source: 'manual' });
      }
      router.push('/inbody/review');
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const actions: { kind: 'camera' | 'gallery' | 'pdf' | 'manual'; icon: IconName; label: string }[] = [
    { kind: 'camera', icon: 'camera', label: t('inbody.camera') },
    { kind: 'gallery', icon: 'images', label: t('inbody.gallery') },
    { kind: 'pdf', icon: 'document-text', label: t('inbody.pdf') },
    { kind: 'manual', icon: 'create', label: t('inbody.manual') },
  ];

  return (
    <Screen edges={['bottom']}>
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, padding: space.xl, overflow: 'hidden', gap: space.md }}>
        <SaduPattern variant="chevron" opacity={0.12} />
        <Row style={{ justifyContent: 'space-between' }}>
          <T size="xl" bold color={brand.cream}>{t('inbody.title')}</T>
          <Logo variant="mark" height={26} color={brand.amber} />
        </Row>
        <T color={brand.sand} style={{ lineHeight: 24 }}>{t('inbody.hubIntro')}</T>
      </BrandGradient>

      {busy ? (
        <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
          <Logo variant="mark" height={42} color={brand.orange} />
          <ActivityIndicator color={brand.deepGreen} />
          <T bold>{t('inbody.reading')}</T>
          <T size="sm" muted>{t('inbody.readingHint')}</T>
        </Card>
      ) : (
        <>
          <SectionTitle title={t('inbody.addReport')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {actions.map((a, i) => (
              <Pressable key={a.kind} onPress={() => start(a.kind)}
                style={({ pressed }) => ({
                  width: '47%', flexGrow: 1, padding: space.lg, gap: space.sm, borderRadius: radius.lg,
                  backgroundColor: i === 0 ? brand.orange : colors.card, borderWidth: 1,
                  borderColor: i === 0 ? brand.orange : colors.border, opacity: pressed ? 0.85 : 1,
                })}>
                <Ionicons name={a.icon} size={24} color={i === 0 ? brand.cream : brand.orange} />
                <T semibold color={i === 0 ? brand.cream : colors.text}>{a.label}</T>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* شرح وتعلّم */}
      <Row gap={space.md}>
        <LearnCard icon="document-text-outline" title={t('inbody.howToRead')} onPress={() => router.push('/learn/inbody')} />
        <LearnCard icon="layers-outline" title={t('inbody.whatIsBC')} onPress={() => router.push('/learn/body-composition')} />
      </Row>

      <SectionTitle title={t('inbody.history')} />
      {reports.length === 0 ? <Card><Empty text={t('inbody.noReports')} icon="analytics-outline" /></Card> : reports.map((r) => (
        <Card key={r.id} onPress={() => router.push({ pathname: '/inbody/[id]', params: { id: r.id } })} style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T semibold>{r.test_date ?? new Date(r.created_at).toISOString().slice(0, 10)}{r.metrics.device_model ? ` · ${r.metrics.device_model}` : ''}</T>
            {r.applied ? <T size="xs" semibold color={colors.accent}>{t('inbody.applied')}</T> : null}
          </Row>
          <Row gap={space.lg}>
            <Mini label={t('inbody.m_weight')} value={r.metrics.weight_kg} />
            <Mini label={t('inbody.m_pbf')} value={r.metrics.pbf_pct} />
            <Mini label={t('inbody.m_smm')} value={r.metrics.smm_kg} />
            {r.analysis?.caution_ecw ? <Ionicons name="warning" size={18} color={brand.orange} /> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

function LearnCard({ icon, title, onPress }: { icon: IconName; title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      flex: 1, padding: space.md, gap: space.sm, borderRadius: radius.lg, backgroundColor: brand.deepGreen, opacity: pressed ? 0.85 : 1,
    })}>
      <Ionicons name={icon} size={20} color={brand.amber} />
      <T size="sm" semibold color={brand.cream}>{title}</T>
    </Pressable>
  );
}

function Mini({ label, value }: { label: string; value: number | null }) {
  return (
    <View>
      <T bold>{value ?? '—'}</T>
      <T size="xs" muted>{label}</T>
    </View>
  );
}
