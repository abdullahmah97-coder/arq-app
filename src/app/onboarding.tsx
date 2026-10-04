import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { GymPicker } from '@/components/GymPicker';
import { Button, H, Input, OptionCard, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { pickImage, type PickedImage } from '@/lib/images';
import { ACCOUNT_ICON, ACCOUNT_TYPES, type AccountType } from '@/lib/partners';
import { createPlanWithFallback } from '@/lib/plan';
import { markTourPending } from '@/lib/tour';
import { validateInput } from '@/lib/plan/rules';
import type { PlanInput } from '@/lib/plan/types';
import { errorKey, supabase, uploadImage } from '@/lib/supabase';
import type { Gender, Goal, Level } from '@/lib/types';
import { Logo } from '@/brand/Brand';
import { colors, radius, space } from '@/theme';

const TOTAL = 6;

export default function Onboarding() {
  const { t } = useTranslation();
  const { userId, profile, health, refreshProfile, refreshPlan } = useUser();

  // أول سؤال: نوع الحساب. المتدرب يكمل الأسئلة، والشريك تنفتح له لوحة الشريك وطلب الانضمام
  const [acct, setAcct] = useState<AccountType | null>(null);
  const [chosen, setChosen] = useState<AccountType>('trainee');
  const [step, setStep] = useState(0);
  const [gender, setGender] = useState<Gender>(health?.gender ?? 'male');
  const [birthYear, setBirthYear] = useState(health?.birth_year ? String(health.birth_year) : '');
  const [height, setHeight] = useState(health?.height_cm ? String(health.height_cm) : '');
  const [weight, setWeight] = useState(health?.weight_kg ? String(health.weight_kg) : '');
  const [goal, setGoal] = useState<Goal>(health?.goal ?? 'fit');
  const [level, setLevel] = useState<Level>(health?.level ?? 'beginner');
  const [days, setDays] = useState(health?.days_per_week ?? 3);
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [gymId, setGymId] = useState<string | null>(profile?.gym_id ?? null);
  const [busy, setBusy] = useState(false);

  const input = (): PlanInput => ({
    gender,
    age: new Date().getFullYear() - Number(birthYear),
    height_cm: Number(height),
    weight_kg: Number(weight),
    goal,
    level,
    days_per_week: days,
  });

  const next = () => {
    if (step === 0 && !(Number(birthYear) > 1920 && Number(birthYear) <= new Date().getFullYear() - 13)) {
      return Alert.alert(t('errors.invalidNumber'));
    }
    if (step === 1 && validateInput({ ...input(), age: 30 })) return Alert.alert(t('errors.invalidNumber'));
    if (step < TOTAL - 1) setStep(step + 1);
    else finish();
  };

  const choosePhoto = async (src: 'camera' | 'library') => {
    const img = await pickImage(src, [3, 4]);
    if (img) setPhoto(img);
  };

  const finish = async () => {
    setBusy(true);
    try {
      const i = input();
      const { error: hErr } = await supabase.from('health_profiles').upsert({
        user_id: userId, gender, birth_year: Number(birthYear), height_cm: i.height_cm, weight_kg: i.weight_kg,
        goal, level, days_per_week: days, updated_at: new Date().toISOString(),
      });
      if (hErr) throw hErr;

      let photoPath: string | null = null;
      if (photo) photoPath = await uploadImage('body', userId, photo.uri, photo.mimeType);
      await supabase.from('body_logs').insert({ user_id: userId, weight_kg: i.weight_kg, photo_path: photoPath });

      // خطة بالذكاء الاصطناعي (تجهز خلال ثواني والدالة تحفظها)، ولو ما زبطت خطة قياسية على طول
      const generated = await createPlanWithFallback(userId, i, { photoPath });
      if (generated.source === 'rules') console.log('AI fallback:', generated.aiError);

      const { error: pErr } = await supabase.from('profiles').update({ gym_id: gymId, onboarded: true }).eq('id', userId);
      if (pErr) throw pErr;
      // أول ما يدخل التطبيق تطلع له جولة التعريف
      await markTourPending(userId);
      await refreshPlan();
      await refreshProfile(); // يغيّر الحارس وينقل المستخدم للتبويبات
    } catch (e) {
      Alert.alert(t(errorKey(e)));
      setBusy(false);
    }
  };

  const choose = async () => {
    if (chosen === 'trainee') { setAcct('trainee'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({ account_type: chosen, onboarded: true }).eq('id', userId);
      if (error) throw error;
      await markTourPending(userId); // جولة الشركاء أول ما يدخل
      await refreshProfile(); // الحارس ينقله للرئيسية، ولوحة الشريك تطلب منه يكمل طلب الانضمام
    } catch (e) {
      Alert.alert(t(errorKey(e)));
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl }}>
        <Logo variant="mark" height={64} color={colors.primary} />
        <ActivityIndicator color={colors.text} />
        <T size="lg" bold center>{t(acct === null ? 'partners.preparing' : 'onboarding.generating')}</T>
      </View>
    );
  }

  if (acct === null) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: space.sm, marginTop: space.lg }}>
          <Logo variant="mark" height={44} color={colors.primary} />
          <H>{t('partners.whoAreYou')}</H>
          <T muted center>{t('partners.whoAreYouSub')}</T>
        </View>
        {ACCOUNT_TYPES.map((a) => (
          <OptionCard key={a} title={t(`partners.acct_${a}`)} subtitle={t(`partners.acctSub_${a}`)} icon={ACCOUNT_ICON[a] as never}
            selected={chosen === a} onPress={() => setChosen(a)} />
        ))}
        {chosen !== 'trainee' ? <T size="xs" muted center style={{ lineHeight: 19 }}>{t('partners.partnerReviewNote')}</T> : null}
        <Button title={t('common.next')} onPress={choose} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <T size="sm" muted>{t('onboarding.stepOf', { n: step + 1, total: TOTAL })}</T>
        <View style={{ height: 6, backgroundColor: colors.card, borderRadius: 3 }}>
          <View style={{ height: 6, width: `${((step + 1) / TOTAL) * 100}%`, backgroundColor: colors.primary, borderRadius: 3 }} />
        </View>

        {step === 0 && (
          <>
            <H>{t('onboarding.aboutYou')}</H>
            <T muted>{t('onboarding.gender')}</T>
            <Segmented value={gender} onChange={setGender}
              options={[{ value: 'male', label: t('onboarding.male') }, { value: 'female', label: t('onboarding.female') }]} />
            <Input label={t('onboarding.birthYear')} value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" maxLength={4} placeholder="1998" />
          </>
        )}

        {step === 1 && (
          <>
            <H>{t('onboarding.body')}</H>
            <Input label={t('onboarding.height')} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="175" />
            <Input label={t('onboarding.weight')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="80" />
          </>
        )}

        {step === 2 && (
          <>
            <H>{t('onboarding.goal')}</H>
            {([['lose', 'flame-outline'], ['gain', 'barbell-outline'], ['maintain', 'scale-outline'], ['fit', 'body-outline']] as const).map(([g, icon]) => (
              <OptionCard key={g} title={t(`onboarding.goal_${g}`)} icon={icon} selected={goal === g} onPress={() => setGoal(g)} />
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <H>{t('onboarding.level')}</H>
            <Segmented value={level} onChange={setLevel}
              options={(['beginner', 'intermediate', 'advanced'] as const).map((l) => ({ value: l, label: t(`onboarding.level_${l}`) }))} />
            <T muted>{t('onboarding.daysPerWeek')}</T>
            <Segmented value={days} onChange={setDays} options={[2, 3, 4, 5, 6].map((d) => ({ value: d, label: String(d) }))} />
          </>
        )}

        {step === 4 && (
          <>
            <H>{t('onboarding.photo')} <T muted size="sm">({t('common.optional')})</T></H>
            <T muted>{t('onboarding.photoWhy')}</T>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg }} contentFit="cover" />
            ) : null}
            <Row>
              <Button style={{ flex: 1 }} title={t('onboarding.takePhoto')} icon="camera-outline" variant="secondary" onPress={() => choosePhoto('camera')} />
              <Button style={{ flex: 1 }} title={t('onboarding.pickPhoto')} icon="images-outline" variant="secondary" onPress={() => choosePhoto('library')} />
            </Row>
          </>
        )}

        {step === 5 && (
          <>
            <H>{t('onboarding.gym')}</H>
            <GymPicker userId={userId} value={gymId} onChange={(g) => setGymId(g.id)} />
          </>
        )}

        <Row style={{ marginTop: space.lg }}>
          <Button style={{ flex: 1 }} title={t('common.back')} variant="ghost" onPress={() => (step > 0 ? setStep(step - 1) : setAcct(null))} />
          <Button
            style={{ flex: 2 }}
            title={step === TOTAL - 1 ? t('onboarding.finish') : step === 4 && !photo ? t('onboarding.skipPhoto') : t('common.next')}
            onPress={next}
          />
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}
