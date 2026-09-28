// مكتبة التمارين: كل التمارين (أرك 3D + المكتبة الموسّعة بالصور) مع بحث وفلاتر العضلة والأداة والنوع
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, I18nManager, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExerciseThumb } from '@/components/exercise/ExercisePhotos';
import { T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { GROUP_OF, MUSCLE_GROUPS, type MuscleGroup } from '@/lib/training';
import { ALL_EXERCISES, categoryOf, equipOf, exerciseMuscles, MUSCLE_NAMES, normSearch, type ExerciseGuide } from '@/three/catalog';
import { LIB_CATEGORIES, LIB_EQUIPMENT, type LibCategory, type LibEquipment } from '@/three/fedb';
import { brand, colors, fonts, space } from '@/theme';

interface Row { e: ExerciseGuide; hay: string; groups: Set<MuscleGroup>; equip: LibEquipment; cat: LibCategory; muscles: string }

export default function ExerciseLibrary() {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [equip, setEquip] = useState<LibEquipment | null>(null);
  const [cat, setCat] = useState<LibCategory | null>(null);

  // تمارين أرك (3D) أولاً ثم المكتبة مرتبة أبجدياً بلغة المستخدم
  const rows = useMemo<Row[]>(() => {
    const own = ALL_EXERCISES.filter((e) => !e.source);
    const lib = ALL_EXERCISES.filter((e) => e.source).sort((a, b) => a.name[lng].localeCompare(b.name[lng], lng));
    return [...own, ...lib].map((e) => {
      const m = exerciseMuscles(e);
      return {
        e, equip: equipOf(e), cat: categoryOf(e),
        hay: normSearch([e.name.ar, e.name.en, ...(e.aliases ?? [])].join(' ')),
        groups: new Set(m.primary.map((x) => GROUP_OF[x])),
        muscles: m.primary.slice(0, 3).map((x) => MUSCLE_NAMES[x][lng]).join(lng === 'ar' ? '، ' : ', '),
      };
    });
  }, [lng]);

  const list = useMemo(() => {
    const words = normSearch(q).split(' ').filter(Boolean);
    return rows.filter((r) => (!group || r.groups.has(group)) && (!equip || r.equip === equip) && (!cat || r.cat === cat)
      && words.every((w) => r.hay.includes(w)));
  }, [rows, q, group, equip, cat]);

  const filtered = !!(q || group || equip || cat);
  const clear = () => { setQ(''); setGroup(null); setEquip(null); setCat(null); };

  const header = (
    <View style={{ gap: space.sm, paddingBottom: space.sm }}>
      <Chips value={group} onChange={setGroup} all={t('library.allMuscles')}
        options={MUSCLE_GROUPS.map((g) => ({ value: g, label: t(`workout.mg_${g}`) }))} />
      <Chips value={equip} onChange={setEquip} all={t('library.allEquipment')}
        options={LIB_EQUIPMENT.map((k) => ({ value: k, label: t(`library.eq_${k}`) }))} />
      <Chips value={cat} onChange={setCat} all={t('library.allTypes')}
        options={LIB_CATEGORIES.map((k) => ({ value: k, label: t(`library.cat_${k}`) }))} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg }}>
        <T size="sm" muted>{t('library.count', { count: list.length })}</T>
        {filtered ? (
          <Pressable onPress={clear} hitSlop={8}><T size="sm" semibold color={colors.primary}>{t('library.clear')}</T></Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: colors.card,
          borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 }}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder={t('library.search')} placeholderTextColor={colors.muted}
            returnKeyType="search" autoCorrect={false}
            style={{ flex: 1, color: colors.text, fontFamily: fonts.regular, textAlign: I18nManager.isRTL ? 'right' : 'left' }} />
          {q ? <Pressable onPress={() => setQ('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable> : null}
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(r) => r.e.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={9}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: space.xl * 2 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', gap: space.sm, padding: space.xl }}>
            <Ionicons name="search-outline" size={28} color={colors.muted} />
            <T muted center>{t('library.none')}</T>
          </View>
        }
        ListFooterComponent={list.length ? <T size="xs" muted center style={{ padding: space.lg }}>{t('library.credit')}</T> : null}
        renderItem={({ item: r }) => (
          <Pressable onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: r.e.id } })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 10,
              borderBottomWidth: 1, borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
            <ExerciseThumb photo={r.e.photos?.[0]} has3d={!r.e.library} />
            <View style={{ flex: 1, gap: 2 }}>
              <T semibold numberOfLines={2}>{L(r.e.name)}</T>
              <T size="xs" muted numberOfLines={1}>
                {[r.muscles, t(`library.eq_${r.equip}`), r.e.level ? t(`library.lvl_${r.e.level}`) : null].filter(Boolean).join(' · ')}
              </T>
            </View>
            <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.muted} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function Chips<V extends string>({ value, onChange, options, all }: {
  value: V | null; onChange: (v: V | null) => void; options: { value: V; label: string }[]; all: string;
}) {
  const items: { value: V | null; label: string }[] = [{ value: null, label: all }, ...options];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: space.lg }}>
      {items.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={o.value ?? 'all'} onPress={() => onChange(on && o.value !== null ? null : o.value)}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
              backgroundColor: on ? brand.deepGreen : colors.card, borderColor: on ? brand.deepGreen : colors.border }}>
            <T size="sm" semibold color={on ? brand.cream : colors.text}>{o.label}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
