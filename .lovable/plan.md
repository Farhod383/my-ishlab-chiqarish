# Nakladnoy moduli (avtomatik kirim sessiyasi)

Nakladnoy oldindan qo'lda yaratilmaydi. Sklad kirimi boshlanganda sessiya avtomatik ochiladi, tugatilgandan keyin Nakladnoy bo'limida paydo bo'ladi, rasm yuklanib yakunlangandan keyingina qoldiqqa tushadi.

## 1. Kirim sessiyasi avtomatik boshlanadi
- Sklad → "Mahsulot kirimi" bosilib birinchi mahsulot saqlanganda ochiq sessiya bo'lmasa, yangi sessiya avtomatik boshlanadi va boshlanish vaqti o'sha payt yoziladi (masalan 12.09.2026 10:00).
- Foydalanuvchi oddiy tarzda kiritadi: mahsulot → miqdor → narx → valyuta (+ mavjud ixtiyoriy maydonlar: zavod, zakaz, manba, telefon).
- "Kim olib keldi" — faqat Davronxo'ja / Sanjar tanlanadigan ro'yxat.

## 2. Bitta kelish = bitta sessiya
- Ochiq sessiya mavjud bo'lsa, keyingi barcha mahsulotlar o'sha sessiyaga biriktiriladi (10:00, 10:05, 10:12, 10:25 — hammasi bitta sessiya).
- Sklad sahifasida ochiq sessiya paneli ko'rinadi: boshlangan vaqt, kiritilgan mahsulotlar ro'yxati, jami miqdor va summa, qatorni o'chirish imkoni.

## 3. Kirimni tugatish
- "Kirimni tugatish" bosilganda tugash vaqti avtomatik yoziladi, jami mahsulotlar soni, jami miqdor va jami summa hisoblanadi.
- Sessiya "Rasm kutilmoqda" holatiga o'tadi va Nakladnoy bo'limida paydo bo'ladi. Qoldiqqa hali tushmaydi.

## 4. Nakladnoyda yakunlash
- Nakladnoy bo'limida sessiya ochiladi: barcha mahsulotlar ko'rinadi, nakladnoy rasmi yuklanadi.
- Rasm yuklanmaguncha "Yakunlash" tugmasi ishlamaydi.
- Yakunlangandan keyin mahsulotlar sklad qoldig'iga kirim bo'ladi va Sklad harakatlar tarixida yakunlangan kirim sifatida ko'rinadi. Hech narsa qayta so'ralmaydi.

## 5. Keyingi kelish — yangi sessiya
- 10:00 sessiya tugatilgandan keyin 15:00 da kiritilgan birinchi mahsulot yangi sessiyani boshlaydi. Sessiyalar hech qachon aralashmaydi.

## 6. Nakladnoy identifikatori
- Qo'lda nom kiritilmaydi. Identifikator sessiyaning boshlanish vaqtidan shakllanadi: `12.09.2026 10:00` (24 soat, AM/PM yo'q).

## 7. Nakladnoy ro'yxati va kartasi
Ko'rinadi: identifikator, status (Kirim davom etmoqda / Rasm kutilmoqda / Yakunlangan), boshlangan va tugagan vaqt, davomiyligi ("1 soat 25 daqiqa"), kim kiritgani, mahsulotlar soni, jami summa, rasm. Ochilganda har bir mahsulot: nomi, miqdori, narxi, valyutasi, jami summasi.

## 8. Chap menyu
- Sklad ostiga "Nakladnoy" bo'limi qo'shiladi; faqat Admin, Sklad va Ta'minot ko'radi (menyu + sahifa himoyasi).

## 9. Takroriy kirimdan himoya
- Bitta sessiya faqat bir marta yakunlanadi va har bir qator faqat bir marta skladga tushadi — baza darajasida bloklanadi.
- Yakunlangan sessiyaning mahsulotlarini o'zgartirib bo'lmaydi.

## 10. Responsive
Kirim oynasi va mahsulotlar ro'yxati kichik laptopda ham viewport ichida qoladi: balandligi cheklangan, ro'yxat ichki scroll bilan, sarlavha va tugmalar doim ko'rinib turadi.

Mavjud sklad funksiyalari (chiqim, korrektura, instrumentlar, qaytarish, qayta zakaz) va mavjud ma'lumotlar tegilmaydi.

## Texnik tafsilotlar
- Yangi jadvallar: `intake_sessions` (status `open|pending_photo|finalized`, started_at, finished_at, image_url, supplier, created_by) va `intake_items` (session_id, product_id yoki product_name, unit, quantity, unit_price, currency, location, order_id, source, phone, created_at).
- Ochiq sessiya: `created_by` + `status='open'` bo'yicha partial unique index — bir foydalanuvchida bir vaqtda faqat bitta ochiq sessiya.
- `stock_movements` ga nullable `intake_session_id` va `intake_item_id`; `intake_item_id` bo'yicha unique index duplicate kirimni bloklaydi.
- Yakunlash bitta `finalize_intake_session` SECURITY DEFINER funksiyasida: status va rasm tekshiruvi, mahsulotni topish/yaratish, `stock_movements` yozuvlari (mavjud triggerlar qoldiq va last_price'ni yangilaydi), status `finalized`.
- RLS + GRANT: admin / warehouse / supply uchun; yakunlangan sessiya va uning qatorlari UPDATE/DELETE dan himoyalanadi.
- Rasm `product-images` bucketiga yuklanadi.
- Yangi sahifa `src/pages/InvoicesPage.tsx`, route `/invoices`, `AppSidebar` elementi; `WarehousePage` kirim oynasi sessiyaga yozadi va ochiq sessiya panelini ko'rsatadi.
