// فقاعة رسالة (ترتيب الواتساب بألوان أرك): ذيل على أول رسالة من كل مجموعة، والوقت وعلامة القراءة داخل الفقاعة
// (على آخر سطر لو فيه مكان)، «معدّلة» للمعدّلة، و«انحذفت هذي الرسالة» للمحذوفة للجميع،
// والصورة/الفيديو بإطار رفيع والوقت فوقها. فقاعتي بلون التطبيق الداكن ونصها كريمي.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, I18nManager, Platform, Pressable, Text, View, type TextStyle } from 'react-native';
import { VideoThumb, videoSize } from '@/components/chat/ChatVideo';
import { msgTime, textIsRTL } from '@/lib/chatFormat';
import type { Message } from '@/lib/messages';
import { brand, colors, fonts } from '@/theme';

/** حالة رسالتي: تنرسل (ساعة)، وصلت (✓)، انقرت (✓✓ كهرماني) */
export type BubbleStatus = 'sending' | 'sent' | 'read';

/** اتجاه الواجهة الفعلي (الجوال: I18nManager، الويب: dir الصفحة) */
export function uiIsRTL(): boolean {
  if (Platform.OS === 'web') return typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  return I18nManager.isRTL;
}

/** مقاس الصورة في الفقاعة: عرض ثابت والارتفاع حسب نسبة الصورة (بحدود) */
export function photoSize(w?: number | null, h?: number | null) {
  const W = 240;
  const ratio = w && h ? h / w : 1.25;
  return { width: W, height: Math.round(Math.min(320, Math.max(150, W * ratio))) };
}

/** ظل خفيف تحت الفقاعة (مثل الواتساب) */
export const BUBBLE_SHADOW = '0px 1px 0.5px rgba(10,51,45,0.14)';
const NB = ' ';
const metaText = (): TextStyle => ({ fontSize: 11, lineHeight: 15, fontFamily: fonts.regular });

/** لون الوقت: فوق الصورة أبيض، وفي فقاعتي كريمي خافت، وفي فقاعة الطرف الثاني خافت */
type Tone = 'mine' | 'theirs' | 'light';
const metaColor = (tone: Tone) => (tone === 'light' ? '#FFFFFF' : tone === 'mine' ? colors.bubbleMineMeta : colors.bubbleMeta);

/** الوقت و«معدّلة» وعلامة القراءة */
function Meta({ time, edited, status, tone }: { time: string; edited?: boolean; status?: BubbleStatus; tone: Tone }) {
  const { t } = useTranslation();
  const c = metaColor(tone);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {edited ? <Text style={[metaText(), { color: c }]}>{t('chat.edited')}</Text> : null}
      <Text style={[metaText(), { color: c }]}>{time}</Text>
      {status === 'sending' ? <Ionicons name="time-outline" size={13} color={c} />
        : status ? <Ionicons name={status === 'read' ? 'checkmark-done' : 'checkmark'} size={16} color={status === 'read' ? colors.readTick : c} /> : null}
    </View>
  );
}

/**
 * نص الرسالة مع مكان محجوز (شفاف) بآخره بعرض الوقت: لو فيه مكان بآخر سطر يجي الوقت جنبه، وإلا ينزل لسطر لحاله.
 * الوقت يجي في الجهة اللي ينتهي فيها السطر حسب اتجاه النص نفسه (عربي يسار، إنجليزي يمين).
 */
function Body({ text, time, edited, status, uiRTL, muted, mine }: {
  text: string; time: string; edited?: boolean; status?: BubbleStatus; uiRTL: boolean; muted?: boolean; mine: boolean;
}) {
  const { t } = useTranslation();
  const rtl = textIsRTL(text, uiRTL);
  // الجهة اللي ينتهي فيها السطر: يسار للعربي ويمين للإنجليزي (start/end تنقلب مع اتجاه الواجهة)
  const atEnd = rtl === uiRTL;
  const spacer = ` ${NB}${edited ? t('chat.edited') + NB : ''}${time.replace(/\s/g, NB)}${status ? NB.repeat(status === 'sending' ? 5 : 6) : ''}${NB}`;
  const tone: Tone = mine ? 'mine' : 'theirs';
  const color = muted ? metaColor(tone) : mine ? colors.bubbleMineText : colors.text;
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={{ fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color, writingDirection: rtl ? 'rtl' : 'ltr' }}>
        {rtl ? '‏' : '‎'}{text}
        <Text style={{ fontSize: 11, fontFamily: fonts.regular, color: 'transparent' }}>{spacer}</Text>
      </Text>
      <View pointerEvents="none" style={[{ position: 'absolute', bottom: -3 }, atEnd ? { end: 0 } : { start: 0 }]}>
        <Meta time={time} edited={edited} status={status} tone={tone} />
      </View>
    </View>
  );
}

/** ذيل الفقاعة (مثلث صغير فوق من جهة المرسل) */
function Tail({ mine, color }: { mine: boolean; color: string }) {
  return (
    <View pointerEvents="none" style={[
      { position: 'absolute', top: 0, width: 0, height: 0, borderTopWidth: 12, borderTopColor: color },
      mine ? { end: -7, borderEndWidth: 8, borderEndColor: 'transparent' } : { start: -7, borderStartWidth: 8, borderStartColor: 'transparent' },
    ]} />
  );
}

function Photo({ uri, size, uploading }: { uri?: string; size: { width: number; height: number }; uploading?: boolean }) {
  return (
    <View style={{ backgroundColor: colors.cardAlt, ...size }}>
      {uri ? <Image source={{ uri }} style={size} contentFit="cover" transition={150} /> : null}
      {uploading || !uri ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: uploading ? 'rgba(10,51,45,0.35)' : 'transparent' }}>
          <ActivityIndicator color={uploading ? brand.cream : colors.muted} />
        </View>
      ) : null}
    </View>
  );
}

export interface BubbleProps {
  m: Message;
  mine: boolean;
  /** أول رسالة من المجموعة (من نفس الشخص ورا بعض): عليها الذيل */
  first: boolean;
  lng: 'ar' | 'en';
  uiRTL: boolean;
  /** لرسائلي بس */
  status?: BubbleStatus;
  /** رابط الصورة/الفيديو (أو الملف من الجوال وهو ينرفع) */
  mediaUri?: string;
  uploading?: boolean;
  onLongPress?: (m: Message) => void;
  onOpenMedia?: (m: Message) => void;
  /** نسخة للعرض بس (فوق قائمة الخيارات) */
  preview?: boolean;
}

export const Bubble = memo(function Bubble({ m, mine, first, lng, uiRTL, status, mediaUri, uploading, onLongPress, onOpenMedia, preview }: BubbleProps) {
  const { t } = useTranslation();
  const bg = mine ? colors.bubbleMine : colors.bubbleTheirs;
  const time = msgTime(m.created_at, lng);
  const deleted = !!m.deleted_at;
  const hasMedia = !deleted && (!!m.media_path || !!uploading);
  const video = m.media_type === 'video';
  const caption = deleted ? '' : m.body.trim();
  const edited = !!m.edited_at && !deleted;
  const tick = mine && !deleted ? status : undefined;
  const size = video ? videoSize(m.media_w, m.media_h) : photoSize(m.media_w, m.media_h);
  const label = deleted ? t(mine ? 'chat.deletedMine' : 'chat.deletedTheirs')
    : caption || (video ? t('chat.video') : t('chat.photo'));

  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: hasMedia ? undefined : '82%', marginTop: first ? 8 : 2, marginStart: mine ? 0 : 8, marginEnd: mine ? 8 : 0 }}>
      <Pressable
        disabled={preview}
        onLongPress={onLongPress ? () => onLongPress(m) : undefined}
        delayLongPress={280}
        onPress={hasMedia && onOpenMedia && !uploading ? () => onOpenMedia(m) : undefined}
        accessibilityRole={hasMedia ? 'imagebutton' : undefined}
        accessibilityLabel={[label, time, edited ? t('chat.edited') : ''].filter(Boolean).join(lng === 'ar' ? '، ' : ', ')}
        style={{
          backgroundColor: bg, borderRadius: 10, boxShadow: BUBBLE_SHADOW,
          ...(first ? (mine ? { borderTopEndRadius: 0 } : { borderTopStartRadius: 0 }) : null),
          ...(hasMedia ? { padding: 3 } : { paddingHorizontal: 9, paddingTop: 5, paddingBottom: 8 }),
        }}>
        {hasMedia ? (
          <>
            <View style={{ borderRadius: 8, overflow: 'hidden', ...size }}>
              {video
                ? <VideoThumb uri={mediaUri} width={m.media_w} height={m.media_h} duration={m.media_dur} uploading={uploading} />
                : <Photo uri={mediaUri} size={size} uploading={uploading} />}
              {!caption ? (
                <>
                  <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 42 }} />
                  <View pointerEvents="none" style={{ position: 'absolute', bottom: 4, end: 8 }}>
                    <Meta time={time} edited={edited} status={tick} tone="light" />
                  </View>
                </>
              ) : null}
            </View>
            {caption ? (
              <View style={{ width: size.width, paddingHorizontal: 6, paddingTop: 4, paddingBottom: 5 }}>
                <Body text={caption} time={time} edited={edited} status={tick} uiRTL={uiRTL} mine={mine} />
              </View>
            ) : null}
          </>
        ) : deleted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="ban" size={15} color={metaColor(mine ? 'mine' : 'theirs')} />
            <Body text={label} time={time} uiRTL={uiRTL} muted mine={mine} />
          </View>
        ) : (
          <Body text={m.body} time={time} edited={edited} status={tick} uiRTL={uiRTL} mine={mine} />
        )}
      </Pressable>
      {first ? <Tail mine={mine} color={bg} /> : null}
    </View>
  );
});

/** فاصل الأيام (اليوم، أمس، …) */
export function DayChip({ label }: { label: string }) {
  return (
    <View style={{ alignSelf: 'center', backgroundColor: colors.bubbleTheirs, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 12, marginBottom: 4, boxShadow: BUBBLE_SHADOW }}>
      <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.bubbleMeta, fontFamily: fonts.regular }}>{label}</Text>
    </View>
  );
}
