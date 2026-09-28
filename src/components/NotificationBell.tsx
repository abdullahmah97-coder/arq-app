// جرس التنبيهات مع عدد غير المقروء (يتحدّث لحظياً)
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useUser } from '@/lib/auth';
import { useUnreadNotifications } from '@/lib/notifications';
import { brand, colors, fonts } from '@/theme';

export function NotificationBell({ color = colors.text, size = 23, ring }: { color?: string; size?: number; ring?: string }) {
  const { t } = useTranslation();
  const { userId } = useUser();
  const n = useUnreadNotifications(userId);
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={n ? t('notif.bell', { n }) : t('notif.title')}
      style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.6 : 1 })}
    >
      <Ionicons name={n ? 'notifications' : 'notifications-outline'} size={size} color={color} />
      {n > 0 ? (
        <View style={{
          position: 'absolute', top: -2, end: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
          backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center',
          borderWidth: 2, borderColor: ring ?? colors.bg,
        }}>
          <Text style={{ color: brand.cream, fontSize: 10, fontFamily: fonts.title, lineHeight: 13 }}>{n > 99 ? '99+' : n}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
