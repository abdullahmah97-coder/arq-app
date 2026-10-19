// دعوة «مين تشجع؟» لمن ما اختار فريقه: بطاقة في صفحة الدوري تختار منها بضغطة على شعار الفريق،
// وسطر صغير في مربع الرئيسية. مو إجبارية: «لاحقاً» يخفيها من المكانين على هالجهاز،
// ويقدر يختار بعدين من «فريقي» في صفحة الدوري أو من صفحة التوقعات.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { NT } from '@/components/pulse/widgets';
import { T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { seasonTeams, setMyTeam, teamName, type LeagueData } from '@/lib/league';
import { enablePush } from '@/lib/push';
import { brand, colors, radius, space } from '@/theme';
import { TeamBadge } from './LeagueParts';

const KEY = 'arq.league.teamInvite.hidden';
let hiddenCache: boolean | null = null;
const listeners = new Set<(v: boolean) => void>();
const announce = (v: boolean) => { hiddenCache = v; listeners.forEach((f) => f(v)); };

/** هل أخفى الدعوة على هالجهاز؟ null = للحين نقرأ (ما نعرضها لين نعرف) */
function useInviteHidden(): [boolean | null, () => void] {
  const [hidden, setHidden] = useState<boolean | null>(hiddenCache);
  useEffect(() => {
    listeners.add(setHidden);
    if (hiddenCache == null) {
      AsyncStorage.getItem(KEY).then((v) => announce(v === '1')).catch(() => announce(false));
    } else {
      setHidden(hiddenCache);
    }
    return () => { listeners.delete(setHidden); };
  }, []);
  const hide = () => {
    announce(true);
    AsyncStorage.setItem(KEY, '1').catch(() => {});
  };
  return [hidden, hide];
}

/** بطاقة صفحة الدوري. mine = فريقه (null = بدون فريق، undefined = ما ندري للحين: ما نعرض شي) */
export function TeamInviteCard({ data, mine, lng, onPicked }: {
  data: LeagueData; mine: number | null | undefined; lng: string; onPicked: (teamId: number) => void;
}) {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [hidden, hide] = useInviteHidden();
  const [busy, setBusy] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  if (picked != null) {
    const name = teamName(data.teams.get(picked), lng);
    return (
      <View style={[box, { borderColor: colors.border }]} accessibilityLiveRegion="polite">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <TeamBadge team={data.teams.get(picked)} lng={lng} size={40} />
          <T size="sm" semibold style={{ flex: 1, lineHeight: 21 }}>{t('league.inviteDone', { team: name })}</T>
          <Pressable onPress={() => setPicked(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('league.inviteOk')}>
            <T size="sm" semibold color={brand.orange}>{t('league.inviteOk')}</T>
          </Pressable>
        </View>
      </View>
    );
  }
  if (mine !== null || hidden !== false) return null;
  const teams = seasonTeams(data.teams, data.matches, data.standings, lng);
  if (!teams.length) return null;

  const pick = async (id: number) => {
    setBusy(id);
    try {
      await setMyTeam(userId, id);
      enablePush(true).catch(() => {});
      setPicked(id);
      onPicked(id);
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={box}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: brand.amber, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="star" size={20} color={brand.deepGreen} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T semibold>{t('league.inviteTitle')}</T>
          <T size="xs" muted style={{ lineHeight: 18 }}>{t('league.inviteBody')}</T>
        </View>
        <Pressable onPress={hide} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('league.inviteLater')}
          style={({ pressed }) => [{ paddingVertical: 4, paddingHorizontal: 6 }, pressed && { opacity: 0.6 }]}>
          <T size="xs" semibold muted>{t('league.inviteLater')}</T>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}>
        {teams.map((x) => {
          const name = teamName(x, lng);
          return (
            <Pressable key={x.id} onPress={() => pick(x.id)} disabled={busy != null} accessibilityRole="button"
              accessibilityLabel={t('league.invitePick', { team: name })}
              style={({ pressed }) => [{ width: 66, alignItems: 'center', gap: 4, paddingVertical: 4 },
                busy != null && busy !== x.id && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
              <View>
                <TeamBadge team={x} lng={lng} size={46} />
                {busy === x.id ? (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 23, backgroundColor: 'rgba(10,51,45,0.45)',
                    alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color={brand.cream} size="small" />
                  </View>
                ) : null}
              </View>
              <T size="xs" center numberOfLines={1} style={{ width: 66 }}>{name}</T>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** سطر مربع الرئيسية: يفتح «فريقي»، و ✕ يخفيه (ويخفي بطاقة صفحة الدوري بعد) */
export function TeamInviteRow({ mine }: { mine: number | null | undefined }) {
  const { t } = useTranslation();
  const [hidden, hide] = useInviteHidden();
  if (mine !== null || hidden !== false) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(248,237,218,0.12)', borderRadius: 12,
      borderWidth: 1, borderColor: 'rgba(254,169,79,0.45)', paddingStart: 10, paddingEnd: 4, paddingVertical: 4 }}>
      <Pressable onPress={() => router.push('/league/team')} accessibilityRole="button" accessibilityLabel={t('league.inviteHome')}
        style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }, pressed && { opacity: 0.7 }]}>
        <Ionicons name="star-outline" size={14} color={brand.amber} />
        <NT size={12} semibold color={brand.cream} numberOfLines={1} style={{ flex: 1 }}>{t('league.inviteHome')}</NT>
      </Pressable>
      <Pressable onPress={hide} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('league.inviteLater')}
        style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.6 }]}>
        <Ionicons name="close" size={15} color={brand.sand} />
      </Pressable>
    </View>
  );
}

const box = { backgroundColor: colors.card, borderWidth: 1.5, borderColor: brand.amber, borderRadius: radius.lg, padding: space.md, gap: space.md } as const;
