
## SEL raqamlarini aniq tuzatish
- [x] 07N26149–07N26159 aynan SEL0081–SEL0091 ga o‘tkazildi; eski raqamlar, tarix va audit saqlandi, takroriy raqam yo‘q.
- [x] SEL ro‘yxati sonli kamayish tartibida; 11 zakaz bazada va haqiqiy foydalanuvchi sahifasida tekshirildi, eski raqamlar qavsda ko‘rinmaydi, qidiruvda ishlaydi. 32 test o‘tdi; 129 zakaz, 2473 bosqich, 462 topshiriq va detallar saqlandi.

## Zakaz prefikslarini kengaytirish
- [x] Backend va frontendga olti yangi prefiks qo‘shildi; SEL alohida va boshqa prefikslar umumiy ketma-ketlikda. Mahsulot turi aniq 5 faol zakaz raqami tarix bilan yangilandi.
- [x] 29 test o‘tdi; admin2 hisobida joriy/ikki eski raqam orqali qidiruv, tugallanganlar tasdiqlash tugmasi va PDF yuklanishi tekshirildi; 129 zakaz, bosqichlar, detallar va topshiriqlar saqlandi, takroriy raqam yo‘q.
- [ ] Foydalanuvchi ko‘rsatgan 33/31/30/29/28/27/26/25/21/2/11/6 zakazlarni aynan aniqlash: to‘liq zakaz raqami yoki ro‘yxat rasmi kerak. Joriy raqamlar va navbat pozitsiyalari aytilgan mahsulot turlariga mos emas; taxminiy almashtirish bajarilmadi.

## Sklad yonida Ta’minot
- [x] Mavjud Ta’minot havolasi Sklad yoniga joylashtirildi; sahifa va API ko‘rish ruxsatlari moslandi, 4 test o‘tdi va haqiqiy 37 so‘rov bilan menyudan o‘tish tekshirildi.

## Ta’minot asosiy ro‘yxati
- [x] Asosiy sahifada 35 haqiqiy buyurtmaning mahsuloti, miqdori, zakaz havolasi, uchta sana va holati tekshirildi; umumiy kategoriya bloklari neytral.
- [x] Kelmagan mahsulotning kelish sanasi yashirildi; vaqt saqlanmagan muddatda “Vaqt belgilanmagan” ko‘rsatiladi. 9 test o‘tdi; 1280 px va 390 px ekranlar hamda mavjud tafsilotga o‘tish tekshirildi, ma’lumotlar o‘zgarmadi.

## Ta’minot dizayn va sana ko‘rinishi
- [x] Buyurtma berish tugmasi, Muddat/sanalarni faqat ko‘rinishda yangilash. (Kartochkalardagi to‘q fon keyingi so‘rov bilan oq fonga qaytarildi.)
- [x] Haqiqiy buyurtmalar va buyurtma oynasi 1280 px desktop hamda 390 px mobil ekranlarda tekshirildi; to‘q qizil/yashil fon, oq matn, DD.MM.YYYY va 24 soatlik sanalar tasdiqlandi. Besh regressiya testi o‘tdi; ma’lumotlar o‘zgartirilmadi.

## Kassa navigatsiya layout (yangi)
- [x] Kassa/Ta'minot + Hisobot/Qarz tugmalari joyi barqaror (sticky header, shrink-0)

## Buriyev Shuxrat ism ko‘rinishi
- [x] Lotincha Buriyev Shuxrat va rus/kirillcha Буриев Шухрат HR, Sklad, Instrument va tarixda tilga mos ko‘rinsin; boshqa xodimlar va saqlangan ma’lumotlar o‘zgarmasin.
- Daily tasks module (admin/otk/manager) — done

## Zakaz hisoboti kartochkalari
- [x] Rangli kartochkalar, umumiy status filtri va mos hisoblagichlarni amalga oshirish va tekshirish.
- [x] Asosiy Admin va Admin 2 hisoblarida kartochkalarni amalda tekshirish.

## ERP ekran kengligiga moslashish
- [x] Umumiy sahifa, jadval va modal kengliklarini tuzatish.
- [x] 26 modulni 1280, 1024, 768 va 390 px kengliklarda tekshirish; tashqi gorizontal overflow qolmadi.
- [x] Kirilgan hisobda haqiqiy zakaz tafsiloti/hisoboti/tahriri, mijoz, menyu ochiq/yopiq holati va yettita modalni tekshirish; 13 regressiya testi o‘tdi. Mobil tekshiruv Chromium ekran emulyatsiyasida bajarildi, fizik Android/iPhone qurilmalari tekshirilmadi.

## Сварочные перчатки
- [x] Mavjud 20 dona qoldiq mavjud instrumentga bir marta o‘tkazildi; 2 kirim va 12 berish/qaytarish yozuvi saqlandi, yangi instrument yaratilmadi.
- [x] Oddiy mahsulotlardan chiqarildi; real ilovada qoldiq, instrument berish tanlovi va hisobot tarixi tekshirildi. Qaytarish/berish va bog‘langan stock triggerlari rollback bilan tekshirildi; tasnif testi o‘tdi.

## Ta’minot kartochkalari: oq fon va rangli status yozuvlari
- [x] Barcha buyurtma, kategoriya va filtr kartalari oq fonga qaytarildi; qizil/yashil faqat status yozuvi, belgi va ixcham chipda.
- [x] Status, mahsulot nomi, miqdor va sanalar kattaroq/qalinroq qilindi; zakaz raqami har kartochkada, sanalar DD.MM.YYYY HH:mm.
- [x] 1280 px va 390 pxda tekshirildi; 5 sana testi, typecheck va build toza; ma’lumotlar va biznes-logika o‘zgarmadi.

## Ta’minot kartochkalari: ixcham va to‘q status ranglari
- [x] Kutilmoqda kartochkasi to‘q qizil, Ta’minlandi kartochkasi to‘q yashil fon, barcha yozuvlar oq; asosiy ro‘yxat, guruh ichi va zakaz tafsilotidagi “Sklad” bo‘limida bir xil.
- [x] Ichki padding 10–12 px, matnlar kichraytirildi, hech bir ma’lumot, sana, izoh yoki tugma olib tashlanmadi.
- [x] 1280 px va 390 pxda tekshirildi; tanlangan kartochkada ham matn oq qoladi; 23 test va typecheck toza.

## Ta'minot 2 va Shovkat
- [x] Kassa menyuda birinchi; Kassa | Ta'minot | Ta'minot 2 tablari
- [x] taminot2@gmail.com (Ta'minot + Sklad rollari)
- [x] Shovkat kirimlari Ta'minot 2 balansidan (narx x miqdor), alohida hisob

## Zakazlar: Tugallangan yashil, Istisno qizil
- [x] Statistik kartochkalar, status/prioritet belgilari, tablar va zakazlar ro‘yxati bitta rangda: Tugallangan — to‘q yashil, Istisno — to‘q qizil; rangli fon ustida oq yozuv.
- [x] Ro‘yxat qatorlari o‘sha rangning yumshoq tusi + chapda to‘q chiziq bilan (matn qora va o‘qiladigan); real ma‘lumotlar bilan brauzerda tekshirildi, 46 test o‘tdi.
