// ترتيب الرئيسية: اضغط مطولاً على القسم واسحبه لمكانه، ومن العين تخفيه أو تظهره
// السحب مبني على PanResponder و Animated من React Native نفسه (بدون مكتبات أصلية جديدة)
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Component, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Modal, PanResponder, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NT } from '@/components/pulse/widgets';
import { DEFAULT_LAYOUT, isDefaultLayout, SECTION_META, type HomeLayout, type HomeSection } from '@/lib/homeLayout';
import type { IconName } from '@/components/ui';
import { brand, night, space } from '@/theme';

const ROW_H = 54;
const GAP = 8;
const STEP = ROW_H + GAP;

export function HomeArrange({ visible, layout, onSave, onClose }: {
  visible: boolean; layout: HomeLayout; onSave: (l: HomeLayout) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<HomeSection[]>(layout.order);
  const [hidden, setHidden] = useState<Set<HomeSection>>(new Set(layout.hidden));
  const [dragging, setDragging] = useState(false);

  const toggle = (k: HomeSection) => {
    Haptics.selectionAsync().catch(() => {});
    setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  };
  const done = () => { onSave({ order, hidden: [...hidden] }); onClose(); };
  const reset = () => { setOrder([...DEFAULT_LAYOUT.order]); setHidden(new Set()); };
  const isDefault = isDefaultLayout({ order, hidden: [...hidden] });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={done}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <SafeAreaView edges={['bottom']} style={{ maxHeight: '90%', backgroundColor: night.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: space.lg }}>
          <View style={{ paddingHorizontal: space.lg, gap: 4, marginBottom: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <NT size={18} bold>{t('homeLayout.title')}</NT>
              <Pressable onPress={done} hitSlop={8} style={{ backgroundColor: brand.amber, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 }}>
                <NT size={13} bold color={brand.deepGreen}>{t('homeLayout.done')}</NT>
              </Pressable>
            </View>
            <NT size={12} muted>{t('homeLayout.hint')}</NT>
          </View>
          <ScrollView scrollEnabled={!dragging} contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
            <SortableList
              data={order}
              onDragState={setDragging}
              onChange={setOrder}
              moveUpLabel={t('homeLayout.moveUp')}
              moveDownLabel={t('homeLayout.moveDown')}
              renderRow={(k, active) => {
                const off = hidden.has(k);
                return (
                  <View style={{
                    height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 16,
                    backgroundColor: active ? night.cardStrong : night.card, borderWidth: 1, borderColor: active ? brand.amber : night.line,
                  }}>
                    <Ionicons name="reorder-three" size={22} color={active ? brand.amber : night.muted} />
                    <Ionicons name={SECTION_META[k].icon as IconName} size={18} color={off ? night.faint : brand.orange} />
                    <NT size={14} semibold style={{ flex: 1, opacity: off ? 0.45 : 1 }} numberOfLines={1}>{t(SECTION_META[k].label)}</NT>
                    <Pressable onPress={() => toggle(k)} hitSlop={10} accessibilityRole="switch" accessibilityState={{ checked: !off }}
                      accessibilityLabel={t(off ? 'homeLayout.show' : 'homeLayout.hide')}>
                      <Ionicons name={off ? 'eye-off-outline' : 'eye-outline'} size={20} color={off ? night.faint : night.text} />
                    </Pressable>
                  </View>
                );
              }}
            />
            {!isDefault ? (
              <Pressable onPress={reset} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: space.md }}>
                <Ionicons name="refresh" size={15} color={night.accent} />
                <NT size={13} semibold color={night.accent}>{t('homeLayout.reset')}</NT>
              </Pressable>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** قائمة تنرتّب بالسحب بعد الضغط المطول. كل الصفوف بنفس الارتفاع (STEP) عشان حساب المكان يكون بسيط ودقيق.
 *  مكتوبة كـ class لأن حالة السحب (الإصبع والقيم المتحركة) تتغير خارج الرسم وما تحتاج إعادة رسم مع كل حركة */
interface SortProps<K extends string> {
  data: K[]; onChange: (d: K[]) => void; renderRow: (k: K, active: boolean) => ReactNode; onDragState: (on: boolean) => void;
  moveUpLabel: string; moveDownLabel: string;
}
class SortableList<K extends string> extends Component<SortProps<K>, { active: K | null; target: number }> {
  state: { active: K | null; target: number } = { active: null, target: 0 };
  private dy = new Animated.Value(0);
  private shifts = new Map<K, Animated.Value>();
  private drag = { key: null as K | null, from: 0, to: 0, granted: false };

  private shiftOf(k: K) {
    let v = this.shifts.get(k);
    if (!v) { v = new Animated.Value(0); this.shifts.set(k, v); }
    return v;
  }

  componentDidUpdate(_: SortProps<K>, prev: { active: K | null; target: number }) {
    if (prev.active === this.state.active && prev.target === this.state.target) return;
    // الصفوف اللي بين المكان القديم والجديد تتزحزح خطوة لتفسح المجال
    const { active, target } = this.state;
    const from = this.drag.from;
    this.props.data.forEach((k, i) => {
      if (k === active) return;
      let to = 0;
      if (active != null) {
        if (from < target && i > from && i <= target) to = -STEP;
        else if (from > target && i >= target && i < from) to = STEP;
      }
      Animated.timing(this.shiftOf(k), { toValue: to, duration: 140, useNativeDriver: false }).start();
    });
  }

  private start(k: K, i: number) {
    this.drag = { key: k, from: i, to: i, granted: false };
    this.dy.setValue(0);
    this.setState({ active: k, target: i });
    this.props.onDragState(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  private finish = () => {
    const { key, from, to } = this.drag;
    if (key == null) return;
    this.drag = { key: null, from: 0, to: 0, granted: false };
    const next = [...this.props.data];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.dy.setValue(0);
    this.shifts.forEach((v) => { v.stopAnimation(); v.setValue(0); });
    this.setState({ active: null, target: 0 });
    this.props.onDragState(false);
    if (from !== to) { this.props.onChange(next); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }
  };

  private pan = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // بعد الضغط المطول: أول حركة للإصبع تمسك السحب (وتلغي ضغطة الصف)
    onMoveShouldSetPanResponderCapture: () => { if (this.drag.key != null) { this.drag.granted = true; return true; } return false; },
    onPanResponderMove: (_, g) => {
      this.dy.setValue(g.dy);
      const n = Math.max(0, Math.min(this.props.data.length - 1, this.drag.from + Math.round(g.dy / STEP)));
      if (n !== this.drag.to) { this.drag.to = n; this.setState({ target: n }); Haptics.selectionAsync().catch(() => {}); }
    },
    onPanResponderRelease: this.finish,
    onPanResponderTerminate: this.finish,
    onPanResponderTerminationRequest: () => false,
  });

  private swap(i: number, j: number) {
    const { data, onChange } = this.props;
    if (j < 0 || j >= data.length) return;
    const next = [...data];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  render() {
    const { data, renderRow, moveUpLabel, moveDownLabel } = this.props;
    const { active } = this.state;
    return (
      <View {...this.pan.panHandlers}>
        {data.map((k, i) => {
          const isActive = k === active;
          return (
            <Animated.View key={k} style={{
              marginBottom: GAP, zIndex: isActive ? 10 : 0, elevation: isActive ? 8 : 0,
              shadowColor: '#000', shadowOpacity: isActive ? 0.35 : 0, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
              transform: [{ translateY: isActive ? this.dy : this.shiftOf(k) }, { scale: isActive ? 1.03 : 1 }],
            }}>
              <Pressable
                delayLongPress={220}
                onLongPress={() => this.start(k, i)}
                onPressOut={() => { if (this.drag.key === k && !this.drag.granted) this.finish(); }}
                accessibilityActions={[{ name: 'moveUp', label: moveUpLabel }, { name: 'moveDown', label: moveDownLabel }]}
                onAccessibilityAction={(e) => this.swap(i, e.nativeEvent.actionName === 'moveUp' ? i - 1 : i + 1)}
              >
                {renderRow(k, isActive)}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    );
  }
}
