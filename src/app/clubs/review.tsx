// قيّم النادي: نجوم عامة + تفاصيل (النظافة، الأجهزة، الزحمة، المدربين، التعامل) — لازم زيارة مسجّلة للنادي أو نفس السلسلة
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { STAR } from '@/components/clubs/parts';
import { Button, Card, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { deleteReview } from '@/lib/clubs';
import { goBackOrHome } from '@/lib/nav';
import { errorKey } from '@/lib/supabase';
import { FACETS, loadReviewsFull, saveFullReview, type Facet } from '@/lib/trust';
import { colors, fonts, space } from '@/theme';

export default function RateClub() {
  const { gym, name } = useLocalSearchParams<{ gym: string; name?: string }>();
  const { t } = useTranslation();
  const { userId } = useUser();
  const [rating, setRating] = useState(0);
  const [facets, setFacets] = useState<Partial<Record<Facet, number>>>({});
  const [body, setBody] = useState('');
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    loadReviewsFull(String(gym)).then((rs) => {
      const m = rs.find((r) => r.is_me);
      if (m) { setRating(m.rating); setBody(m.body ?? ''); setFacets(m.facets); setExists(true); }
    });
  }, [gym]);

  const save = async () => {
    if (!rating) return Alert.alert(t('clubs.pickStars'));
    setBusy(true);
    try { await saveFullReview(userId, String(gym), rating, body, facets); goBackOrHome(); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: name ? t('clubs.rateName', { name }) : t('clubs.rate') }} />
      <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
        <T bold>{t('clubs.howWas')}</T>
        <Row gap={10}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Pressable key={i} onPress={() => setRating(i)} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('clubs.starsA11y', { count: i })}>
              <Ionicons name={rating >= i ? 'star' : 'star-outline'} size={38} color={rating >= i ? STAR : colors.muted} />
            </Pressable>
          ))}
        </Row>
        <T size="sm" muted>{rating ? t(`clubs.star_${rating}`) : ' '}</T>
      </Card>

      {/* التفاصيل (اختيارية) */}
      <Card style={{ gap: space.sm }}>
        <T semibold>{t('trust.facetsTitle')}</T>
        <T size="xs" muted>{t('trust.facetsHint')}</T>
        {FACETS.map((f) => (
          <Row key={f} style={{ justifyContent: 'space-between' }}>
            <T size="sm" style={{ flex: 1 }}>{t(`trust.facet_${f}`)}</T>
            <Row gap={4}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Pressable key={i} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${t(`trust.facet_${f}`)} ${i}`}
                  onPress={() => setFacets((p) => ({ ...p, [f]: p[f] === i ? undefined : i }))}>
                  <Ionicons name={(facets[f] ?? 0) >= i ? 'star' : 'star-outline'} size={22} color={(facets[f] ?? 0) >= i ? STAR : colors.muted} />
                </Pressable>
              ))}
            </Row>
          </Row>
        ))}
      </Card>

      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('clubs.yourComment')}</T>
        <TextInput value={body} onChangeText={setBody} multiline maxLength={500} placeholder={t('clubs.commentPh')} placeholderTextColor={colors.muted}
          style={{ minHeight: 130, textAlignVertical: 'top', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: space.md, color: colors.text, fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, textAlign: 'auto' }} />
        <T size="xs" muted>{t('clubs.reviewRules')}</T>
        <T size="xs" muted>{t('trust.visitRule')}</T>
      </View>
      <Button title={t('clubs.publishReview')} icon="checkmark" loading={busy} onPress={save} />
      {exists ? <Button variant="ghost" title={t('clubs.deleteReview')} icon="trash-outline" onPress={async () => { await deleteReview(userId, String(gym)); goBackOrHome(); }} /> : null}
    </Screen>
  );
}
