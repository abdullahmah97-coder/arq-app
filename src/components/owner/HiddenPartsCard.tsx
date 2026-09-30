// لوحة الإدارة ← الأجزاء المخفية عن المستخدمين (للمالك بس): كل اللي أخفاه بالضغط المطوّل، ويرجّعه من هنا
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Button, Card, Row, T } from '@/components/ui';
import { listHiddenParts, setPartHidden, useHiddenParts } from '@/lib/appOwner';
import { useLocalized } from '@/lib/i18n';
import { timeAgo } from '@/lib/dates';
import { errorKey } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';
import { useOwnerMode } from './Hideable';

type HiddenRow = { key: string; label: string | null; hidden_at: string };

export function HiddenPartsCard() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const owner = useOwnerMode();
  const live = useHiddenParts();
  const [rows, setRows] = useState<HiddenRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    if (!owner) return;
    let alive = true;
    listHiddenParts().then((r) => { if (alive) setRows(r); }, () => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [owner]));
  if (!owner) return null;
  // اللي رجّعه من مكانه يختفي من هنا على طول
  const shown = (rows ?? []).filter((r) => live.has(r.key));
  const restore = async (r: HiddenRow) => {
    setBusy(r.key);
    try { await setPartHidden(r.key, r.label ?? r.key, false); setRows((x) => x?.filter((y) => y.key !== r.key) ?? null); }
    catch (e) { Alert.alert(t(errorKey(e))); }
    finally { setBusy(null); }
  };
  return (
    <Card style={{ gap: space.sm }}>
      <Row gap={8}>
        <Ionicons name="eye-off-outline" size={18} color={brand.orange} />
        <T bold style={{ flex: 1 }}>{t('ownerParts.listTitle')}{shown.length ? ` · ${shown.length}` : ''}</T>
      </Row>
      <T size="xs" muted style={{ lineHeight: 18 }}>{t('ownerParts.listHint')}</T>
      {rows && !shown.length ? <T size="sm" muted>{t('ownerParts.listEmpty')}</T> : null}
      {shown.map((r) => (
        <Row key={r.key} gap={space.sm} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T size="sm" semibold numberOfLines={1}>{r.label || r.key}</T>
            <T size="xs" muted>{timeAgo(r.hidden_at, lng)}</T>
          </View>
          <Button small variant="secondary" icon="eye-outline" title={t('ownerParts.show')} loading={busy === r.key} onPress={() => restore(r)} />
        </Row>
      ))}
    </Card>
  );
}
