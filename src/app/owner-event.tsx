// لوحة إدارة التطبيق ← إضافة أو تعديل فعالية: الاسم، النوع، المدينة والمكان، الموعد (أو ملاحظة لو غير مؤكد)، النبذة، الرابط الرسمي، والصورة
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, View } from 'react-native';
import { EventArt, EventCard, EventIcon } from '@/components/events/EventParts';
import { Button, Card, Input, Loading, Row, Screen, T } from '@/components/ui';
import {
  deleteEvent, EVENT_CATEGORIES, loadEvent, parseEventDate, removeEventImage, saveEvent, uploadEventImage, validEventUrl,
  type EventCategory, type EventInput, type LocalEvent,
} from '@/lib/localEvents';
import { brand, colors, radius, space } from '@/theme';

const MAX_MB = 5;

export default function OwnerEventEdit() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [category, setCategory] = useState<EventCategory>('running');
  const [city, setCity] = useState('');
  const [cityEn, setCityEn] = useState('');
  const [venue, setVenue] = useState('');
  const [venueEn, setVenueEn] = useState('');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [note, setNote] = useState('');
  const [noteEn, setNoteEn] = useState('');
  const [summary, setSummary] = useState('');
  const [summaryEn, setSummaryEn] = useState('');
  const [url, setUrl] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [featured, setFeatured] = useState(false);
  const [active, setActive] = useState(true);

  // الصور: القديمة تنحذف بعد الحفظ لو تبدّلت، واللي انرفعت وما انحفظت تنحذف لو طلع بدون حفظ
  // final: undefined = طلع بدون حفظ، null = بدون صورة
  const imgs = useRef({ original: null as string | null, fresh: [] as string[], final: undefined as string | null | undefined });
  useEffect(() => {
    const s = imgs.current;
    return () => {
      s.fresh.filter((p) => p !== s.final).forEach(removeEventImage);
      if (s.final !== undefined && s.original && s.original !== s.final) removeEventImage(s.original);
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    loadEvent(id).then((e) => {
      if (!e) return;
      setTitle(e.title); setTitleEn(e.title_en ?? ''); setCategory(e.category);
      setCity(e.city ?? ''); setCityEn(e.city_en ?? ''); setVenue(e.venue ?? ''); setVenueEn(e.venue_en ?? '');
      setStarts(e.starts_on ?? ''); setEnds(e.ends_on ?? ''); setNote(e.date_note ?? ''); setNoteEn(e.date_note_en ?? '');
      setSummary(e.summary ?? ''); setSummaryEn(e.summary_en ?? ''); setUrl(e.url ?? '');
      setImage(e.image_path); imgs.current.original = e.image_path;
      setFeatured(e.featured); setActive(e.active);
    }).catch(() => Alert.alert(t('errors.generic'))).finally(() => setLoading(false));
  }, [id, t]);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
    const a = res.canceled ? null : res.assets?.[0];
    if (!a) return;
    if (a.fileSize && a.fileSize > MAX_MB * 1024 * 1024) return Alert.alert(t('events.tooBig', { mb: MAX_MB }));
    setUploading(true);
    try {
      const path = await uploadEventImage(a.uri, a.mimeType ?? 'image/jpeg');
      imgs.current.fresh.push(path);
      setImage(path);
    } catch (e) {
      Alert.alert(String((e as Error)?.message) === 'file_too_big' ? t('events.tooBig', { mb: MAX_MB }) : t('errors.generic'));
    } finally { setUploading(false); }
  };

  const draft = (): EventInput | null => {
    if (title.trim().length < 2) { Alert.alert(t('events.err_title')); return null; }
    const s = parseEventDate(starts); const e = parseEventDate(ends);
    if (s === undefined || e === undefined) { Alert.alert(t('events.err_date')); return null; }
    if (e && !s) { Alert.alert(t('events.err_endOnly')); return null; }
    if (s && e && e < s) { Alert.alert(t('events.err_range')); return null; }
    if (url.trim() && !validEventUrl(url)) { Alert.alert(t('events.err_url')); return null; }
    return {
      category, title, title_en: titleEn, city, city_en: cityEn, venue, venue_en: venueEn,
      starts_on: s, ends_on: e && e !== s ? e : null, date_note: note, date_note_en: noteEn,
      summary, summary_en: summaryEn, url, image_path: image, featured, active,
    };
  };

  const save = async () => {
    const d = draft();
    if (!d) return;
    setBusy(true);
    try {
      await saveEvent(d, id);
      imgs.current.final = image;
      router.back();
    } catch { Alert.alert(t('errors.generic')); } finally { setBusy(false); }
  };

  const remove = () => Alert.alert(t('events.deleteConfirm'), title, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('events.delete'), style: 'destructive', onPress: async () => {
      if (!id) return;
      try {
        await deleteEvent({ id, image_path: imgs.current.original });
        imgs.current.final = null; imgs.current.original = null;
        router.back();
      } catch { Alert.alert(t('errors.generic')); }
    } },
  ]);

  if (loading) return <Loading />;

  // معاينة البطاقة زي ما بيشوفها المستخدم (بدون تحقق)
  const previewRow: LocalEvent = {
    id: id ?? 'preview', category, title: title.trim() || t('events.f_title'), title_en: titleEn || null,
    city: city || null, city_en: cityEn || null, venue: venue || null, venue_en: venueEn || null,
    starts_on: parseEventDate(starts) || null, ends_on: parseEventDate(ends) || null, date_note: note || null, date_note_en: noteEn || null,
    summary: summary || null, summary_en: summaryEn || null, url: url || null, image_path: image, featured, active,
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: id ? t('events.editTitle') : t('events.new') }} />

      {/* الاسم والنوع */}
      <Card style={{ gap: space.sm }}>
        <Input label={t('events.f_title')} value={title} onChangeText={setTitle} maxLength={90} placeholder={t('events.f_titlePh')} />
        <Input label={t('events.f_titleEn')} value={titleEn} onChangeText={setTitleEn} maxLength={90} placeholder="Riyadh Marathon 2027" autoCapitalize="words" />
        <T size="sm" muted>{t('events.f_category')}</T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {EVENT_CATEGORIES.map((c) => (
            <Pressable key={c} onPress={() => setCategory(c)} accessibilityRole="button" accessibilityState={{ selected: category === c }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: category === c ? brand.deepGreen : colors.cardAlt }}>
              <EventIcon category={c} size={14} color={category === c ? brand.cream : colors.text} />
              <T size="xs" semibold color={category === c ? brand.cream : colors.text}>{t(`events.cat_${c}`)}</T>
            </Pressable>
          ))}
        </Row>
      </Card>

      {/* الموعد */}
      <Card style={{ gap: space.sm }}>
        <T semibold>{t('events.when')}</T>
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Input label={t('events.f_starts')} value={starts} onChangeText={setStarts} placeholder="2027-02-05" keyboardType="numbers-and-punctuation" autoCorrect={false} /></View>
          <View style={{ flex: 1 }}><Input label={t('events.f_ends')} value={ends} onChangeText={setEnds} placeholder="2027-02-06" keyboardType="numbers-and-punctuation" autoCorrect={false} /></View>
        </Row>
        <T size="xs" muted style={{ lineHeight: 18 }}>{t('events.f_datesHint')}</T>
        <Input label={t('events.f_note')} hint={t('events.f_noteHint')} value={note} onChangeText={setNote} maxLength={80} placeholder={t('events.f_notePh')} />
        <Input label={t('events.f_noteEn')} value={noteEn} onChangeText={setNoteEn} maxLength={80} placeholder="Late January (date to be announced)" />
      </Card>

      {/* المكان */}
      <Card style={{ gap: space.sm }}>
        <T semibold>{t('events.where')}</T>
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Input label={t('events.f_city')} value={city} onChangeText={setCity} maxLength={40} placeholder={t('events.f_cityPh')} /></View>
          <View style={{ flex: 1 }}><Input label={t('events.f_cityEn')} value={cityEn} onChangeText={setCityEn} maxLength={40} placeholder="Riyadh" /></View>
        </Row>
        <Input label={t('events.f_venue')} value={venue} onChangeText={setVenue} maxLength={90} placeholder={t('events.f_venuePh')} />
        <Input label={t('events.f_venueEn')} value={venueEn} onChangeText={setVenueEn} maxLength={90} placeholder="King Abdulaziz Racecourse" />
      </Card>

      {/* النبذة والرابط */}
      <Card style={{ gap: space.sm }}>
        <Input label={t('events.f_summary')} value={summary} onChangeText={setSummary} maxLength={500} multiline placeholder={t('events.f_summaryPh')} />
        <Input label={t('events.f_summaryEn')} value={summaryEn} onChangeText={setSummaryEn} maxLength={500} multiline />
        <Input label={t('events.f_url')} hint={t('events.f_urlHint')} value={url} onChangeText={setUrl} maxLength={300}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
      </Card>

      {/* الصورة */}
      <Card style={{ gap: space.sm }}>
        <T semibold>{t('events.f_image')}</T>
        <Pressable onPress={pick} disabled={uploading} accessibilityRole="button" accessibilityLabel={image ? t('events.change') : t('events.pick')}>
          <EventArt e={{ category, image_path: image }} style={{ height: 150, borderRadius: radius.md }} iconSize={54} />
        </Pressable>
        <Row gap={space.sm}>
          <Button small style={{ flex: 1 }} variant="secondary" icon="images-outline" loading={uploading} title={image ? t('events.change') : t('events.pick')} onPress={pick} />
          {image ? <Button small style={{ flex: 1 }} variant="secondary" icon="close-circle-outline" title={t('events.removeImage')} onPress={() => setImage(null)} /> : null}
        </Row>
        <T size="xs" muted style={{ lineHeight: 18 }}>{t('events.f_imageHint')}</T>
      </Card>

      <Card style={{ gap: space.md }}>
        <Row>
          <View style={{ flex: 1 }}><T semibold>{t('events.featured')}</T><T size="xs" muted>{t('events.featuredHint')}</T></View>
          <Switch value={featured} onValueChange={setFeatured} trackColor={{ true: brand.orange }} />
        </Row>
        <Row>
          <View style={{ flex: 1 }}><T semibold>{t('events.activeLabel')}</T><T size="xs" muted>{t('events.activeHint')}</T></View>
          <Switch value={active} onValueChange={setActive} trackColor={{ true: brand.orange }} />
        </Row>
      </Card>

      {/* المعاينة */}
      <Row gap={6}>
        <Ionicons name="eye-outline" size={16} color={colors.muted} />
        <T size="sm" muted>{t('events.previewLabel')}</T>
      </Row>
      <EventCard e={previewRow} onPress={() => {}} />

      <Button icon="checkmark" title={t('common.save')} loading={busy} disabled={uploading} onPress={save} />
      {id ? <Button variant="ghost" icon="trash-outline" title={t('events.delete')} onPress={remove} /> : null}
    </Screen>
  );
}
