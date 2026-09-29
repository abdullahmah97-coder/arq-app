// صفحة الملعب أو الاستوديو: المعلومات، واختيار اليوم والوقت (الملاعب) أو الحصة (اليوقا والبيلاتس) والحجز من أرك،
// أو زر «احجز من موقعهم» للأماكن المدرجة من مواقعها الرسمية
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { BookingStatusPill, SportIcon, VenueArt } from '@/components/bookings/parts';
import { Button, Card, Empty, Input, Loading, Row, Screen, T } from '@/components/ui';
import {
  bookableInApp, bookClass, bookCourt, clockLabel, dayLabel, daySlots, hoursLabel, isCourtSport, loadClassSchedule, loadCourts, loadTaken, loadVenue,
  nextDays, overlaps, riyadhDate, riyadhMinute, tooSoon, venueCity, venueName, whenLabel,
  type BookingStatus, type ClassSession, type Court, type Slot, type Sport, type Taken, type Venue,
} from '@/lib/bookings';
import { useLocalized } from '@/lib/i18n';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

const DAYS = 14;

export default function VenuePage() {
  const { id, sport: sportParam } = useLocalSearchParams<{ id: string; sport?: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [v, setV] = useState<Venue | null | undefined>(undefined);
  const [courts, setCourts] = useState<Court[]>([]);
  const [sport, setSport] = useState<Sport | null>(null);
  const days = useMemo(() => nextDays(DAYS), []);
  const [day, setDay] = useState(days[0]);
  const [taken, setTaken] = useState<Taken[] | null>(null);
  const [sessions, setSessions] = useState<ClassSession[] | null>(null);
  const [picked, setPicked] = useState<{ court: Court; slot: Slot } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: BookingStatus; what: string; when: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    loadVenue(String(id)).then((x) => {
      setV(x);
      if (!x) return;
      setSport((cur) => cur ?? (x.sports.includes(sportParam as Sport) ? (sportParam as Sport) : x.sports[0]));
      if (bookableInApp(x)) loadCourts(x.id).then(setCourts).catch(() => setCourts([]));
    }).catch(() => setV(null));
  }, [id, sportParam]));

  const inApp = !!v && bookableInApp(v);
  const courtMode = !!sport && isCourtSport(sport);

  // الأوقات المحجوزة لليوم المختار (من بداية اليوم لين الصبح اللي بعده)
  const loadDay = useCallback(() => {
    if (!v || !inApp || !courtMode) return;
    setTaken(null);
    const from = `${day}T00:00:00+03:00`;
    const to = new Date(Date.parse(from) + 36 * 3600_000).toISOString();
    loadTaken(v.id, new Date(Date.parse(from)).toISOString(), to).then(setTaken).catch(() => setTaken([]));
  }, [v, inApp, courtMode, day]);
  useFocusEffect(loadDay);

  const loadSessions = useCallback(() => {
    if (!v || !inApp || courtMode) return;
    setSessions(null);
    loadClassSchedule(v.id, DAYS).then(setSessions).catch(() => setSessions([]));
  }, [v, inApp, courtMode]);
  useFocusEffect(loadSessions);

  if (v === undefined) return <Loading />;
  if (!v) return <Screen><Empty icon="calendar-outline" text={t('book.notFound')} /></Screen>;

  const name = venueName(v, lng);
  const about = lng === 'en' ? v.about_en || v.about : v.about;
  const slots = daySlots(v, day).filter((s) => !tooSoon(s.start));
  const sportCourts = courts.filter((c) => c.sport === sport);
  const external = v.booking_url || v.website;

  const confirmCourt = async () => {
    if (!picked) return;
    setBusy('court'); setErr(null);
    try {
      const r = await bookCourt(picked.court.id, picked.slot.start, note);
      setResult({ status: r.status, what: `${t(`book.sport_${picked.court.sport}`)} · ${picked.court.name}`, when: whenLabel(picked.slot.start, lng) });
      setPicked(null); setNote('');
      loadDay();
    } catch (e) { setErr(t(errorKey(e))); loadDay(); } finally { setBusy(null); }
  };
  const takeClass = async (s: ClassSession) => {
    setBusy(`${s.class_id}${s.starts_at}`); setErr(null);
    try {
      const r = await bookClass(s.class_id, s.starts_at);
      setResult({ status: r.status, what: `${t(`book.sport_${s.sport}`)} · ${lng === 'en' && s.title_en ? s.title_en : s.title}`, when: whenLabel(s.starts_at, lng) });
      loadSessions();
    } catch (e) { setErr(t(errorKey(e))); loadSessions(); } finally { setBusy(null); }
  };

  // الحصص حسب اليوم
  const byDay = (sessions ?? []).filter((s) => s.sport === sport).reduce<Record<string, ClassSession[]>>((a, s) => {
    (a[riyadhDate(s.starts_at)] ||= []).push(s); return a;
  }, {});

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: '' }} />
      <VenueArt v={v} style={{ height: 170, borderRadius: radius.lg }} iconSize={64} />
      <View style={{ gap: 6 }}>
        <T size="xl" bold style={{ lineHeight: 34 }}>{name}</T>
        <Row gap={6}><Ionicons name="location-outline" size={15} color={colors.muted} /><T size="sm" muted style={{ flex: 1 }}>{venueCity(v, lng)}</T></Row>
        {v.audience && v.audience !== 'mixed' ? <T size="xs" semibold color={colors.primary}>{t(`book.aud_${v.audience}`)}</T> : null}
      </View>

      {/* الرياضات */}
      {v.sports.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {v.sports.map((s) => {
            const on = s === sport;
            return (
              <Pressable key={s} onPress={() => { setSport(s); setPicked(null); setResult(null); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? brand.deepGreen : colors.cardAlt }}>
                <SportIcon sport={s} size={15} color={on ? brand.amber : colors.text} />
                <T size="sm" semibold color={on ? brand.cream : colors.text}>{t(`book.sport_${s}`)}</T>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* معلومات */}
      <Card style={{ gap: space.sm }}>
        {inApp && courtMode ? <Info icon="time-outline" label={t('book.hours')} value={`${hoursLabel(v, lng)} · ${t('book.slotLen', { n: v.slot_min })}`} /> : null}
        {inApp && courtMode && v.price_sar != null ? <Info icon="cash-outline" label={t('book.price')} value={t('book.priceSlot', { n: v.price_sar })} /> : null}
        {v.phone ? <Info icon="call-outline" label={t('book.phone')} value={v.phone} onPress={() => Linking.openURL(`tel:${v.phone!.replace(/\s/g, '')}`).catch(() => {})} /> : null}
        {v.maps_url ? <Info icon="navigate-outline" label={t('book.directions')} value={t('book.openMaps')} onPress={() => Linking.openURL(v.maps_url!).catch(() => {})} /> : null}
        {v.instagram ? <Info icon="logo-instagram" label="Instagram" value={`@${v.instagram}`} onPress={() => Linking.openURL(`https://instagram.com/${v.instagram}`).catch(() => {})} /> : null}
        {v.website ? <Info icon="globe-outline" label={t('book.website')} value={v.website.replace(/^https:\/\/(www\.)?/, '').split('/')[0]} onPress={() => Linking.openURL(v.website!).catch(() => {})} /> : null}
      </Card>
      {about ? <T style={{ lineHeight: 26 }}>{about}</T> : null}

      {!inApp ? (
        <View style={{ gap: space.sm }}>
          {external ? <Button icon="open-outline" title={t('book.bookOnSite')} onPress={() => Linking.openURL(external).catch(() => {})} /> : null}
          <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md, gap: 4 }}>
            <T size="sm" semibold>{t('book.listedNoteTitle')}</T>
            <T size="xs" muted style={{ lineHeight: 19 }}>{t('book.listedNote')}</T>
          </View>
          {v.source_url ? (
            <Pressable onPress={() => Linking.openURL(v.source_url!).catch(() => {})} style={{ alignSelf: 'center' }}>
              <T size="xs" muted>{t('book.source')}</T>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          {result ? (
            <View style={{ backgroundColor: result.status === 'confirmed' ? '#2E8B57' : brand.amber, borderRadius: radius.md, padding: space.md, gap: 4 }}>
              <Row gap={6}>
                <Ionicons name={result.status === 'confirmed' ? 'checkmark-circle' : 'time'} size={18} color={result.status === 'confirmed' ? '#fff' : brand.deepGreen} />
                <T semibold color={result.status === 'confirmed' ? '#fff' : brand.deepGreen}>{t(result.status === 'confirmed' ? 'book.doneConfirmed' : 'book.donePending')}</T>
              </Row>
              <T size="sm" color={result.status === 'confirmed' ? '#fff' : brand.deepGreen}>{result.what} · {result.when}</T>
              <T size="xs" color={result.status === 'confirmed' ? 'rgba(255,255,255,0.9)' : brand.deepGreen}>{t(result.status === 'confirmed' ? 'book.doneConfirmedHint' : 'book.donePendingHint')}</T>
              <Pressable onPress={() => router.push('/bookings')} style={{ alignSelf: 'flex-start', paddingTop: 4 }}>
                <T size="sm" bold color={result.status === 'confirmed' ? '#fff' : brand.deepGreen}>{t('book.myBookings')} ›</T>
              </Pressable>
            </View>
          ) : null}
          {err ? <View style={{ backgroundColor: 'rgba(241,85,29,0.12)', borderRadius: radius.md, padding: space.md }}><T size="sm" color={brand.orange}>{err}</T></View> : null}

          {courtMode ? (
            <>
              <T semibold>{t('book.pickDay')}</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {days.map((d) => {
                  const on = d === day; const l = dayLabel(d, lng);
                  return (
                    <Pressable key={d} onPress={() => { setDay(d); setPicked(null); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ alignItems: 'center', minWidth: 62, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: on ? brand.deepGreen : colors.card, borderWidth: 1, borderColor: on ? brand.deepGreen : colors.border }}>
                      <T size="xs" semibold color={on ? brand.amber : colors.muted}>{l.top}</T>
                      <T size="sm" bold color={on ? brand.cream : colors.text}>{l.bottom}</T>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {!sportCourts.length ? <Empty icon="calendar-outline" text={t('book.noCourts')} /> : taken === null ? <Loading /> : sportCourts.map((c) => {
                const mine = taken.filter((x) => x.court_id === c.id);
                return (
                  <Card key={c.id} style={{ gap: space.sm }}>
                    <Row gap={6}><SportIcon sport={c.sport} size={16} color={colors.primary} /><T semibold style={{ flex: 1 }}>{c.name}</T></Row>
                    {!slots.length ? <T size="xs" muted>{t('book.noTimesToday')}</T> : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {slots.map((s) => {
                          const hit = mine.find((x) => overlaps(s, x));
                          const sel = picked?.court.id === c.id && picked.slot.start === s.start;
                          const bg = hit ? (hit.mine ? brand.orange : colors.cardAlt) : sel ? brand.deepGreen : colors.card;
                          const fg = hit ? (hit.mine ? '#fff' : colors.muted) : sel ? brand.cream : colors.text;
                          return (
                            <Pressable key={s.start} disabled={!!hit} onPress={() => { setPicked({ court: c, slot: s }); setResult(null); setErr(null); }}
                              accessibilityRole="button" accessibilityState={{ disabled: !!hit, selected: sel }}
                              style={{ minWidth: 78, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, backgroundColor: bg,
                                borderWidth: 1, borderColor: sel ? brand.deepGreen : colors.border, opacity: hit && !hit.mine ? 0.55 : 1 }}>
                              <T size="sm" semibold color={fg} style={hit && !hit.mine ? { textDecorationLine: 'line-through' } : undefined}>{clockLabel(s.minute, lng)}</T>
                              {hit?.mine ? <T size="xs" color="#fff">{t('book.yours')}</T> : s.nextDay ? <T size="xs" color={sel ? brand.sand : colors.muted}>{t('book.afterMidnight')}</T> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                    {picked?.court.id === c.id ? (
                      <View style={{ gap: space.sm, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md }}>
                        <T semibold>{t('book.confirmTitle')}</T>
                        <T size="sm">{t(`book.sport_${c.sport}`)} · {c.name}</T>
                        <T size="sm">{whenLabel(picked.slot.start, lng)} – {clockLabel(riyadhMinute(picked.slot.end), lng)}</T>
                        {v.price_sar != null ? <T size="sm" semibold color={colors.primary}>{t('book.priceAtVenue', { n: v.price_sar })}</T> : <T size="sm" muted>{t('book.payAtVenue')}</T>}
                        <Input value={note} onChangeText={setNote} maxLength={200} placeholder={t('book.notePh')} />
                        <Row gap={space.sm}>
                          <View style={{ flex: 1 }}><Button title={t(v.auto_confirm ? 'book.bookNow' : 'book.sendRequest')} icon="checkmark" loading={busy === 'court'} onPress={confirmCourt} /></View>
                          <Button variant="ghost" title={t('common.cancel')} onPress={() => setPicked(null)} />
                        </Row>
                        {!v.auto_confirm ? <T size="xs" muted style={{ lineHeight: 18 }}>{t('book.requestHint')}</T> : null}
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </>
          ) : sessions === null ? <Loading /> : !Object.keys(byDay).length ? <Empty icon="calendar-outline" text={t('book.noClasses')} /> : (
            Object.entries(byDay).map(([d, list]) => {
              const l = dayLabel(d, lng);
              return (
                <View key={d} style={{ gap: space.sm }}>
                  <T bold>{l.top} {l.bottom}</T>
                  {list.map((s) => {
                    const left = Math.max(0, s.capacity - s.booked);
                    const key = `${s.class_id}${s.starts_at}`;
                    return (
                      <Card key={key} style={{ gap: 6 }}>
                        <Row style={{ alignItems: 'flex-start' }}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <T semibold>{lng === 'en' && s.title_en ? s.title_en : s.title}</T>
                            <T size="xs" muted>{clockLabel(riyadhMinute(s.starts_at), lng)} – {clockLabel(riyadhMinute(s.ends_at), lng)}{s.coach_name ? ` · ${s.coach_name}` : ''}</T>
                            <T size="xs" muted>{[s.audience !== 'mixed' ? t(`book.aud_${s.audience}`) : null, s.price_sar != null ? t('book.priceClass', { n: s.price_sar }) : null].filter(Boolean).join(' · ')}</T>
                          </View>
                          {s.my_status ? <BookingStatusPill status={s.my_status} /> : <T size="xs" semibold color={left ? colors.primary : colors.muted}>{left ? t('book.seatsLeft', { count: left, n: left }) : t('book.full')}</T>}
                        </Row>
                        {!s.my_status && left > 0 ? <Button small icon="add" title={t('book.takeSeat')} loading={busy === key} onPress={() => takeClass(s)} /> : null}
                      </Card>
                    );
                  })}
                </View>
              );
            })
          )}
          <T size="xs" muted center style={{ lineHeight: 19 }}>{t('book.rules')}</T>
        </View>
      )}
    </Screen>
  );
}

function Info({ icon, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress?: () => void }) {
  const body = (
    <Row gap={space.md} style={{ alignItems: 'center' }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <T size="xs" muted>{label}</T>
        <T semibold color={onPress ? colors.primary : colors.text} numberOfLines={1}>{value}</T>
      </View>
    </Row>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="link">{body}</Pressable> : body;
}
