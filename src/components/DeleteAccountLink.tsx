// رابط «حذف الحساب» مع التأكيد (شاشة الانتظار والملف الشخصي).
// وهو يحذف يطلع «جارٍ حذف الحساب…» وما ينضغط مرة ثانية: الضغطة الثانية كانت تبدأ حذف ثاني
// يفشل بعد ما ينحذف الحساب، وتطلّع «صار خطأ» مع إن الحساب انحذف.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { Row, T } from '@/components/ui';
import { deleteMyAccount } from '@/lib/account';
import { errorKey } from '@/lib/supabase';
import { colors, space } from '@/theme';

export function DeleteAccountLink({ userId }: { userId?: string | null }) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  const remove = () => {
    if (!userId) return;
    setDeleting(true);
    // لو نجح الحذف يطلع المستخدم من التطبيق، فالرابط يرجع بس لو فشل
    deleteMyAccount(userId).catch((e) => {
      setDeleting(false);
      Alert.alert(t(errorKey(e)));
    });
  };
  const confirm = () => Alert.alert(t('profile.deleteAccount'), t('profile.deleteConfirm'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('profile.deleteYes'), style: 'destructive', onPress: remove },
  ]);

  return (
    <Pressable onPress={confirm} disabled={deleting || !userId} accessibilityRole="button"
      accessibilityState={{ busy: deleting, disabled: deleting }} hitSlop={8} style={{ paddingVertical: space.sm }}>
      {deleting ? (
        <Row gap={space.xs} style={{ justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={colors.danger} />
          <T size="sm" color={colors.danger}>{t('profile.deleting')}</T>
        </Row>
      ) : (
        <T size="sm" center color={colors.danger}>{t('profile.deleteAccount')}</T>
      )}
    </Pressable>
  );
}
