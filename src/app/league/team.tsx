// «فريقي»: تختار فريقك، ونذكّرك قبل كل مباراة له ونرسل لك نتيجتها أول ما تخلص
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { TeamBadge } from '@/components/league/LeagueParts';
import { Button, Card, Empty, Loading, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { loadLeague, myTeam, setMyTeam, teamName, type LeagueTeam } from '@/lib/league';
import { enablePush } from '@/lib/push';
import { brand, colors, radius, space } from '@/theme';

export default function PickTeam() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [teams, setTeams] = useState<LeagueTeam[] | null>(null);
  const [mine, setMine] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | 'none' | null>(null);

  useEffect(() => {
    Promise.all([loadLeague(), myTeam().catch(() => null)]).then(([d, team]) => {
      // فرق الموسم الحالي بس (من المباريات أو الترتيب)
      const ids = new Set<number>([...d.matches.flatMap((m) => [m.home_id, m.away_id]), ...d.standings.map((s) => s.team_id)]);
      const list = [...d.teams.values()].filter((x) => ids.has(x.id));
      list.sort((a, b) => teamName(a, lng).localeCompare(teamName(b, lng), lng === 'en' ? 'en' : 'ar'));
      setTeams(list); setMine(team);
    }).catch(() => setTeams([]));
  }, [lng]);

  const pick = async (id: number | null) => {
    setBusy(id ?? 'none');
    try {
      await setMyTeam(userId, id);
      setMine(id);
      if (id != null) enablePush(true).catch(() => {});
      router.back();
    } catch { Alert.alert(t('errors.generic')); } finally { setBusy(null); }
  };

  if (!teams) return <Loading />;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('league.pickTeam') }} />
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="notifications-outline" size={18} color={colors.primary} />
          <T semibold>{t('league.pickTitle')}</T>
        </View>
        <T size="sm" muted style={{ lineHeight: 21 }}>{t('league.pickBody')}</T>
      </Card>
      {teams.length ? (
        <View style={{ gap: space.sm }}>
          {teams.map((x) => {
            const on = x.id === mine;
            return (
              <Pressable key={x.id} onPress={() => pick(x.id)} disabled={busy != null} accessibilityRole="radio" accessibilityState={{ checked: on }}
                accessibilityLabel={teamName(x, lng)}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg,
                  borderWidth: on ? 2 : 1, borderColor: on ? brand.orange : colors.border, backgroundColor: colors.card }, pressed && { opacity: 0.85 }]}>
                <TeamBadge team={x} lng={lng} size={36} />
                <T semibold style={{ flex: 1 }}>{teamName(x, lng)}</T>
                {busy === x.id ? <Ionicons name="hourglass-outline" size={18} color={colors.muted} />
                  : on ? <Ionicons name="checkmark-circle" size={22} color={brand.orange} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : <Empty icon="football-outline" text={t('league.noData')} />}
      {mine != null ? <Button variant="secondary" icon="close-circle-outline" title={t('league.noTeam')} loading={busy === 'none'} onPress={() => pick(null)} /> : null}
    </Screen>
  );
}
