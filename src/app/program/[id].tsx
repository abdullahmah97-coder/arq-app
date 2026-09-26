// برنامج من المجتمع: صاحبه ورتبته، التمارين، والاعتماد كخطتي (+10 نقاط لصاحبه)
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { ProgramBody } from '@/components/ProgramBody';
import { AuthorRow } from '@/components/social/cards';
import { Empty, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { adoptProgramRpc, deleteProgram, loadProgram, toProgramShape, type UserProgram } from '@/lib/social';
import { brand, radius, space } from '@/theme';

export default function CommunityProgram() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { userId } = useUser();
  const [p, setP] = useState<UserProgram | null | undefined>(undefined);
  useEffect(() => { loadProgram(String(id)).then(setP).catch(() => setP(null)); }, [id]);
  const shape = useMemo(() => (p ? toProgramShape(p) : null), [p]);

  if (p === undefined) return <Loading />;
  if (!p || !shape) return <Screen><Empty text={t('social.programNotFound')} /></Screen>;
  const mine = p.author === userId;

  const remove = () => Alert.alert(t('social.deleteProgram'), '', [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteProgram(p.id); router.back(); } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('social.program'), headerRight: mine ? () => (
        <Pressable onPress={remove} hitSlop={10} accessibilityLabel={t('common.delete')}><Ionicons name="trash-outline" size={20} color={brand.orange} /></Pressable>
      ) : undefined }} />
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, overflow: 'hidden', padding: space.xl, gap: space.sm }}>
        <SaduPattern variant="peaks" opacity={0.1} />
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          <Tag text={t('programs.days', { n: p.days.length })} />
          <Tag text={t(`onboarding.level_${p.level}`)} />
          <Tag text={t('social.adoptsN', { n: p.adopts })} />
        </Row>
        <T size="xl" bold color={brand.cream}>{p.title}</T>
        {p.description ? <T color={brand.sand} style={{ lineHeight: 24 }}>{p.description}</T> : null}
      </BrandGradient>
      <View style={{ paddingHorizontal: space.xs }}>
        <AuthorRow a={p.author_p} sub={t('social.byCoach')} />
      </View>
      <ProgramBody p={shape} onAdopted={async () => { if (!mine) await adoptProgramRpc(p.id); }} />
    </Screen>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: 'rgba(248,237,218,0.16)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <T size="xs" semibold color={brand.cream}>{text}</T>
    </View>
  );
}
