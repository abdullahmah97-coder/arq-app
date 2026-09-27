// أفضل رقم بين الأصدقاء لتمرين واحد (على الخلفية الداكنة): المراكز الثلاثة + رقمك + كم باقي لتتصدر
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { NT, Num } from '@/components/pulse/widgets';
import { fmtSet, liftScore, type FriendBest } from '@/lib/training';
import { brand, night, pulse } from '@/theme';

const MEDAL = ['#FEA94F', '#D9CBB4', '#C98A5B'];

export function verdictFor(rows: FriendBest[], mine: { weight_kg: number; reps: number } | null) {
  const leader = rows.find((r) => !r.is_me);
  if (!leader) return null;
  const top = liftScore(leader.weight_kg, leader.reps);
  const me = mine ? liftScore(mine.weight_kg, mine.reps) : 0;
  if (mine && me >= top) return { kind: 'lead' as const, leader };
  if (mine && mine.weight_kg > 0 && leader.weight_kg > 0) {
    const need = Math.ceil((top / (1 + Math.min(mine.reps, 12) / 30) - mine.weight_kg) * 2) / 2; // لأقرب ½ كجم
    return { kind: 'gap' as const, leader, kg: Math.max(0.5, need) };
  }
  return { kind: 'behind' as const, leader };
}

export function FriendsBest({ rows, mine, compact }: { rows: FriendBest[]; mine: { weight_kg: number; reps: number } | null; compact?: boolean }) {
  const { t } = useTranslation();
  const v = verdictFor(rows, mine);
  if (!v) return null;
  const name = (r: FriendBest) => (r.is_me ? t('presence.you') : (r.full_name || r.username).split(' ')[0]);
  const verdict = v.kind === 'lead' ? t('workout.youLead') : v.kind === 'gap' ? t('workout.gapKg', { kg: v.kg, name: name(v.leader) }) : t('workout.behind', { name: name(v.leader) });
  const vColor = v.kind === 'lead' ? pulse.green : brand.amber;

  if (compact) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(254,169,79,0.08)', borderRadius: 10, padding: 8 }}>
        <Ionicons name="trophy" size={14} color={brand.amber} />
        <NT size={12} muted style={{ flex: 1 }} numberOfLines={2}>
          {t('workout.friendsTop')}: <NT size={12} semibold color={night.text}>{name(v.leader)} {fmtSet(v.leader)}</NT>
          {mine ? <NT size={12} semibold color={vColor}>{'  ·  '}{verdict}</NT> : null}
        </NT>
      </View>
    );
  }

  const top3 = rows.filter((r) => r.place <= 3);
  const meRow = rows.find((r) => r.is_me && r.place > 3);
  return (
    <View style={{ gap: 6 }}>
      {top3.map((r) => (
        <Pressable key={r.user_id} onPress={() => (r.is_me ? null : router.push({ pathname: '/user/[id]', params: { id: r.user_id } }))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
          <View style={{ width: 22, height: 22, borderRadius: 5, transform: [{ rotate: '45deg' }], backgroundColor: MEDAL[r.place - 1], alignItems: 'center', justifyContent: 'center' }}>
            <NT size={11} bold color={brand.deepGreen} style={{ transform: [{ rotate: '-45deg' }] }}>{r.place}</NT>
          </View>
          <NT size={13} semibold={r.is_me} color={r.is_me ? brand.amber : night.text} style={{ flex: 1 }} numberOfLines={1}>{name(r)}</NT>
          <Num size={15} color={r.place === 1 ? brand.amber : night.text}>{fmtSet(r)}</Num>
        </Pressable>
      ))}
      {meRow ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, borderTopWidth: 1, borderTopColor: night.line }}>
          <NT size={12} faint style={{ width: 22, textAlign: 'center' }}>{meRow.place}</NT>
          <NT size={13} semibold color={brand.amber} style={{ flex: 1 }}>{name(meRow)}</NT>
          <Num size={15}>{fmtSet(meRow)}</Num>
        </View>
      ) : null}
      {mine ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Ionicons name={v.kind === 'lead' ? 'flame' : 'trending-up'} size={14} color={vColor} />
          <NT size={12} semibold color={vColor}>{t('workout.todayBest', { set: fmtSet(mine) })} · {verdict}</NT>
        </View>
      ) : null}
    </View>
  );
}
