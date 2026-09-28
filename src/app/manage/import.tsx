// استيراد أعضاء من ملف CSV (Excel ← حفظ باسم CSV): معاينة وأخطاء كل سطر قبل الحفظ، ثم رموز الربط
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Share, View } from 'react-native';
import { Button, Card, Row, Screen, T } from '@/components/ui';
import { importMemberships, parseMembersCsv, type ParsedImport } from '@/lib/gymops';
import { errorKey } from '@/lib/supabase';
import { colors, space } from '@/theme';

export default function ImportMembers() {
  const { gym } = useLocalSearchParams<{ gym: string }>();
  const { t } = useTranslation();
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ row_no: number; member_name: string | null; claim_code: string | null; error: string | null }[] | null>(null);

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    try {
      const text = await new File(r.assets[0].uri).text();
      setParsed(parseMembersCsv(text)); setDone(null);
    } catch { Alert.alert(t('gymops.readFail')); }
  };
  const run = async () => {
    if (!parsed?.rows.length) return;
    setBusy(true);
    try { setDone(await importMemberships(String(gym), parsed.rows)); setParsed(null); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  const shareCodes = () => {
    const lines = (done ?? []).filter((d) => d.claim_code).map((d) => `${d.member_name}: ${d.claim_code}`);
    Share.share({ message: `${t('gymops.codesHeader')}\n${lines.join('\n')}` });
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.tool_import') }} />
      <Card style={{ gap: space.sm }}>
        <T semibold>{t('gymops.importHow')}</T>
        <T size="sm" muted>{t('gymops.importCols')}</T>
        <T size="xs" muted>name,contact,plan,start,end,price{'\n'}فهد العتيبي,0500000000,سنوي,2026-10-01,2027-09-30,2000</T>
      </Card>
      <Button icon="document-attach-outline" title={t('gymops.pickCsv')} onPress={pick} />
      {parsed ? (
        <Card style={{ gap: space.sm }}>
          <T semibold>{t('gymops.previewN', { count: parsed.rows.length })}</T>
          {parsed.rows.slice(0, 8).map((r, i) => <T key={i} size="xs">{r.name} · {r.plan} · {r.start} → {r.end}</T>)}
          {parsed.rows.length > 8 ? <T size="xs" muted>…</T> : null}
          {parsed.errors.length ? (
            <View style={{ gap: 2 }}>
              <T size="sm" semibold color={colors.danger}>{t('gymops.errorsN', { count: parsed.errors.length })}</T>
              {parsed.errors.slice(0, 10).map((e) => <T key={e.line} size="xs" color={colors.danger}>{t('gymops.lineN', { n: e.line })}: {t(`gymops.imp_${e.msg}`)}</T>)}
            </View>
          ) : null}
          <Button icon="cloud-upload-outline" title={t('gymops.importNow', { count: parsed.rows.length })} loading={busy} disabled={!parsed.rows.length} onPress={run} />
        </Card>
      ) : null}
      {done ? (
        <Card style={{ gap: space.sm }}>
          <T semibold>{t('gymops.importedN', { count: done.filter((d) => d.claim_code).length })}</T>
          {done.filter((d) => d.error).map((d) => <T key={d.row_no} size="xs" color={colors.danger}>{t('gymops.lineN', { n: d.row_no + 1 })}: {d.member_name} — {t('gymops.imp_server')}</T>)}
          <Row><Button small icon="share-social-outline" title={t('gymops.shareCodes')} onPress={shareCodes} /></Row>
          <T size="xs" muted>{t('gymops.claimExplain')}</T>
        </Card>
      ) : null}
    </Screen>
  );
}
