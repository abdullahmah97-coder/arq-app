// لو صار خطأ داخل صفحة: نعرض رسالة ودّية بدل ما ينقفل التطبيق، ونسجّل الخطأ للمالك.
// يلفّ كل صفحة في الـ Stack والتبويبات (screenLayout)، فرأس الصفحة وزر الرجوع يبقون شغّالين.
import { Ionicons } from '@expo/vector-icons';
import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, T } from '@/components/ui';
import { errorDetail, logEvent } from '@/lib/events';
import { goBackOrHome } from '@/lib/nav';
import { brand, colors, space } from '@/theme';

function Fallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: colors.bg }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="construct-outline" size={32} color={brand.orange} />
      </View>
      <T bold center>{t('errors.screenTitle')}</T>
      <T size="sm" muted center style={{ lineHeight: 22 }}>{t('errors.screenHint')}</T>
      <View style={{ alignSelf: 'stretch', gap: space.sm, marginTop: space.sm }}>
        <Button title={t('common.retry')} icon="refresh" onPress={onRetry} />
        <Button title={t('common.back')} variant="ghost" onPress={goBackOrHome} />
      </View>
    </View>
  );
}

export class ScreenErrorBoundary extends Component<{ children: ReactNode; name?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    logEvent('screen_error', { ...errorDetail(error), screen: this.props.name ?? null });
  }

  render() {
    if (this.state.error) return <Fallback onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
