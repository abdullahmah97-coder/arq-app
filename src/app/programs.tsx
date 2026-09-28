// برامج جاهزة: برامج ARQ + برامج ينشرها أصحاب الرتب العالية في المجتمع
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { ProgramBody } from '@/components/ProgramBody';
import { ProgramCard } from '@/components/social/cards';
import { Button, Empty, Row, Screen, Segmented, T } from '@/components/ui';
import { PROGRAMS } from '@/content/programs';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { canPublish } from '@/lib/ranks';
import { loadPrograms, type UserProgram } from '@/lib/social';
import { brand, radius, space } from '@/theme';

export default function Programs() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const { plan, profile } = useUser();
  const [src, setSrc] = useState<'arq' | 'community'>('arq');
  const [open, setOpen] = useState<string | null>(PROGRAMS[0]?.id ?? null);
  const [community, setCommunity] = useState<UserProgram[] | null>(null);

  useEffect(() => { if (src === 'community' && !community) loadPrograms({ limit: 40 }).then(setCommunity).catch(() => setCommunity([])); }, [src, community]);

  return (
    <Screen edges={['bottom']}>
      <Segmented value={src} onChange={setSrc} options={[{ value: 'arq', label: t('social.arqPrograms') }, { value: 'community', label: t('social.communityPrograms') }]} />

      {src === 'arq' ? (
        <>
          <T muted style={{ lineHeight: 24 }}>{t('programs.intro')}</T>
          {PROGRAMS.map((p) => {
            const active = plan?.data.program?.id === p.id;
            const expanded = open === p.id;
            return (
              <View key={p.id} style={{ gap: space.md }}>
                <Pressable onPress={() => setOpen(expanded ? null : p.id)}>
                  <ImageBackground source={require('../../assets/imagery/run-sand.jpg')} style={styles.hero} imageStyle={{ borderRadius: 20 }} contentFit="cover">
                    <LinearGradient colors={['rgba(10,51,45,0.2)', 'rgba(10,51,45,0.95)']} style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />
                    <View style={{ flex: 1, justifyContent: 'flex-end', padding: space.lg, gap: 6 }}>
                      <Row gap={6} style={{ flexWrap: 'wrap' }}>
                        <Tag text={t('programs.days', { n: p.daysPerWeek, count: p.daysPerWeek })} />
                        <Tag text={t(`onboarding.level_${p.level}`)} />
                        {p.audience !== 'all' ? <Tag text={t(`programs.for_${p.audience}`)} /> : null}
                        {active ? <Tag text={t('programs.active')} strong /> : null}
                      </Row>
                      <T size="xl" bold color={brand.cream}>{L(p.name)}</T>
                      <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{L(p.summary)}</T>
                    </View>
                  </ImageBackground>
                </Pressable>
                {expanded ? <ProgramBody p={p} /> : null}
              </View>
            );
          })}
        </>
      ) : (
        <>
          <T muted style={{ lineHeight: 24 }}>{t('social.communityIntro')}</T>
          {canPublish('program', profile) ? (
            <Button title={t('social.newProgram')} icon="add-circle-outline" variant="secondary" onPress={() => router.push('/program/new')} />
          ) : null}
          {community === null ? null : community.length
            ? community.map((p) => <ProgramCard key={p.id} p={p} />)
            : <Empty icon="barbell-outline" text={t('social.noCommunityPrograms')} />}
        </>
      )}
    </Screen>
  );
}

function Tag({ text, strong }: { text: string; strong?: boolean }) {
  return (
    <View style={{ backgroundColor: strong ? brand.orange : 'rgba(248,237,218,0.18)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <T size="xs" semibold color={brand.cream}>{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 260, borderRadius: 20, overflow: 'hidden' },
});
