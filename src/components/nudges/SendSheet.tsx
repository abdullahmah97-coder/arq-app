// «أرسل الحين» بخياراتك: لمين يوصل (حسب الشرط / كل المتدربين / أشخاص تختارهم)، حتى لو وصلهم تنبيه اليوم،
// حتى بوقت الهدوء، ووين يفتح لما يضغطونه — والعدد يتحدث قدامك قبل الإرسال
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Button, Input, Row, T } from '@/components/ui';
import { adminUserList, displayName, type AdminUser } from '@/lib/adminUsers';
import { broadcastNudge, defaultNudgeUrl, NUDGE_OPEN, type NudgeAudience, type NudgeTemplate } from '@/lib/nudges';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, fonts, radius, space } from '@/theme';

type Picked = Pick<AdminUser, 'id' | 'username' | 'full_name' | 'avatar_url'>;
/** نتيجة المعاينة: عدد، أو وقت الهدوء، أو خطأ */
type Preview = { n: number } | { quiet: true } | { error: string } | null;

export function SendSheet({ tpl, onClose, onSent }: { tpl: NudgeTemplate; onClose: () => void; onSent: (n: number) => void }) {
  const { t } = useTranslation();
  const [audience, setAudience] = useState<NudgeAudience>('rule');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [free, setFree] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [url, setUrl] = useState<string>(defaultNudgeUrl(tpl.category));
  const [preview, setPreview] = useState<Preview>(null);
  const [counting, setCounting] = useState(true);
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminUser[] | null>(null);

  const users = picked.map((p) => p.id);
  const usersKey = users.join(',');
  const opts = { audience, users, ignoreLimits: free, url, quietOk: quiet };
  const needPeople = audience === 'pick' && !users.length;

  // المعاينة: كم بيوصله بهالخيارات (تتحدث بعد ما توقف تغيّر شوي)
  useEffect(() => {
    let alive = true;
    const ids = usersKey ? usersKey.split(',') : [];
    if (audience === 'pick' && !ids.length) return;
    const h = setTimeout(() => {
      setCounting(true);
      broadcastNudge(tpl.id, true, { audience, users: ids, ignoreLimits: free, url, quietOk: quiet })
        .then((n) => { if (alive) setPreview({ n }); })
        .catch((e) => { if (alive) setPreview(/quiet_hours/.test(String(e?.message)) ? { quiet: true } : { error: t(errorKey(e)) }); })
        .finally(() => { if (alive) setCounting(false); });
    }, 300);
    return () => { alive = false; clearTimeout(h); };
  }, [tpl.id, audience, usersKey, free, quiet, url, t]);

  // البحث عن أشخاص (حرفين على الأقل)
  const searching = audience === 'pick' && query.trim().length >= 2;
  useEffect(() => {
    if (!searching) return;
    let alive = true;
    const h = setTimeout(() => {
      adminUserList({ kind: 'all', search: query.trim(), limit: 20 })
        .then(({ rows }) => { if (alive) setResults(rows); }, () => { if (alive) setResults([]); });
    }, 350);
    return () => { alive = false; clearTimeout(h); };
  }, [searching, query]);

  const count = preview && 'n' in preview ? preview.n : 0;
  const send = async () => {
    setSending(true);
    try {
      const n = await broadcastNudge(tpl.id, false, opts);
      onSent(n);
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setSending(false);
    }
  };

  const who = tpl.gender === 'all' ? t('nudge.aud_all') : t(`nudge.g_${tpl.gender}`);
  const lang = t(`nudge.lang_${tpl.locale}`);
  const shownResults = searching ? (results ?? []).filter((r) => !users.includes(r.id)) : [];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md }}>
            <T size="lg" bold style={{ flex: 1 }} numberOfLines={1}>{t('nudge.sendTitle')}</T>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </Row>
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.md }} keyboardShouldPersistTaps="handled">
            {/* النص نفسه */}
            <View style={{ flexDirection: 'row', gap: space.md, backgroundColor: brand.deepGreen, borderRadius: 18, padding: space.md }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="flame" size={20} color={brand.cream} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: brand.cream, fontFamily: fonts.title, fontSize: 14, textAlign: 'auto', writingDirection: 'auto' }}>{tpl.title}</Text>
                <Text style={{ color: 'rgba(248,237,218,0.8)', fontFamily: fonts.body, fontSize: 13, lineHeight: 20, textAlign: 'auto', writingDirection: 'auto' }}>{tpl.body}</Text>
              </View>
            </View>

            <T semibold>{t('nudge.audienceQ')}</T>
            <Choice on={audience === 'rule'} title={t('nudge.audRule')} sub={t(`nudge.rule_${tpl.category}`)} onPress={() => setAudience('rule')} />
            <Choice on={audience === 'all'} title={t('nudge.audAll')} sub={t('nudge.audAllSub', { who, lang })} onPress={() => setAudience('all')} />
            <Choice on={audience === 'pick'} title={t('nudge.audPick')} sub={t('nudge.audPickSub')} onPress={() => setAudience('pick')} />

            {audience === 'pick' ? (
              <View style={{ gap: space.sm }}>
                {picked.length ? (
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    {picked.map((p) => (
                      <Pressable key={p.id} onPress={() => setPicked((xs) => xs.filter((x) => x.id !== p.id))} accessibilityRole="button"
                        accessibilityLabel={t('nudge.unpick', { name: displayName(p) })}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(241,85,29,0.12)', borderRadius: radius.pill, paddingStart: 4, paddingEnd: 10, paddingVertical: 4 }}>
                        <Avatar size={24} uri={publicUrl('avatars', p.avatar_url)} name={displayName(p)} />
                        <T size="xs" semibold color={colors.primary}>{displayName(p)}</T>
                        <Ionicons name="close" size={14} color={colors.primary} />
                      </Pressable>
                    ))}
                  </Row>
                ) : null}
                <Input value={query} onChangeText={setQuery} placeholder={t('nudge.pickPh')} autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
                {searching && results === null ? <ActivityIndicator color={colors.primary} /> : null}
                {shownResults.map((r) => (
                  <Pressable key={r.id} onPress={() => { setPicked((xs) => (xs.some((x) => x.id === r.id) ? xs : [...xs, r])); }}
                    accessibilityRole="button" accessibilityLabel={t('nudge.pickA11y', { name: displayName(r) })}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.md,
                      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
                    <Avatar size={34} uri={publicUrl('avatars', r.avatar_url)} name={displayName(r)} />
                    <View style={{ flex: 1 }}>
                      <T size="sm" semibold numberOfLines={1}>{displayName(r)}</T>
                      <T size="xs" muted numberOfLines={1}>@{r.username}</T>
                    </View>
                    <Ionicons name="add-circle" size={24} color={colors.primary} />
                  </Pressable>
                ))}
                {searching && results !== null && !shownResults.length ? <T size="xs" muted center>{t('verify.noResults')}</T> : null}
              </View>
            ) : null}

            <T semibold style={{ marginTop: space.sm }}>{t('nudge.optsTitle')}</T>
            <Toggle title={t('nudge.free')} sub={t('nudge.freeSub')} value={free} onChange={setFree} />
            <Toggle title={t('nudge.quiet')} sub={t('nudge.quietSub')} value={quiet} onChange={setQuiet} />

            <T semibold style={{ marginTop: space.sm }}>{t('nudge.openTitle')}</T>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {NUDGE_OPEN.map((o) => {
                const on = url === o.url;
                return (
                  <Pressable key={o.key} onPress={() => setUrl(o.url)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    style={{ borderRadius: radius.pill, borderWidth: 1, borderColor: on ? colors.primary : colors.border,
                      backgroundColor: on ? colors.primary : colors.card, paddingHorizontal: 12, paddingVertical: 7 }}>
                    <T size="xs" semibold color={on ? colors.onPrimary : colors.text}>{t(`nudge.open_${o.key}`)}</T>
                  </Pressable>
                );
              })}
            </Row>

            <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md, gap: 6, marginTop: space.sm }}>
              {needPeople ? <T size="sm" semibold>{t('nudge.pickNone')}</T>
                : counting || !preview ? <Row gap={8}><ActivityIndicator color={colors.primary} /><T size="sm">{t('nudge.counting')}</T></Row>
                : 'quiet' in preview ? <T size="sm" semibold color={colors.danger}>{t('nudge.quietNow')}</T>
                : 'error' in preview ? <T size="sm" color={colors.danger}>{preview.error}</T>
                : preview.n ? <T size="lg" bold>{t('nudge.willReach', { count: preview.n })}</T>
                : <T size="sm" semibold>{t('nudge.nobodyHint')}</T>}
              <T size="xs" muted style={{ lineHeight: 18 }}>{t('nudge.respectNote')}</T>
            </View>

            <Button icon="megaphone-outline" title={count ? t('nudge.sendTo', { count }) : t('nudge.send')} loading={sending}
              disabled={!count || needPeople || counting || sending} onPress={send} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Choice({ on, title, sub, onPress }: { on: boolean; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.md, borderRadius: radius.md,
        borderWidth: 1.5, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? 'rgba(241,85,29,0.06)' : colors.card, opacity: pressed ? 0.8 : 1 })}>
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.primary : colors.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <T semibold>{title}</T>
        <T size="xs" muted style={{ lineHeight: 18 }}>{sub}</T>
      </View>
    </Pressable>
  );
}

function Toggle({ title, sub, value, onChange }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row gap={space.md} style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T semibold>{title}</T>
        <T size="xs" muted style={{ lineHeight: 18 }}>{sub}</T>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} trackColor={{ true: brand.orange, false: colors.border }} thumbColor={brand.cream} />
    </Row>
  );
}
