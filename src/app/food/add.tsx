// إضافة أكل: ابحث في قاعدة الأطعمة أو سجّل أكل مخصص — تنحسب السعرات والبروتين والكربوهيدرات والدهون
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, I18nManager, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Input, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import {
  FOOD_CATEGORIES, FOODS, getFood, kcalFromMacros, logFood, logFromDb, recentFoodIds, scaleFood, searchFoods,
  servingsFromGrams, slotForHour, type Food, type FoodCategory, type MealSlot,
} from '@/lib/nutrition';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const num0 = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : 0; };

export default function AddFood() {
  const { t } = useTranslation();
  const { L, num } = useLocalized();
  const { userId } = useUser();
  const [slot, setSlot] = useState<MealSlot>(slotForHour(new Date().getHours()));
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<FoodCategory | 'all'>('all');
  const [recent, setRecent] = useState<Food[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [servings, setServings] = useState(1);
  const [grams, setGrams] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<{ n: number; kcal: number }>({ n: 0, kcal: 0 });
  const [custom, setCustom] = useState(false);
  const [c, setC] = useState({ name: '', kcal: '', p: '', carbs: '', f: '' });

  useEffect(() => {
    recentFoodIds(userId).then((ids) => setRecent(ids.map(getFood).filter((f): f is Food => !!f))).catch(() => {});
  }, [userId]);

  const list = useMemo(() => {
    const base = cat === 'all' ? FOODS : FOODS.filter((f) => f.cat === cat);
    return searchFoods(q, base);
  }, [q, cat]);

  const pick = (f: Food) => {
    setOpen(open === f.id ? null : f.id);
    setServings(1);
    setGrams('');
  };

  const done = (kcal: number) => {
    setAdded((a) => ({ n: a.n + 1, kcal: a.kcal + kcal }));
    setOpen(null);
  };

  const addDb = async (f: Food) => {
    const s = grams ? servingsFromGrams(f, num0(grams)) : servings;
    if (s <= 0) return Alert.alert(t('errors.required'));
    setBusy(true);
    try {
      await logFromDb(userId, f, s, slot, L(f.name));
      done(scaleFood(f, s).kcal);
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  const addCustom = async () => {
    const p = num0(c.p), carbs = num0(c.carbs), fat = num0(c.f);
    const kcal = num0(c.kcal) || kcalFromMacros(p, carbs, fat);
    if (!c.name.trim() || kcal <= 0) return Alert.alert(t('food.customNeed'));
    setBusy(true);
    try {
      await logFood(userId, { slot, name: c.name.trim(), source: 'custom', kcal, protein_g: p, carbs_g: carbs, fat_g: fat });
      done(Math.round(kcal));
      setC({ name: '', kcal: '', p: '', carbs: '', f: '' });
      setCustom(false);
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  const row = (f: Food) => {
    const isOpen = open === f.id;
    const s = grams ? servingsFromGrams(f, num0(grams)) : servings;
    const m = scaleFood(f, s);
    return (
      <Card key={f.id} style={{ gap: space.sm, borderColor: isOpen ? colors.primary : colors.border }} onPress={() => pick(f)}>
        <Row>
          <View style={{ flex: 1 }}>
            <T semibold>{L(f.name)}</T>
            <T size="xs" muted>{L(f.serving)} · {num(f.grams)} {t('common.g')}</T>
          </View>
          <T bold style={{ color: colors.primary }}>{num(f.kcal)}</T>
          <T size="xs" muted>{t('common.kcal')}</T>
        </Row>
        {isOpen ? (
          <View style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={space.sm}>
                <Pressable onPress={() => { setGrams(''); setServings((v) => Math.max(0.5, v - 0.5)); }} hitSlop={8} style={stepBtn}>
                  <Ionicons name="remove" size={18} color={colors.text} />
                </Pressable>
                <T bold>{num(grams ? s : servings)}</T>
                <Pressable onPress={() => { setGrams(''); setServings((v) => Math.min(20, v + 0.5)); }} hitSlop={8} style={stepBtn}>
                  <Ionicons name="add" size={18} color={colors.text} />
                </Pressable>
                <T size="xs" muted>{t('food.servings')}</T>
              </Row>
              <View style={{ width: 110 }}>
                <Input value={grams} onChangeText={setGrams} keyboardType="decimal-pad" placeholder={t('food.grams')} style={{ paddingVertical: 6 }} />
              </View>
            </Row>
            <T size="sm" muted>
              {num(m.kcal)} {t('common.kcal')} · {t('plan.protein')} {num(m.protein_g)} · {t('plan.carbs')} {num(m.carbs_g)} · {t('plan.fat')} {num(m.fat_g)} {t('common.g')}
            </T>
            <Button title={`${t('food.addTo')} ${t(`plan.slot_${slot}`)}`} icon="checkmark" onPress={() => addDb(f)} loading={busy} />
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('food.addFood') }} />
      <Screen edges={['bottom']}>
        <Pressable onPress={() => router.push('/food/photo')} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <Row style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.md }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera" size={20} color={brand.cream} />
            </View>
            <View style={{ flex: 1 }}>
              <T semibold color={brand.cream}>{t('meal.snap')}</T>
              <T size="xs" color={brand.sand}>{t('meal.snapHint')}</T>
            </View>
            <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={brand.cream} />
          </Row>
        </Pressable>
        <Segmented value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ value: s, label: t(`plan.slot_${s}`) }))} />

        {added.n ? (
          <Row style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.success, padding: space.md }}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <T size="sm" style={{ flex: 1 }}>{t('food.addedCount', { n: num(added.n), kcal: num(added.kcal) })}</T>
          </Row>
        ) : null}

        <Input value={q} onChangeText={setQ} placeholder={t('food.search')} autoCorrect={false} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {(['all', ...FOOD_CATEGORIES] as const).map((k) => (
            <Pressable key={k} onPress={() => setCat(k)} style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1,
              borderColor: cat === k ? colors.primary : colors.border, backgroundColor: cat === k ? colors.primary : colors.card,
            }}>
              <T size="sm" color={cat === k ? colors.onPrimary : colors.text}>{t(`food.cat_${k}`)}</T>
            </Pressable>
          ))}
        </ScrollView>

        {custom ? (
          <Card style={{ gap: space.sm }}>
            <T bold>{t('food.custom')}</T>
            <Input label={t('food.customName')} value={c.name} onChangeText={(v) => setC({ ...c, name: v })} />
            <Row gap={space.sm}>
              <View style={{ flex: 1 }}><Input label={t('common.kcal')} value={c.kcal} onChangeText={(v) => setC({ ...c, kcal: v })} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Input label={`${t('plan.protein')} (${t('common.g')})`} value={c.p} onChangeText={(v) => setC({ ...c, p: v })} keyboardType="decimal-pad" /></View>
            </Row>
            <Row gap={space.sm}>
              <View style={{ flex: 1 }}><Input label={`${t('plan.carbs')} (${t('common.g')})`} value={c.carbs} onChangeText={(v) => setC({ ...c, carbs: v })} keyboardType="decimal-pad" /></View>
              <View style={{ flex: 1 }}><Input label={`${t('plan.fat')} (${t('common.g')})`} value={c.f} onChangeText={(v) => setC({ ...c, f: v })} keyboardType="decimal-pad" /></View>
            </Row>
            <T size="xs" muted>{t('food.customHint')}</T>
            <Row gap={space.sm}>
              <Button style={{ flex: 1 }} title={t('common.cancel')} variant="ghost" onPress={() => setCustom(false)} />
              <Button style={{ flex: 1 }} title={t('food.addTo') + ' ' + t(`plan.slot_${slot}`)} onPress={addCustom} loading={busy} />
            </Row>
          </Card>
        ) : (
          <Button title={t('food.custom')} icon="create-outline" variant="secondary" small onPress={() => setCustom(true)} />
        )}

        {!q && cat === 'all' && recent.length ? (
          <View style={{ gap: space.sm }}>
            <T size="sm" bold muted>{t('food.recent')}</T>
            {recent.map(row)}
            <T size="sm" bold muted>{t('food.allFoods')}</T>
          </View>
        ) : null}
        {list.length ? list.map(row) : <T muted center>{t('food.noResults')}</T>}
        <T size="xs" muted center>{t('food.approx')}</T>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const stepBtn = { width: 32, height: 32, borderRadius: 16, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.cardAlt };
