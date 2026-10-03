import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const MAX_PRODUCTS = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} مطلوب`);
  }
  const result = value.trim();
  if (result.length > maxLength) throw new Error(`${field} طويل جدًا`);
  return result;
}

function cleanList(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new Error(`${field} يجب أن يكون قائمة`);
  const result = value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 30);
  if (!result.length) throw new Error(`${field} مطلوب`);
  if (result.some((item) => item.length > 50)) {
    throw new Error(`${field} يحتوي على قيمة طويلة جدًا`);
  }
  return result;
}

function decodeBase64(value: unknown) {
  if (typeof value !== "string" || !value) {
    throw new Error("صورة المنتج مطلوبة");
  }
  // Accept both raw base64 and data URLs, but never trust a client-provided path.
  const base64 = value.includes(",") ? value.split(",", 2)[1] : value;
  const normalized = base64.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("صيغة الصورة غير صحيحة");
  }
  const estimatedBytes = Math.floor(normalized.length * 3 / 4);
  if (estimatedBytes > MAX_IMAGE_BYTES) throw new Error("حجم الصورة يجب ألا يتجاوز 5 ميجابايت");
  return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
}

function extensionForMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function requestKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") || "unknown";
  const ip = forwarded.split(",")[0].trim();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);

  try {
    const body = await request.json();
    const merchantName = requiredText(body.merchant_name, "اسم التاجر", 120);
    const merchantPhone = requiredText(body.merchant_phone, "رقم الهاتف", 30);
    const products = body.products;

    if (!Array.isArray(products) || products.length < 1 || products.length > MAX_PRODUCTS) {
      return json({ error: `يمكن إرسال من 1 إلى ${MAX_PRODUCTS} منتجات فقط` }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: allowed, error: rateLimitError } = await supabase.rpc(
      "consume_product_rate_limit",
      { p_rate_key: await requestKey(request), p_window_seconds: 3600, p_max_requests: 10 },
    );
    if (rateLimitError) throw rateLimitError;
    if (!allowed) return json({ error: "تم تجاوز عدد المحاولات المسموح بها، حاول لاحقًا" }, 429);

    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .upsert({ name: merchantName, phone: merchantPhone }, { onConflict: "phone" })
      .select("id")
      .single();
    if (merchantError) throw merchantError;

    const results = [];
    for (const raw of products) {
      try {
        const name = requiredText(raw.name, "اسم المنتج", 160);
        const description = requiredText(raw.description, "وصف المنتج", 2000);
        const category = requiredText(raw.category, "التصنيف", 100);
        const price = Number(raw.price);
        const stock = Number(raw.stock ?? 0);
        const colors = cleanList(raw.colors, "الألوان");
        const sizes = cleanList(raw.sizes, "المقاسات");
        const mimeType = String(raw.image_mime_type || "image/jpeg").toLowerCase();

        if (!Number.isFinite(price) || price < 0) throw new Error("السعر غير صحيح");
        if (!Number.isInteger(stock) || stock < 0) throw new Error("المخزون غير صحيح");
        if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error("نوع الصورة غير مسموح");

        const bytes = decodeBase64(raw.image_base64);
        const filePath = `${merchant.id}/${crypto.randomUUID()}.${extensionForMime(mimeType)}`;
        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, bytes, { contentType: mimeType, upsert: false });
        if (uploadError) throw uploadError;

        const { data: publicUrl } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        const { data: product, error: productError } = await supabase
          .from("products")
          .upsert({ name, description, category, colors, sizes, image_url: publicUrl.publicUrl }, { onConflict: "name" })
          .select("id, name, image_url")
          .single();
        if (productError) throw productError;

        const { data: relation, error: relationError } = await supabase
          .from("merchant_products")
          .upsert(
            { merchant_id: merchant.id, product_id: product.id, price, stock, status: "active" },
            { onConflict: "merchant_id,product_id" },
          )
          .select("id, price, stock, status")
          .single();
        if (relationError) throw relationError;

        results.push({ status: "success", product_name: name, product, relation });
      } catch (error) {
        results.push({
          status: "rejected",
          product_name: typeof raw?.name === "string" ? raw.name : "غير معروف",
          reason: error instanceof Error ? error.message : "بيانات المنتج غير صحيحة",
        });
      }
    }

    return json({
      success: results.some((item) => item.status === "success"),
      results,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "حدث خطأ في الخادم" }, 400);
  }
});
