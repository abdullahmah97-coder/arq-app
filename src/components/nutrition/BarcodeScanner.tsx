// ماسح باركود المنتجات: كاميرا مع إطار، فلاش، وكتابة الرقم يدوي لو الكاميرا ما قرته.
// الخروج سهل: زر «إغلاق» واضح فوق وتحت (قريب من الإبهام)، وسحب الصفحة لتحت في الآيفون، وزر الرجوع في أندرويد.
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, T } from '@/components/ui';
import { barcodeCandidates } from '@/lib/nutrition/barcode';
import { brand, radius, space } from '@/theme';

/** باركود المنتجات الغذائية فقط (مو QR) */
const TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;
const FRAME_W = 290;
const FRAME_H = 180;
const DIM = 'rgba(0,0,0,0.55)';
/**
 * تقريب ٢× تقريباً: الكاميرا الرئيسية في آيفون برو (١٣ وأحدث) ما تركّز أقرب من ~٢٠ سم،
 * فلو قرّبت الجوال من الباركود يطلع مغبّش وما ينقرا. مع التقريب تمسك الجوال أبعد والباركود واضح وكبير.
 * (expo-camera في الآيفون: العامل = أقصى تقريب ^ القيمة، فـ 0.14 ≈ ٢× بأغلب الأجهزة)
 */
const ZOOM_2X = 0.14;
/** أندرويد يحسب التقريب بطريقة ثانية (نسبة من أقصى تقريب، يوصل ١٠٠× بعض الأجهزة) وكاميراته تركّز من قريب، فنخليه ١× */
const CAN_ZOOM = Platform.OS === 'ios';

type Props = { visible: boolean; onClose: () => void; onScanned: (code: string, type: string) => void };

export function BarcodeScanner({ visible, onClose, onScanned }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}
      supportedOrientations={['portrait']}>
      {/* المحتوى يتركّب من جديد كل مرة ينفتح (يرجع الفلاش والكتابة لوضعهم الأول) */}
      {visible ? <ScannerBody onClose={onClose} onScanned={onScanned} /> : <View style={{ flex: 1, backgroundColor: '#000' }} />}
    </Modal>
  );
}

function ScannerBody({ onClose, onScanned }: Omit<Props, 'visible'>) {
  const { t } = useTranslation();
  const [perm, requestPerm] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [zoomed, setZoomed] = useState(CAN_ZOOM);
  const [typing, setTyping] = useState(false);
  const [manual, setManual] = useState('');
  const [manualBad, setManualBad] = useState(false);
  const [locked, setLocked] = useState(false);
  // الكاميرا ترسل نفس الباركود كذا مرة بالثانية: أول قراءة صحيحة بس
  const done = useRef(false);
  const asked = useRef(false);

  // نطلب إذن الكاميرا مرة وحدة لما تنفتح الشاشة
  useEffect(() => {
    if (!perm || perm.granted || !perm.canAskAgain || asked.current) return;
    asked.current = true;
    void requestPerm();
  }, [perm, requestPerm]);

  const finish = (code: string, type: string) => {
    done.current = true;
    setLocked(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onScanned(code, type);
  };

  const onBarcode = ({ data, type }: BarcodeScanningResult) => {
    if (done.current) return;
    if (!barcodeCandidates(data, type).length) return; // قراءة ناقصة: نكمل المسح
    finish(data, type);
  };

  const submitManual = () => {
    const code = manual.replace(/\D/g, '');
    if (!barcodeCandidates(code).length) { setManualBad(true); return; }
    finish(code, '');
  };

  const granted = !!perm?.granted;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {granted && !typing ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} zoom={CAN_ZOOM && zoomed ? ZOOM_2X : 0}
          barcodeScannerSettings={{ barcodeTypes: [...TYPES] }} onBarcodeScanned={locked ? undefined : onBarcode} />
      ) : null}

      {/* إطار المسح: تعتيم حوله وفتحة بالنص */}
      {granted && !typing ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, backgroundColor: DIM }} />
          <View style={{ flexDirection: 'row', height: FRAME_H }}>
            <View style={{ flex: 1, backgroundColor: DIM }} />
            <View style={{ width: FRAME_W, height: FRAME_H, borderRadius: radius.lg, borderWidth: 3, borderColor: brand.orange }} />
            <View style={{ flex: 1, backgroundColor: DIM }} />
          </View>
          <View style={{ flex: 1, backgroundColor: DIM }} />
        </View>
      ) : null}

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* مقبض السحب: اسحب لتحت وتطلع (آيفون) */}
        {Platform.OS === 'ios' ? <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)', marginTop: space.sm }} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md }}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: 22,
              backgroundColor: 'rgba(0,0,0,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', opacity: pressed ? 0.8 : 1 })}>
            <Ionicons name="close" size={22} color="#fff" />
            <T semibold color="#fff">{t('common.close')}</T>
          </Pressable>
          {granted && !typing ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {CAN_ZOOM ? <Pressable onPress={() => setZoomed((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('meal.bcZoom')}
                style={({ pressed }) => ({ minWidth: 44, height: 44, paddingHorizontal: 10, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: 'rgba(0,0,0,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', opacity: pressed ? 0.8 : 1 })}>
                <T bold color="#fff" style={{ writingDirection: 'ltr' }}>{zoomed ? '2×' : '1×'}</T>
              </Pressable> : null}
              <RoundBtn icon={torch ? 'flash' : 'flash-outline'} label={t('meal.bcTorch')} active={torch} onPress={() => setTorch((v) => !v)} />
            </View>
          ) : null}
        </View>

        {typing ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md }}>
            <Ionicons name="barcode-outline" size={48} color={brand.cream} style={{ alignSelf: 'center' }} />
            <T bold size="lg" center color={brand.cream}>{t('meal.bcTypeTitle')}</T>
            <T size="sm" center color="rgba(248,237,218,0.75)">{t('meal.bcTypeHint')}</T>
            <TextInput value={manual} onChangeText={(v) => { setManual(v.replace(/\D/g, '').slice(0, 14)); setManualBad(false); }}
              keyboardType="number-pad" autoFocus maxLength={14} placeholder="6281234567890" placeholderTextColor="rgba(248,237,218,0.35)"
              returnKeyType="search" onSubmitEditing={submitManual} accessibilityLabel={t('meal.bcTypeTitle')}
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.lg, borderWidth: 1, borderColor: manualBad ? '#FF8A65' : 'rgba(248,237,218,0.3)',
                color: brand.cream, fontSize: 24, letterSpacing: 3, textAlign: 'center', paddingVertical: 14, writingDirection: 'ltr' }} />
            {manualBad ? <T size="sm" center color="#FF8A65">{t('meal.bcBadCode')}</T> : null}
            <Button title={t('meal.bcSearch')} icon="search" onPress={submitManual} disabled={manual.length < 8} />
            <Button title={t('meal.bcBackToCamera')} icon="scan-outline" variant="secondary" onPress={() => setTyping(false)} />
          </KeyboardAvoidingView>
        ) : (
          <View style={{ flex: 1, justifyContent: 'flex-end', padding: space.xl, gap: space.md }}>
            {!perm ? <ActivityIndicator color={brand.cream} /> : null}
            {perm && !granted ? (
              <View style={{ gap: space.md, marginBottom: space.xl * 2 }}>
                <Ionicons name="camera-outline" size={44} color={brand.cream} style={{ alignSelf: 'center' }} />
                <T bold center color={brand.cream}>{t('meal.bcNeedCamera')}</T>
                {perm.canAskAgain ? (
                  <Button title={t('meal.bcAllowCamera')} icon="camera" onPress={() => void requestPerm()} />
                ) : (
                  <Button title={t('meal.bcOpenSettings')} icon="settings-outline" onPress={() => void Linking.openSettings()} />
                )}
              </View>
            ) : null}
            {granted ? (
              <View style={{ alignItems: 'center', marginBottom: space.lg }}>
                {locked ? <ActivityIndicator color={brand.cream} /> : (
                  <View style={{ gap: 4 }}>
                    <T semibold center color={brand.cream}>{t('meal.bcAim')}</T>
                    <T size="sm" center color="rgba(248,237,218,0.8)">{t('meal.bcDistance')}</T>
                  </View>
                )}
              </View>
            ) : null}
            {/* تحت قريب من الإبهام: اكتب الرقم أو اطلع */}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button style={{ flex: 1 }} title={t('meal.bcTypeShort')} icon="keypad-outline" variant="secondary" onPress={() => setTyping(true)} />
              <Button style={{ flex: 1 }} title={t('common.close')} icon="close" variant="dark" onPress={onClose} />
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function RoundBtn({ icon, label, onPress, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? brand.orange : 'rgba(0,0,0,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
      <Ionicons name={icon} size={22} color="#fff" />
    </Pressable>
  );
}
