// إرشادات المجتمع: يوافق عليها المستخدم مرة وحدة قبل أول منشور أو تعليق (شرط App Store رقم 1.2:
// شروط واضحة إن ما فيه تسامح مع المحتوى المسيء أو المستخدمين المسيئين)
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Row, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { acceptGuidelines } from '@/lib/safety';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

type Rule = { icon: keyof typeof Ionicons.glyphMap; text: string };

/** const { ensure, modal } = useGuidelinesGate();  ثم  if (!(await ensure())) return;  و{modal} داخل الشاشة */
export function useGuidelinesGate() {
  const { t } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const accepted = !!profile?.guidelines_at;

  const ensure = useCallback((): Promise<boolean> => {
    if (accepted) return Promise.resolve(true);
    setOpen(true);
    return new Promise<boolean>((res) => { resolver.current = res; });
  }, [accepted]);

  const finish = (ok: boolean) => { setOpen(false); resolver.current?.(ok); resolver.current = null; };
  const modal = (
    <GuidelinesModal visible={open} onClose={() => finish(false)}
      onAccept={async () => {
        try { await acceptGuidelines(); await refreshProfile(); finish(true); }
        catch (e) { Alert.alert(t(errorKey(e))); }
      }} />
  );
  return { ensure, modal };
}

function GuidelinesModal({ visible, onAccept, onClose }: { visible: boolean; onAccept: () => Promise<void>; onClose: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const rules = t('safety.rules', { returnObjects: true }) as Rule[];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(6,31,27,0.45)', justifyContent: 'flex-end' }}>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '88%' }}>
          <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.md }}>
            <Row gap={space.sm}>
              <Ionicons name="people-circle-outline" size={28} color={brand.deepGreen} />
              <T size="lg" bold style={{ flex: 1 }}>{t('safety.gateTitle')}</T>
            </Row>
            <T size="sm" style={{ lineHeight: 22 }}>{t('safety.gateIntro')}</T>
            {Array.isArray(rules) ? rules.map((r) => (
              <Row key={r.text} gap={space.sm} style={{ alignItems: 'flex-start' }}>
                <Ionicons name={r.icon} size={18} color={brand.deepGreen} style={{ marginTop: 2 }} />
                <T size="sm" style={{ flex: 1, lineHeight: 22 }}>{r.text}</T>
              </Row>
            )) : null}
            <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md }}>
              <T size="sm" semibold style={{ lineHeight: 22 }}>{t('safety.gateZero')}</T>
            </View>
            <Pressable onPress={() => { onClose(); router.push('/policy/community'); }} accessibilityRole="link" hitSlop={6}>
              <T size="sm" semibold color={colors.primary}>{t('safety.gateReadAll')}</T>
            </Pressable>
            <Button title={t('safety.gateAccept')} icon="checkmark" loading={busy}
              onPress={async () => { setBusy(true); try { await onAccept(); } finally { setBusy(false); } }} />
            <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
