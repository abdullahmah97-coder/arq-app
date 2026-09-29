// اختبار ترتيب أقسام الرئيسية: الدمج مع الأقسام الجديدة وتنظيف القيم الغلط
import { HOME_SECTIONS, isDefaultLayout, mergeLayout } from '../src/lib/homeSections.ts';
import { mergeShortcuts, SHORTCUT_IDS, visibleShortcuts } from '../src/lib/shortcutsCore.ts';
let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

ok(eq(mergeLayout(null).order, HOME_SECTIONS) && isDefaultLayout(mergeLayout(null)), 'nothing saved gives the default order');
const moved = mergeLayout({ order: ['steps', 'rings', 'shortcuts', 'monitors', 'mission', 'nutrition', 'recovery', 'dashboard', 'stats', 'checkin', 'clubs', 'store', 'rules'] });
ok(moved.order[0] === 'steps' && moved.order.length === HOME_SECTIONS.length && !isDefaultLayout(moved), 'saved order kept');
const older = mergeLayout({ order: ['mission', 'rings', 'monitors', 'dashboard', 'steps', 'stats', 'checkin', 'clubs', 'store', 'rules'] });
ok(older.order.indexOf('nutrition') === older.order.indexOf('mission') + 1 && older.order.indexOf('recovery') === older.order.indexOf('nutrition') + 1, 'new sections appear after their default neighbour');
const junk = mergeLayout({ order: ['rings', 'rings', 'old_thing', 42, 'store'], hidden: ['store', 'store', 'nope'] });
ok(new Set(junk.order).size === HOME_SECTIONS.length && junk.order[0] === 'rings' && eq(junk.hidden, ['store']), 'duplicates and unknown keys dropped');
ok(eq(mergeLayout({ order: 'x', hidden: null }).order, HOME_SECTIONS), 'bad shapes fall back to default');
ok(!isDefaultLayout(mergeLayout({ hidden: ['rules'] })), 'hiding a section is a custom layout');
const mine = ['inbody', 'coach', ...SHORTCUT_IDS.filter((k) => k !== 'inbody' && k !== 'coach' && k !== 'learn'), 'gone'];
const sc = mergeShortcuts({ order: mine, hidden: ['meal'] });
ok(sc.order[0] === 'inbody' && sc.order[1] === 'coach' && sc.order.length === SHORTCUT_IDS.length && sc.order.includes('learn'), 'shortcut priority kept and new shortcuts added');
ok(!visibleShortcuts(sc).includes('meal') && visibleShortcuts(sc)[0] === 'inbody', 'hidden shortcuts are left out');
if (fail) process.exit(1);
