## HR shtrix-kod: faqat Admin 2
- [x] Admin 2 uchun himoyalangan kod ko‘rish/tahrirlash; unikal kod, eski alias, optimistic tekshiruv va server audit. Barcha 122 HR yozuvi saqlandi.
- [x] HR maydoni, nusxalash/skaner, faol/nofaol kod qidiruvi; boshqa rollarga maydon/PDF/API yopiq. Kod-only tahrir tarixiy HR maydonlarini o‘zgartirmaydi.
- [x] Admin 2 qo‘lda/skaner saqlash va eski/yangi kod; oddiy Admin UI/API rad; 33 test, 575 px dialog va build OK. Sinov kodlari tiklandi, alias/audit qoldi. Fizik skaner mavjud emas.

## Inventarizatsiya qoldig‘i
- [x] Ikki martalik yozish olib tashlandi; save_product_inventory: rol tekshiruvi, mahsulot qulfi, expected-stock, bir martalik delta, audit va nol-delta retry.
- [x] Haqiqiy test mahsulotida 7 API testi: 120/80/100/125/122, parallel ikki saqlash→120 va eski qoldiq rad; 24 regressiya testi, build OK. Admin 2 oynasida 0→120→0 saqlanib ro‘yxatdan o‘qildi. Test mahsuloti 0 qoldiqda, narxi 0; sinov tarixi saqlandi, mavjud mahsulotlar o‘zgarmadi.

## Nakladnoysiz kirim: ta’minotchi xarajatlari
- [x] Alohida xarajatlar, hisob/valyuta/HR tanlovi, tasdiqlash va atomik saqlash.
- [x] Ta’minot tarixi/filtrlari, ruxsatli tahrirlash/o‘chirish, balans va audit.
- [x] 24 test; Admin 2 haqiqiy oynasida USD xarajati saqlanib tarixdan o‘qildi va tasdiqlab o‘chirildi. API: retry/bitta debit, tahrir, eski versiya/payload collision va mablag‘ rad, tovar narx/qoldiq mustaqilligi sinaldi; 390 px oynada tashqi overflow yo‘q. Sinov xarajatlari soft-delete, audit saqlandi, balans tiklandi. Mavjud UZS Ta’minot balansi manfiy: yangi UZS xarajati serverda rad etiladi; eski operatsiyalar o‘zgartirilmadi.

## ERP prefiksli va prefikssiz skaner tekshiruvi
- [x] Barcha katalog manbalari va EN/RU variantlari: umumiy server qidiruvi, saqlangan kod normalizatsiyasi, tarixiy product→instrument bog‘lanishi; tur/kind bo‘yicha aniq tanlov.
- [x] ERP/prefikssiz/zavod/alias/instrument kodlari haqiqiy hisobning API so‘rovlarida topildi; 52 test va build OK. Kod/qoldiq/MXIK yozuvlari o‘zgartirilmadi.
- [ ] Oynadagi to‘liq skaner oqimini qayta tekshirish: joriy o‘z hisobida Sklad yozish/skaner oynalari ochilmaydi; fizik skaner mavjud emas.

## Yakuniy skaner talabi
- [x] Shift/modifikatorlar buferni buzmasligi; umumiy kirim/chiqim tutgichi maydon qiymatini saqlaydi.
- [x] Zavod aliaslari kirim/chiqim/instrument tanlovi, mahsulot/instrument tahriri va yangi mahsulotda; default yorliq filtri.
- [x] Admin 2 brauzerida ERP000000812, RU ERP000000854, MCT00012; miqdor 17 va zakaz o‘zgarmadi. Sinov zavod aliasi ikkala kod bilan topildi va olib tashlandi; raw tarix, collision/MCT rad tekshirildi. 46 tegishli test o‘tdi; fizik qurilma tekshirilmagan.

## Xodim bejigi va chiqim skaneri
- [x] 116 mavjud HR yozuviga 116 doimiy MCT kodi; yangi xodim avtomatik kodi va tahrir taqiqi rollback sinovida tasdiqlandi.
- [x] HR checkbox tanlovi va 4/6/8 talik vektor A4 bejik PDF; haqiqiy sakkiz xodim bitta A4 sahifada, matn vektor.
- [x] Faqat chiqim/instrument berishda xodim+tovar skaneri; miqdor va zakaz saqlanadi, kirim skaneriga tegilmadi.
- [x] 21 test; Admin 2 brauzerida uchala chiqim oynasida ikki kod va miqdor 17/9/2 saqlanishi, tashqi sahifada ishlamasligi, 575 px ekran tekshirildi. Haqiqiy chiqim saqlanmadi; fizik printer/skaner mavjud emas.

## Qo‘lda shtrix-kod va tahrirlash
- [x] Sverka yangi mahsulotida qo‘lda kod/avtogeneratsiya va saqlangan kod yorlig‘i.
- [x] Vakolatli mahsulot turi kodi tahriri, barcha partiyalar sinxronligi, eski alias va audit.
- [x] 38 frontend test; DB rollback: qo‘lda/avto kod, tahrir, eski/yangi scan, canonical/alias dublikat, retry, audit, ruxsatsiz rad va eski katalog/Kassa/Nakladnoy saqlanishi. Admin 2 brauzerida yangi maydon, mavjud kod, o‘zgarmagan kodni saqlash taqiqi va haqiqiy 40×30 mm PDF tekshirildi. Brauzerda real mahsulot kodi/kirimi o‘zgartirilmadi; fizik printer/skaner tekshirilmagan.

## Sklad sverka va qo‘lda MXIK
- [x] Nakladnoysiz atomik, takrorlanmaydigan sverka kirimi; o‘zgarmas tarix, eski/yangi qoldiq va Kassa/Ta’minotdan mustaqillik.
- [x] Sklad/bosh buxgalter/admin uchun tasdiqlanadigan MXIK tahriri va server auditi; matn va boshlang‘ich nollar saqlanadi.
- [x] 29 frontend test; bazada rollback bilan mavjud/yangi mahsulot, dublikat/retry, rollar, audit, narxlar va Kassa/Nakladnoy/Qarz mustaqilligi sinaldi. Brauzerda Sklad useri kirim tasdiqlash oynasi va mavjud MXIKni o‘zgartirmay saqlash sinaldi; brauzer orqali yangi sverka kirimi real qoldiqqa saqlanmadi.

## Mahsulot turi bo‘yicha shtrix-kod
- [x] 790 katalog yozuvi zaxirasi; 544 mahsulotda kod dublikati yo‘q, mavjud instrumentga bog‘langan tarixiy kod alias sifatida saqlandi. Mahsulot qiymatlari va instrument biznes qiymatlari o‘zgarmadi.
- [x] 789 doimiy tur ID/kod, faqat shtrix-kod skaneri (MXIK oddiy qidiruvda), tur IDli qidiruv/guruhlash, dublikat yaratishni bloklash va ommaviy 40×30 mm yorliqlar.
- [x] 12 test, haqiqiy Bolt ikki kirimi/Office/Sklad/rename/price rollback sinovi, dublikat rad etilishi, haqiqiy hisob bilan 4 sahifali 40×30 PDF va 427/417/34 hamda 49/129 ro‘yxatlari tekshirildi. Yakuniy sonli hisobot tayyor.
- [ ] 49 instrument guruhidagi 129 yozuvning turini tasdiqlash: model/o‘lcham/xususiyatlar yetishmaydi, birlashtirilmadi. Avvalgi 34 noaniq manba yozuvi saqlandi; fizik printer va xatolar.xlsx vazifalari pastda.

## Sklad: nomlar, MXIK va skaner
- [x] 451 moslik tekshirildi: 427 nom/alias, 417 skript MXIK; 34 yozuv tekshiruvga (4 takroriy eski nom, 11 yangi nom to‘qnashuvi, 9 topilmagan, 10 NULL MXIK). 544 mahsulot snapshots/audit saqlandi; qoldiq, narx va birlik o‘zgarmadi, moslikdan tashqari mahsulot nomlariga tegilmadi.
- [x] Eski/yangi nom qidiruvi, alohida ID filtri, 544 mahsulot va 246 instrument uchun unikal Code 128 shtrix-kod; tegishli pickerlar, nakladnoy/tarix va hisobot tanlovi yangilandi.
- [x] Admin 2 hisobida kirim/chiqim skaneri, dona 1→2, kg o‘zgarmasligi, umumiy MXIKdan aniq tanlash, noma’lum koddan yaratish tugmasi va 40×30 mm PDF tekshirildi; 10 test o‘tdi. Tekshiruvda yangi kirim/chiqim yozuvi saqlanmadi.
- [ ] Rasmiy NULL MXIK tasdiqlash: 11 manba yozuviga aniqlashtiruvchi texnik ma’lumot yetishmaydi; 10 tasi bazada topilib alohida tekshiruvga qo‘yildi, bittasi topilmadi. Jami katalogda 126 kodsiz mahsulot bor. Kodlar taxmin qilinmadi.
- [ ] Fizik XP-365B va skaner: qurilmalarga kirish yo‘q, haqiqiy yorliq bosish/o‘qish tasdiqlanmagan; brauzer klaviatura skaneri emulyatsiyasi va PDF tekshirildi.
- [ ] 75 xatoli manba mahsuloti uchun alohida nomli hisobot: xatolar.xlsx biriktirilmagan; 451 moslikdan tashqaridagi barcha nomlar o‘zgartirilmagan.

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

## Sklad kirimi — "Qarz" to'lov turi
- [x] Naqd/O'tkazma/Korporativ karta/Qarz tanlovi; Qarz yakunlanganda Kassa → Qarz'ga bir marta yoziladi (manba "Sklad tovar kirimi"), tahrir/bekor sinxron, to'lov bo'lsa o'chirish bloklanadi; Ta'minot kassasidan ayrilmaydi. 4 tur DB'da sinaldi.

## Sklad: tarix asosida qoldiq + Skaner tarixi
- [x] scan_history jadvali (RLS: yozish o'z nomidan, o'qish admin/warehouse/chief_accountant), log_scan/finalize_scan RPC, stock_balance_check() — 18 mahsulotda tarixiy farq (boshlang'ich qoldiq tarixsiz), avtomatik o'zgartirish yo'q.
- [x] Skaner tarixi tabi (Harakatlar tarixi yonida): sana/nom/kod/foydalanuvchi/modul/amal/natija filtrlari; CatalogScanner barcha 5 nuqtada (Sklad, Kirim, Chiqim×2, Sverka) tarix yozadi; chiqim/sverka tasdiqlanganda miqdor va yakuniy qoldiq bog'lanadi.
- [x] 122 test o'tdi, build toza; Admin 2 brauzerida Topildi/Topilmadi yozuvlari, tab va tekshiruv oynasi tekshirildi. Nakladnoy kirimida miqdor skaner yozuviga bog'lanmaydi (sessiya serverda yakunlanadi).

## Skaner shtrix-kod maydoniga tushishi (03.11.2026) — TAYYOR
- [x] Yagona skaner kanali (scanChannel.ts): faqat eng yuqori oyna skaneri hodisani qayta ishlaydi
- [x] BarcodeScanField: Shtrix-kod maydoni + Skanerlash tugmasi (tahrirlash oynasi, Sverka yangi mahsulot)
- [x] Sverka: noma'lum kod → "Yangi mahsulot yaratish" taklifi, kod avtomatik shtrix-kod maydoniga
- [x] Testlar: 29 o'tdi, build OK; brauzerda Admin 2 bilan 4 oqim tekshirildi (DB o'zgartirilmadi)
