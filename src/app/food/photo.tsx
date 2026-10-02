// صوّر وجبتك: الذكاء الاصطناعي يتعرف على الأكل ويقدّر السعرات والبروتين والكارب والدهون، وأنت تراجع وتعدّل الكمية قبل التسجيل
// بعد الصورة تقدر تكتب وش فيها (مثلاً «شاورما جبن») عشان يحسب اللي ما يبان بالصورة، وتقدر تصحّح الوصف بعد التحليل
// أو امسح باركود منتج معلّب: نجيب قيمه من Open Food Facts وتختار الكمية
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, View } from 'react-native';
import { BarcodeScanner } from '@/components/nutrition/BarcodeScanner';
import { Button, Card, Input, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import {
  aiBarcodeLookup, analyzeMeal, canonicalBarcode, defaultPortion, logFood, logFoods, lookupBarcode, pickMealPhoto, portionMacros, portions, productName,
  scaleItem, siteName, slotForHour, totals, type AiLookupError, type BarcodeProduct, type MealAnalysis, type MealPhoto, type MealSlot, type PortionKey,
} from '@/lib/nutrition';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const FACTORS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const ERR: Record<string, string> = {
  ai_not_configured: 'meal.errNotReady', rate_limited: 'meal.errLimit', not_food: 'meal.errNotFood',
  file_too_large: 'meal.errTooLarge', network: 'errors.network', permission_denied: 'meal.errPermission',
};

/** عدد الحصص/العبوات للمنتج الممسوح */
const COUNTS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

type Phase = 'pick' | 'describe' | 'analyzing' | 'review' | 'error' | 'saved' | 'lookup' | 'product' | 'unknown';

export default function MealPhotoScreen() {
  const { t } = useTranslation();
  const { lng, num } = useLocalized();
  const { userId } = useUser();
  const { auto, scan } = useLocalSearchParams<{ auto?: string; scan?: string }>();
  const [slot, setSlot] = useState<MealSlot>(slotForHour(new Date().getHours()));
  const [photo, setPhoto] = useState<MealPhoto | null>(null);
  /** وصف المستخدم للصورة (اختياري) */
  const [hint, setHint] = useState('');
  /** صورة ملصق القيم الغذائية (من الباركود): وصفها جاهز وتتحلل على طول بدون خطوة الوصف */
  const [labelHint, setLabelHint] = useState('');
  /** الوصف اللي انحسبت عليه النتيجة المعروضة */
  const [usedNote, setUsedNote] = useState('');
  const [phase, setPhase] = useState<Phase>('pick');
  const [err, setErr] = useState('');
  const [res, setRes] = useState<MealAnalysis | null>(null);
  const [factor, setFactor] = useState<number[]>([]);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [savedKcal, setSavedKcal] = useState(0);
  const started = useRef(false);
  // الباركود
  const [scanOpen, setScanOpen] = useState(false);
  const [code, setCode] = useState<{ data: string; type: string } | null>(null);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [lookupErr, setLookupErr] = useState<AiLookupError | 'invalid_code' | null>(null);
  /** مرحلة البحث: قاعدة المنتجات المفتوحة ثم الذكاء الاصطناعي (ياخذ ثواني أكثر) */
  const [stage, setStage] = useState<'db' | 'ai'>('db');
  /** كم بحث بالذكاء الاصطناعي باقي اليوم (من الخادم) */
  const [aiLeft, setAiLeft] = useState<number | null>(null);
  const [portionKey, setPortionKey] = useState<PortionKey>('serving');
  const [count, setCount] = useState(1);
  const [mode, setMode] = useState<'photo' | 'barcode'>('photo');

  const run = async (p: MealPhoto, h: string) => {
    setPhase('analyzing');
    const { result, error } = await analyzeMeal(p, h);
    if (!result) { setErr(error ?? 'ai_failed'); setPhase('error'); return; }
    setRes(result);
    setUsedNote(h);
    setFactor(result.items.map(() => 1));
    setRemoved(new Set());
    setPhase('review');
  };

  /** بعد الصورة نسألك وش فيها (اختياري) قبل التحليل، عشان يعرف المكونات اللي ما تبان مثل الجبن داخل الشاورما */
  const take = async (source: 'camera' | 'library', label = '') => {
    try {
      const p = await pickMealPhoto(source);
      if (!p) return;
      setMode('photo');
      setPhoto(p);
      setRes(null);
      setLabelHint(label);
      if (label) await run(p, label);
      else setPhase('describe');
    } catch (e) {
      setErr(e instanceof Error && e.message === 'permission_denied' ? 'permission_denied' : 'ai_failed');
      setPhase('error');
    }
  };

  // فتح الكاميرا مباشرة لما تجي من زر «صوّر وجبتك»
  useEffect(() => {
    if (auto === 'camera' && !started.current) { started.current = true; void take('camera'); }
    if (scan && !started.current) { started.current = true; setScanOpen(true); }
  }, [auto, scan]); // eslint-disable-line react-hooks/exhaustive-deps

  const showProduct = (p: BarcodeProduct) => {
    const d = defaultPortion(portions(p));
    if (!d) return false;
    setProduct(p);
    setPortionKey(d.key);
    setCount(1);
    setPhase('product');
    return true;
  };

  /** بعد المسح: Open Food Facts أول، ولو ما لقيناه (أو ما عليه قيم) نبحث عنه بالذكاء الاصطناعي في الويب */
  const lookup = async (c: { data: string; type: string }) => {
    setMode('barcode');
    setCode(c);
    setPhoto(null);
    setProduct(null);
    setLookupErr(null);
    setStage('db');
    setPhase('lookup');
    const canonical = canonicalBarcode(c.data, c.type);
    if (!canonical) { setLookupErr('invalid_code'); setPhase('unknown'); return; }
    let off: BarcodeProduct | null = null;
    try { off = await lookupBarcode(c.data, c.type); } catch { /* القاعدة المفتوحة واقفة؟ نكمل بالذكاء الاصطناعي */ }
    if (off && showProduct(off)) return;
    setStage('ai');
    const r = await aiBarcodeLookup(canonical, off ? productName(off, 'en') : null);
    setAiLeft(r.remaining ?? null);
    if (r.product && showProduct(r.product)) return;
    setProduct(off);
    setLookupErr(r.error ?? null);
    setPhase('unknown');
  };

  /** قفل الماسح: لو جيت من زر الباركود مباشرة وما مسحت شي، نرجعك للصفحة اللي كنت فيها بدل ما تعلق هنا */
  const closeScanner = () => {
    setScanOpen(false);
    if (scan && phase === 'pick') {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  };

  const onScanned = (data: string, type: string) => {
    setScanOpen(false);
    void lookup({ data, type });
  };

  const portionList = product ? portions(product) : [];
  const portion = portionList.find((x) => x.key === portionKey) ?? portionList[0];
  const productMacros = portion ? portionMacros(portion, count) : null;
  const unitLabel = t(product?.unit === 'ml' ? 'common.ml' : 'common.g');
  const portionLabel = (key: PortionKey, amount: number | null) => {
    const size = amount ? ` ${num(amount)} ${unitLabel}` : '';
    return key === 'hundred' ? `${num(100)} ${unitLabel}` : `${t(key === 'serving' ? 'meal.bcServing' : 'meal.bcPackage')}${size}`;
  };

  const saveProduct = async () => {
    if (!product || !portion || !productMacros) return;
    setBusy(true);
    try {
      const name = productName(product, lng === 'ar' ? 'ar' : 'en');
      const label = portionLabel(portion.key, portion.amount);
      await logFood(userId, {
        slot, name: `${name.slice(0, 78 - label.length)} · ${label}`, servings: count, source: 'barcode', ...productMacros,
      });
      setSavedKcal(productMacros.kcal);
      setPhase('saved');
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  const stepCount = (dir: 1 | -1) => setCount((c) => {
    const k = COUNTS.indexOf(c);
    return COUNTS[Math.min(COUNTS.length - 1, Math.max(0, (k < 0 ? 1 : k) + dir))];
  });

  /** المنتج مو موجود: نصوّر ملصق القيم الغذائية والذكاء الاصطناعي يقراه */
  const photoLabel = () => {
    const name = product ? productName(product, lng === 'ar' ? 'ar' : 'en') : '';
    void take('camera', t('meal.bcLabelHint', { name: name ? ` (${name})` : '' }));
  };
  /** الوصف اللي ينرسل مع الصورة */
  const note = labelHint || hint.trim();
  const analyze = () => { if (photo) void run(photo, note); };

  const items = (res?.items ?? []).map((it, i) => ({ it: scaleItem(it, factor[i] ?? 1), i })).filter((x) => !removed.has(x.i));
  const sum = totals(items.map((x) => x.it));

  const save = async () => {
    if (!items.length) return;
    setBusy(true);
    try {
      await logFoods(userId, items.map(({ it }) => ({
        slot, source: 'photo' as const, name: lng === 'ar' ? it.name_ar : it.name_en,
        kcal: it.kcal, protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g,
      })));
      setSavedKcal(sum.kcal);
      setPhase('saved');
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  const reset = () => {
    setPhoto(null); setHint(''); setLabelHint(''); setUsedNote(''); setRes(null); setErr(''); setProduct(null); setCode(null); setPhase('pick');
  };
  const again = () => {
    reset();
    if (mode === 'barcode') setScanOpen(true);
  };
  const step = (i: number, dir: 1 | -1) => setFactor((f) => {
    const k = FACTORS.indexOf(f[i] ?? 1);
    const next = FACTORS[Math.min(FACTORS.length - 1, Math.max(0, k + dir))];
    return f.map((v, j) => (j === i ? next : v));
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('meal.title') }} />
      <Screen edges={['bottom']}>
        {photo ? (
          // وقت الوصف الصورة أقصر شوي عشان خانة الكتابة وزر التحليل يبانون فوق الكيبورد
          <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: phase === 'describe' ? 16 / 9 : 4 / 3, borderRadius: radius.lg, backgroundColor: colors.cardAlt }}
            contentFit="cover" />
        ) : null}

        {phase === 'pick' ? (
          <>
            <Card style={{ gap: space.md, alignItems: 'center', paddingVertical: space.xl }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="camera" size={30} color={brand.cream} />
              </View>
              <T bold size="lg" center>{t('meal.headline')}</T>
              <T muted center>{t('meal.intro')}</T>
            </Card>
            <Button title={t('meal.takePhoto')} icon="camera" onPress={() => take('camera')} />
            <Button title={t('meal.scanBarcode')} icon="barcode-outline" variant="dark" onPress={() => setScanOpen(true)} />
            <Button title={t('meal.fromLibrary')} icon="images-outline" variant="secondary" onPress={() => take('library')} />
            <T size="xs" muted center>{t('meal.privacy')}</T>
          </>
        ) : null}

        {phase === 'describe' && photo ? (
          <>
            <Card style={{ gap: space.sm }}>
              <Row gap={space.sm}>
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
                <T bold size="lg" style={{ flex: 1 }}>{t('meal.describeTitle')}</T>
              </Row>
              <T size="sm" muted style={{ lineHeight: 21 }}>{t('meal.describeSub')}</T>
              <Input value={hint} onChangeText={setHint} placeholder={t('meal.hintPh')} maxLength={200} returnKeyType="done"
                accessibilityLabel={t('meal.describeTitle')} accessibilityHint={t('meal.describeSub')} />
            </Card>
            <Button title={t(res ? 'meal.analyzeAgain' : 'meal.analyze')} icon="sparkles" onPress={analyze} />
            {/* جيت من النتيجة وغيّرت رأيك؟ ترجع لها بدون تحليل جديد */}
            {res ? <Button title={t('meal.backToResult')} variant="secondary" onPress={() => setPhase('review')} /> : null}
            <Button title={t('meal.another')} icon="camera-outline" variant="ghost" onPress={reset} />
          </>
        ) : null}

        {phase === 'analyzing' ? (
          <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
            <ActivityIndicator color={colors.primary} />
            <T semibold>{t('meal.analyzing')}</T>
            <T size="xs" muted center>{t('meal.analyzingHint')}</T>
          </Card>
        ) : null}

        {phase === 'error' ? (
          <Card style={{ gap: space.md }}>
            <Row><Ionicons name="alert-circle-outline" size={20} color={colors.danger} /><T bold style={{ flex: 1 }}>{t(ERR[err] ?? 'meal.errFailed')}</T></Row>
            {/* «ما فيها أكل»: غالباً يحتاج وصف، فنرجعك لخانة الوصف بدل ما نعيد نفس الطلب */}
            {photo && err === 'not_food' && !labelHint ? (
              <Button title={t(hint.trim() ? 'meal.editNote' : 'meal.notFoodDescribe')} icon="create-outline" onPress={() => setPhase('describe')} />
            ) : photo && err !== 'ai_not_configured' && err !== 'rate_limited' ? (
              <Button title={t('meal.retry')} icon="refresh" onPress={analyze} />
            ) : null}
            <Button title={t('meal.another')} icon="camera-outline" variant="secondary" onPress={reset} />
            <Button title={t('meal.manual')} icon="create-outline" variant="ghost" onPress={() => router.replace('/food/add')} />
          </Card>
        ) : null}

        {phase === 'review' && res ? (
          <>
            <Card style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <T size="xs" muted>{t('meal.total')}</T>
                  <Row gap={6} style={{ alignItems: 'baseline' }}>
                    <T size="xxl" bold color={colors.primary}>{num(sum.kcal)}</T>
                    <T size="sm" muted>{t('common.kcal')}</T>
                  </Row>
                </View>
                <View style={{ backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <T size="xs" semibold>{t(`meal.conf_${res.confidence}`)}</T>
                </View>
              </Row>
              <Row gap={space.sm}>
                <Macro label={t('plan.protein')} v={sum.protein_g} color={colors.text} />
                <Macro label={t('plan.carbs')} v={sum.carbs_g} color={colors.accent} />
                <Macro label={t('plan.fat')} v={sum.fat_g} color={colors.muted} />
              </Row>
              {res.note?.[lng] ? <T size="xs" muted>{res.note[lng]}</T> : null}
              {usedNote && !labelHint ? (
                <Row gap={6} style={{ alignItems: 'flex-start' }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.muted} style={{ marginTop: 2 }} />
                  <T size="xs" muted style={{ flex: 1 }}>{t('meal.yourNote', { note: usedNote })}</T>
                </Row>
              ) : null}
            </Card>

            <T size="sm" bold muted>{t('meal.items')}</T>
            {items.map(({ it, i }) => (
              <Card key={i} style={{ gap: space.sm }}>
                <Row>
                  <View style={{ flex: 1 }}>
                    <T semibold>{lng === 'ar' ? it.name_ar : it.name_en}</T>
                    <T size="xs" muted>
                      ~{num(it.grams)} {t('common.g')} · {t('plan.protein')} {num(it.protein_g)} · {t('plan.carbs')} {num(it.carbs_g)} · {t('plan.fat')} {num(it.fat_g)}
                    </T>
                  </View>
                  <T bold color={colors.primary}>{num(it.kcal)}</T>
                  <Pressable onPress={() => setRemoved((r) => new Set(r).add(i))} hitSlop={8} accessibilityLabel={t('common.delete')}>
                    <Ionicons name="close-circle" size={20} color={colors.muted} />
                  </Pressable>
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T size="xs" muted>{t('meal.portion')}</T>
                  <Row gap={space.sm}>
                    <Pressable onPress={() => step(i, -1)} hitSlop={8} style={stepBtn}><Ionicons name="remove" size={16} color={colors.text} /></Pressable>
                    <T semibold style={{ minWidth: 48, textAlign: 'center' }}>{num(Math.round((factor[i] ?? 1) * 100))}{lng === 'ar' ? '٪' : '%'}</T>
                    <Pressable onPress={() => step(i, 1)} hitSlop={8} style={stepBtn}><Ionicons name="add" size={16} color={colors.text} /></Pressable>
                  </Row>
                </Row>
              </Card>
            ))}
            {!items.length ? <T muted center>{t('meal.allRemoved')}</T> : null}

            <Segmented value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ value: s, label: t(`plan.slot_${s}`) }))} />
            <Button title={`${t('food.addTo')} ${t(`plan.slot_${slot}`)}`} icon="checkmark" onPress={save} loading={busy} disabled={!items.length} />
            <Row gap={space.sm}>
              <Button style={{ flex: 1 }} small title={t('meal.another')} icon="camera-outline" variant="secondary" onPress={reset} />
              <Button style={{ flex: 1 }} small title={t('meal.addMissing')} icon="add" variant="ghost" onPress={() => router.push('/food/add')} />
            </Row>
            {/* التحليل مو دقيق؟ اكتب (أو صحّح) وش في الصورة ونحلل نفس الصورة من جديد */}
            {!labelHint ? (
              <Button small title={t(usedNote ? 'meal.editNote' : 'meal.addNote')} icon="create-outline" variant="ghost"
                onPress={() => { setHint(usedNote); setPhase('describe'); }} />
            ) : null}
            <T size="xs" muted center>{t('meal.estimate')}</T>
          </>
        ) : null}

        {phase === 'lookup' ? (
          <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
            <ActivityIndicator color={colors.primary} />
            <T semibold center>{t(stage === 'ai' ? 'meal.bcSearchingAi' : 'meal.bcLooking')}</T>
            {stage === 'ai' ? <T size="xs" muted center>{t('meal.bcSearchingAiHint')}</T> : null}
            {code ? <T size="xs" muted style={{ writingDirection: 'ltr' }}>{code.data}</T> : null}
          </Card>
        ) : null}

        {phase === 'product' && product && portion && productMacros ? (
          <>
            <Card style={{ gap: space.md }}>
              <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                {product.image ? (
                  <Image source={{ uri: product.image }} style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: '#fff' }} contentFit="contain" />
                ) : (
                  <View style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="barcode-outline" size={30} color={colors.muted} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <T semibold>{productName(product, lng === 'ar' ? 'ar' : 'en')}</T>
                  <T size="xs" muted style={{ writingDirection: 'ltr', textAlign: lng === 'ar' ? 'right' : 'left' }}>{product.code}</T>
                </View>
              </Row>
              <Row style={{ alignItems: 'baseline' }} gap={6}>
                <T size="xxl" bold color={colors.primary}>{num(productMacros.kcal)}</T>
                <T size="sm" muted>{t('common.kcal')}</T>
              </Row>
              <Row gap={space.sm}>
                <Macro label={t('plan.protein')} v={productMacros.protein_g} color={colors.text} />
                <Macro label={t('plan.carbs')} v={productMacros.carbs_g} color={colors.accent} />
                <Macro label={t('plan.fat')} v={productMacros.fat_g} color={colors.muted} />
              </Row>
            </Card>

            <T size="sm" bold muted>{t('meal.bcHowMuch')}</T>
            {portionList.length > 1 ? (
              <Segmented value={portion.key} onChange={(k) => { setPortionKey(k); setCount(1); }} wrap
                options={portionList.map((x) => ({ value: x.key, label: portionLabel(x.key, x.amount) }))} />
            ) : null}
            <Card style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T semibold style={{ flex: 1 }}>{portionLabel(portion.key, portion.amount)}</T>
                <Row gap={space.sm}>
                  <Pressable onPress={() => stepCount(-1)} hitSlop={8} style={stepBtn} accessibilityLabel={t('meal.bcLess')}><Ionicons name="remove" size={16} color={colors.text} /></Pressable>
                  <T bold style={{ minWidth: 44, textAlign: 'center' }}>×{num(count)}</T>
                  <Pressable onPress={() => stepCount(1)} hitSlop={8} style={stepBtn} accessibilityLabel={t('meal.bcMore')}><Ionicons name="add" size={16} color={colors.text} /></Pressable>
                </Row>
              </Row>
              {portion.amount && count !== 1 ? <T size="xs" muted>{t('meal.bcTotalAmount', { n: num(Math.round(portion.amount * count)), unit: unitLabel })}</T> : null}
            </Card>

            <Segmented value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ value: s, label: t(`plan.slot_${s}`) }))} />
            <Button title={`${t('food.addTo')} ${t(`plan.slot_${slot}`)}`} icon="checkmark" onPress={saveProduct} loading={busy} />
            <Row gap={space.sm}>
              <Button style={{ flex: 1 }} small title={t('meal.bcAnother')} icon="barcode-outline" variant="secondary" onPress={again} />
              <Button style={{ flex: 1 }} small title={t('meal.bcWrong')} icon="camera-outline" variant="ghost" onPress={photoLabel} />
            </Row>
            {product.source === 'ai' ? (
              <View style={{ gap: 4, alignItems: 'center' }}>
                <T size="xs" muted center>{t('meal.bcAiSource', { conf: t(`meal.conf_${product.confidence ?? 'low'}`) })}</T>
                {aiLeft != null ? <T size="xs" muted center>{t('meal.bcAiLeft', { count: aiLeft })}</T> : null}
                {siteName(product.sourceUrl) ? (
                  <Pressable onPress={() => product.sourceUrl && void Linking.openURL(product.sourceUrl)} hitSlop={8} accessibilityRole="link">
                    <T size="xs" semibold color={colors.primary} style={{ writingDirection: 'ltr' }}>{t('meal.bcSourceLink', { site: siteName(product.sourceUrl) })}</T>
                  </Pressable>
                ) : null}
              </View>
            ) : <T size="xs" muted center>{t('meal.bcSource')}</T>}
          </>
        ) : null}

        {phase === 'unknown' ? (
          <Card style={{ gap: space.md }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <Ionicons name={lookupErr === 'network' ? 'cloud-offline-outline' : 'help-circle-outline'} size={22} color={colors.primary} />
              <T bold style={{ flex: 1 }}>
                {t(lookupErr === 'network' ? 'errors.network' : lookupErr === 'invalid_code' ? 'meal.bcBadCode' : lookupErr === 'rate_limited' ? 'meal.bcAiLimit'
                  : product ? 'meal.bcNoValues' : 'meal.bcNotFound')}
              </T>
            </Row>
            {product ? <T semibold>{productName(product, lng === 'ar' ? 'ar' : 'en')}</T> : null}
            {lookupErr !== 'network' ? <T size="sm" muted>{t('meal.bcNotFoundHint')}</T> : null}
            {code ? <T size="xs" muted style={{ writingDirection: 'ltr', textAlign: lng === 'ar' ? 'right' : 'left' }}>{code.data}</T> : null}
            {lookupErr === 'network' && code ? <Button title={t('meal.retry')} icon="refresh" onPress={() => void lookup(code)} /> : null}
            {lookupErr !== 'network' ? <Button title={t('meal.bcPhotoLabel')} icon="camera" onPress={photoLabel} /> : null}
            <Button title={t('meal.bcScanAgain')} icon="barcode-outline" variant="secondary" onPress={() => { reset(); setScanOpen(true); }} />
            <Button title={t('meal.bcManual')} icon="create-outline" variant="ghost" onPress={() => router.replace('/food/add')} />
          </Card>
        ) : null}

        {phase === 'saved' ? (
          <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            <T bold size="lg">{t('meal.saved', { kcal: num(savedKcal) })}</T>
            <T muted center>{t('meal.savedHint', { slot: t(`plan.slot_${slot}`) })}</T>
            <Row gap={space.sm} style={{ marginTop: space.sm }}>
              <Button small title={t(mode === 'barcode' ? 'meal.bcAnother' : 'meal.another')} icon={mode === 'barcode' ? 'barcode-outline' : 'camera-outline'}
                variant="secondary" onPress={again} />
              <Button small title={t('meal.done')} onPress={() => router.back()} />
            </Row>
          </Card>
        ) : null}
      </Screen>
      <BarcodeScanner visible={scanOpen} onClose={closeScanner} onScanned={onScanned} />
    </KeyboardAvoidingView>
  );
}

function Macro({ label, v, color }: { label: string; v: number; color: string }) {
  const { t } = useTranslation();
  const { num } = useLocalized();
  return (
    <View style={{ flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.sm, gap: 2 }}>
      <T size="xs" muted>{label}</T>
      <T bold color={color}>{num(Math.round(v))} {t('common.g')}</T>
    </View>
  );
}

const stepBtn = { width: 30, height: 30, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.cardAlt };
