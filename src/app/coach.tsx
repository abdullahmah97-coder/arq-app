// مدرب ARQ الذكي: اطلب تمرين أو شرح أو وجبة أو افتح أي صفحة — بالعربي أو الإنجليزي
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo, SaduPattern } from '@/brand/Brand';
import { goBackOrHome } from '@/components/HeaderBack';
import { NT, Num } from '@/components/pulse/widgets';
import { useUser } from '@/lib/auth';
import { askCoach, starterChips, type CoachContext, type CoachMessage, type CoachReply, type CoachRoute, type CoachWorkout } from '@/lib/coach';
import { todayIndex } from '@/lib/dates';
import { useHealth } from '@/lib/health';
import { useLocalized } from '@/lib/i18n';
import type { PlanExercise } from '@/lib/plan/types';
import { supabase } from '@/lib/supabase';
import { startWorkout } from '@/lib/training';
import { getExercise } from '@/three/catalog';
import { brand, fonts, night, space } from '@/theme';
import { openHref } from '@/lib/nav';

const KEY = 'arq.coach.history';
const ROUTE_PATH: Record<CoachRoute, string> = {
  health: '/health', inbody: '/inbody', plan: '/(tabs)/plan', compete: '/(tabs)/compete', devices: '/devices',
  progress: '/progress', friends: '/friends', challenge_new: '/challenge/new', learn: '/learn/body-composition', programs: '/programs',
};

/** نص بسيط يدعم **عريض** وأسطر جديدة */
function Rich({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <NT size={15} color={color} style={{ lineHeight: 25 }}>
      {parts.map((p, i) => (p.startsWith('**') ? <NT key={i} size={15} bold color={color}>{p.slice(2, -2)}</NT> : p))}
    </NT>
  );
}

export default function Coach() {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const { userId, health, plan, refreshPlan } = useUser();
  const h = useHealth();
  const [msgs, setMsgs] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v) try { setMsgs(JSON.parse(v)); } catch {} }).catch(() => {});
  }, []);
  useEffect(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))).catch(() => {});
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
  }, [msgs]);

  const ctx = useMemo<CoachContext>(() => {
    const day = plan?.data.days.find((d) => d.day === todayIndex());
    return {
      lang: lng === 'en' ? 'en' : 'ar',
      gender: health?.gender ?? null, goal: health?.goal ?? null, level: health?.level ?? null, weight_kg: health?.weight_kg ?? null,
      recovery: h.scores?.recovery ?? null, zone: h.scores?.zone ?? null, strain: h.scores?.strain ?? null,
      sleep_min: h.today?.sleep?.asleep_min ?? null, steps: h.today?.steps ?? null,
      today: day ? { focus: L(day.focus), rest: day.rest, exercises: day.exercises.map((e) => ({ exercise_id: e.exercise_id, name: e.name.en, sets: e.sets, reps: e.reps })) } : null,
      protein_g: plan?.data.targets.protein_g ?? null, calories: plan?.data.targets.calories ?? null,
    };
  }, [health, plan, h.scores, h.today, lng, L]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const user: CoachMessage = { id: String(Date.now()), role: 'user', text: q, at: Date.now() };
    const history = [...msgs, user];
    setMsgs(history); setInput(''); setBusy(true);
    const reply = await askCoach(history, ctx);
    setBusy(false);
    setMsgs((m) => [...m, { id: user.id + 'r', role: 'coach', text: reply.text, reply, at: Date.now() }]);
  };

  const addToToday = async (w: CoachWorkout) => {
    if (!plan) return openHref('/(tabs)/plan');
    const data = structuredClone(plan.data);
    const idx = data.days.findIndex((d) => d.day === todayIndex());
    const exercises: PlanExercise[] = w.exercises.map((e) => {
      const g = getExercise(e.exercise_id)!;
      return { name: g.name, exercise_id: e.exercise_id, sets: e.sets, reps: e.reps, rest_sec: e.rest_sec };
    });
    const day = { day: todayIndex(), rest: false, focus: { ar: w.title, en: w.title }, exercises };
    if (idx >= 0) data.days[idx] = { ...data.days[idx], ...day }; else data.days.push(day);
    const { error } = await supabase.from('plans').update({ data }).eq('id', plan.id);
    if (error) return Alert.alert(t('errors.generic'));
    await refreshPlan();
    Alert.alert(t('coach.added'));
  };

  const open = (r: CoachReply['open']) => {
    if (!r) return;
    if (r.kind === 'exercise') router.push({ pathname: '/exercise/[id]', params: { id: r.id } });
    else openHref(ROUTE_PATH[r.route]);
  };

  const chips = msgs.length ? (msgs[msgs.length - 1].reply?.chips ?? []) : starterChips(ctx.lang);

  return (
    <View style={{ flex: 1, backgroundColor: night.bg }}>
      <StatusBar style={night.statusBar} />
      <LinearGradient colors={[night.bg2, night.bg]} style={StyleSheet.absoluteFill} end={{ x: 0, y: 0.45 }} />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        {/* مقبض السحب: اسحب لتحت للإغلاق */}
        <View style={styles.grabber} />
        {/* الترويسة */}
        <View style={styles.header}>
          <Pressable onPress={goBackOrHome} hitSlop={12} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={20} color={night.text} />
            <NT size={13} semibold>{t('common.close')}</NT>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles" size={16} color={brand.amber} />
              <NT size={17} bold>{t('coach.title')}</NT>
            </View>
            <NT size={11} faint>{t('coach.subtitle')}</NT>
          </View>
          <Pressable onPress={() => setMsgs([])} hitSlop={10} style={styles.iconBtn} accessibilityLabel={t('coach.clear')}>
            <Ionicons name="refresh" size={19} color={night.muted} />
          </Pressable>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            {msgs.length === 0 ? (
              <View style={styles.hello}>
                <View style={styles.orb}>
                  <SaduPattern variant="chevron" opacity={0.15} />
                  <View style={{ transform: [{ rotate: '-45deg' }] }}><Logo variant="mark" height={30} color={brand.cream} /></View>
                </View>
                <NT size={20} bold center>{t('coach.hello')}</NT>
                <NT muted center style={{ lineHeight: 23 }}>{t('coach.intro')}</NT>
              </View>
            ) : null}

            {msgs.map((m) => m.role === 'user' ? (
              <View key={m.id} style={[styles.bubble, styles.me]}>
                <NT size={15} color={brand.deepGreen}>{m.text}</NT>
              </View>
            ) : (
              <View key={m.id} style={{ gap: 8, alignSelf: 'stretch' }}>
                <View style={[styles.bubble, styles.bot]}>
                  <Rich text={m.text} color={night.text} />
                </View>
                {m.reply?.workout ? <WorkoutCard w={m.reply.workout} onAdd={() => addToToday(m.reply!.workout!)} hasPlan={!!plan}
                  onStart={() => startWorkout(userId, { title: m.reply!.workout!.title, source: 'coach', exercises: m.reply!.workout!.exercises }).catch(() => Alert.alert(t('errors.generic')))} /> : null}
                {m.reply?.open ? (
                  <Pressable onPress={() => open(m.reply!.open)} style={styles.openBtn}>
                    <Ionicons name={m.reply.open.kind === 'exercise' ? 'cube-outline' : 'arrow-forward-circle-outline'} size={18} color={brand.deepGreen} />
                    <NT size={13} semibold color={brand.deepGreen}>
                      {m.reply.open.kind === 'exercise'
                        ? `${t('exercise.watch3d')} · ${L(getExercise(m.reply.open.id)?.name ?? { ar: '', en: '' })}`
                        : t(`coach.route_${m.reply.open.route}`)}
                    </NT>
                  </Pressable>
                ) : null}
                {m.reply?.source === 'local' ? <NT size={10} faint>{t('coach.offline')}</NT> : null}
              </View>
            ))}
            {busy ? (
              <View style={[styles.bubble, styles.bot, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
                <ActivityIndicator size="small" color={brand.amber} />
                <NT size={13} muted>{t('coach.thinking')}</NT>
              </View>
            ) : null}
          </ScrollView>

          {chips.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: space.lg, paddingBottom: 8 }} style={{ flexGrow: 0 }}>
              {chips.map((c) => (
                <Pressable key={c} onPress={() => send(c)} style={styles.chip}>
                  <NT size={13} color={night.text}>{c}</NT>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.inputBar}>
            <TextInput
              value={input} onChangeText={setInput} placeholder={t('coach.placeholder')} placeholderTextColor={night.faint}
              style={[styles.input, { fontFamily: fonts.regular, color: night.text }]} multiline maxLength={600}
              onSubmitEditing={() => send(input)} blurOnSubmit returnKeyType="send"
            />
            <Pressable onPress={() => send(input)} disabled={!input.trim() || busy} style={[styles.send, { opacity: input.trim() && !busy ? 1 : 0.4 }]} accessibilityLabel={t('coach.send')}>
              <Ionicons name={lng === 'ar' ? 'arrow-back' : 'arrow-forward'} size={20} color={brand.cream} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function WorkoutCard({ w, onAdd, onStart, hasPlan }: { w: CoachWorkout; onAdd: () => void; onStart: () => void; hasPlan: boolean }) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  return (
    <View style={styles.workout}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <NT size={16} bold style={{ flex: 1 }}>{w.title}</NT>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
          <Num size={20} color={brand.amber}>{w.minutes}</Num>
          <NT size={11} faint style={{ marginBottom: 2 }}>{t('coach.min')}</NT>
        </View>
      </View>
      {w.exercises.map((e, i) => {
        const g = getExercise(e.exercise_id);
        if (!g) return null;
        return (
          <Pressable key={i} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: e.exercise_id } })} style={styles.exRow}>
            <View style={styles.exNum}><NT size={11} bold color={brand.amber}>{i + 1}</NT></View>
            <NT size={14} style={{ flex: 1 }} numberOfLines={1}>{L(g.name)}</NT>
            <Num size={14} color={night.muted}>{e.sets}×{e.reps}</Num>
            <Ionicons name="cube-outline" size={16} color={brand.amber} />
          </Pressable>
        );
      })}
      {w.note ? <NT size={12} muted style={{ lineHeight: 20 }}>💡 {w.note}</NT> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Pressable onPress={onStart} style={[styles.btn, { backgroundColor: brand.orange }]}>
          <Ionicons name="play" size={15} color={brand.cream} />
          <NT size={13} semibold color={brand.cream}>{t('coach.start')}</NT>
        </Pressable>
        <Pressable onPress={onAdd} style={[styles.btn, { backgroundColor: night.cardStrong }]}>
          <Ionicons name="calendar-outline" size={15} color={night.text} />
          <NT size={13} semibold>{hasPlan ? t('coach.addToday') : t('home.makePlan')}</NT>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: night.card },
  closeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: night.cardStrong, borderWidth: 1, borderColor: night.line },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: night.line, marginTop: 6 },
  hello: { alignItems: 'center', gap: space.md, paddingTop: space.xl, paddingHorizontal: space.lg },
  orb: { width: 84, height: 84, borderRadius: 22, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }], overflow: 'hidden', marginBottom: space.md },
  bubble: { maxWidth: '88%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  me: { alignSelf: 'flex-end', backgroundColor: brand.amber, borderBottomEndRadius: 4 },
  bot: { alignSelf: 'flex-start', backgroundColor: night.card, borderWidth: 1, borderColor: night.line, borderBottomStartRadius: 4 },
  workout: { backgroundColor: night.cardStrong, borderRadius: 18, padding: space.md, gap: 8, borderWidth: 1, borderColor: 'rgba(254,169,79,0.25)' },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  exNum: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: brand.amber, alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 10 },
  openBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: brand.amber, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(254,169,79,0.35)', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: night.card },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: night.line },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, backgroundColor: night.card, fontSize: 15, textAlign: 'auto', writingDirection: 'auto' },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' },
});
