// خدمات الفرع في صفحة النادي: شبكة أيقونات للمتوفر، سطر لغير المتوفر، وتأكيد الزوار (موجودة / مو موجودة)
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Card, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { canManageGymOrChain, loadChainServices, loadGymServices, serviceName, voteService, type ChainService, type GymService } from '@/lib/services';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

type Mci = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function ServiceIcon({ icon, size = 22, color = brand.deepGreen }: { icon: string; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={icon as Mci} size={size} color={color} />;
}

export function GymServices({ gymId }: { gymId: string }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [items, setItems] = useState<GymService[] | null>(null);
  const [manage, setManage] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(() => { loadGymServices(gymId).then(setItems).catch(() => setItems([])); }, [gymId]);
  useEffect(() => { load(); canManageGymOrChain(gymId).then(setManage).catch(() => {}); }, [gymId, load]);

  if (!items) return null;
  const yes = items.filter((s) => s.available === true && s.key !== 'other');
  const no = items.filter((s) => s.available === false);
  const other = items.find((s) => s.key === 'other' && s.available && s.note);
  const unknown = items.filter((s) => s.available === null && s.key !== 'other');
  const fromChain = yes.some((s) => s.source === 'public_info' || s.source === 'manager' || s.source === 'admin');
  const sel = picked ? items.find((s) => s.key === picked) ?? null : null;

  const vote = async (v: boolean) => {
    if (!sel) return;
    try {
      await voteService(userId, gymId, sel.key, sel.my_vote === v ? null : v);
      load();
    } catch (e) { Alert.alert(t(errorKey(e))); }
  };

  return (
    <Card style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size="lg" bold>{t('services.title')}</T>
        {manage ? (
          <Pressable onPress={() => router.push({ pathname: '/clubs/services', params: { gym: gymId } })} hitSlop={8} accessibilityRole="button">
            <T size="sm" semibold color={colors.primary}>{t('services.edit')}</T>
          </Pressable>
        ) : null}
      </Row>

      {yes.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {yes.map((s) => (
            <Pressable key={s.key} onPress={() => { setPicked(picked === s.key ? null : s.key); setAsking(false); }} accessibilityRole="button"
              accessibilityLabel={serviceName(s, lng)}
              style={{ width: '31.5%', alignItems: 'center', gap: 4, paddingVertical: space.sm, paddingHorizontal: 4, borderRadius: radius.lg,
                backgroundColor: picked === s.key ? brand.sand : colors.bg, borderWidth: 1, borderColor: picked === s.key ? brand.orange : colors.border }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(241,85,29,0.10)' }}>
                <ServiceIcon icon={s.icon} size={22} color={brand.orange} />
              </View>
              <T size="xs" semibold center numberOfLines={2}>{serviceName(s, lng)}</T>
              {s.note ? <T size="xs" muted center numberOfLines={2} style={{ fontSize: 10, lineHeight: 14 }}>{s.note}</T> : null}
              {s.yes_verified ? <T size="xs" center color={colors.success} style={{ fontSize: 10 }}>{t('services.confirmedN', { count: s.yes_verified })}</T> : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <T size="sm" muted>{t('services.none')}</T>
      )}

      {other ? <T size="sm"><T size="sm" semibold>{t('services.other')}: </T>{other.note}</T> : null}
      {no.length ? <T size="xs" muted>{t('services.notAvailable')}: {no.map((s) => serviceName(s, lng)).join('، ')}</T> : null}
      {fromChain ? <T size="xs" muted>{t('services.chainInfoNote')}</T> : null}

      {sel ? (
        <View style={{ gap: space.sm, backgroundColor: colors.bg, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border }}>
          <T size="sm" semibold>{t('services.askIsThere', { name: serviceName(sel, lng) })}</T>
          <Row gap={space.sm}>
            <VoteBtn active={sel.my_vote === true} icon="check" label={t('services.yesThere')} count={sel.yes_votes} onPress={() => vote(true)} />
            <VoteBtn active={sel.my_vote === false} icon="close" label={t('services.notThere')} count={sel.no_votes} onPress={() => vote(false)} />
          </Row>
          <T size="xs" muted>{t('services.voteHint')}</T>
        </View>
      ) : null}

      {unknown.length ? (
        asking ? (
          <View style={{ gap: space.sm }}>
            <T size="sm" semibold>{t('services.helpTitle')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {unknown.map((s) => (
                <Pressable key={s.key} onPress={() => setPicked(s.key)} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                    borderWidth: 1, borderColor: picked === s.key ? brand.orange : colors.border, backgroundColor: s.my_vote != null ? brand.sand : colors.card }}>
                  <ServiceIcon icon={s.icon} size={14} color={colors.muted} />
                  <T size="xs">{serviceName(s, lng)}</T>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setAsking(true)} accessibilityRole="button" hitSlop={6}>
            <T size="sm" semibold color={colors.primary}>{t('services.helpCta')}</T>
          </Pressable>
        )
      ) : null}
    </Card>
  );
}

function VoteBtn({ active, icon, label, count, onPress }: { active: boolean; icon: Mci; label: string; count: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 999,
        backgroundColor: active ? brand.deepGreen : colors.card, borderWidth: 1, borderColor: active ? brand.deepGreen : colors.border }}>
      <MaterialCommunityIcons name={icon} size={16} color={active ? brand.cream : colors.text} />
      <T size="sm" semibold color={active ? brand.cream : colors.text}>{label}</T>
      {count ? <T size="xs" color={active ? brand.sand : colors.muted}>({count})</T> : null}
    </Pressable>
  );
}

/** ملخص خدمات السلسلة: كل خدمة متوفرة وفي كم فرع */
export function ChainServicesCard({ chainId, manage }: { chainId: string; manage?: boolean }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [items, setItems] = useState<ChainService[] | null>(null);
  useEffect(() => { loadChainServices(chainId).then(setItems).catch(() => setItems([])); }, [chainId]);
  if (!items) return null;
  const shown = items.filter((s) => s.key !== 'other' && (s.branches_yes > 0 || s.chain_default === true));
  if (!shown.length && !manage) return null;
  return (
    <Card style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size="lg" bold>{t('services.title')}</T>
        {manage ? (
          <Pressable onPress={() => router.push({ pathname: '/clubs/services', params: { chain: chainId } })} hitSlop={8} accessibilityRole="button">
            <T size="sm" semibold color={colors.primary}>{t('services.edit')}</T>
          </Pressable>
        ) : null}
      </Row>
      {shown.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {shown.map((s) => (
            <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}>
              <ServiceIcon icon={s.icon} size={16} color={brand.orange} />
              <T size="xs" semibold>{serviceName(s, lng)}</T>
              <T size="xs" muted>{s.branches && s.branches_yes && s.branches_yes < s.branches ? t('services.inSomeBranches', { yes: s.branches_yes, count: s.branches }) : t('services.allBranches')}</T>
            </View>
          ))}
        </View>
      ) : <T size="sm" muted>{t('services.none')}</T>}
      <T size="xs" muted>{t('services.chainVaries')}</T>
    </Card>
  );
}
