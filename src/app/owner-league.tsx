// لوحة إدارة التطبيق ← الدوري السعودي: التشغيل (المالك بس)، وقت التذكير، رابط التذاكر، وحالة المزامنة مع API-Football
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Switch, View } from 'react-native';
import { Button, Card, Empty, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { durationLabel } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { adminLeagueStatus, saveLeagueSettings, type LeagueAdminStatus } from '@/lib/league';
import { isAdmin } from '@/lib/owner';
import { brand, colors, radius, space } from '@/theme';

const REMIND = [30, 60, 120] as const;

export default function OwnerLeague() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { profile } = useUser();
  const owner = !!profile.is_owner;
  const [ok, setOk] = useState<boolean | null>(null);
  const [st, setSt] = useState<LeagueAdminStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [remind, setRemind] = useState(60);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => adminLeagueStatus().then((s) => {
    setSt(s); setEnabled(s.settings.enabled); setRemind(s.settings.remind_minutes); setUrl(s.settings.tickets_url ?? '');
  }), []);

  useEffect(() => {
    isAdmin().then((a) => { setOk(a); if (a) load().catch(() => setOk(false)); });
  }, [load]);

  if (ok === null || (ok && !st)) return <Loading />;
  if (!ok || !st) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  const ago = (iso: string | null) => (iso ? t('leagueAdmin.ago', { d: durationLabel(iso, lng) }) : t('leagueAdmin.never'));
  const save = async () => {
    const u = url.trim();
    if (!/^https:\/\/\S{4,}$/.test(u) || u.length > 300) return Alert.alert(t('leagueAdmin.badUrl'));
    setBusy(true);
    try {
      await saveLeagueSettings({ ...st.settings, enabled, remind_minutes: remind, tickets_url: u });
      await load();
      Alert.alert(t('leagueAdmin.saved'));
    } catch { Alert.alert(t('errors.generic')); } finally { setBusy(false); }
  };

  const health = !st.server_ready ? { icon: 'construct-outline' as const, color: colors.muted, text: t('leagueAdmin.notReady') }
    : st.last_error ? { icon: 'alert-circle' as const, color: colors.danger, text: t('leagueAdmin.error') }
    : st.last_ok_at ? { icon: 'checkmark-circle' as const, color: brand.green, text: t('leagueAdmin.ok') }
    : { icon: 'time-outline' as const, color: colors.muted, text: t('leagueAdmin.waiting') };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('league.title') }} />
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
        <Row gap={8}>
          <Ionicons name="football" size={18} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('events.adminEyebrow')}</T>
        </Row>
        <T size="lg" bold color={brand.cream}>{t('league.title')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('leagueAdmin.intro')}</T>
      </View>

      <Card style={{ gap: space.sm }}>
        <Row gap={8}>
          <Ionicons name={health.icon} size={18} color={health.color} />
          <T semibold style={{ flex: 1 }}>{health.text}</T>
        </Row>
        {st.last_error ? (
          <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.sm, gap: 2 }}>
            <T size="xs" style={{ lineHeight: 19 }}>{st.last_error}</T>
            {st.last_error_at ? <T size="xs" muted>{ago(st.last_error_at)}</T> : null}
          </View>
        ) : null}
        <Stat label={t('leagueAdmin.lastUpdate')} value={ago(st.last_ok_at)} />
        <Stat label={t('leagueAdmin.season')} value={st.season ? `${st.season}–${st.season + 1}` : '—'} />
        <Stat label={t('leagueAdmin.counts')} value={t('leagueAdmin.countsValue', { teams: st.teams, matches: st.matches })} />
        <Stat label={t('leagueAdmin.people')} value={t('leagueAdmin.peopleValue', { fans: st.fans, reminders: st.reminders })} />
        <Stat label={t('leagueAdmin.requestsLeft')} value={st.requests_left == null ? '—' : String(st.requests_left)} />
        <T size="xs" muted style={{ lineHeight: 19 }}>{t('leagueAdmin.keyNote')}</T>
      </Card>

      <Card style={{ gap: space.md }}>
        <Row>
          <View style={{ flex: 1 }}><T semibold>{t('leagueAdmin.enabled')}</T><T size="xs" muted>{t('leagueAdmin.enabledHint')}</T></View>
          <Switch value={enabled} disabled={!owner} onValueChange={setEnabled} trackColor={{ true: brand.orange }} />
        </Row>
        <View style={{ gap: 6 }}>
          <T size="sm" semibold>{t('leagueAdmin.remindBefore')}</T>
          <Segmented<number> value={remind} onChange={(v) => owner && setRemind(v)}
            options={REMIND.map((n) => ({ value: n, label: t('leagueAdmin.minutes', { n }) }))} />
        </View>
        <Input label={t('leagueAdmin.ticketsUrl')} hint={t('leagueAdmin.ticketsHint')} value={url} onChangeText={setUrl}
          editable={owner} autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={300} />
        {owner ? <Button icon="checkmark" title={t('common.save')} loading={busy} onPress={save} />
          : <T size="xs" muted center>{t('leagueAdmin.ownerOnly')}</T>}
      </Card>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <T size="sm" muted>{label}</T>
      <T size="sm" semibold>{value}</T>
    </Row>
  );
}
