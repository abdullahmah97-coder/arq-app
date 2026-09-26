// الرتب: كيف تبدأ مبتدئ وترتقي بالالتزام (النقاط) وماذا تفتح كل رتبة
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { Num } from '@/components/pulse/widgets';
import { RankTrack } from '@/components/social/ProfileView';
import { Card, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { POINT_SOURCES, rankProgress, RANKS } from '@/lib/ranks';
import { brand, colors, radius, space } from '@/theme';

export default function Ranks() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const { profile } = useUser();
  const { cur, next, remaining } = rankProgress(profile.points);

  return (
    <Screen edges={['bottom']}>
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, overflow: 'hidden', padding: space.xl, gap: space.sm, alignItems: 'center' }}>
        <SaduPattern variant="chevron" opacity={0.1} />
        <View style={{ width: 64, height: 64, borderRadius: 16, transform: [{ rotate: '45deg' }], backgroundColor: 'rgba(248,237,218,0.14)', borderWidth: 2, borderColor: brand.amber, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={cur.icon} size={28} color={brand.amber} style={{ transform: [{ rotate: '-45deg' }] }} />
        </View>
        <T size="xs" color={brand.sand} style={{ marginTop: space.sm }}>{t('social.yourRank')}</T>
        <T size="xxl" bold color={brand.cream}>{L(cur.name)}</T>
        <Row gap={6}><Num size={30} color={brand.amber}>{profile.points}</Num><T color={brand.sand}>{t('home.points')}</T></Row>
        <T size="sm" color={brand.cream} center>{next ? t('social.toNextSelf', { n: remaining, rank: L(next.name) }) : t('social.maxRank')}</T>
      </BrandGradient>
      <RankTrack points={profile.points} />

      <T size="lg" bold>{t('social.ladder')}</T>
      {RANKS.map((r) => {
        const reached = profile.points >= r.min;
        const isCur = r.level === cur.level;
        const c = r.level === 4 ? brand.amber : r.color;
        return (
          <Card key={r.id} style={[{ gap: space.sm }, isCur && { borderColor: c, borderWidth: 2 }]}>
            <Row>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: reached ? c : colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={reached ? r.icon : 'lock-closed'} size={18} color={reached ? (r.level === 4 ? brand.deepGreen : brand.cream) : colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <T bold>{L(r.name)}{isCur ? ` · ${t('social.youAreHere')}` : ''}</T>
                <T size="xs" muted>{r.min === 0 ? t('social.startHere') : t('social.fromPoints', { n: r.min })}</T>
              </View>
            </Row>
            {r.perks.map((p, i) => (
              <Row key={i} gap={6} style={{ alignItems: 'flex-start' }}>
                <Ionicons name="checkmark" size={16} color={reached ? colors.primary : colors.muted} style={{ marginTop: 3 }} />
                <T size="sm" muted={!reached} style={{ flex: 1 }}>{L(p)}</T>
              </Row>
            ))}
          </Card>
        );
      })}

      <T size="lg" bold>{t('social.howToEarn')}</T>
      <Card style={{ gap: 2 }}>
        {POINT_SOURCES.map((s, i) => (
          <Row key={i} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <Ionicons name={s.icon as any} size={18} color={colors.primary} />
            <T size="sm" style={{ flex: 1 }}>{L(s.label)}</T>
            <T bold color={brand.orange}>+{s.pts}</T>
          </Row>
        ))}
      </Card>
      <T size="xs" muted center>{t('social.coachNote')}</T>
    </Screen>
  );
}
