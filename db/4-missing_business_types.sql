-- ============================================================
-- Two business types are used on member records but were never
-- added to the 0.Lookup sheet, so those members could not import.
-- Codes and names taken from the member rows that reference them.
-- Safe to re-run.
-- ============================================================

insert into categories (code, name) values
  ('160', 'ডিলার ও ডিস্ট্রিবিঊটর'),
  ('147', 'দৈনিক তাজা ব্যবসা (শাকসবজি, ফল, কসাই, ডিম, দুধ, ফুল) / Daily Fresh Business (vegetables, Fruits, Butchery, Eggs , Milk)')
on conflict (code) do nothing;

insert into business_types (code, name, category_code) values
  ('1601090', 'ডিলার ও ডিস্ট্রিবিঊটর- খাদ্য সামগ্রী, পানীয় ও ফ্রোজেন আইটেম', '160'),
  ('1471097', 'ছোট- বড় বেকারির দোকান (কেক/ পাঊরুটি/ বিস্কুট) / Bakery', '147')
on conflict (code) do update set
  name = excluded.name, category_code = excluded.category_code;

select code, name from business_types where code in ('1471097','1601090');
