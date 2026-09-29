// تنبيه السعرات: النص والرقم من لوحة إدارة التطبيق. الكل يقرأ، والإدارة بس تعدّل، والقيم الغلط ترتفض
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();

  const row = (await as(U.A, `select value from app_settings where key = 'calorie_alert'`))[0];
  check('default alert readable by users', row?.value?.threshold === 200 && row.value.enabled === true, JSON.stringify(row));
  check('default Arabic text mentions the remaining calories', String(row?.value?.title_ar).includes('{n}'));

  // المستخدم العادي ما يعدّل
  const upd = await as(U.A, `update app_settings set value = value || '{"threshold": 100}' where key = 'calorie_alert' returning 1`);
  check('users cannot change the alert', upd.length === 0);
  await expectErr('users cannot add settings', () => as(U.A, `insert into app_settings (key, value) values ('x_y', '{}')`), /row-level security|permission denied/);

  // الإدارة تعدّل النص والرقم، والتعديل في السجل
  await as(U.E, `update app_settings set value = jsonb_build_object('enabled', true, 'threshold', 150, 'title_ar', 'باقي {n} بس!', 'body_ar', 'قربت تكمّل', 'title_en', '', 'body_en', null, 'extra', 1) where key = 'calorie_alert'`);
  const v = (await as(U.A, `select value from app_settings where key = 'calorie_alert'`))[0].value;
  check('admin edit saved', v.threshold === 150 && v.title_ar === 'باقي {n} بس!', JSON.stringify(v));
  check('unknown keys dropped and empty English stored as null', !('extra' in v) && v.title_en === null, JSON.stringify(v));
  const log = await q(`select action from admin_log where kind = 'setting' and target = 'calorie_alert'`);
  check('edit is logged', log.length === 1 && log[0].action === 'edit');

  // قيم غلط
  await expectErr('threshold below 50 rejected', () => as(U.E, `update app_settings set value = value || '{"threshold": 10}' where key = 'calorie_alert'`), /bad_value/);
  await expectErr('threshold above 500 rejected', () => as(U.E, `update app_settings set value = value || '{"threshold": 900}' where key = 'calorie_alert'`), /bad_value/);
  await expectErr('Arabic title required', () => as(U.E, `update app_settings set value = value || '{"title_ar": " "}' where key = 'calorie_alert'`), /bad_value/);
  await expectErr('enabled must be true/false', () => as(U.E, `update app_settings set value = value || '{"enabled": "yes"}' where key = 'calorie_alert'`), /bad_value/);

  // إيقاف للجميع
  await as(U.E, `update app_settings set value = value || '{"enabled": false}' where key = 'calorie_alert'`);
  check('admin can switch it off for everyone', (await as(U.A, `select (value->>'enabled')::boolean e from app_settings where key = 'calorie_alert'`))[0].e === false);
})().catch((e) => { console.error(e); process.exit(1); });
