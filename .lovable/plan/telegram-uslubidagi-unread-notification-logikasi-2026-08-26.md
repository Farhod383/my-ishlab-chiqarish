# Telegram uslubidagi unread notification logikasi

## Maqsad
Bildirishnoma badge’larini umumiy `notifications.read_at` maydonidan ajratib, har bir foydalanuvchi uchun alohida va bazada saqlanadigan read/unread holatiga o‘tkazish. Mavjud notificationlar o‘chirilmaydi.

## Amalga oshirish

### 1. Har bir user uchun alohida holat
- `notification_user_states` jadvali yaratiladi: `notification_id`, `user_id`, `is_read`, `read_at`, `created_at`.
- `(notification_id, user_id)` yagona bo‘ladi; bir userning o‘qishi boshqa user holatiga ta’sir qilmaydi.
- RLS orqali foydalanuvchi faqat o‘z holatini ko‘rishi va o‘zgartirishi mumkin bo‘ladi.
- Mavjud notificationlar tegishli userlar uchun backfill qilinadi; notification yozuvlarining o‘zi saqlanadi.

### 2. Yangi notificationlarni real vaqtda tarqatish
- Yangi notification yaratilganda backend trigger uning aniq qabul qiluvchilari uchun unread holat yozuvlarini yaratadi.
- Shaxsiy, rolga yuborilgan va Admin/Nachalnik ko‘radigan notificationlar mavjud ruxsat mantiqiga mos taqsimlanadi.
- Badge soni `is_read = false` bo‘lgan real baza yozuvlaridan olinadi; frontenddagi statik yoki umumiy `read_at` hisobiga tayanmaydi.

### 3. Telegram uslubidagi UI xatti-harakati
- Yangi notification realtime kelganda tegishli user badge’i avtomatik `+1` bo‘ladi.
- Modul ichidagi notificationlar ko‘ringanda ular shu user uchun avtomatik read qilinadi va counter kamayadi.
- Notification bosilib sahifaga o‘tilishidan oldin ham read holati saqlanadi.
- “Barchasini o‘qildi” faqat joriy userning unread yozuvlarini yangilaydi.
- Unread notificationlar vizual ajralib turadi; counter `0` bo‘lsa badge butunlay yashiriladi.
- Sidebar modul badge’lari ham ayni per-user baza holatidan hisoblanadi.

### 4. Barqarorlik va tekshiruv
- Refresh, logout/login va route almashishda holat bazadan qayta yuklanadi va read xabarlar qayta unread bo‘lmaydi.
- Optimistic UI xatosi yuz bersa baza holati qayta yuklanib counter tiklanadi.
- Ikki alohida user kontekstida read mustaqilligi, realtime `+1`, avtomatik kamayish, “Barchasini o‘qildi” va navigatsiya orqali read holati tekshiriladi.

## Texnik tafsilotlar
- `notifications` — notification kontenti va yo‘naltirish ma’lumoti sifatida qoladi.
- Yangi per-user state jadvali notification kontentini takrorlamaydi va eski ma’lumotlarni o‘chirmaydi.
- Frontend notification context’i state jadvali bilan join/query qiladi va realtime INSERT/UPDATE eventlarini tinglaydi.
