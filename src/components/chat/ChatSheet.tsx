// قائمة خيارات من تحت (مثل الواتساب): للضغطة المطوّلة على رسالة أو محادثة، وتأكيد الحذف
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { T, type IconName } from '@/components/ui';
import { colors, space } from '@/theme';

export interface SheetAction {
  key: string;
  label: string;
  icon?: IconName;
  /** أحمر (حذف) */
  destructive?: boolean;
  onPress: () => void;
}

export function ChatSheet({ visible, title, subtitle, preview, actions, onClose }: {
  visible: boolean; title?: string; subtitle?: string;
  /** معاينة الرسالة اللي ضغطت عليها (فوق الخيارات) */
  preview?: ReactNode;
  actions: SheetAction[]; onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel={t('common.close')}
        style={{ flex: 1, backgroundColor: 'rgba(6,31,27,0.45)', justifyContent: 'flex-end' }}>
        {preview ? <View pointerEvents="none" style={{ paddingHorizontal: space.lg, marginBottom: space.md }}>{preview}</View> : null}
        <Pressable onPress={() => {}} accessible={false}>
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: space.sm }}>
            <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.sm }} />
            {title || subtitle ? (
              <View style={{ paddingHorizontal: space.xl, paddingBottom: space.sm, gap: 4 }}>
                {title ? <T bold center>{title}</T> : null}
                {subtitle ? <T size="sm" muted center style={{ lineHeight: 21 }}>{subtitle}</T> : null}
              </View>
            ) : null}
            {actions.map((a) => (
              <Pressable key={a.key} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.label}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: 14,
                  borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: pressed ? colors.cardAlt : 'transparent' })}>
                {a.icon ? <Ionicons name={a.icon} size={21} color={a.destructive ? colors.danger : colors.text} /> : null}
                <T semibold color={a.destructive ? colors.danger : colors.text} style={{ flex: 1 }}>{a.label}</T>
              </Pressable>
            ))}
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('chat.cancel')}
              style={({ pressed }) => ({ alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: pressed ? colors.cardAlt : 'transparent' })}>
              <T semibold muted>{t('chat.cancel')}</T>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
