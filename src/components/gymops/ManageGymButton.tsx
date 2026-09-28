// زر «إدارة النادي» في صفحة النادي: يظهر للمدير والاستقبال فقط
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { isGymStaff } from '@/lib/gymops';

export function ManageGymButton({ gymId }: { gymId: string }) {
  const { t } = useTranslation();
  const [ok, setOk] = useState(false);
  useEffect(() => { isGymStaff(gymId).then(setOk).catch(() => {}); }, [gymId]);
  if (!ok) return null;
  return <Button small variant="secondary" icon="business-outline" title={t('gymops.manageGym')} onPress={() => router.push({ pathname: '/manage/[gymId]', params: { gymId } })} />;
}
