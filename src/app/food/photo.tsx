// صوّر وجبتك: الذكاء الاصطناعي يتعرف على الأكل ويقدّر السعرات والبروتين والكارب والدهون، وأنت تراجع وتعدّل الكمية قبل التسجيل
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { Button, Card, Input, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import {
  analyzeMeal, logFoods, pickMealPhoto, scaleItem, slotForHour, totals, type MealAnalysis, type MealPhoto, type MealSlot,
} from '@/lib/nutrition';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const FACTORS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const ERR: Record<string, string> = {
  ai_not_configured: 'meal.errNotReady', rate_limited: 'meal.errLimit', not_food: 'meal.errNotFood',
  file_too_large: 'meal.errTooLarge', network: 'errors.network', permission_denied: 'meal.errPermission',
};

type Phase = 'pick' | 'analyzing' | 'review' | 'error' | 'saved';

export default function MealPhotoScreen() {
  const { t } = useTranslation();
  const { lng, num } = useLocalized();
  const { userId } = useUser();
  const { auto } = useLocalSearchParams<{ auto?: string }>();
  const [slot, setSlot] = useState<MealSlot>(slotForHour(new Date().getHours()));
  const [photo, setPhoto] = useState<MealPhoto | null>(null);
  const [hint, setHint] = useState('');
  const [phase, setPhase] = useState<Phase>('pick');
  const [err, setErr] = useState('');
  const [res, setRes] = useState<MealAnalysis | null>(null);
  const [factor, setFactor] = useState<number[]>([]);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [savedKcal, setSavedKcal] = useState(0);
  const started = useRef(false);

  const run = async (p: MealPhoto, h: string) => {
    setPhase('analyzing');
    const { result, error } = await analyzeMeal(p, h);
    if (!result) { setErr(error ?? 'ai_failed'); setPhase('error'); return; }
    setRes(result);
    setFactor(result.items.map(() => 1));
    setRemoved(new Set());
    setPhase('review');
  };

  const take = async (source: 'camera' | 'library') => {
    try {
      const p = await pickMealPhoto(source);
      if (!p) return;
      setPhoto(p);
      await run(p, hint);
    } catch (e) {
      setErr(e instanceof Error && e.message === 'permission_denied' ? 'permission_denied' : 'ai_failed');
      setPhase('error');
    }
  };

  // فتح الكاميرا مباشرة لما تجي من زر «صوّر وجبتك»
  useEffect(() => {
    if (auto === 'camera' && !started.current) { started.current = true; void take('camera'); }
  }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = (res?.items ?? []).map((it, i) => ({ it: scaleItem(it, factor[i] ?? 1), i })).filter((x) => !removed.has(x.i));
  const sum = totals(items.map((x) => x.it));

  const save = async () => {
    if (!items.length) return;
    setBusy(true);
    try {
      await logFoods(userId, items.map(({ it }) => ({
        slot, source: 'photo' as const, name: lng === 'ar' ? it.name_ar : it.name_en,
        kcal: it.kcal, protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g,
      })));
      setSavedKcal(sum.kcal);
      setPhase('saved');
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  const reset = () => { setPhoto(null); setRes(null); setErr(''); setPhase('pick'); };
  const step = (i: number, dir: 1 | -1) => setFactor((f) => {
    const k = FACTORS.indexOf(f[i] ?? 1);
    const next = FACTORS[Math.min(FACTORS.length - 1, Math.max(0, k + dir))];
    return f.map((v, j) => (j === i ? next : v));
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('meal.title') }} />
      <Screen edges={['bottom']}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, backgroundColor: colors.cardAlt }} contentFit="cover" />
        ) : null}

        {phase === 'pick' ? (
          <>
            <Card style={{ gap: space.md, alignItems: 'center', paddingVertical: space.xl }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="camera" size={30} color={brand.cream} />
              </View>
              <T bold size="lg" center>{t('meal.headline')}</T>
              <T muted center>{t('meal.intro')}</T>
            </Card>
            <Input label={t('meal.hintLabel')} value={hint} onChangeText={setHint} placeholder={t('meal.hintPh')} maxLength={200} />
            <Button title={t('meal.takePhoto')} icon="camera" onPress={() => take('camera')} />
            <Button title={t('meal.fromLibrary')} icon="images-outline" variant="secondary" onPress={() => take('library')} />
            <T size="xs" muted center>{t('meal.privacy')}</T>
          </>
        ) : null}

        {phase === 'analyzing' ? (
          <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
            <ActivityIndicator color={colors.primary} />
            <T semibold>{t('meal.analyzing')}</T>
            <T size="xs" muted center>{t('meal.analyzingHint')}</T>
          </Card>
        ) : null}

        {phase === 'error' ? (
          <Card style={{ gap: space.md }}>
            <Row><Ionicons name="alert-circle-outline" size={20} color={colors.danger} /><T bold style={{ flex: 1 }}>{t(ERR[err] ?? 'meal.errFailed')}</T></Row>
            {photo && err !== 'ai_not_configured' && err !== 'rate_limited' ? (
              <Button title={t('meal.retry')} icon="refresh" onPress={() => run(photo, hint)} />
            ) : null}
            <Button title={t('meal.another')} icon="camera-outline" variant="secondary" onPress={reset} />
            <Button title={t('meal.manual')} icon="create-outline" variant="ghost" onPress={() => router.replace('/food/add')} />
          </Card>
        ) : null}

        {phase === 'review' && res ? (
          <>
            <Card style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <T size="xs" muted>{t('meal.total')}</T>
                  <Row gap={6} style={{ alignItems: 'baseline' }}>
                    <T size="xxl" bold color={colors.primary}>{num(sum.kcal)}</T>
                    <T size="sm" muted>{t('common.kcal')}</T>
                  </Row>
                </View>
                <View style={{ backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <T size="xs" semibold>{t(`meal.conf_${res.confidence}`)}</T>
                </View>
              </Row>
              <Row gap={space.sm}>
                <Macro label={t('plan.protein')} v={sum.protein_g} color={colors.text} />
                <Macro label={t('plan.carbs')} v={sum.carbs_g} color={colors.accent} />
                <Macro label={t('plan.fat')} v={sum.fat_g} color={colors.muted} />
              </Row>
              {res.note?.[lng] ? <T size="xs" muted>{res.note[lng]}</T> : null}
            </Card>

            <T size="sm" bold muted>{t('meal.items')}</T>
            {items.map(({ it, i }) => (
              <Card key={i} style={{ gap: space.sm }}>
                <Row>
                  <View style={{ flex: 1 }}>
                    <T semibold>{lng === 'ar' ? it.name_ar : it.name_en}</T>
                    <T size="xs" muted>
                      ~{num(it.grams)} {t('common.g')} · {t('plan.protein')} {num(it.protein_g)} · {t('plan.carbs')} {num(it.carbs_g)} · {t('plan.fat')} {num(it.fat_g)}
                    </T>
                  </View>
                  <T bold color={colors.primary}>{num(it.kcal)}</T>
                  <Pressable onPress={() => setRemoved((r) => new Set(r).add(i))} hitSlop={8} accessibilityLabel={t('common.delete')}>
                    <Ionicons name="close-circle" size={20} color={colors.muted} />
                  </Pressable>
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T size="xs" muted>{t('meal.portion')}</T>
                  <Row gap={space.sm}>
                    <Pressable onPress={() => step(i, -1)} hitSlop={8} style={stepBtn}><Ionicons name="remove" size={16} color={colors.text} /></Pressable>
                    <T semibold style={{ minWidth: 48, textAlign: 'center' }}>{num(Math.round((factor[i] ?? 1) * 100))}{lng === 'ar' ? '٪' : '%'}</T>
                    <Pressable onPress={() => step(i, 1)} hitSlop={8} style={stepBtn}><Ionicons name="add" size={16} color={colors.text} /></Pressable>
                  </Row>
                </Row>
              </Card>
            ))}
            {!items.length ? <T muted center>{t('meal.allRemoved')}</T> : null}

            <Segmented value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ value: s, label: t(`plan.slot_${s}`) }))} />
            <Button title={`${t('food.addTo')} ${t(`plan.slot_${slot}`)}`} icon="checkmark" onPress={save} loading={busy} disabled={!items.length} />
            <Row gap={space.sm}>
              <Button style={{ flex: 1 }} small title={t('meal.another')} icon="camera-outline" variant="secondary" onPress={reset} />
              <Button style={{ flex: 1 }} small title={t('meal.addMissing')} icon="add" variant="ghost" onPress={() => router.push('/food/add')} />
            </Row>
            <T size="xs" muted center>{t('meal.estimate')}</T>
          </>
        ) : null}

        {phase === 'saved' ? (
          <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            <T bold size="lg">{t('meal.saved', { kcal: num(savedKcal) })}</T>
            <T muted center>{t('meal.savedHint', { slot: t(`plan.slot_${slot}`) })}</T>
            <Row gap={space.sm} style={{ marginTop: space.sm }}>
              <Button small title={t('meal.another')} icon="camera-outline" variant="secondary" onPress={reset} />
              <Button small title={t('meal.done')} onPress={() => router.back()} />
            </Row>
          </Card>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Macro({ label, v, color }: { label: string; v: number; color: string }) {
  const { t } = useTranslation();
  const { num } = useLocalized();
  return (
    <View style={{ flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.sm, gap: 2 }}>
      <T size="xs" muted>{label}</T>
      <T bold color={color}>{num(Math.round(v))} {t('common.g')}</T>
    </View>
  );
}

const stepBtn = { width: 30, height: 30, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.cardAlt };
