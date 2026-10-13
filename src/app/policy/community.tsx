// إرشادات المجتمع: وش مسموح في المنشورات والتعليقات والرسائل، وكيف تبلّغ وتحظر، ووش يصير للمخالف
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PolicyPage } from '@/components/policy/PolicyPage';
import { Button } from '@/components/ui';
import { space } from '@/theme';

export default function CommunityGuidelines() {
  const { t } = useTranslation();
  return (
    <PolicyPage ns="communityGuidelines" footer={
      <View style={{ gap: space.sm }}>
        <Button small variant="secondary" icon="ban-outline" title={t('safety.blockedListTitle')} onPress={() => router.push('/blocked')} />
      </View>
    } />
  );
}
