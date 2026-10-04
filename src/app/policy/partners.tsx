// سياسة تسجيل الشركاء: الأندية والمتاجر والمطاعم والملاعب والاستوديوهات ومراكز الاستشفاء
// (التجربة المجانية ٣ أشهر، وبعدها عمولة ١٠٪ على الطلبات اللي تجي عن طريق أرك، ورسوم خدمة ٢٫٥٪ على المشتري)
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PolicyPage } from '@/components/policy/PolicyPage';
import { Button } from '@/components/ui';

export default function PartnerPolicy() {
  const { t } = useTranslation();
  return (
    <PolicyPage ns="partnerPolicy"
      footer={<Button small variant="secondary" icon="lock-closed-outline" title={t('partnerPolicy.privacyLink')} onPress={() => router.push('/policy/privacy')} />} />
  );
}
