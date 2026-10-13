// لوحة إدارة التطبيق ← بلاغات المجتمع ← الفحص الآلي: تشغيل فحص النصوص بعد النشر (Qwen3Guard عبر Hugging Face)
// وإعداده، وأرقام آخر ٢٤ ساعة. النتائج نفسها تطلع في «مفتوحة» مع البلاغات، والقرار للمالك.
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Switch, View } from 'react-native';
import { Button, Card, Input, Loading, Row, Segmented, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { AUTOMOD_CAP_MAX, autoModStats, saveAutoMod, type AutoModSettings, type AutoModStats } from '@/lib/safety';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const KNOWN_ERRORS = new Set(['auth', 'credits', 'model', 'http_429', 'http_5xx', 'http_4xx', 'timeout', 'network', 'bad_output']);

export function AutoModPanel() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [stats, setStats] = useState<AutoModStats | null>(null);
  const [s, setS] = useState<AutoModSettings | null>(null);
  const [cap, setCap] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    autoModStats()
      .then((x) => { setStats(x); setS(x.settings); setCap(String(x.settings.daily_cap)); })
      .catch((e) => Alert.alert(t(errorKey(e))));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  if (!stats || !s) return <Loading />;

  const n = parseInt(toLatin(cap), 10);
  const dirty = s.enabled !== stats.settings.enabled || s.action !== stats.settings.action || s.messages !== stats.settings.messages
    || n !== stats.settings.daily_cap;

  const save = async () => {
    if (!Number.isInteger(n) || n < 0 || n > AUTOMOD_CAP_MAX) return Alert.alert(t('automod.err_cap', { max: AUTOMOD_CAP_MAX }));
    setBusy(true);
    try { await saveAutoMod({ ...s, daily_cap: n }); load(); }
    catch (e) { Alert.alert(t(errorKey(e))); }
    finally { setBusy(false); }
  };

  const stopNow = async (v: AutoModSettings) => {
    setBusy(true);
    try { await saveAutoMod(v); load(); }
    catch (e) { Alert.alert(t(errorKey(e))); }
    finally { setBusy(false); }
  };

  // التشغيل والرسائل: تأكيد قبل، لأن النص يطلع لمزوّد خارجي
  const turnOn = (v: boolean) => {
    if (!v) return setS({ ...s, enabled: false });
    Alert.alert(t('automod.onQ'), t('automod.onExplain'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('automod.onConfirm'), onPress: () => setS({ ...s, enabled: true }) },
    ]);
  };
  const messagesOn = (v: boolean) => {
    if (!v) return setS({ ...s, messages: false });
    Alert.alert(t('automod.messagesQ'), t('automod.messagesExplain'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('automod.messagesConfirm'), style: 'destructive', onPress: () => setS({ ...s, messages: true }) },
    ]);
  };

  const err = stats.last_error ? (KNOWN_ERRORS.has(stats.last_error) ? stats.last_error : 'other') : null;
  const stale = stats.settings.enabled && stats.queued > 0 && (!stats.last_at || Date.now() - Date.parse(stats.last_at) > 10 * 60_000);

  return (
    <View style={{ gap: space.md }}>
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
        <Row gap={8}>
          <Ionicons name="sparkles" size={18} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('automod.eyebrow')}</T>
        </Row>
        <T size="lg" bold color={brand.cream}>{t('automod.title')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('automod.intro')}</T>
      </View>

      {/* الحالة */}
      <Card style={{ gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T semibold>{t(stats.settings.enabled ? 'automod.stateOn' : 'automod.stateOff')}</T>
          <T size="xs" muted>{stats.last_at ? t('automod.lastAt', { when: timeAgo(stats.last_at, lng) }) : t('automod.never')}</T>
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {([['checked', stats.checked_24h], ['flagged', stats.flagged_24h], ['errors', stats.errors_24h], ['queued', stats.queued]] as const).map(([k, v]) => (
            <View key={k} style={{ flexGrow: 1, minWidth: 120, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.sm, gap: 2 }}>
              <T size="lg" bold>{v}</T>
              <T size="xs" muted>{t(`automod.stat_${k}`)}</T>
            </View>
          ))}
        </View>
        <T size="xs" muted>{t('automod.used', { used: stats.used_24h, cap: stats.settings.daily_cap })}</T>
        {!stats.server_ready ? <T size="sm" color={colors.danger} style={{ lineHeight: 21 }}>{t('automod.notReady')}</T> : null}
        {err ? <T size="sm" color={colors.danger} style={{ lineHeight: 21 }}>{t(`automod.err_${err}`)}</T> : null}
        {stale && !err ? <T size="sm" color={colors.danger} style={{ lineHeight: 21 }}>{t('automod.stale')}</T> : null}
      </Card>

      {/* الإعداد: للمالك بس. المشرف الثاني يقدر يوقف (الفحص كله أو الرسائل) */}
      {!stats.can_edit ? (
        <Card style={{ gap: space.sm }}>
          <T size="sm" muted style={{ lineHeight: 21 }}>{t('automod.ownerOnly')}</T>
          {stats.settings.enabled ? (
            <Button small variant="danger" icon="pause-circle-outline" title={t('automod.turnOff')} loading={busy}
              onPress={() => stopNow({ ...stats.settings, enabled: false })} />
          ) : null}
          {stats.settings.messages ? (
            <Button small variant="secondary" icon="chatbubbles-outline" title={t('automod.messagesOff')} loading={busy}
              onPress={() => stopNow({ ...stats.settings, messages: false })} />
          ) : null}
        </Card>
      ) : (
      <Card style={{ gap: space.md }}>
        <Row>
          <View style={{ flex: 1 }}><T semibold>{t('automod.enabled')}</T><T size="xs" muted style={{ lineHeight: 19 }}>{t('automod.enabledHint')}</T></View>
          <Switch value={s.enabled} onValueChange={turnOn} trackColor={{ true: brand.orange }} accessibilityLabel={t('automod.enabled')} />
        </Row>
        <View style={{ gap: 6 }}>
          <T semibold>{t('automod.action')}</T>
          <Segmented value={s.action} onChange={(a) => setS({ ...s, action: a })}
            options={[{ value: 'flag', label: t('automod.action_flag') }, { value: 'hide', label: t('automod.action_hide') }]} />
          <T size="xs" muted style={{ lineHeight: 19 }}>{t(s.action === 'hide' ? 'automod.action_hideHint' : 'automod.action_flagHint')}</T>
        </View>
        <Row>
          <View style={{ flex: 1 }}><T semibold>{t('automod.messages')}</T><T size="xs" muted style={{ lineHeight: 19 }}>{t('automod.messagesHint')}</T></View>
          <Switch value={s.messages} onValueChange={messagesOn} trackColor={{ true: brand.orange }} accessibilityLabel={t('automod.messages')} />
        </Row>
        <Input label={t('automod.cap')} hint={t('automod.capHint')} value={cap} onChangeText={setCap} keyboardType="number-pad" maxLength={5} />
        <Button icon="checkmark" title={t('common.save')} loading={busy} disabled={!dirty} onPress={save} />
      </Card>
      )}

      <T size="xs" muted style={{ lineHeight: 19 }}>{t('automod.footnote')}</T>
    </View>
  );
}
