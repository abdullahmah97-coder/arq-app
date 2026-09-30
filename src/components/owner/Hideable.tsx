// المالك (هو بس): يضغط مطوّل على أي جزء من التطبيق ويخفيه عن كل المستخدمين أو يرجّعه.
// المخفي ما يطلع للمستخدمين أبداً، وعند المالك يطلع باهت وعليه «مخفي عن الكل» عشان يرجّعه متى ما بغى.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { ChatSheet, type SheetAction } from '@/components/chat/ChatSheet';
import { T } from '@/components/ui';
import { setPartHidden, useHiddenParts } from '@/lib/appOwner';
import { useUser } from '@/lib/auth';
import { errorKey } from '@/lib/supabase';
import { brand } from '@/theme';

/** أطول من ضغطة الأزرار المطوّلة العادية (٤٥٠ms) عشان ما يتعارض معها */
const OWNER_LONG_MS = 750;
/** وقت آخر ضغطة مسكها جزء داخلي (عشان الجزء اللي براه ما يفتح قائمة ثانية) */
let claimedAt = -1;

/** أنا مالك التطبيق؟ */
export function useOwnerMode(): boolean {
  const { profile } = useUser();
  return !!profile?.is_owner;
}

/** هالجزء مخفي؟ ولمين يطلع: للمالك (باهت) وللمستخدم لا */
export function usePart(id: string) {
  const owner = useOwnerMode();
  const hidden = useHiddenParts().has(id);
  return { owner, hidden, show: !hidden || owner };
}

/** «مخفي عن الكل» فوق الجزء (عند المالك بس) */
export function HiddenTag({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', top: 6, start: 6, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: brand.deepGreen, borderColor: brand.amber, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }, style]}>
      <Ionicons name="eye-off" size={12} color={brand.amber} />
      <T size="xs" semibold color={brand.amber} style={{ fontSize: 11 }}>{t('ownerParts.hiddenTag')}</T>
    </View>
  );
}

/** قائمة المالك للجزء: إخفاء عن الكل / إظهار للكل (+ خيارات زيادة لو فيه) */
export function OwnerPartSheet({ id, label, visible, onClose, extra = [] }: {
  id: string; label: string; visible: boolean; onClose: () => void; extra?: SheetAction[];
}) {
  const { t } = useTranslation();
  const hidden = useHiddenParts().has(id);
  const toggle = async () => {
    onClose();
    try { await setPartHidden(id, label, !hidden); }
    catch (e) { setTimeout(() => Alert.alert(t(errorKey(e))), Platform.OS === 'ios' ? 450 : 60); }
  };
  return (
    <ChatSheet visible={visible} onClose={onClose} title={label}
      subtitle={hidden ? t('ownerParts.isHidden') : t('ownerParts.isShown')}
      actions={[
        hidden
          ? { key: 'show', label: t('ownerParts.show'), icon: 'eye-outline', onPress: toggle }
          : { key: 'hide', label: t('ownerParts.hide'), icon: 'eye-off-outline', destructive: true, onPress: toggle },
        ...extra,
      ]} />
  );
}

/** يفتح قائمة المالك بعد ضغطة مطوّلة على أي مكان في الجزء (بدون ما يوقف أزرار الجزء نفسه) */
export function useOwnerLongPress(onLong: () => void, enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  if (!enabled) return {};
  return {
    onTouchStart: (e: GestureResponderEvent) => {
      clear();
      // الجزء الداخلي أولى (الحدث يوصل له قبل اللي براه)
      if (e.nativeEvent.timestamp === claimedAt) return;
      claimedAt = e.nativeEvent.timestamp;
      start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      timer.current = setTimeout(() => {
        timer.current = null;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onLong();
      }, OWNER_LONG_MS);
    },
    onTouchMove: (e: GestureResponderEvent) => {
      if (Math.hypot(e.nativeEvent.pageX - start.current.x, e.nativeEvent.pageY - start.current.y) > 10) clear();
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
  };
}

/**
 * جزء يقدر المالك يخفيه. للمستخدمين: يرجع الجزء نفسه بدون أي غلاف (أو ما يرجع شي لو مخفي).
 * للمالك: غلاف يلقط الضغطة المطوّلة، والمخفي يطلع باهت وعليه «مخفي عن الكل».
 */
export function Hideable({ id, label, children, style }: { id: string; label: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { owner, hidden } = usePart(id);
  const [menu, setMenu] = useState(false);
  const touch = useOwnerLongPress(() => setMenu(true), owner);
  if (!owner) return hidden ? null : <>{children}</>;
  // المسافات بين العناصر (gap) للغلاف الداخلي اللي فيه العناصر نفسها
  const { gap, rowGap, columnGap, ...outer } = StyleSheet.flatten(style) ?? {};
  return (
    <View style={outer} {...touch}>
      <View style={[{ gap, rowGap, columnGap }, hidden && { opacity: 0.35 }]}>{children}</View>
      {hidden ? <HiddenTag /> : null}
      <OwnerPartSheet id={id} label={label} visible={menu} onClose={() => setMenu(false)} />
    </View>
  );
}
