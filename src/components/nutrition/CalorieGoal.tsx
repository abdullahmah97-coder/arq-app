// زر ✎ جنب هدف السعرات: تعدّل هدفك اليومي أو ترجع لهدف خطتك
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { Button, Input, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { KCAL_GOAL_MAX, KCAL_GOAL_MIN, parseKcal } from '@/lib/nutrition/goal';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, withAlpha } from '@/theme';

const STEPS = [-250, -100, 100, 250];

/** زر واضح: دائرة بلون التطبيق وقلم بنفس اللون (على الكرت الداكن كهرماني مثل زر الإطالة) */
export function EditGoalButton({ goal, planCalories, custom, color }: {
  goal: number | null; planCalories: number | null; custom: boolean; color?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const c = color ?? colors.primary;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('food.editGoal')}
        style={({ pressed }) => ({
          width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
          backgroundColor: withAlpha(c, 0.16), borderWidth: 1, borderColor: withAlpha(c, 0.5), opacity: pressed ? 0.6 : 1,
        })}>
        <Ionicons name="pencil" size={16} color={c} />
      </Pressable>
      {open ? <GoalModal goal={goal} planCalories={planCalories} custom={custom} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function GoalModal({ goal, planCalories, custom, onClose }: { goal: number | null; planCalories: number | null; custom: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { num } = useLocalized();
  const { userId, refreshProfile } = useUser();
  const [value, setValue] = useState(goal ? String(goal) : planCalories ? String(planCalories) : '2000');
  const [busy, setBusy] = useState(false);

  const save = async (kcal: number | null) => {
    if (kcal != null && (kcal < KCAL_GOAL_MIN || kcal > KCAL_GOAL_MAX)) {
      return Alert.alert(t('food.goalRange', { min: num(KCAL_GOAL_MIN), max: num(KCAL_GOAL_MAX) }));
    }
    setBusy(true);
    try {
      // الهدف خاص: ينحفظ في health_profiles. لو القاعدة قبل الترحيل (ما فيها العمود) نحفظه بالمكان القديم
      let { error } = await supabase.from('health_profiles').upsert({ user_id: userId, kcal_goal: kcal }, { onConflict: 'user_id' });
      if (error && (error.code === 'PGRST204' || error.code === '42703')) {
        ({ error } = await supabase.from('profiles').update({ kcal_goal: kcal }).eq('id', userId));
      }
      if (error) throw error;
      await refreshProfile();
      onClose();
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const n = parseKcal(value);
  const bump = (d: number) => setValue(String(Math.min(KCAL_GOAL_MAX, Math.max(KCAL_GOAL_MIN, (n ?? planCalories ?? 2000) + d))));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: space.lg }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.bg, borderRadius: radius.lg, padding: space.lg, gap: space.md }}>
            <T bold size="lg">{t('food.goalTitle')}</T>
            <T size="sm" muted style={{ lineHeight: 21 }}>
              {planCalories ? t('food.goalPlanHint', { n: num(planCalories) }) : t('food.goalNoPlanHint')}
            </T>
            <Input value={value} onChangeText={(v) => setValue(v.replace(/[^\d٠-٩]/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4}
              accessibilityLabel={t('food.goalTitle')} style={{ textAlign: 'center', fontSize: 26, writingDirection: 'ltr' }} />
            <Row gap={space.sm} style={{ justifyContent: 'center' }}>
              {STEPS.map((d) => (
                <Pressable key={d} onPress={() => bump(d)} accessibilityRole="button"
                  style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.cardAlt, opacity: pressed ? 0.7 : 1 })}>
                  <T size="sm" semibold style={{ writingDirection: 'ltr' }}>{d > 0 ? `+${d}` : `−${Math.abs(d)}`}</T>
                </Pressable>
              ))}
            </Row>
            <T size="xs" muted style={{ lineHeight: 19 }}>{t('food.goalMacrosNote')}</T>
            <Button title={t('common.save')} icon="checkmark" loading={busy} onPress={() => void save(n)} disabled={n == null} />
            {custom && planCalories ? (
              <Button title={t('food.goalReset', { n: num(planCalories) })} icon="refresh" variant="ghost" disabled={busy} onPress={() => void save(null)} />
            ) : null}
            <View />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
