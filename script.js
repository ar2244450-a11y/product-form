// ⚠️ استبدل الرابط ده برابط الـ Webhook بتاعك من n8n
const WEBHOOK_URL = "https://overfeed-unwilling-contently.ngrok-free.dev/webhook/products-batch";

let productCount = 0;
const container = document.getElementById('productsContainer');
const form = document.getElementById('mainForm');
const submitBtn = document.getElementById('submitBtn');
const statusMsg = document.getElementById('statusMsg');

function addProduct(){
  productCount++;
  const id = productCount;
  const block = document.createElement('div');
  block.className = 'product-block';
  block.dataset.id = id;
  block.innerHTML = `
    <span class="p-num">منتج ${id}</span>
    ${id > 1 ? `<button type="button" class="remove-btn" onclick="removeProduct(${id})">حذف ✕</button>` : ''}
    <div class="field">
      <label>اسم الموديل <span class="req">*</span></label>
      <input type="text" class="p-name" required>
    </div>
    <div class="field">
      <label>وصف المنتج <span class="req">*</span></label>
      <textarea class="p-description" required maxlength="2000" rows="3" placeholder="اكتب وصف المنتج والخامة والتفاصيل"></textarea>
    </div>
    <div class="row2">
      <div class="field">
        <label>السعر <span class="req">*</span></label>
        <input type="number" class="p-price" required min="0.01" step="0.01" inputmode="decimal">
      </div>
      <div class="field">
        <label>الكمية المتاحة</label>
        <input type="number" class="p-stock" min="0" step="1" value="0" inputmode="numeric">
      </div>
    </div>
    <div class="row2">
      <div class="field">
        <label>الألوان (مفصولة بفاصلة)</label>
        <input type="text" class="p-colors" placeholder="أحمر,أزرق,أسود" required>
      </div>
      <div class="field">
        <label>المقاسات (مفصولة بفاصلة)</label>
        <input type="text" class="p-sizes" placeholder="M,L,XL" required>
      </div>
    </div>
    <div class="field">
      <label>التصنيف</label>
      <select class="p-category" required>
        <option value="ملابس رجالي">ملابس رجالي</option>
        <option value="ملابس حريمي">ملابس حريمي</option>
        <option value="ملابس أطفال">ملابس أطفال</option>
        <option value="أحذية">أحذية</option>
        <option value="إكسسوارات">إكسسوارات</option>
      </select>
    </div>
    <div class="field">
      <label>صورة المنتج <span class="req">*</span></label>
      <div class="img-upload">
        <span class="hint">اضغط لاختيار صورة (jpg/png)</span>
        <input type="file" class="p-image" accept=".jpg,.jpeg,.png,.webp" required>
        <img class="img-preview" alt="معاينة صورة المنتج">
      </div>
    </div>
  `;
  container.appendChild(block);

  const fileInput = block.querySelector('.p-image');
  const preview = block.querySelector('.img-preview');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if(file){
      const reader = new FileReader();
      reader.onload = e => {
        preview.src = e.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  });
}

function removeProduct(id){
  const block = container.querySelector(`[data-id="${id}"]`);
  if(block) block.remove();
}

function fileToBase64(file){
  return new Promise((resolve, reject) => {
    if(!file){ resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[char]));
}

function clearValidationErrors(){
  document.querySelectorAll('.field-error').forEach(error => error.remove());
  document.querySelectorAll('[aria-invalid="true"]').forEach(input => {
    input.removeAttribute('aria-invalid');
  });
}

function addFieldError(input, message){
  if(!input) return;
  input.setAttribute('aria-invalid', 'true');
  const error = document.createElement('small');
  error.className = 'field-error';
  error.textContent = message;
  input.closest('.field')?.appendChild(error);
}

function showPageErrors(errors){
  statusMsg.innerHTML = `<strong>راجع البيانات التالية:</strong><ul>${errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`;
  statusMsg.className = 'status-msg err';
  statusMsg.scrollIntoView({behavior: 'smooth', block: 'nearest'});
}

function setSubmitting(isSubmitting){
  submitBtn.disabled = isSubmitting;
  submitBtn.classList.toggle('is-loading', isSubmitting);
  submitBtn.setAttribute('aria-busy', String(isSubmitting));
  submitBtn.querySelector('.submit-label').textContent = isSubmitting ? 'جاري الإرسال...' : 'إرسال جميع المنتجات';
}

function extractServerError(data, fallback){
  if(typeof data === 'string' && data.trim()) return data;
  if(data?.error) return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
  if(data?.message) return data.message;
  return fallback;
}

function normalizePhone(value){
  return String(value ?? '')
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
    .replace(/[\s()-]/g, '');
}

addProduct(); // منتج واحد افتراضي عند فتح الصفحة

document.getElementById('addProductBtn').addEventListener('click', addProduct);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearValidationErrors();
  statusMsg.style.display = 'none';

  const blocks = [...container.querySelectorAll('.product-block')];
  const validationErrors = [];

  const merchantName = document.getElementById('merchantName').value.trim();
  const merchantPhoneInput = document.getElementById('merchantPhone');
  const merchantPhone = normalizePhone(merchantPhoneInput.value);
  if(!merchantName) validationErrors.push('اسم التاجر مطلوب');
  if(!merchantPhone){
    validationErrors.push('رقم التليفون مطلوب');
    addFieldError(merchantPhoneInput, 'رقم التليفون مطلوب');
  } else if(!/^\d{11}$/.test(merchantPhone)){
    validationErrors.push('رقم التليفون يجب أن يتكون من 11 رقمًا بالضبط');
    addFieldError(merchantPhoneInput, 'اكتب 11 رقمًا بالضبط');
  }
  if(!blocks.length) validationErrors.push('أضف منتجًا واحدًا على الأقل');

  blocks.forEach((block, index) => {
    const label = `المنتج ${index + 1}`;
    const priceInput = block.querySelector('.p-price');
    const price = Number(priceInput.value);
    if(!Number.isFinite(price) || price <= 0){
      const message = `${label}: السعر يجب أن يكون أكبر من صفر`;
      validationErrors.push(message);
      addFieldError(priceInput, 'السعر يجب أن يكون أكبر من صفر');
    }

    const descriptionInput = block.querySelector('.p-description');
    if(!descriptionInput.value.trim()){
      validationErrors.push(`${label}: وصف المنتج مطلوب`);
      addFieldError(descriptionInput, 'وصف المنتج مطلوب');
    }

    const stock = Number(block.querySelector('.p-stock').value);
    if(!Number.isInteger(stock) || stock < 0){
      validationErrors.push(`${label}: الكمية يجب أن تكون رقمًا صحيحًا غير سالب`);
    }

    if(!block.querySelector('.p-name').value.trim()) validationErrors.push(`${label}: اسم المنتج مطلوب`);
    if(!block.querySelector('.p-image').files[0]) validationErrors.push(`${label}: صورة المنتج مطلوبة`);
  });

  if(validationErrors.length){
    showPageErrors(validationErrors);
    return;
  }

  setSubmitting(true);
  statusMsg.style.display = 'none';

  try{
    const products = await Promise.all(blocks.map(async block => {
      const fileInput = block.querySelector('.p-image');
      const file = fileInput.files[0];
      const base64 = await fileToBase64(file);
      return {
        name: block.querySelector('.p-name').value.trim(),
        description: block.querySelector('.p-description').value.trim(),
        price: Number(block.querySelector('.p-price').value),
        stock: Number(block.querySelector('.p-stock').value) || 0,
        colors: block.querySelector('.p-colors').value.split(',').map(s=>s.trim()).filter(Boolean),
        sizes: block.querySelector('.p-sizes').value.split(',').map(s=>s.trim()).filter(Boolean),
        category: block.querySelector('.p-category').value,
        image_base64: base64,
        image_filename: file ? file.name : null
      };
    }));

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'mlys_7hK2pQ9xR4vN8wZ3tY6'
      },
      body: JSON.stringify({
        merchant_name: merchantName,
        merchant_phone: merchantPhone,
        products
      })
    });

    const responseText = await res.text();
    let data = {};
    try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = responseText; }
    if(!res.ok) throw new Error(extractServerError(data, `فشل الإرسال (${res.status})`));

    const results = data.results || [];
    if(results.length){
      const rejected = results.filter(r => r.status === 'rejected');
      const partial = results.filter(r => r.status === 'partial');
      const accepted = results.filter(r => r.status === 'success');
      let html = '';
      if(accepted.length) html += `<div>✅ تم إضافة ${accepted.length} منتج بالكامل</div>`;
      if(partial.length) html += partial.map(r => `<div class="result-line">⚠️ "${escapeHtml(r.product_name)}": ${escapeHtml(r.reason)}</div>`).join('');
      if(rejected.length) html += rejected.map(r => `<div class="result-line">❌ "${escapeHtml(r.product_name)}": ${escapeHtml(r.reason)}</div>`).join('');
      statusMsg.innerHTML = html;
      statusMsg.className = (rejected.length || partial.length) ? 'status-msg err' : 'status-msg ok';
      if(rejected.length || partial.length) return;
    } else {
      statusMsg.textContent = '✅ تم إرسال المنتجات بنجاح';
      statusMsg.className = 'status-msg ok';
    }

    form.reset();
    container.innerHTML = '';
    productCount = 0;
    addProduct();
  }catch(err){
    showPageErrors([err.message || 'حصل خطأ أثناء الإرسال، حاول تاني']);
  }finally{
    setSubmitting(false);
  }
});
