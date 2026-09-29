// خطة جديدة: ٣ طرق — بالذكاء الاصطناعي (تجهز خلال ثواني)، أو تختار من الجداول الجاهزة، أو تبني جدولك بنفسك
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Animated, Easing, I18nManager, Pressable, TextInput, View } from 'react-native';
import { BrandGradient, Logo, SaduPattern } from '@/brand/Brand';
import { Button, Card, Row, Screen, Segmented, T } from '@/components/ui';
import { PROGRAMS } from '@/content/programs';
import { useUser } from '@/lib/auth';
import { createAiPlan, createRulesPlan, loadPlanInput, PlanError, type PlanErrorCode } from '@/lib/plan';
import { errorKey, supabase } from '@/lib/supabase';
import { brand, colors, fonts, radius, space } from '@/theme';

const DONE_BACK = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/plan'));
/** مراحل تقريبية للعرض أثناء الانتظار (الخطة عادة تجهز خلال ٢٠–٣٠ ثانية) */
const STEPS = [
  { key: 'read', at: 0 },
  { key: 'train', at: 2 },
  { key: 'meals', at: 9 },
  { key: 'week', at: 17 },
] as const;

export default function NewPlan() {
  const { t } = useTranslation();
  const { userId, health, plan, refreshPlan, refreshProfile } = useUser();
  const [place, setPlace] = useState<'gym' | 'home'>('gym');
  const [days, setDays] = useState<number>(health?.days_per_week ?? 3);
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<'pick' | 'ai' | 'error'>('pick');
  const [err, setErr] = useState<PlanErrorCode>('failed');
  const [quickBusy, setQuickBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const incomplete = !health?.height_cm || !health.birth_year || !health.gender || !health.goal || !health.level;

  const startAi = async () => {
    setPhase('ai');
    try {
      // أيام التمرين تتحفظ في ملفك (الخطط الجاية تمشي عليها)
      if (health && days !== health.days_per_week) {
        await supabase.from('health_profiles').update({ days_per_week: days, updated_at: new Date().toISOString() }).eq('user_id', userId);
        await refreshProfile();
      }
      const base = await loadPlanInput(userId, health ? { ...health, days_per_week: days } : null);
      if (!base) throw new PlanError('incomplete');
      await createAiPlan(userId, base.input, { photoPath: base.photoPath, inbodyReportId: base.inbodyReportId, notes, place });
      await refreshPlan();
      if (!alive.current) return;
      DONE_BACK();
      setTimeout(() => Alert.alert(t('planNew.readyTitle'), t('planNew.readyBody')), 350);
    } catch (e) {
      await refreshPlan().catch(() => {});
      if (!alive.current) return;
      setErr(e instanceof PlanError ? e.code : 'failed');
      setPhase('error');
    }
  };

  const quick = async () => {
    setQuickBusy(true);
    try {
      const base = await loadPlanInput(userId, health);
      if (!base) throw new PlanError('incomplete');
      await createRulesPlan(userId, base.input, base.inbodyReportId);
      await refreshPlan();
      DONE_BACK();
    } catch (e) {
      Alert.alert(e instanceof PlanError && e.code === 'incomplete' ? t('planNew.incomplete') : t(errorKey(e)));
    } finally { setQuickBusy(false); }
  };

  if (phase === 'ai') return <Building place={place} />;

  if (phase === 'error') {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: space.md, marginTop: space.xl }}>
          <Ionicons name={err === 'rate_limited' ? 'hourglass-outline' : err === 'network' ? 'cloud-offline-outline' : 'alert-circle-outline'} size={48} color={colors.primary} />
          <T size="lg" bold center>{t(`planNew.err_${err}`)}</T>
          <T muted center style={{ lineHeight: 24 }}>{t(`planNew.errHint_${err === 'rate_limited' || err === 'network' || err === 'incomplete' ? err : 'failed'}`)}</T>
        </View>
        {err !== 'rate_limited' && err !== 'incomplete' ? <Button title={t('planNew.retry')} icon="refresh" onPress={startAi} /> : null}
        {err === 'incomplete' ? <Button title={t('planNew.completeProfile')} icon="person-outline" onPress={() => router.push('/profile-edit')} /> : null}
        <Button title={t('planNew.quickShort')} icon="flash-outline" variant="secondary" onPress={quick} loading={quickBusy} />
        <Button title={t('planNew.pickProgram')} icon="albums-outline" variant="secondary" onPress={() => router.push('/programs')} />
        <Button title={t('planNew.buildOwn')} icon="create-outline" variant="ghost" onPress={() => router.push('/plan-builder')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <T muted style={{ lineHeight: 24 }}>{t('planNew.intro')}</T>

      {/* ١) بالذكاء الاصطناعي */}
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, padding: space.lg, gap: space.md, overflow: 'hidden' }}>
        <SaduPattern variant="arrows" opacity={0.1} />
        <Row style={{ alignItems: 'flex-start' }}>
          <Ionicons name="sparkles" size={26} color={brand.amber} />
          <View style={{ flex: 1, gap: 4 }}>
            <Row gap={8}>
              <T size="lg" bold color={brand.cream}>{t('planNew.aiTitle')}</T>
              <View style={{ backgroundColor: brand.amber, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <T size="xs" bold color={brand.deepGreen}>{t('planNew.aiBadge')}</T>
              </View>
            </Row>
            <T size="sm" color={brand.sand} style={{ lineHeight: 21 }}>{t('planNew.aiSub')}</T>
          </View>
        </Row>
        {incomplete ? (
          <T size="sm" color={brand.cream}>{t('planNew.incomplete')}</T>
        ) : (
          <>
            <View style={{ gap: 6 }}>
              <T size="xs" semibold color={brand.cream}>{t('planNew.where')}</T>
              <Segmented value={place} onChange={setPlace} options={[{ value: 'gym', label: t('planNew.gym') }, { value: 'home', label: t('planNew.home') }]} />
            </View>
            <View style={{ gap: 6 }}>
              <T size="xs" semibold color={brand.cream}>{t('planNew.daysPerWeek')}</T>
              <Segmented value={days} onChange={setDays} options={[2, 3, 4, 5, 6].map((d) => ({ value: d, label: String(d) }))} />
            </View>
            <View style={{ gap: 6 }}>
              <T size="xs" semibold color={brand.cream}>{t('planNew.notes')}</T>
              <TextInput value={notes} onChangeText={(v) => setNotes(v.slice(0, 300))} multiline placeholder={t('planNew.notesPh')}
                placeholderTextColor="rgba(248,237,218,0.5)" maxLength={300}
                style={{ minHeight: 70, borderRadius: radius.md, backgroundColor: 'rgba(0,0,0,0.18)', color: brand.cream, padding: 12,
                  fontFamily: fonts.regular, fontSize: 14, textAlignVertical: 'top', textAlign: I18nManager.isRTL ? 'right' : 'auto' }} />
            </View>
          </>
        )}
        <Pressable onPress={incomplete ? () => router.push('/profile-edit') : startAi} accessibilityRole="button"
          style={({ pressed }) => ({ backgroundColor: brand.amber, borderRadius: 999, paddingVertical: 13, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
          <T bold color={brand.deepGreen}>{incomplete ? t('planNew.completeProfile') : t('planNew.aiGo')}</T>
        </Pressable>
      </BrandGradient>

      {/* ٢) من الجداول الجاهزة */}
      <Choice icon="albums-outline" title={t('planNew.pickProgram')} sub={t('planNew.pickProgramSub', { n: PROGRAMS.length })} onPress={() => router.push('/programs')} />

      {/* ٣) ابنِ جدولك بنفسك */}
      <Choice icon="create-outline" title={t('planNew.buildOwn')} sub={t(plan ? 'planNew.buildOwnSubEdit' : 'planNew.buildOwnSub')} onPress={() => router.push('/plan-builder')} />

      <Pressable onPress={quick} disabled={quickBusy} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: space.sm }}>
        {quickBusy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="flash-outline" size={16} color={colors.primary} />}
        <T size="sm" semibold color={colors.primary}>{t('planNew.quick')}</T>
      </Pressable>
      <T size="xs" muted center>{t('planNew.keepsMeals')}</T>
    </Screen>
  );
}

function Choice({ icon, title, sub, onPress }: { icon: 'albums-outline' | 'create-outline'; title: string; sub: string; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ gap: 6 }}>
      <Row>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T bold>{title}</T>
          <T size="sm" muted style={{ lineHeight: 20 }}>{sub}</T>
        </View>
        <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
      </Row>
    </Card>
  );
}

/** شاشة الانتظار: مراحل واضحة وشريط تقدّم، وتقدر تطلع والخطة تنحفظ لك */
function Building({ place }: { place: 'gym' | 'home' }) {
  const { t } = useTranslation();
  const [sec, setSec] = useState(0);
  const [bar] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const id = setInterval(() => setSec((s) => s + 1), 1000);
    // يقرب من ٩٢٪ خلال ٣٠ ثانية وما يوصل ١٠٠ لين تجهز الخطة فعلاً
    Animated.timing(bar, { toValue: 0.92, duration: 30000, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    return () => clearInterval(id);
  }, [bar]);
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: space.lg, marginTop: space.xl }}>
        <Logo variant="mark" height={56} color={colors.primary} />
        <T size="lg" bold center>{t('planNew.building')}</T>
        <View style={{ alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
          <Animated.View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primary, width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
        </View>
      </View>
      <Card style={{ gap: space.md }}>
        {STEPS.map((s, i) => {
          const next = STEPS[i + 1];
          const done = next ? sec >= next.at : false;
          const now = sec >= s.at && !done;
          return (
            <Row key={s.key} gap={10}>
              {done ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                : now ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Ionicons name="ellipse-outline" size={20} color={colors.border} />}
              <T style={{ flex: 1, opacity: done || now ? 1 : 0.5 }}>{t(`planNew.step_${s.key}`, { place: t(place === 'home' ? 'planNew.home' : 'planNew.gym') })}</T>
            </Row>
          );
        })}
      </Card>
      <T size="sm" muted center style={{ lineHeight: 22 }}>{t(sec > 45 ? 'planNew.slow' : 'planNew.canLeave')}</T>
    </Screen>
  );
}
