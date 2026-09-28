// قائمة اختيار تمرين من كل المكتبة (تمارين أرك 3D + المكتبة الموسّعة بالصور): بحث بالعربي/الإنجليزي وفلتر العضلة
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExerciseThumb } from '@/components/exercise/ExercisePhotos';
import { NT } from '@/components/pulse/widgets';
import { useLocalized } from '@/lib/i18n';
import { GROUP_OF, MUSCLE_GROUPS, type MuscleGroup } from '@/lib/training';
import { ALL_EXERCISES, exerciseMuscles, MUSCLE_NAMES, normSearch } from '@/three/catalog';
import { brand, fonts, night, space } from '@/theme';

export function ExercisePicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<MuscleGroup | null>(null);

  const rows = useMemo(() => ALL_EXERCISES.map((e) => {
    const m = exerciseMuscles(e).primary;
    return {
      e, groups: new Set(m.map((x) => GROUP_OF[x])),
      hay: normSearch([e.name.ar, e.name.en, ...(e.aliases ?? [])].join(' ')),
      muscles: m.slice(0, 2).map((x) => MUSCLE_NAMES[x][lng]).join(lng === 'ar' ? '، ' : ', '),
    };
  }), [lng]);
  const list = useMemo(() => {
    const words = normSearch(q).split(' ').filter(Boolean);
    return rows.filter((r) => (!group || r.groups.has(group)) && words.every((w) => r.hay.includes(w)));
  }, [rows, q, group]);

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <SafeAreaView edges={['bottom']} style={{ height: '80%', backgroundColor: night.bg2, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.sm, paddingHorizontal: space.lg }}>
          <TextInput value={q} onChangeText={setQ} placeholder={t('library.search')} placeholderTextColor={night.faint} autoCorrect={false}
            style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: night.card, color: night.text, paddingHorizontal: 14, textAlign: 'auto', fontFamily: fonts.regular }} />
          <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={24} color={night.text} /></Pressable>
        </View>
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 6, paddingHorizontal: space.lg, paddingBottom: space.sm }}>
            {([null, ...MUSCLE_GROUPS] as (MuscleGroup | null)[]).map((g) => {
              const on = group === g;
              return (
                <Pressable key={g ?? 'all'} onPress={() => setGroup(g)}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? brand.orange : night.card }}>
                  <NT size={13} style={{ color: on ? brand.cream : night.text }}>{g ? t(`workout.mg_${g}`) : t('library.allMuscles')}</NT>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <FlatList
          data={list}
          keyExtractor={(r) => r.e.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={12}
          windowSize={7}
          contentContainerStyle={{ paddingHorizontal: space.lg }}
          ListEmptyComponent={<NT faint style={{ textAlign: 'center', padding: space.lg }}>{t('library.none')}</NT>}
          renderItem={({ item: r }) => (
            <Pressable onPress={() => onPick(r.e.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: night.line }}>
              <ExerciseThumb photo={r.e.photos?.[0]} size={40} has3d={!r.e.library} />
              <View style={{ flex: 1, gap: 2 }}>
                <NT numberOfLines={1}>{r.e.name[lng]}</NT>
                <NT size={11} faint numberOfLines={1}>{r.muscles}</NT>
              </View>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </View>
  );
}
