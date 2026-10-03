// ⚠️ استبدل الرابط ده برابط الـ Webhook بتاعك من n8n
const WEBHOOK_URL = "https://overfeed-unwilling-contently.ngrok-free.dev/webhook/products-batch";

let productCount = 0;
const container = document.getElementById('productsContainer');

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
    <div class="row2">
      <div class="field">
        <label>السعر <span class="req">*</span></label>
        <input type="number" class="p-price" required min="0">
      </div>
      <div class="field">
        <label>الكمية المتاحة</label>
        <input type="number" class="p-stock" min="0" value="0">
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
        <input type="file" class="p-image" accept=".jpg,.jpeg,.png" required>
        <img class="img-preview">
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

addProduct(); // منتج واحد افتراضي عند فتح الصفحة
document.getElementById('addProductBtn').addEventListener('click', addProduct);

document.getElementById('mainForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('submitBtn');
  const statusMsg = document.getElementById('statusMsg');
  submitBtn.disabled = true;
  submitBtn.textContent = 'جاري الإرسال...';
  statusMsg.style.display = 'none';

  try{
    const blocks = [...container.querySelectorAll('.product-block')];
    const products = await Promise.all(blocks.map(async block => {
      const fileInput = block.querySelector('.p-image');
      const file = fileInput.files[0];
      const base64 = await fileToBase64(file);
      return {
        name: block.querySelector('.p-name').value,
        price: Number(block.querySelector('.p-price').value),
        stock: Number(block.querySelector('.p-stock').value) || 0,
        colors: block.querySelector('.p-colors').value.split(',').map(s=>s.trim()).filter(Boolean),
        sizes: block.querySelector('.p-sizes').value.split(',').map(s=>s.trim()).filter(Boolean),
        category: block.querySelector('.p-category').value,
        image_base64: base64,
        image_filename: file ? file.name : null
      };
    }));

    const payload = {
      merchant_name: document.getElementById('merchantName').value,
      merchant_phone: document.getElementById('merchantPhone').value,
      products
    };

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'mlys_7hK2pQ9xR4vN8wZ3tY6'
      },
      body: JSON.stringify(payload)
    });

    if(!res.ok) throw new Error('فشل الإرسال');

    const data = await res.json();
    const results = data.results || [];

    if(results.length){
      const rejected = results.filter(r => r.status === 'rejected');
      const partial = results.filter(r => r.status === 'partial');
      const accepted = results.filter(r => r.status === 'success');

      let html = '';
      if(accepted.length){
        html += `<div>✅ تم إضافة ${accepted.length} منتج بالكامل</div>`;
      }
      if(partial.length){
        html += partial.map(r =>
          `<div style="margin-top:6px;">⚠️ "${r.product_name}": ${r.reason}</div>`
        ).join('');
      }
      if(rejected.length){
        html += rejected.map(r =>
          `<div style="margin-top:6px;">❌ "${r.product_name}": ${r.reason}</div>`
        ).join('');
      }
      statusMsg.innerHTML = html;
      statusMsg.className = (rejected.length || partial.length) ? 'status-msg err' : 'status-msg ok';
    } else {
      statusMsg.textContent = '✅ تم إرسال المنتجات بنجاح';
      statusMsg.className = 'status-msg ok';
    }

    document.getElementById('mainForm').reset();
    container.innerHTML = '';
    productCount = 0;
    addProduct();

  }catch(err){
    statusMsg.textContent = '❌ حصل خطأ أثناء الإرسال، حاول تاني';
    statusMsg.className = 'status-msg err';
  }finally{
    submitBtn.disabled = false;
    submitBtn.textContent = 'إرسال جميع المنتجات';
  }
});
