// تعديل خدمات الفرع أو السلسلة (للمدير): متوفر / غير متوفر / ما أعرف، مع ملاحظة قصيرة وتنبيه لو الزوار خالفوا
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, TextInput, View } from 'react-native';
import { ServiceIcon } from '@/components/clubs/GymServices';
import { Card, Empty, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { canManageGymOrChain, loadChainServices, loadGymServices, saveChainService, saveGymService, serviceName } from '@/lib/services';
import { canManageChain } from '@/lib/clubs';
import { errorKey } from '@/lib/supabase';
import { brand, colors, fonts, radius, space } from '@/theme';

type Val = 'yes' | 'no' | 'unknown';
interface Row { key: string; icon: string; name_ar: string; name_en: string; value: Val; note: string; hint: string | null; warn: string | null }

const toVal = (b: boolean | null | undefined): Val => (b === true ? 'yes' : b === false ? 'no' : 'unknown');
const toBool = (v: Val) => (v === 'yes' ? true : v === 'no' ? false : null);

export default function EditServices() {
  const { gym, chain } = useLocalSearchParams<{ gym?: string; chain?: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (gym) {
      setAllowed(await canManageGymOrChain(String(gym)));
      const s = await loadGymServices(String(gym));
      setRows(s.map((x) => ({
        key: x.key, icon: x.icon, name_ar: x.name_ar, name_en: x.name_en,
        value: x.source === 'gym' ? toVal(x.available) : 'unknown', note: x.source === 'gym' ? x.note ?? '' : '',
        hint: x.source && x.source !== 'gym' && x.available != null ? t('services.chainSays', { v: x.available ? t('services.yes') : t('services.no') }) : null,
        warn: x.available === true && x.no_votes > 0 ? t('services.flagged', { count: x.no_votes }) : x.available === false && x.yes_votes > 0 ? t('services.confirmedByN', { count: x.yes_votes }) : null,
      })));
    } else if (chain) {
      setAllowed(await canManageChain(String(chain)));
      const s = await loadChainServices(String(chain));
      setRows(s.map((x) => ({
        key: x.key, icon: x.icon, name_ar: x.name_ar, name_en: x.name_en, value: toVal(x.chain_default), note: x.note ?? '',
        hint: x.branches ? t('services.inBranches', { yes: x.branches_yes, count: x.branches }) : null, warn: null,
      })));
    }
  }, [gym, chain, t]);
  useFocusEffect(useCallback(() => { load().catch(() => setRows([])); }, [load]));

  const save = async (r: Row, value: Val, note: string) => {
    setRows((rs) => rs?.map((x) => (x.key === r.key ? { ...x, value, note } : x)) ?? rs);
    try {
      if (gym) await saveGymService(String(gym), r.key, toBool(value), note);
      else if (chain) await saveChainService(String(chain), r.key, toBool(value), note);
    } catch (e) { Alert.alert(t(errorKey(e))); load(); }
  };

  if (rows === null || allowed === null) return <Loading />;
  if (!allowed) return <Screen><Empty icon="lock-closed-outline" text={t('services.noAccess')} /></Screen>;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: chain ? t('services.editChainTitle') : t('services.editTitle') }} />
      <T size="sm" muted>{chain ? t('services.editChainHint') : t('services.editHint')}</T>
      {rows.map((r) => (
        <Card key={r.key} style={{ gap: space.sm }}>
          <Row gap={space.sm}>
            <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(241,85,29,0.10)' }}>
              <ServiceIcon icon={r.icon} size={18} color={brand.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <T semibold>{serviceName(r, lng)}</T>
              {r.hint ? <T size="xs" muted>{r.hint}</T> : null}
            </View>
          </Row>
          <Segmented<Val> value={r.value} onChange={(v) => save(r, v, r.note)} options={[
            { value: 'yes', label: t('services.yes') }, { value: 'no', label: t('services.no') }, { value: 'unknown', label: t('services.unknown') },
          ]} />
          {r.value === 'yes' || r.key === 'other' ? (
            <TextInput defaultValue={r.note} maxLength={120} placeholder={r.key === 'other' ? t('services.otherPh') : t('services.notePh')} placeholderTextColor={colors.muted}
              onEndEditing={(e) => { const v = e.nativeEvent.text; if (v !== r.note) save(r, r.key === 'other' && r.value === 'unknown' && v.trim() ? 'yes' : r.value, v); }}
              style={{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: 10, color: colors.text, fontFamily: fonts.regular, fontSize: 14, textAlign: 'auto' }} />
          ) : null}
          {r.warn ? <T size="xs" color={brand.orange}>{r.warn}</T> : null}
        </Card>
      ))}
    </Screen>
  );
}
