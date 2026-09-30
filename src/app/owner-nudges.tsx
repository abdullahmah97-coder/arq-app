// لوحة المالك ← تنبيهات التحفيز: تكتب النصوص (رجال / نساء / الجميع، عربي / English) والخادم يرسلها في أوقاتها
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Empty, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { SendSheet } from '@/components/nudges/SendSheet';
import {
  deleteNudge, fillNudge, loadNudges, NUDGE_CATEGORIES, NUDGE_VARS, nudgeStats, sampleVars, saveNudge, sendTestNudge, setNudgeActive,
  type NudgeCategory, type NudgeDraft, type NudgeGender, type NudgeTemplate,
} from '@/lib/nudges';
import { isAdmin } from '@/lib/owner';
import { brand, colors, fonts, radius, space } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const CAT_ICON: Record<NudgeCategory, IconName> = { gym: 'barbell-outline', friend: 'people-outline', streak: 'flame-outline', workout: 'clipboard-outline', meal: 'restaurant-outline' };
const VAR_KEY: Record<string, string> = { '{name}': 'var_name', '{friend}': 'var_friend', '{gym}': 'var_gym', '{streak}': 'var_streak', '{workout}': 'var_workout' };

export default function OwnerNudges() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [ok, setOk] = useState<boolean | null>(null);
  const [sendFor, setSendFor] = useState<NudgeTemplate | null>(null);
  const [rows, setRows] = useState<NudgeTemplate[]>([]);
  const [stats, setStats] = useState<Record<string, { today: number; week: number }>>({});
  const [cat, setCat] = useState<NudgeCategory>('gym');
  const [who, setWho] = useState<NudgeGender>('all');
  const [draft, setDraft] = useState<NudgeDraft | null>(null);

  const load = useCallback(async () => {
    const admin = await isAdmin();
    setOk(admin);
    if (!admin) return;
    const [r, s] = await Promise.all([loadNudges(), nudgeStats()]);
    setRows(r); setStats(s);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const inCat = useMemo(() => rows.filter((r) => r.category === cat), [rows, cat]);
  // العربي أولاً، بعده الإنجليزي
  const shown = inCat.filter((r) => who === 'all' || r.gender === who || r.gender === 'all')
    .sort((a, b) => Number(a.locale !== 'ar') - Number(b.locale !== 'ar'));
  // تحذير لو فئة ما لها نص عربي مفعّل
  const missing = (['male', 'female'] as const).filter((g) => !inCat.some((r) => r.active && r.locale === 'ar' && (r.gender === g || r.gender === 'all')));

  if (ok === null) return <Loading />;
  if (!ok) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  const st = stats[cat];
  const toggle = async (r: NudgeTemplate, v: boolean) => {
    setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, active: v } : x)));
    try { await setNudgeActive(r.id, v); } catch { setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, active: !v } : x))); Alert.alert(t('errors.generic')); }
  };
  const test = async (r: NudgeTemplate) => {
    try { await sendTestNudge(r.id); Alert.alert(t('nudge.testSent')); } catch { Alert.alert(t('errors.generic')); }
  };
  // «أرسل الحين»: صفحة خيارات (لمين، الحدود، وين يفتح) والعدد يتحدث قبل الإرسال
  const sendNow = (r: NudgeTemplate) => setSendFor(r);
  const remove = (r: NudgeTemplate) => Alert.alert(t('nudge.deleteConfirm'), r.title, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('nudge.delete'), style: 'destructive', onPress: async () => { try { await deleteNudge(r.id); load(); } catch { Alert.alert(t('errors.generic')); } } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md, gap: 6 }}>
        <Row gap={6}><Ionicons name="flame" size={18} color={brand.orange} /><T semibold>{t('nudge.title')}</T></Row>
        <T size="xs" style={{ lineHeight: 20 }}>{t('nudge.intro')}</T>
      </View>

      <Segmented wrap value={cat} onChange={setCat} options={NUDGE_CATEGORIES.map((c) => ({
        value: c, label: `${t(`nudge.cat_${c}`)} (${rows.filter((r) => r.category === c && r.active).length})`,
      }))} />

      <View style={{ gap: 6 }}>
        <Row gap={6}>
          <Ionicons name={CAT_ICON[cat]} size={18} color={colors.primary} />
          <T size="sm" style={{ flex: 1, lineHeight: 20 }}>{t(`nudge.when_${cat}`)}</T>
        </Row>
        {st ? <T size="xs" muted>{t('nudge.sentToday', { n: st.today, w: st.week })}</T> : null}
        {missing.length ? (
          <T size="xs" color={colors.danger}>{t('nudge.noActive', { who: missing.map((g) => t(`nudge.g_${g}`)).join(' / ') })}</T>
        ) : null}
      </View>

      <Segmented value={who} onChange={setWho} options={[
        { value: 'all', label: t('nudge.showAll') }, { value: 'male', label: t('nudge.g_male') }, { value: 'female', label: t('nudge.g_female') },
      ]} />

      <Button icon="add" title={t('nudge.add')} onPress={() => setDraft({
        category: cat, gender: who === 'all' ? 'male' : who, friend_gender: 'all', locale: 'ar', title: '', body: '', active: true,
      })} />

      {shown.length ? shown.map((r) => (
        <View key={r.id} style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, opacity: r.active ? 1 : 0.55 }}>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Pill text={t(`nudge.for_${r.gender}`)} />
            <Pill text={r.locale === 'ar' ? 'ع' : 'En'} />
            {r.category === 'friend' ? <Pill text={`${t('nudge.friendIs')}: ${t(`nudge.fg_${r.friend_gender}`)}`} /> : null}
            {!r.active ? <Pill text={t('nudge.inactive')} muted /> : null}
            <View style={{ flex: 1 }} />
            <Switch value={r.active} onValueChange={(v) => toggle(r, v)} trackColor={{ true: brand.orange }} accessibilityLabel={r.title} />
          </Row>
          <VarText text={r.title} bold />
          <VarText text={r.body} />
          <Button small icon="megaphone-outline" title={t('nudge.sendNow')} onPress={() => sendNow(r)} />
          {r.last_broadcast_at ? (
            <T size="xs" muted>{t('nudge.lastSent', { ago: timeAgo(r.last_broadcast_at, lng), count: r.last_broadcast_n ?? 0 })}</T>
          ) : null}
          <Row gap={space.lg}>
            <Action icon="paper-plane-outline" label={t('nudge.test')} onPress={() => test(r)} />
            <Action icon="create-outline" label={t('nudge.editShort')} onPress={() => setDraft({ ...r })} />
            <Action icon="trash-outline" label={t('nudge.delete')} onPress={() => remove(r)} danger />
          </Row>
        </View>
      )) : <Empty icon="chatbubble-ellipses-outline" text={t('nudge.empty')} />}

      <Editor draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />
      {sendFor ? (
        <SendSheet tpl={sendFor} onClose={() => setSendFor(null)}
          onSent={(n) => { setSendFor(null); Alert.alert(t('nudge.sentNow', { count: n })); load(); }} />
      ) : null}
    </Screen>
  );
}

function Pill({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <View style={{ backgroundColor: muted ? colors.cardAlt : 'rgba(241,85,29,0.10)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <T size="xs" semibold color={muted ? colors.muted : colors.primary}>{text}</T>
    </View>
  );
}

function Action({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={16} color={danger ? colors.danger : colors.muted} />
      <T size="xs" color={danger ? colors.danger : colors.muted}>{label}</T>
    </Pressable>
  );
}

/** النص مع تلوين المتغيرات {name} … */
function VarText({ text, bold }: { text: string; bold?: boolean }) {
  const parts = text.split(/(\{(?:name|friend|gym|streak|workout)\})/g);
  return (
    <Text style={{ color: colors.text, fontFamily: bold ? fonts.title : fonts.body, fontSize: bold ? 15 : 14, lineHeight: 22, textAlign: 'auto', writingDirection: 'auto' }}>
      {parts.map((p, i) => (/^\{\w+\}$/.test(p)
        ? <Text key={i} style={{ color: colors.primary, fontFamily: fonts.semibold }}>{p}</Text>
        : <Text key={i}>{p}</Text>))}
    </Text>
  );
}

function Editor({ draft, onClose, onSaved }: { draft: NudgeDraft | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [d, setD] = useState<NudgeDraft | null>(draft);
  const [busy, setBusy] = useState(false);
  const [lastDraft, setLastDraft] = useState(draft);
  if (draft !== lastDraft) { setLastDraft(draft); setD(draft); }
  if (!d) return null;

  const set = (p: Partial<NudgeDraft>) => setD({ ...d, ...p });
  const vars = sampleVars(d);
  const save = async () => {
    if (!d.title.trim() || d.body.trim().length < 3) { Alert.alert(t('nudge.tooShort')); return; }
    setBusy(true);
    try { await saveNudge(d); onSaved(); } catch { Alert.alert(t('errors.generic')); }
    setBusy(false);
  };

  return (
    <Modal visible={!!draft} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md }}>
            <T size="lg" bold>{d.id ? t('nudge.edit') : t('nudge.new')} · {t(`nudge.cat_${d.category}`)}</T>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('common.cancel')}><Ionicons name="close" size={26} color={colors.text} /></Pressable>
          </Row>
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.md }} keyboardShouldPersistTaps="handled">
            <T size="sm" muted>{t('nudge.audience')}</T>
            <Segmented value={d.gender} onChange={(v) => set({ gender: v })} options={[
              { value: 'male', label: t('nudge.for_male') }, { value: 'female', label: t('nudge.for_female') }, { value: 'all', label: t('nudge.for_all') },
            ]} />
            <T size="sm" muted>{t('nudge.language')}</T>
            <Segmented value={d.locale} onChange={(v) => set({ locale: v })} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
            {d.category === 'friend' ? (
              <>
                <T size="sm" muted>{t('nudge.friendGender')}</T>
                <Segmented value={d.friend_gender} onChange={(v) => set({ friend_gender: v })} options={[
                  { value: 'male', label: t('nudge.fg_male') }, { value: 'female', label: t('nudge.fg_female') }, { value: 'all', label: t('nudge.fg_all') },
                ]} />
              </>
            ) : null}
            <Input label={t('nudge.titleLabel')} value={d.title} onChangeText={(v) => set({ title: v })} maxLength={80} placeholder={t('nudge.titlePh')} />
            <Input label={t('nudge.bodyLabel')} value={d.body} onChangeText={(v) => set({ body: v })} maxLength={240} multiline placeholder={t('nudge.bodyPh')} />
            <T size="xs" muted>{t('nudge.vars')}</T>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {NUDGE_VARS[d.category].map((v) => (
                <Pressable key={v} onPress={() => set({ body: `${d.body}${d.body && !d.body.endsWith(' ') ? ' ' : ''}${v}` })}
                  style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, opacity: pressed ? 0.6 : 1 })}>
                  <T size="xs" color={colors.primary}>{v} · {t(`nudge.${VAR_KEY[v]}`)}</T>
                </Pressable>
              ))}
            </Row>

            <T size="sm" muted style={{ marginTop: space.sm }}>{t('nudge.preview')}</T>
            <View style={{ flexDirection: 'row', gap: space.md, backgroundColor: brand.deepGreen, borderRadius: 18, padding: space.md }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="flame" size={20} color={brand.cream} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: brand.cream, fontFamily: fonts.title, fontSize: 14, textAlign: 'auto', writingDirection: 'auto' }}>{fillNudge(d.title, vars) || '—'}</Text>
                <Text style={{ color: 'rgba(248,237,218,0.8)', fontFamily: fonts.body, fontSize: 13, lineHeight: 20, textAlign: 'auto', writingDirection: 'auto' }}>{fillNudge(d.body, vars) || '—'}</Text>
              </View>
            </View>

            <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
              <T semibold>{t('nudge.activeLabel')}</T>
              <Switch value={d.active} onValueChange={(v) => set({ active: v })} trackColor={{ true: brand.orange }} />
            </Row>
            <Button title={t('nudge.save')} icon="checkmark" loading={busy} onPress={save} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
