// تسجيل التمرين مباشرة: الوزن × العدّات لكل مجموعة، مع "آخر مرة" واقتراح وزن اليوم ومؤقت الراحة
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { FullSafeView } from '@/components/FullSafeView';
import { NT, Num, Pill } from '@/components/pulse/widgets';
import { showRir } from '@/components/rir';
import { useUser } from '@/lib/auth';
import { ExercisePicker } from '@/components/ExercisePicker';
import { useLocalized } from '@/lib/i18n';
import { FriendsBest } from '@/components/workout/FriendsBest';
import {
  daysAgo, liftScore, loadFriendsBest, type FriendBest, discardWorkout, finishWorkout, fmtSet, getActiveWorkout, lastTimeFor, loadHistory, logSet, repRange,
  saveActiveWorkout, suggestNext, unlogSet, type ActiveWorkout, type SessionData,
} from '@/lib/training';
import { getExercise } from '@/three/catalog';
import { brand, fonts, night, pulse, space } from '@/theme';
import { goBackOrHome } from '@/lib/nav';

interface Draft { weight: string; reps: string }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function WorkoutLog() {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const { userId, refreshProfile } = useUser();
  const [w, setW] = useState<ActiveWorkout | null>(null);
  const [history, setHistory] = useState<SessionData[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [extra, setExtra] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [friends, setFriends] = useState<Record<string, FriendBest[]>>({});

  useFocusEffect(useCallback(() => {
    getActiveWorkout().then((a) => { if (!a) goBackOrHome(); else setW(a); });
    loadHistory(80).then(setHistory);
  }, []));
  const exKey = w?.exercises.map((e) => e.exercise_id).join(',') ?? '';
  useEffect(() => { if (exKey) loadFriendsBest(exKey.split(',')).then(setFriends).catch(() => {}); }, [exKey]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (rest && now >= rest.until) setRest(null); }, [now, rest]);

  const update = (next: ActiveWorkout) => { setW(next); saveActiveWorkout(next); };

  // "آخر مرة" + الاقتراح لكل تمرين
  const info = useMemo(() => {
    const out: Record<string, { last: ReturnType<typeof lastTimeFor>; suggest: ReturnType<typeof suggestNext> }> = {};
    for (const e of w?.exercises ?? []) {
      const last = lastTimeFor(e.exercise_id, history, w?.session_id);
      out[e.exercise_id] = { last, suggest: last ? suggestNext(e.exercise_id, last.sets, e.reps) : null };
    }
    return out;
  }, [w, history]);

  if (!w) return <View style={{ flex: 1, backgroundColor: night.bg }} />;

  const key = (ex: string, i: number) => `${ex}#${i}`;
  const draftOf = (ex: string, i: number, target: string): Draft => {
    const d = drafts[key(ex, i)];
    if (d) return d;
    const done = w.done.find((s) => s.exercise_id === ex && s.set_index === i);
    if (done) return { weight: String(+done.weight_kg), reps: String(done.reps) };
    const inf = info[ex];
    const lastSet = inf?.last?.sets.find((s) => s.set_index === i) ?? inf?.last?.sets[inf.last.sets.length - 1];
    const weight = inf?.suggest ? inf.suggest.weight : lastSet ? lastSet.weight_kg : 0;
    const reps = inf?.suggest ? inf.suggest.reps : repRange(target)[1];
    return { weight: weight ? String(weight) : '', reps: String(reps) };
  };

  const toggle = async (ex: string, i: number, target: string, restSec: number) => {
    const isDone = w.done.some((s) => s.exercise_id === ex && s.set_index === i);
    if (isDone) {
      update({ ...w, done: w.done.filter((s) => !(s.exercise_id === ex && s.set_index === i)) });
      unlogSet(w.session_id, ex, i).catch(() => {});
      return;
    }
    const d = draftOf(ex, i, target);
    const entry = { exercise_id: ex, set_index: i, reps: Math.max(0, parseInt(d.reps, 10) || 0), weight_kg: Math.max(0, parseFloat(d.weight.replace(',', '.')) || 0), done_at: new Date().toISOString() };
    if (!entry.reps) return;
    update({ ...w, done: [...w.done, entry] });
    setRest({ until: Date.now() + restSec * 1000, total: restSec });
    try { await logSet(userId, w.session_id, entry); } catch { /* يبقى محفوظ محلياً ويُعاد عند الإنهاء */ }
  };

  const finish = async () => {
    if (!w.done.length) {
      return Alert.alert(t('workout.nothingLogged'), '', [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('workout.discard'), style: 'destructive', onPress: async () => { await discardWorkout(w); goBackOrHome(); } },
      ]);
    }
    setBusy(true);
    // إعادة إرسال أي مجموعة ما وصلت (بدون إنترنت أثناء التمرين)
    for (const s of w.done) { try { await logSet(userId, w.session_id, s); } catch {} }
    const { points } = await finishWorkout(w);
    setBusy(false);
    if (points) refreshProfile();
    router.replace({ pathname: '/workout/[id]', params: { id: w.session_id, points: String(points) } });
  };

  const addExercise = (id: string) => {
    setPicker(false);
    if (w.exercises.some((e) => e.exercise_id === id)) return;
    update({ ...w, exercises: [...w.exercises, { exercise_id: id, sets: 3, reps: '8-12', rest_sec: 90 }] });
  };

  const elapsed = (now - Date.parse(w.started_at)) / 1000;
  const doneCount = w.done.length;
  const totalSets = w.exercises.reduce((a, e) => a + e.sets + (extra[e.exercise_id] ?? 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: night.bg }}>
      <StatusBar style={night.statusBar} />
      <LinearGradient colors={[night.bg2, night.bg]} style={StyleSheet.absoluteFill} end={{ x: 0, y: 0.4 }} />
      <FullSafeView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={goBackOrHome} hitSlop={10} style={styles.iconBtn}><Ionicons name="chevron-down" size={22} color={night.text} /></Pressable>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <NT size={15} bold numberOfLines={1}>{w.title}</NT>
            <Num size={20} color={brand.amber}>{mmss(elapsed)}</Num>
          </View>
          <Pressable onPress={finish} disabled={busy} style={styles.finish}><NT size={13} bold color={brand.cream}>{t('workout.finish')}</NT></Pressable>
        </View>
        <View style={{ paddingHorizontal: space.lg }}>
          <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.min(100, (doneCount / Math.max(1, totalSets)) * 100)}%` }]} /></View>
          <NT size={11} faint style={{ marginTop: 4 }}>{t('workout.setsDone', { done: doneCount, total: totalSets })}</NT>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            {w.exercises.map((e) => {
              const g = getExercise(e.exercise_id);
              if (!g) return null;
              const inf = info[e.exercise_id];
              const n = e.sets + (extra[e.exercise_id] ?? 0);
              return (
                <View key={e.exercise_id} style={styles.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <NT size={16} bold style={{ flex: 1 }} numberOfLines={1}>{L(g.name)}</NT>
                    <Pressable onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: e.exercise_id } })} hitSlop={8}>
                      <Ionicons name="cube-outline" size={20} color={brand.amber} />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <NT size={12} faint>{t('workout.target', { sets: e.sets, reps: e.reps })}</NT>
                    {e.rir ? (
                      <Pressable onPress={() => showRir(lng)} hitSlop={6} style={{ backgroundColor: night.cardStrong, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <NT size={11} semibold color={brand.amber}>RIR {e.rir} ⓘ</NT>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* آخر مرة */}
                  {inf?.last ? (
                    <View style={styles.lastBox}>
                      <Ionicons name="time-outline" size={14} color={night.muted} />
                      <NT size={12} muted style={{ flex: 1 }}>
                        {daysAgo(inf.last.session.started_at) === 0 ? t('workout.lastToday') : t('workout.lastTime', { days: daysAgo(inf.last.session.started_at), count: daysAgo(inf.last.session.started_at) })}{' '}
                        <NT size={12} semibold color={night.text}>{inf.last.sets.map(fmtSet).join(' · ')}</NT>
                      </NT>
                    </View>
                  ) : <NT size={12} faint>{t('workout.firstTime')}</NT>}
                  {inf?.suggest ? (
                    <Pill color={inf.suggest.increase ? brand.cream : brand.amber} bg={inf.suggest.increase ? brand.orange : 'rgba(254,169,79,0.14)'}>
                      {inf.suggest.increase ? '↑ ' : ''}{t('workout.suggest', { set: fmtSet({ weight_kg: inf.suggest.weight, reps: inf.suggest.reps }) })}
                    </Pill>
                  ) : null}

                  {friends[e.exercise_id] ? (
                    <FriendsBest compact rows={friends[e.exercise_id]}
                      mine={w.done.filter((x) => x.exercise_id === e.exercise_id).reduce<{ weight_kg: number; reps: number } | null>((b, x) => (!b || liftScore(x.weight_kg, x.reps) > liftScore(b.weight_kg, b.reps) ? x : b), null)} />
                  ) : null}

                  {/* المجموعات */}
                  <View style={styles.setHead}>
                    <NT size={10} faint style={{ width: 26 }}>#</NT>
                    <NT size={10} faint style={{ flex: 1 }}>{t('workout.previous')}</NT>
                    <NT size={10} faint style={styles.colIn}>{t('workout.kg')}</NT>
                    <NT size={10} faint style={styles.colIn}>{t('workout.reps')}</NT>
                    <View style={{ width: 40 }} />
                  </View>
                  {Array.from({ length: n }, (_, k) => k + 1).map((i) => {
                    const d = draftOf(e.exercise_id, i, e.reps);
                    const done = w.done.some((s) => s.exercise_id === e.exercise_id && s.set_index === i);
                    const prev = inf?.last?.sets.find((s) => s.set_index === i);
                    const set = (patch: Partial<Draft>) => setDrafts((x) => ({ ...x, [key(e.exercise_id, i)]: { ...d, ...patch } }));
                    return (
                      <View key={i} style={[styles.setRow, done && styles.setDone]}>
                        <Num size={15} color={done ? brand.amber : night.muted} style={{ width: 26 }}>{i}</Num>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <NT size={12} faint>{prev ? fmtSet(prev) : '—'}</NT>
                          {done && prev ? <SetDelta now={w.done.find((s) => s.exercise_id === e.exercise_id && s.set_index === i)!} prev={prev} /> : null}
                        </View>
                        <TextInput value={d.weight} onChangeText={(v) => set({ weight: v })} keyboardType="decimal-pad" editable={!done}
                          placeholder="0" placeholderTextColor={night.faint} style={[styles.input, { fontFamily: fonts.display }]} selectTextOnFocus />
                        <TextInput value={d.reps} onChangeText={(v) => set({ reps: v })} keyboardType="number-pad" editable={!done}
                          placeholder="0" placeholderTextColor={night.faint} style={[styles.input, { fontFamily: fonts.display }]} selectTextOnFocus />
                        <Pressable onPress={() => toggle(e.exercise_id, i, e.reps, e.rest_sec)} style={[styles.check, done && { backgroundColor: brand.amber, borderColor: brand.amber }]} accessibilityLabel={t('workout.a11ySet', { n: i + 1 })}>
                          <Ionicons name="checkmark" size={18} color={done ? brand.deepGreen : night.muted} />
                        </Pressable>
                      </View>
                    );
                  })}
                  {inf?.last && w.done.some((x) => x.exercise_id === e.exercise_id) ? (() => {
                    const vNow = w.done.filter((x) => x.exercise_id === e.exercise_id).reduce((a, x) => a + x.weight_kg * x.reps, 0);
                    const vPrev = inf.last.sets.reduce((a, x) => a + x.weight_kg * x.reps, 0);
                    if (!vPrev) return null;
                    const pct = vNow / vPrev;
                    return (
                      <View style={{ gap: 4, marginTop: 4 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <NT size={11} faint>{t('workout.volVsLast')}</NT>
                          <NT size={11} semibold color={pct >= 1 ? pulse.green : night.muted}>{`\u2066${Math.round(vNow).toLocaleString('en-US')} / ${Math.round(vPrev).toLocaleString('en-US')}\u2069 ${t('workout.kg')}`}{pct >= 1 ? ' ✓' : ''}</NT>
                        </View>
                        <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.min(100, pct * 100)}%`, backgroundColor: pct >= 1 ? pulse.green : brand.amber }]} /></View>
                      </View>
                    );
                  })() : null}
                  <Pressable onPress={() => setExtra((x) => ({ ...x, [e.exercise_id]: (x[e.exercise_id] ?? 0) + 1 }))} style={styles.addSet}>
                    <Ionicons name="add" size={16} color={brand.amber} /><NT size={12} semibold color={brand.amber}>{t('workout.addSet')}</NT>
                  </Pressable>
                </View>
              );
            })}
            <Pressable onPress={() => setPicker(true)} style={styles.addEx}>
              <Ionicons name="add-circle-outline" size={20} color={night.text} />
              <NT semibold>{t('workout.addExercise')}</NT>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* مؤقت الراحة */}
        {rest ? (
          <View style={styles.rest}>
            <Ionicons name="hourglass-outline" size={18} color={brand.deepGreen} />
            <NT size={13} semibold color={brand.deepGreen}>{t('workout.rest')}</NT>
            <Num size={22} color={brand.deepGreen}>{mmss(Math.max(0, (rest.until - now) / 1000))}</Num>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setRest({ until: rest.until + 15000, total: rest.total + 15 })} hitSlop={8}><NT size={13} bold color={brand.deepGreen}>+15</NT></Pressable>
            <Pressable onPress={() => setRest(null)} hitSlop={8}><NT size={13} bold color={brand.deepGreen}>{t('workout.skip')}</NT></Pressable>
          </View>
        ) : null}
      </FullSafeView>

      <Modal visible={picker} animationType="slide" transparent onRequestClose={() => setPicker(false)}>
        <ExercisePicker onPick={addExercise} onClose={() => setPicker(false)} />
      </Modal>
    </View>
  );
}

/** سهم مقارنة المجموعة مع نفس المجموعة آخر مرة */
function SetDelta({ now, prev }: { now: { weight_kg: number; reps: number }; prev: { weight_kg: number; reps: number } }) {
  const d = liftScore(now.weight_kg, now.reps) - liftScore(prev.weight_kg, prev.reps);
  if (Math.abs(d) < 1e-6) return <NT size={11} faint>=</NT>;
  const up = d > 0;
  const txt = now.weight_kg !== prev.weight_kg ? `${up ? '+' : ''}${+(now.weight_kg - prev.weight_kg).toFixed(1)}kg` : `${up ? '+' : ''}${now.reps - prev.reps}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: up ? 'rgba(76,175,125,0.16)' : 'rgba(241,85,29,0.16)', borderRadius: 6, paddingHorizontal: 4 }}>
      <Ionicons name={up ? 'caret-up' : 'caret-down'} size={10} color={up ? pulse.green : brand.orange} />
      <NT size={10} semibold color={up ? pulse.green : brand.orange}>{`\u2066${txt}\u2069`}</NT>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: night.card },
  finish: { backgroundColor: brand.orange, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  progress: { height: 6, borderRadius: 3, backgroundColor: night.line, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: brand.amber, borderRadius: 3 },
  card: { backgroundColor: night.card, borderRadius: 18, borderWidth: 1, borderColor: night.line, padding: space.md, gap: 8 },
  lastBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: night.card, borderRadius: 10, padding: 8 },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingHorizontal: 4 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 4, borderRadius: 10 },
  setDone: { backgroundColor: 'rgba(254,169,79,0.10)' },
  colIn: { width: 64, textAlign: 'center' },
  input: { width: 64, height: 40, borderRadius: 10, backgroundColor: night.cardStrong, color: night.text, textAlign: 'center', fontSize: 17 },
  check: { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: night.line, alignItems: 'center', justifyContent: 'center' },
  addSet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  addEx: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: night.line, paddingVertical: 14 },
  rest: { position: 'absolute', left: space.lg, right: space.lg, bottom: 28, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: brand.amber, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
});
