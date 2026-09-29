// «اختصاراتي»: شبكة في الرئيسية وقائمة في حسابي بنفس الأولوية. اضغط مطولاً على أي اختصار لترتيبه أو إخفائه
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, View } from 'react-native';
import { ArrangeSheet } from '@/components/pulse/HomeArrange';
import { NT } from '@/components/pulse/widgets';
import { Row, T, type IconName } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { LONG_PRESS_MS } from '@/lib/homeLayout';
import { HOME_SHORTCUTS, SHORTCUT_IDS, SHORTCUTS, useShortcuts, visibleShortcuts, type ShortcutId } from '@/lib/shortcuts';
import { brand, colors, night, space } from '@/theme';

function useArrange() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const { layout, save } = useShortcuts(userId);
  const [open, setOpen] = useState(false);
  const start = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setOpen(true); };
  const sheet = open ? (
    <ArrangeSheet<ShortcutId> title={t('shortcuts.arrangeTitle')} hint={t('shortcuts.arrangeHint')} order={layout.order} hidden={layout.hidden}
      defaults={SHORTCUT_IDS} meta={(k) => ({ icon: SHORTCUTS[k].icon, label: t(SHORTCUTS[k].label) })} onSave={save} onClose={() => setOpen(false)} />
  ) : null;
  return { layout, start, sheet };
}

/** شبكة الاختصارات في الرئيسية (أول ٨ حسب أولويتك) */
export function HomeShortcuts() {
  const { t } = useTranslation();
  const { layout, start, sheet } = useArrange();
  const list = visibleShortcuts(layout).slice(0, HOME_SHORTCUTS);
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <NT size={15} bold>{t('shortcuts.title')}</NT>
        <Pressable onPress={start} hitSlop={8} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="options-outline" size={14} color={night.accent} />
          <NT size={12} semibold color={night.accent}>{t('shortcuts.arrange')}</NT>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
        {list.map((k) => (
          <Pressable key={k} onPress={() => router.push(SHORTCUTS[k].to as Href)} onLongPress={start} delayLongPress={LONG_PRESS_MS}
            accessibilityRole="button" accessibilityHint={t('shortcuts.a11yHint')}
            style={({ pressed }) => ({ width: '25%', alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: night.card, borderWidth: 1, borderColor: night.line, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={SHORTCUTS[k].icon as IconName} size={22} color={brand.amber} />
            </View>
            <NT size={11} semibold center numberOfLines={2} style={{ paddingHorizontal: 2 }}>{t(SHORTCUTS[k].label)}</NT>
          </Pressable>
        ))}
      </View>
      {sheet}
    </View>
  );
}

/** قائمة الاختصارات في حسابي (كلها، بنفس الترتيب) */
export function ShortcutMenu() {
  const { t } = useTranslation();
  const { layout, start, sheet } = useArrange();
  return (
    <>
      <Row style={{ justifyContent: 'space-between', paddingTop: space.sm }}>
        <T size="sm" bold muted>{t('shortcuts.title')}</T>
        <Pressable onPress={start} hitSlop={8} accessibilityRole="button"><T size="xs" semibold color={colors.primary}>{t('shortcuts.arrangeLong')}</T></Pressable>
      </Row>
      {visibleShortcuts(layout).map((k) => (
        <Pressable key={k} onPress={() => router.push(SHORTCUTS[k].to as Href)} onLongPress={start} delayLongPress={LONG_PRESS_MS}
          accessibilityHint={t('shortcuts.a11yHint')} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Row style={{ paddingVertical: space.md }} gap={space.md}>
            <Ionicons name={SHORTCUTS[k].icon as IconName} size={22} color={colors.primary} />
            <T style={{ flex: 1 }}>{t(SHORTCUTS[k].label)}</T>
            <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
          </Row>
        </Pressable>
      ))}
      {sheet}
    </>
  );
}
