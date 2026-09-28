-- صور مكتبة التمارين (Free Exercise DB — ملكية عامة): حاوية عامة للقراءة فقط
-- الرفع يتم مرة وحدة من الخادم بمفتاح الخدمة (بدون سياسات كتابة للمستخدمين)
insert into storage.buckets (id, name, public) values ('exercises', 'exercises', true) on conflict (id) do nothing;
