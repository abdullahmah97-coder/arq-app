// قائمة اختيار تمرين من مكتبة التمارين ثلاثية الأبعاد (بحث بالعربي/الإنجليزي)
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NT } from '@/components/pulse/widgets';
import { useLocalized } from '@/lib/i18n';
import { EXERCISES, exerciseMuscles, MUSCLE_NAMES } from '@/three/catalog';
import { fonts, night, space } from '@/theme';

export function ExercisePicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const [q, setQ] = useState('');
  const list = EXERCISES.filter((e) => !q || L(e.name).toLowerCase().includes(q.toLowerCase()) || e.name.en.toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <SafeAreaView edges={['bottom']} style={{ maxHeight: '75%', backgroundColor: night.bg2, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.sm }}>
          <TextInput value={q} onChangeText={setQ} placeholder={t('workout.search')} placeholderTextColor={night.faint}
            style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: night.card, color: night.text, paddingHorizontal: 14, textAlign: 'auto', fontFamily: fonts.regular }} />
          <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={24} color={night.text} /></Pressable>
        </View>
        <ScrollView>
          {list.map((e) => (
            <Pressable key={e.id} onPress={() => onPick(e.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: night.line }}>
              <NT style={{ flex: 1 }} numberOfLines={1}>{L(e.name)}</NT>
              <NT size={11} faint>{exerciseMuscles(e).primary.map((m) => L(MUSCLE_NAMES[m])).join('، ')}</NT>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
