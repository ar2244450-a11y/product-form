# Backend آمن لنموذج التاجر

## ما الذي تم تغييره؟

- إزالة `X-API-Key` من الواجهة؛ أي قيمة داخل GitHub ليست سرًا.
- استبدال رابط ngrok بـ Supabase Edge Function ثابت.
- حفظ الصورة داخل Storage بمسار عشوائي لا يعتمد على اسم الملف الذي يرسله المستخدم.
- منع الصور الأكبر من 5 MB، وقبول JPG/PNG/WebP فقط.
- التحقق من اسم التاجر، الهاتف، الاسم، الوصف، التصنيف، السعر، المخزون، الألوان والمقاسات على الخادم.
- إضافة حد مبدئي: 10 طلبات لكل عنوان شبكة خلال ساعة.
- استخدام `SUPABASE_SERVICE_ROLE_KEY` داخل Edge Function فقط، وليس في GitHub أو المتصفح.

## قبل النشر

1. اعتبر المفتاح الموجود سابقًا في `script.js` مكشوفًا وقم بإلغائه/تغييره من n8n فورًا.
2. تأكد من وجود عمود الوصف في جدول `products`:

```sql
alter table public.products
add column if not exists description text;
```

3. تأكد من وجود Bucket عام باسم `product-images`، أو نفّذ SQL السابق الخاص بـ Supabase.
4. نفّذ ملف الـ migration:

```text
supabase/migrations/20261003_product_backend_security.sql
```

## النشر من جهاز عليه Supabase CLI

من مجلد المشروع:

```bash
supabase login
supabase link --project-ref kspmbudswoznitmvkduw
supabase db push
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="ضع_مفتاح_service_role_هنا"
supabase functions deploy products-batch --no-verify-jwt
```

`SUPABASE_SERVICE_ROLE_KEY` لا يوضع في أي ملف Frontend ولا يتم رفعه إلى GitHub.

## بعد النشر

الرابط المستخدم في الواجهة هو:

```text
https://kspmbudswoznitmvkduw.supabase.co/functions/v1/products-batch
```

يجب أن يكون الموقع منشورًا على:

```text
https://ar2244450-a11y.github.io/product-form/
```

لأن الـ CORS حاليًا يسمح بهذا الأصل فقط.

## شكل الطلب

```json
{
  "merchant_name": "اسم التاجر",
  "merchant_phone": "01000000000",
  "products": [
    {
      "name": "تيشيرت قطني",
      "description": "وصف المنتج والخامة والتفاصيل",
      "price": 350,
      "stock": 20,
      "colors": ["أسود", "أبيض"],
      "sizes": ["M", "L", "XL"],
      "category": "ملابس رجالي",
      "image_base64": "...",
      "image_filename": "shirt.jpg",
      "image_mime_type": "image/jpeg"
    }
  ]
}
```

## تنبيه أمني

هذا الـ endpoint عام لأن التاجر لا يسجل دخولًا حاليًا. يوجد rate limit أساسي، لكن أقوى حماية للإنتاج هي إضافة Cloudflare Turnstile أو تسجيل دخول للتاجر قبل قبول الطلب. لا تعيد أي Supabase secret إلى المتصفح.
