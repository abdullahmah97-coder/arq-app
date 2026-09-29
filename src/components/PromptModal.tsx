// نافذة إدخال بسيطة (تشتغل على آيفون وأندرويد والويب بدل Alert.prompt): حقل أو أكثر وزر تأكيد
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View, type KeyboardTypeOptions } from 'react-native';
import { Button, Input, Row, T } from '@/components/ui';
import { colors, radius, space } from '@/theme';

export interface PromptField {
  key: string; label?: string; placeholder?: string; keyboardType?: KeyboardTypeOptions; multiline?: boolean; maxLength?: number;
  initial?: string; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

type Props = {
  visible: boolean; title: string; message?: string; fields: PromptField[]; confirm?: string; danger?: boolean;
  onSubmit: (v: Record<string, string>) => Promise<void> | void; onClose: () => void;
};

export function PromptModal(props: Props) {
  // كل فتح (أو تغيّر الحقول) يبدأ بقيم جديدة: نعيد تركيب المحتوى بمفتاح بدل ما نصفّر الحالة داخل effect
  const key = `${props.visible}|${props.fields.map((f) => f.key + (f.initial ?? '')).join('|')}`;
  return <PromptBody key={key} {...props} />;
}

function PromptBody({ visible, title, message, fields, confirm, danger, onSubmit, onClose }: Props) {
  const { t } = useTranslation();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.initial ?? ''])));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onSubmit(v); } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: space.lg }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.bg, borderRadius: radius.lg, padding: space.lg, gap: space.md }}>
            <T bold size="lg">{title}</T>
            {message ? <T size="sm" muted style={{ lineHeight: 21 }}>{message}</T> : null}
            {fields.map((f) => (
              <Input key={f.key} label={f.label} placeholder={f.placeholder} keyboardType={f.keyboardType} multiline={f.multiline}
                maxLength={f.maxLength ?? (f.multiline ? 300 : 80)} autoCapitalize={f.autoCapitalize}
                style={f.multiline ? { minHeight: 80, textAlignVertical: 'top' } : undefined}
                value={v[f.key] ?? ''} onChangeText={(x) => setV((o) => ({ ...o, [f.key]: x }))} />
            ))}
            <Row gap={space.sm}>
              <View style={{ flex: 1 }}><Button title={confirm ?? t('common.save')} variant={danger ? 'danger' : 'primary'} loading={busy} onPress={submit} /></View>
              <Button variant="ghost" title={t('common.cancel')} onPress={onClose} />
            </Row>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
