// بطاقة «سعرات اليوم»: كم أكلت مقابل هدفك، والماكروز، وقائمة اللي سجلته
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Button, Card, Row, T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { progress, totals, type FoodEntry, type MealSlot } from '@/lib/nutrition';
import { colors, radius, space } from '@/theme';

export interface CalorieTargets { calories: number; protein_g: number; carbs_g: number; fat_g: number }

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

function Bar({ value, color }: { value: number | null; color: string }) {
  const v = value == null ? 0 : Math.min(value, 1);
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
      <View style={{ width: `${v * 100}%`, height: '100%', borderRadius: 4, backgroundColor: value != null && value > 1.05 ? colors.danger : color }} />
    </View>
  );
}

function MacroBar({ label, eaten, target, color }: { label: string; eaten: number; target?: number; color: string }) {
  const { t } = useTranslation();
  const { num } = useLocalized();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <T size="xs" muted>{label}</T>
      <Bar value={progress(eaten, target)} color={color} />
      <T size="xs" semibold>{num(Math.round(eaten))}{target ? ` / ${num(target)}` : ''} {t('common.g')}</T>
    </View>
  );
}

export function CalorieCard({ entries, targets, onDelete }: {
  entries: FoodEntry[]; targets: CalorieTargets | null; onDelete: (e: FoodEntry) => void;
}) {
  const { t } = useTranslation();
  const { num } = useLocalized();
  const sum = totals(entries);
  const goal = targets?.calories ?? null;
  const left = goal != null ? goal - sum.kcal : null;

  const confirmDelete = (e: FoodEntry) =>
    Alert.alert(t('food.deleteTitle'), e.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => onDelete(e) },
    ]);

  return (
    <Card style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ gap: 2 }}>
          <T bold>{t('food.today')}</T>
          <Row gap={6} style={{ alignItems: 'baseline' }}>
            <T size="xxl" bold style={{ color: colors.primary }}>{num(sum.kcal)}</T>
            <T size="sm" muted>{goal != null ? `/ ${num(goal)} ${t('common.kcal')}` : t('common.kcal')}</T>
          </Row>
        </View>
        {left != null ? (
          <View style={{ alignItems: 'flex-end' }}>
            <T size="xs" muted>{left >= 0 ? t('food.remaining') : t('food.over')}</T>
            <T bold style={{ color: left >= 0 ? colors.text : colors.danger }}>{num(Math.abs(left))}</T>
          </View>
        ) : null}
      </Row>
      <Bar value={progress(sum.kcal, goal)} color={colors.primary} />
      <Row gap={space.md}>
        <MacroBar label={t('plan.protein')} eaten={sum.protein_g} target={targets?.protein_g} color={colors.text} />
        <MacroBar label={t('plan.carbs')} eaten={sum.carbs_g} target={targets?.carbs_g} color={colors.accent} />
        <MacroBar label={t('plan.fat')} eaten={sum.fat_g} target={targets?.fat_g} color={colors.muted} />
      </Row>

      {entries.length ? (
        <View style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md }}>
          {SLOTS.map((s) => {
            const rows = entries.filter((e) => e.slot === s);
            if (!rows.length) return null;
            return (
              <View key={s} style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T size="xs" bold style={{ color: colors.primary }}>{t(`plan.slot_${s}`)}</T>
                  <T size="xs" muted>{num(totals(rows).kcal)} {t('common.kcal')}</T>
                </Row>
                {rows.map((e) => (
                  <Pressable key={e.id} onLongPress={() => confirmDelete(e)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 }}>
                    <T size="sm" style={{ flex: 1 }} numberOfLines={1}>
                      {e.name}{e.servings !== 1 ? ` ×${num(e.servings)}` : ''}
                    </T>
                    <T size="sm" muted>{num(e.kcal)}</T>
                    <Pressable onPress={() => confirmDelete(e)} hitSlop={10} accessibilityLabel={t('common.delete')}>
                      <Ionicons name="close-circle-outline" size={18} color={colors.muted} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            );
          })}
        </View>
      ) : (
        <T size="sm" muted>{t('food.empty')}</T>
      )}

      <Row gap={space.sm}>
        <Button style={{ flex: 1 }} title={t('meal.snap')} icon="camera" onPress={() => router.push({ pathname: '/food/photo', params: { auto: 'camera' } })} />
        <Button style={{ flex: 1 }} title={t('food.add')} icon="add-circle-outline" variant="secondary" onPress={() => router.push('/food/add')} />
      </Row>
      <T size="xs" muted center>{t('food.approx')}</T>
    </Card>
  );
}

/** حصة من الخطة على شكل «✓ أكلتها» */
export function AteButton({ logged, onPress }: { logged: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} disabled={logged} hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1,
        borderColor: logged ? colors.success : colors.primary, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: logged ? colors.card : 'transparent' }}>
      <Ionicons name={logged ? 'checkmark-circle' : 'add-circle-outline'} size={15} color={logged ? colors.success : colors.primary} />
      <T size="xs" semibold color={logged ? colors.success : colors.primary}>{logged ? t('food.logged') : t('food.ate')}</T>
    </Pressable>
  );
}
