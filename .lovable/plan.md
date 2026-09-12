# Nakladnoy moduli (Sklad kirimi)

Sklad kirimi endi nakladnoy orqali yig'iladi: bitta nakladnoyga bir nechta mahsulot qo'shiladi, rasm yuklanadi, "Tugatdim" bosilgandan keyingina barcha mahsulotlar sklad qoldig'iga tushadi.

## 1. Chap menyu
- Sklad ostiga yangi "Nakladnoy" bo'limi qo'shiladi.
- Faqat Admin, Sklad va Ta'minot ko'radi (menyu + sahifa himoyasi).

## 2. Nakladnoy ish jarayoni
- "Yangi nakladnoy" tugmasi bosilganda nakladnoy ochiladi va boshlangan vaqt avtomatik yoziladi.
- Ochiq nakladnoy ichiga istalgancha mahsulot qo'shiladi: mahsulot nomi (mavjudlardan tanlash yoki yangi nom), valyuta, narx, miqdor, jami summa avtomatik hisoblanadi.
- Har bir qo'shilgan mahsulot ro'yxatda ko'rinadi, o'chirish mumkin.
- "Kim olib keldi" — faqat Davronxo'ja / Sanjar tanlanadigan ro'yxat, bazaga saqlanadi.

## 3. Yakunlash
- Nakladnoy rasmi majburiy: rasm yuklanmaguncha "Tugatdim" tugmasi ishlamaydi.
- "Tugatdim" bosilganda: tugagan vaqt yoziladi, status "Tugatilgan" bo'ladi va barcha mahsulotlar sklad qoldig'iga kirim qilinadi (mavjud mahsulotga qo'shiladi, yangi nom bo'lsa mahsulot yaratiladi).
- Tugatilmagan nakladnoy sklad qoldig'iga umuman ta'sir qilmaydi.

## 4. Takroriy kirimdan himoya
- Har bir nakladnoy qatori skladga faqat bir marta tushadi — baza darajasida takrorlanish bloklanadi.
- Tugatilgan nakladnoyni qayta tugatib bo'lmaydi, ichidagi mahsulotlarni o'zgartirib bo'lmaydi (faqat ko'rish).

## 5. Nakladnoy tarixi
Ro'yxatda: nakladnoy raqami, status (Jarayonda / Tugatilgan), mahsulotlar soni, jami summa, boshlangan va tugagan vaqt, davomiyligi, kim yaratgani, rasm. Ochilganda ichidagi barcha mahsulotlar ko'rinadi.

Vaqt formati: `12.09.2026 14:31` (24 soat, AM/PM yo'q). Davomiylik: "1 soat 25 daqiqa".

## 6. Sklad bilan bog'lanish
- Sklad harakatlar tarixida nakladnoy raqami ko'rinadi va nakladnoyga havola bo'ladi.
- Skladda mahsulot nomi, miqdori, narxi, valyutasi, jami summa, prixod boshlangan/tugagan vaqti va kim kiritgani nakladnoydan avtomatik olinadi — qayta so'ralmaydi.
- Sklad sahifasidagi "Mahsulot kirimi" tugmasi endi nakladnoy oynasini ochadi; mavjud chiqim, korrektura, instrument va boshqa funksiyalar o'zgarmaydi.

## 7. Responsive
Nakladnoy oynasi kichik ekranda ham viewport ichida qoladi: balandligi cheklangan, mahsulotlar ro'yxati ichki scroll bilan, sarlavha va tugmalar doim ko'rinib turadi.

## Texnik tafsilotlar
- Yangi jadvallar: `invoices` (raqam, status, started_at, finished_at, image_url, supplier, location, order_id, created_by) va `invoice_items` (invoice_id, product_id yoki nomi, unit, quantity, unit_price, currency).
- `stock_movements` ga nullable `invoice_id` va `invoice_item_id` qo'shiladi; `invoice_item_id` bo'yicha unique index duplicate kirimni bloklaydi. Mavjud ustunlar va ma'lumotlar tegilmaydi.
- Yakunlash bitta `finalize_invoice` SECURITY DEFINER funksiyasi ichida: status tekshiruvi, rasm tekshiruvi, mahsulot yaratish/topish, `stock_movements` yozuvlari (mavjud trigger orqali qoldiq va last_price yangilanadi).
- RLS: `invoices`/`invoice_items` uchun admin/warehouse/supply o'qish-yozish; tugatilgan nakladnoyni UPDATE qilish policy darajasida cheklanadi. GRANT'lar migration ichida.
- Rasm `product-images` bucketiga yuklanadi.
- Yangi sahifa `src/pages/InvoicesPage.tsx`, route `/invoices`, `AppSidebar` ga element.
