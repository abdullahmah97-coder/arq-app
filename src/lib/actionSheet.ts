// قائمة خيارات من تحت (آيفون: قائمة النظام، أندرويد والويب: نافذة تنبيه بنفس الخيارات)
import { ActionSheetIOS, Alert, Platform } from 'react-native';

export interface SheetOption { label: string; onPress: () => void; destructive?: boolean }

export function showActions(title: string | undefined, options: SheetOption[], cancelLabel: string) {
  if (Platform.OS === 'ios') {
    const labels = [...options.map((o) => o.label), cancelLabel];
    const destructive = options.map((o, i) => (o.destructive ? i : -1)).filter((i) => i >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: labels, cancelButtonIndex: labels.length - 1, destructiveButtonIndex: destructive.length ? destructive : undefined },
      (i) => { if (i < options.length) options[i].onPress(); },
    );
    return;
  }
  Alert.alert(title ?? '', undefined, [
    ...options.map((o) => ({ text: o.label, onPress: o.onPress, style: o.destructive ? ('destructive' as const) : ('default' as const) })),
    { text: cancelLabel, style: 'cancel' as const },
  ]);
}
