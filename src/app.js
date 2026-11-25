(() => {
  "use strict";
  const { state, persist, totals } = window.POS_STORE;
  const app = document.querySelector("#app");
  const rupiah = value => new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", maximumFractionDigits:0 }).format(value);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[char]));
  const PASSWORD_HASH_ITERATIONS = 150000;
  let toastTimer;
  let modifierProduct = null;
  let modifier = { temperature:"Ice", size:"Regular", sugar:"Normal", ice:"Normal", note:"", price:0 };

  function toast(message) {
    let el = document.querySelector("#toast");
    if (!el) { el = document.createElement("div"); el.id="toast"; el.className="toast"; el.hidden=true; document.body.appendChild(el); }
    el.textContent=message; el.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.hidden=true,2200);
  }

  function toBase64(bytes){
    return btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join(""));
  }

  function fromBase64(value){
    return Uint8Array.from(atob(value),character=>character.charCodeAt(0));
  }

  async function derivePasswordBits(password,salt,iterations){
    const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations,hash:"SHA-256"},material,256));
  }

  async function hashPassword(password){
    if(!crypto?.subtle)throw new Error("Web Crypto tidak tersedia pada browser ini.");
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const hash=await derivePasswordBits(password,salt,PASSWORD_HASH_ITERATIONS);
    return `pbkdf2-sha256$${PASSWORD_HASH_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
  }

  async function verifyPassword(password,encoded){
    if(!crypto?.subtle)throw new Error("Web Crypto tidak tersedia pada browser ini.");
    const [algorithm,iterationText,saltText,hashText]=String(encoded).split("$");
    const iterations=Number(iterationText);
    if(algorithm!=="pbkdf2-sha256"||!Number.isInteger(iterations)||iterations<100000||!saltText||!hashText){
      throw new Error("Format password hash tidak valid.");
    }
    const expected=fromBase64(hashText);
    const actual=await derivePasswordBits(password,fromBase64(saltText),iterations);
    if(actual.length!==expected.length)return false;
    let difference=0;
    for(let index=0;index<actual.length;index++)difference|=actual[index]^expected[index];
    return difference===0;
  }

  function startSession(user){
    state.role=user.role;
    state.user=user;
    state.view=user.role==="Admin"?"dashboard":"pos";
    render();
  }

  function adminSetupView(){
    const admins=state.users.filter(user=>user.role==="Admin");
    const defaultAdmin=admins.find(user=>user.active)||admins[0];
    app.innerHTML=`<main class="login-shell"><section class="login-art"><div><span style="font-size:50px">☕</span><h1>Amankan akses Perkopian.</h1><p>Buat password untuk akun admin sebelum mulai menggunakan sistem.</p></div></section><section class="login-card-wrap"><div class="login-card"><img class="brand-mark login-logo" src="assets/perkopian-logo.png" alt="Logo Perkopian"><h2>Atur password admin</h2><p>Pengaturan awal satu kali. Pilih akun admin dan buat password minimal 6 karakter.</p><form id="admin-setup-form"><div class="field"><label for="setup-admin">Akun admin</label><select id="setup-admin" ${admins.length?"":"disabled"}>${admins.map(user=>`<option value="${esc(user.id)}" ${user.id===defaultAdmin?.id?"selected":""}>${esc(user.name)} · ${esc(user.username)}${user.active?"":" (nonaktif)"}</option>`).join("")}</select></div><div class="field"><label for="setup-password">Password baru</label><input id="setup-password" type="password" autocomplete="new-password" minlength="6" required></div><div class="field"><label for="setup-password-confirm">Konfirmasi password</label><input id="setup-password-confirm" type="password" autocomplete="new-password" minlength="6" required></div><div class="login-error" id="setup-error" role="alert">${admins.length?"":"Akun admin tidak ditemukan. Periksa data pengguna terlebih dahulu."}</div><button class="btn btn-primary" id="setup-submit" style="width:100%" ${admins.length?"":"disabled"}>Simpan password &amp; masuk</button></form></div></section></main>`;
    document.querySelector("#admin-setup-form").addEventListener("submit",async event=>{
      event.preventDefault();
      const error=document.querySelector("#setup-error");
      const password=document.querySelector("#setup-password").value;
      const confirmation=document.querySelector("#setup-password-confirm").value;
      const admin=state.users.find(user=>user.id===document.querySelector("#setup-admin").value&&user.role==="Admin");
      if(!admin){error.textContent="Akun admin tidak ditemukan.";return;}
      if(password.length<6){error.textContent="Password minimal 6 karakter.";return;}
      if(password!==confirmation){error.textContent="Konfirmasi password tidak cocok.";return;}
      const submit=document.querySelector("#setup-submit");
      submit.disabled=true;
      try{
        admin.passwordHash=await hashPassword(password);
      }catch(hashError){
        console.error("Initial admin password could not be secured.",hashError);
        error.textContent="Password tidak dapat disimpan dengan aman di browser ini.";
        submit.disabled=false;
        return;
      }
      admin.active=true;
      persist();
      startSession(admin);
    });
  }

  function loginView() {
    const hasConfiguredAdmin=state.users.some(user=>user.role==="Admin"&&user.active&&user.passwordHash);
    if(!hasConfiguredAdmin){adminSetupView();return;}
    app.innerHTML = `
      <main class="login-shell">
        <section class="login-art"><div><span style="font-size:50px">☕</span><h1>Tempat terbaik untuk memulai shift.</h1><p>Kelola pesanan, pembayaran, stok, dan penjualan Perkopian dari satu tempat yang sederhana.</p></div></section>
        <section class="login-card-wrap"><div class="login-card">
          <img class="brand-mark login-logo" src="assets/perkopian-logo.png" alt="Logo Perkopian"><h2>Masuk ke Perkopian</h2><p>Masuk menggunakan akun yang telah diatur oleh admin.</p>
          <form id="login-form">
            <div class="field"><label for="username">Nama pengguna</label><input id="username" autocomplete="username" placeholder="Username" required></div>
            <div class="field"><label for="password">Kata sandi</label><input id="password" type="password" autocomplete="current-password" placeholder="Password" required></div>
            <button class="btn btn-primary" style="width:100%">Masuk</button>
          </form>
          <div class="login-error" id="login-error"></div>
        </div></section>
      </main>`;
    document.querySelector("#login-form").addEventListener("submit", async event=>{
      event.preventDefault();
      const username=document.querySelector("#username").value.trim();
      const password=document.querySelector("#password").value;
      const found=state.users.find(user=>user.username===username && user.active);
      if(!found){document.querySelector("#login-error").textContent="Nama pengguna tidak ditemukan atau akun nonaktif.";return;}
      if(!found.passwordHash){document.querySelector("#login-error").textContent="Password akun belum diatur. Hubungi admin toko.";return;}
      let passwordValid=false;
      try{
        passwordValid=await verifyPassword(password,found.passwordHash);
      }catch(error){
        console.error("Password could not be verified.",error);
        document.querySelector("#login-error").textContent="Password tidak dapat diverifikasi. Coba browser yang mendukung Web Crypto.";
        return;
      }
      if(!passwordValid){document.querySelector("#login-error").textContent="Password tidak sesuai.";return;}
      startSession(found);
    });
  }

  function shell(content) {
    app.innerHTML = `
      <main class="app-shell">
        <header class="topbar">
          <div class="brand"><img class="brand-mark header-logo" src="assets/perkopian-logo.png" alt="Logo Perkopian"><div><div class="brand-name">${esc(state.settings.shopName)}</div><div class="brand-sub">Coffee house</div></div></div>
          <div class="top-actions"><span class="clock" id="clock"></span><div class="avatar">${esc((state.user?.name||"User").split(" ").map(n=>n[0]).join("").slice(0,2))}</div><div class="role-name"><strong>${esc(state.user?.name||"Pengguna")}</strong><span>${esc(state.role)}</span></div><button class="logout" id="logout" title="Keluar">↪</button></div>
        </header>
        <nav class="nav" id="nav">
          ${state.role==="Kasir" ? `<button data-view="pos" class="${state.view==="pos"?"active":""}">Kasir</button><button data-view="history" class="${state.view==="history"?"active":""}">Riwayat Shift</button>` :
          `<button data-view="dashboard" class="${state.view==="dashboard"?"active":""}">Dashboard</button><button data-view="pos" class="${state.view==="pos"?"active":""}">Kasir</button><button data-view="products" class="${state.view==="products"?"active":""}">Produk</button><button data-view="inventory" class="${state.view==="inventory"?"active":""}">Inventori</button><button data-view="reports" class="${state.view==="reports"?"active":""}">Laporan</button><button data-view="users" class="${state.view==="users"?"active":""}">Pengguna</button><button data-view="settings" class="${state.view==="settings"?"active":""}">Pengaturan</button>`}
        </nav>
        <div class="view">${content}</div>
      </main>`;
    document.querySelector("#logout").addEventListener("click",()=>{state.role=null;state.user=null;state.view="login";render();});
    document.querySelectorAll("#nav button").forEach(button=>button.addEventListener("click",()=>{state.view=button.dataset.view;render();}));
    updateClock(); setInterval(updateClock,30000);
  }

  function updateClock(){
    const el=document.querySelector("#clock");
    if(el) el.textContent=new Date().toLocaleString("id-ID",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
  }

  function posView(){
    const categories=window.POS_DATA.categories;
    const products=state.products.filter(product=>{
      const matchCategory=state.category==="Semua"||product.category===state.category;
      const hay=[product.name,product.description,product.category].join(" ").toLowerCase();
      return matchCategory && hay.includes(state.search.toLowerCase());
    });
    return `<div class="pos-layout">
      <section class="menu-panel"><div class="toolbar"><h2>Menu</h2><label class="search"><input id="menu-search" value="${esc(state.search)}" placeholder="Cari menu..." aria-label="Cari menu"></label></div>
      <div class="categories">${categories.map(category=>`<button class="category ${state.category===category?"active":""}" data-category="${esc(category)}">${esc(category)}</button>`).join("")}</div>
      <div class="product-grid">${products.map(product=>`<button class="product-card ${product.available?"":"unavailable"}" data-product="${product.id}" ${product.available?"":"disabled"}><div class="product-art">${esc(product.icon)}</div><div class="product-name">${esc(product.name)}</div><div class="product-meta"><small>${esc(product.category)}</small><strong>${rupiah(product.price)}</strong></div></button>`).join("")}</div></section>
      ${cartPanel()}
    </div>`;
  }

  function cartPanel(){
    const amount=totals();
    const lines=state.cart.map(line=>`
      <div class="cart-line"><div><div class="cart-line-name">${esc(line.name)}</div><div class="cart-line-mod">${esc([line.modifier?.temperature,line.modifier?.size,line.modifier?.sugar,line.modifier?.note].filter(Boolean).join(" · "))}</div></div>
      <div class="line-right"><strong>${rupiah(line.unitPrice*line.quantity)}</strong><div class="qty"><button data-cart-minus="${line.key}" aria-label="Kurangi">−</button><span>${line.quantity}</span><button data-cart-plus="${line.key}" aria-label="Tambah">+</button><button class="remove-line" data-cart-remove="${line.key}" aria-label="Hapus">×</button></div></div></div>`).join("") || `<div class="empty-cart"><span>🧾</span><strong>Belum ada pesanan</strong><small>Tambahkan menu untuk memulai</small></div>`;
    return `<aside class="cart-panel"><div class="cart-header"><div><h2>Pesanan Aktif</h2><small>Pesanan #${String(state.nextOrder).padStart(4,"0")}</small></div><button class="link-danger" id="clear-cart">Kosongkan</button></div>
      <div class="order-types">${["Dine-In","Takeaway","Delivery"].map(type=>`<button data-order-type="${type}" class="${state.orderType===type?"active":""}">${type==="Dine-In"?"Makan di sini":type==="Takeaway"?"Bawa pulang":"Delivery"}</button>`).join("")}</div>
      ${state.orderType==="Dine-In"?`<input class="table-input" id="table-number" value="${esc(state.table)}" placeholder="Nomor meja">`:""}
      <div class="cart-lines">${lines}</div>
      <div class="totals"><div class="total-row"><span>Subtotal</span><span>${rupiah(amount.subtotal)}</span></div><div class="total-row"><span>Diskon</span><span>-${rupiah(amount.discount)}</span></div><div class="total-row"><span>Pajak (${state.settings.tax}%)</span><span>${rupiah(amount.tax)}</span></div><div class="total-row"><span>Service (${state.settings.service}%)</span><span>${rupiah(amount.service)}</span></div><div class="total-row grand"><span>Total</span><strong>${rupiah(amount.total)}</strong></div></div>
      <div style="display:grid;grid-template-columns:1fr 78px;gap:7px;margin-bottom:8px"><button class="btn" id="discount-btn">Diskon %</button><input id="discount-input" type="number" min="0" max="100" value="${state.discount}" style="width:78px;height:42px;border:1px solid var(--line);border-radius:9px;padding:0 8px"></div>
      <button class="btn btn-primary checkout" id="checkout" ${state.cart.length?"":"disabled"}>Bayar sekarang</button></aside>`;
  }

  function addModifier(product){
    modifierProduct=product;
    modifier={temperature:product.category==="Coffee"?"Ice":"Ice",size:"Regular",sugar:"Normal",ice:"Normal",note:"",price:product.price};
    openModifier();
  }

  function openModifier(){
    const product=modifierProduct;
    const modal=document.createElement("div");
    modal.className="modal-backdrop";modal.id="modifier-modal";
    modal.innerHTML=`<section class="modal"><h2>${esc(product.name)}</h2><p class="modal-sub">${esc(product.description)} · ${rupiah(product.price)}</p>
      <div class="modifier-grid">
        <div class="choice-group"><label>Suhu</label><div class="choice-options" data-choice="temperature"><button class="active" data-value="Ice">Ice</button><button data-value="Hot">Hot</button></div></div>
        <div class="choice-group"><label>Ukuran</label><div class="choice-options" data-choice="size"><button class="active" data-value="Regular">Regular</button><button data-value="Large" data-extra="5000">Large +Rp5.000</button></div></div>
        <div class="choice-group"><label>Gula</label><div class="choice-options three" data-choice="sugar"><button data-value="No sugar">0%</button><button class="active" data-value="Normal">50%</button><button data-value="Full">100%</button></div></div>
        <div class="choice-group"><label>Es</label><div class="choice-options three" data-choice="ice"><button data-value="Less ice">Sedikit</button><button class="active" data-value="Normal">Normal</button><button data-value="No ice">Tanpa es</button></div></div>
      </div><div class="field" style="margin-top:14px"><label for="item-note">Catatan khusus</label><textarea id="item-note" rows="2" placeholder="Contoh: less sugar, oat milk, pisah sirup"></textarea></div>
      <div class="modal-actions"><button class="btn" data-close>Batal</button><button class="btn btn-primary" id="add-modifier">Tambah · <span id="modifier-price">${rupiah(product.price)}</span></button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-choice]").forEach(group=>{
      group.addEventListener("click",event=>{
        const button=event.target.closest("button");if(!button)return;
        group.querySelectorAll("button").forEach(b=>b.classList.remove("active"));button.classList.add("active");
        modifier[group.dataset.choice]=button.dataset.value;
        if(group.dataset.choice==="size")modifier.price=product.price+(button.dataset.extra?5000:0);
        document.querySelector("#modifier-price").textContent=rupiah(modifier.price);
      });
    });
    modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
    modal.addEventListener("click",event=>{if(event.target===modal)modal.remove();});
    modal.querySelector("#item-note").addEventListener("input",event=>modifier.note=event.target.value.trim());
    modal.querySelector("#add-modifier").addEventListener("click",()=>{
      const key=[product.id,modifier.temperature,modifier.size,modifier.sugar,modifier.ice,modifier.note].join("|");
      const found=state.cart.find(line=>line.key===key);
      if(found)found.quantity++;else state.cart.push({key,productId:product.id,name:product.name,unitPrice:modifier.price,quantity:1,modifier:{...modifier}});
      modal.remove();render();
    });
  }

  function bindPos(){
    document.querySelector("#menu-search")?.addEventListener("input",event=>{state.search=event.target.value;render();event && setTimeout(()=>{const input=document.querySelector("#menu-search");input?.focus();const n=input?.value.length;if(n)input.setSelectionRange(n,n)},0)});
    document.querySelectorAll(".category").forEach(button=>button.addEventListener("click",()=>{state.category=button.dataset.category;render()}));
    document.querySelectorAll(".product-card").forEach(card=>card.addEventListener("click",()=>{
      const product=state.products.find(p=>p.id===card.dataset.product);
      if(product.variants)addModifier(product);else{
        const key=product.id+"|Standar";const found=state.cart.find(line=>line.key===key);
        if(found)found.quantity++;else state.cart.push({key,productId:product.id,name:product.name,unitPrice:product.price,quantity:1,modifier:{temperature:"",size:"",sugar:"",ice:"",note:""}});
        render();
      }
    }));
    document.querySelectorAll("[data-cart-plus]").forEach(button=>button.addEventListener("click",()=>{const line=state.cart.find(l=>l.key===button.dataset.cartPlus);if(line)line.quantity++;render()}));
    document.querySelectorAll("[data-cart-minus]").forEach(button=>button.addEventListener("click",()=>{const line=state.cart.find(l=>l.key===button.dataset.cartMinus);if(line){line.quantity--;if(line.quantity<=0)state.cart.splice(state.cart.indexOf(line),1)}render()}));
    document.querySelectorAll("[data-cart-remove]").forEach(button=>button.addEventListener("click",()=>{const line=state.cart.find(l=>l.key===button.dataset.cartRemove);if(line)state.cart.splice(state.cart.indexOf(line),1);render()}));
    document.querySelectorAll("[data-order-type]").forEach(button=>button.addEventListener("click",()=>{state.orderType=button.dataset.orderType;render()}));
    document.querySelector("#table-number")?.addEventListener("input",event=>state.table=event.target.value);
    document.querySelector("#discount-input")?.addEventListener("input",event=>{state.discount=Number(event.target.value)||0;renderTotalsOnly()});
    document.querySelector("#clear-cart")?.addEventListener("click",()=>{if(state.cart.length){state.cart=[];render();toast("Pesanan dikosongkan")}});
    document.querySelector("#checkout")?.addEventListener("click",openPayment);
  }

  function renderTotalsOnly(){
    render();
    setTimeout(()=>document.querySelector("#discount-input")?.focus(),0);
  }

  function openPayment(){
    const amount=totals();
    const modal=document.createElement("div");modal.className="modal-backdrop";modal.id="payment-modal";
    modal.innerHTML=`<section class="modal"><h2>Proses pembayaran</h2><p class="modal-sub">Total yang harus dibayar: <strong>${rupiah(amount.total)}</strong></p>
      <div class="payment-options">${["Tunai","QRIS","Debit/Credit"].map((method,i)=>`<button data-payment="${method}" class="${state.selectedPayment===method?"active":""}"><span>${i===0?"💵":i===1?"📱":"💳"}</span>${method}</button>`).join("")}</div>
      <div id="cash-area" ${state.selectedPayment==="Tunai"?"":"hidden"}><div class="field" style="margin-top:14px"><label for="cash-input">Uang diterima</label><input id="cash-input" type="number" min="0" step="100" placeholder="0"></div><div class="cash-grid">${[20000,50000,100000,200000].map(n=>`<button data-cash="${n}" ${amount.total<=n?"":"disabled"}>${n===20000?"Rp20rb":n===50000?"Rp50rb":n===100000?"Rp100rb":"Rp200rb"}</button>`).join("")}</div><div class="change-box"><span>Kembalian</span><strong id="change">${rupiah(0)}</strong></div></div>
      <div class="modal-actions"><button class="btn" data-close>Batal</button><button class="btn btn-primary" id="confirm-payment" disabled>Selesaikan pembayaran</button></div></section>`;
    document.body.appendChild(modal);
    const confirm=()=>{modal.querySelector("#confirm-payment").disabled=false};
    modal.querySelectorAll("[data-payment]").forEach(button=>button.addEventListener("click",()=>{
      state.selectedPayment=button.dataset.payment;
      modal.querySelectorAll("[data-payment]").forEach(b=>b.classList.toggle("active",b===button));
      const cash=modal.querySelector("#cash-area");cash.hidden=state.selectedPayment!=="Tunai";
      modal.querySelector("#confirm-payment").disabled=state.selectedPayment==="Tunai";
      if(state.selectedPayment!=="Tunai")confirm();
    }));
    const cashInput=modal.querySelector("#cash-input");
    cashInput?.addEventListener("input",()=>{
      const received=Number(cashInput.value)||0;modal.querySelector("#change").textContent=rupiah(Math.max(0,received-amount.total));modal.querySelector("#confirm-payment").disabled=received<amount.total;
    });
    modal.querySelectorAll("[data-cash]").forEach(button=>button.addEventListener("click",()=>{cashInput.value=button.dataset.cash;cashInput.dispatchEvent(new Event("input"))}));
    modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
    modal.querySelector("#confirm-payment").addEventListener("click",()=>{
      completeSale(modal,state.selectedPayment,Number(cashInput?.value)||0);
    });
  }

  function completeSale(modal,method,cashReceived){
    const amount=totals();
    const sale={
      id:state.nextOrder++,number:String(state.nextOrder-1),date:new Date().toISOString(),cashier:state.user?.name||"Kasir",
      orderType:state.orderType,table:state.table,items:state.cart.map(line=>({productId:line.productId,name:line.name,category:line.category,quantity:line.quantity,unitPrice:line.unitPrice,modifier:line.modifier||{}})),
      subtotal:amount.subtotal,discount:amount.discount,tax:amount.tax,service:amount.service,
      taxRate:Number(state.settings.tax)||0,serviceRate:Number(state.settings.service)||0,
      total:amount.total,method,cashReceived,status:"Selesai"
    };
    state.sales.unshift(sale);persist();state.cart=[];state.discount=0;modal.remove();openReceipt(sale);render();
  }

  function openReceipt(sale){
    const modal=document.createElement("div");modal.className="modal-backdrop";
    const itemLines=sale.items.map(item=>`<div class="receipt-row"><span>${item.quantity} × ${esc(item.name)}${item.modifier?.temperature?`<br><small>${esc(item.modifier.temperature)} · ${esc(item.modifier.size||"")}</small>`:""}</span><span>${rupiah(item.unitPrice*item.quantity)}</span></div>`).join("");
    modal.innerHTML=`<section class="modal receipt"><h2>Struk pembayaran</h2><div class="receipt-preview"><div class="receipt-shop"><strong>${esc(state.settings.shopName)}</strong><span>${esc(state.settings.address)}</span><span>${new Date(sale.date).toLocaleString("id-ID")}</span></div><hr><div>No: #${esc(sale.number)}<br>Kasir: ${esc(sale.cashier)}<br>Tipe: ${esc(sale.orderType)}${sale.table?` · Meja ${esc(sale.table)}`:""}</div><div class="receipt-lines">${itemLines}</div><div class="receipt-row"><span>Subtotal</span><span>${rupiah(sale.subtotal)}</span></div><div class="receipt-row"><span>Diskon</span><span>-${rupiah(sale.discount)}</span></div><div class="receipt-row"><span>Pajak</span><span>${rupiah(sale.tax)}</span></div><div class="receipt-row"><span>Service</span><span>${rupiah(sale.service)}</span></div><div class="receipt-row" style="font-weight:bold;font-size:13px"><span>TOTAL</span><span>${rupiah(sale.total)}</span></div><hr><div>Pembayaran: ${esc(sale.method)}${sale.method==="Tunai"?`<br>Tunai: ${rupiah(sale.cashReceived)}<br>Kembalian: ${rupiah(Math.max(0,sale.cashReceived-sale.total))}`:""}</div><p class="receipt-footer">${esc(state.settings.receiptFooter)}</p></div><div class="modal-actions"><button class="btn" data-close>Tutup</button><button class="btn btn-primary" id="print-receipt">Cetak / Print</button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
    modal.querySelector("#print-receipt").addEventListener("click",()=>window.print());
  }

  function dashboardView(){
    const today=new Date().toISOString().slice(0,10);
    const todaySales=state.sales.filter(s=>s.date.slice(0,10)===today&&s.status==="Selesai");
    const omzet=todaySales.reduce((s,x)=>s+x.total,0), count=todaySales.length, avg=count?omzet/count:0;
    const top={};todaySales.forEach(s=>s.items.forEach(i=>top[i.name]=(top[i.name]||0)+i.quantity));const topName=Object.entries(top).sort((a,b)=>b[1]-a[1])[0]?.[0]||"Belum ada";
    const chart=[58,72,46,84,67,92,78];
    const methods=["Tunai","QRIS","Debit/Credit"].map(method=>({method,total:todaySales.filter(s=>s.method===method).reduce((sum,s)=>sum+s.total,0)}));
    const max=Math.max(1,...methods.map(m=>m.total));
    return `<div class="section-head"><div><h2>Ringkasan Hari Ini</h2><p>${new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p></div><button class="btn" id="export-dashboard">Export CSV</button></div>
      <div class="kpi-grid"><div class="kpi"><small>Total Omzet Hari Ini</small><strong>${rupiah(omzet)}</strong><span>Penjualan selesai</span></div><div class="kpi"><small>Jumlah Transaksi</small><strong>${count}</strong><span>Pesanan hari ini</span></div><div class="kpi"><small>Rata-rata Transaksi</small><strong>${rupiah(avg)}</strong><span>Per pesanan</span></div><div class="kpi"><small>Produk Terlaris</small><strong style="font-size:18px">${esc(topName)}</strong><span>Hari ini</span></div></div>
      <div class="dashboard-grid"><div class="card"><div style="padding:16px 18px 0"><h3>Penjualan Mingguan</h3></div><div class="chart">${chart.map((height,i)=>`<div class="chart-col"><div class="chart-bar" style="height:${height}%"><span>${height}k</span></div></div>`).join("")}</div><div class="chart-labels">${["Sen","Sel","Rab","Kam","Jum","Sab","Min"].map(d=>`<span>${d}</span>`).join("")}</div></div><div class="card"><div style="padding:16px 18px 0"><h3>Metode Pembayaran</h3></div><div class="payment-summary">${methods.map(m=>`<div class="payment-row"><span>${m.method}</span><div class="payment-track"><i style="width:${m.total/max*100}%"></i></div><strong>${rupiah(m.total)}</strong></div>`).join("")}</div></div></div>`;
  }

  function historyView(){
    const sales=state.sales;
    return `<div class="section-head"><div><h2>Riwayat Transaksi</h2><p>Transaksi pada shift dan sesi yang tersimpan</p></div></div>${salesTable(sales,true)}`;
  }

  function salesTable(sales,allowVoid=false,allowEditDelete=false){
    if(!sales.length)return `<div class="card" style="padding:40px;text-align:center;color:var(--muted)">Belum ada transaksi.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>No.</th><th>Waktu</th><th>Kasir</th><th>Tipe</th><th>Pembayaran</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${sales.map(s=>{const saleId=esc(s.id??s.number);return `<tr><td>#${esc(s.number)}</td><td>${new Date(s.date).toLocaleString("id-ID",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</td><td>${esc(s.cashier)}</td><td>${esc(s.orderType)}</td><td>${esc(s.method)}</td><td>${rupiah(s.total)}</td><td><span class="badge ${s.status==="Void"?"void":""}">${esc(s.status)}</span></td><td><div class="table-actions"><button data-view-sale="${saleId}">Struk</button>${allowVoid&&s.status!=="Void"?`<button data-void="${saleId}" style="color:var(--danger)">Void</button>`:""}${allowEditDelete?`<button data-edit-sale="${saleId}" ${s.status==="Void"?"disabled title=\"Transaksi void tidak dapat diedit\"":""}>Edit</button><button data-delete-sale="${saleId}" style="color:var(--danger)">Hapus</button>`:""}</div></td></tr>`}).join("")}</tbody></table></div>`;
  }

  function productsView(){
    return `<div class="section-head"><div><h2>Produk &amp; Kategori</h2><p>Kelola harga, HPP, kategori, dan ketersediaan</p></div><button class="btn btn-primary" id="add-product">Tambah produk</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Produk</th><th>Kategori</th><th>HPP</th><th>Harga Jual</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${state.products.map(p=>`<tr><td><strong>${esc(p.icon)} ${esc(p.name)}</strong><br><small style="color:var(--muted)">${esc(p.description)}</small></td><td>${esc(p.category)}</td><td>${rupiah(p.cost)}</td><td>${rupiah(p.price)}</td><td><span class="badge ${p.available?"":"low"}">${p.available?"Tersedia":"Habis"}</span></td><td><div class="table-actions"><button data-toggle-product="${p.id}">${p.available?"Habiskan":"Aktifkan"}</button><button data-edit-product="${p.id}">Edit</button><button data-delete-product="${p.id}" style="color:var(--danger)">Hapus</button></div></td></tr>`).join("")}</tbody></table></div>`;
  }

  function inventoryView(){
    return `<div class="section-head"><div><h2>Inventori Bahan Baku</h2><p>Pantau stok dan ambang minimum</p></div><button class="btn btn-primary" id="add-stock">Catat restock</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Bahan</th><th>Stok</th><th>Minimum</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${state.inventory.map(i=>`<tr><td>${esc(i.name)}</td><td><strong>${i.stock}</strong> ${esc(i.unit)}</td><td>${i.minimum} ${esc(i.unit)}</td><td><span class="badge ${i.stock<=i.minimum?"low":""}">${i.stock<=i.minimum?"Stok rendah":"Normal"}</span></td><td><div class="table-actions"><button data-edit-stock="${i.id}">Edit</button><button data-delete-stock="${i.id}" style="color:var(--danger)">Hapus</button></div></td></tr>`).join("")}</tbody></table></div>`;
  }

  function reportsView(){
    const savedReports=state.savedReports.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Nama laporan</th><th>Periode</th><th>Transaksi</th><th>Omzet</th><th>Dibuat</th><th>Aksi</th></tr></thead><tbody>${state.savedReports.map(report=>`<tr><td><strong>${esc(report.name)}</strong>${report.notes?`<br><small style="color:var(--muted)">${esc(report.notes)}</small>`:""}</td><td>${esc(report.startDate||"Semua tanggal")} – ${esc(report.endDate||"sekarang")}</td><td>${report.sales.length}</td><td>${rupiah(report.revenue)}</td><td>${new Date(report.createdAt).toLocaleDateString("id-ID")}</td><td><div class="table-actions"><button data-view-report="${report.id}">Lihat</button><button data-edit-report="${report.id}">Edit</button><button data-delete-report="${report.id}" style="color:var(--danger)">Hapus</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="card" style="padding:24px;color:var(--muted);font-size:12px">Belum ada laporan tersimpan. Terapkan filter, lalu pilih “Simpan laporan”.</div>`;
    return `<div class="section-head"><div><h2>Laporan Penjualan</h2><p>Rekap transaksi berdasarkan rentang tanggal</p></div><div class="table-actions"><button class="btn" id="export-report">Export CSV</button><button class="btn btn-primary" id="save-report">Simpan laporan</button></div></div><div class="toolbar-panel"><input id="report-start" type="date"><input id="report-end" type="date"><select id="report-category"><option value="">Semua kategori</option><option value="Coffee">Coffee</option><option value="Non-Coffee">Non-Coffee</option><option value="Pastry & Food">Pastry & Food</option></select><button class="btn" id="filter-report">Terapkan</button></div><div id="report-result">${salesTable(state.sales,false,true)}</div><div class="section-head" style="margin-top:24px"><div><h2>Laporan Tersimpan</h2><p>Snapshot laporan tersimpan di perangkat ini</p></div></div>${savedReports}`;
  }

  function usersView(){
    const activeAdminCount=state.users.filter(user=>user.role==="Admin"&&user.active).length;
    return `<div class="section-head"><div><h2>Pengguna &amp; Akses</h2><p>Kelola akun Admin dan Kasir</p></div><button class="btn btn-primary" id="add-user">Tambah pengguna</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Password</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${state.users.map(u=>{const protectedUser=u.id===state.user?.id;const lastActiveAdmin=u.role==="Admin"&&u.active&&activeAdminCount<=1;const deleteTitle=protectedUser?"Akun yang sedang digunakan tidak dapat dihapus":lastActiveAdmin?"Tidak dapat menghapus admin aktif terakhir":"Hapus pengguna";return `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td><span class="badge">${u.passwordHash?"Diatur":"Belum diatur"}</span></td><td><span class="badge ${u.active?"":"low"}">${u.active?"Aktif":"Nonaktif"}</span></td><td><div class="table-actions"><button class="btn" data-toggle-user="${u.id}" style="min-height:32px;padding:0 8px">${u.active?"Nonaktifkan":"Aktifkan"}</button><button class="btn" data-edit-user="${u.id}" style="min-height:32px;padding:0 8px">Edit</button><button class="btn" data-edit-password="${u.id}" style="min-height:32px;padding:0 8px">Password</button><button class="btn" data-delete-user="${u.id}" title="${deleteTitle}" ${protectedUser||lastActiveAdmin?"disabled":""} style="min-height:32px;padding:0 8px;color:var(--danger)">Hapus</button></div></td></tr>`}).join("")}</tbody></table></div>`;
  }

  function settingsView(){
    return `<div class="section-head"><div><h2>Pengaturan Toko</h2><p>Profil, pajak, service charge, dan struk</p></div></div><div class="settings-grid"><form class="card" id="shop-settings"><h3>Profil coffee shop</h3><div class="field"><label>Nama toko</label><input name="shopName" value="${esc(state.settings.shopName)}"></div><div class="field"><label>Alamat</label><textarea name="address" rows="3">${esc(state.settings.address)}</textarea></div><div class="field"><label>Footer struk</label><textarea name="receiptFooter" rows="3">${esc(state.settings.receiptFooter)}</textarea></div><button class="btn btn-primary" type="submit">Simpan profil</button></form><form class="card" id="fee-settings"><h3>Persentase transaksi</h3><div class="field"><label>Pajak (%)</label><input name="tax" type="number" min="0" max="100" value="${state.settings.tax}"></div><div class="field"><label>Service charge (%)</label><input name="service" type="number" min="0" max="100" value="${state.settings.service}"></div><button class="btn btn-primary" type="submit">Simpan biaya</button></form></div>`;
  }

  function bindAdmin(){
    document.querySelector("#add-product")?.addEventListener("click",()=>openProductForm());
    document.querySelectorAll("[data-edit-product]").forEach(button=>button.addEventListener("click",()=>openProductForm(state.products.find(p=>p.id===button.dataset.editProduct))));
    document.querySelectorAll("[data-toggle-product]").forEach(button=>button.addEventListener("click",()=>{const p=state.products.find(p=>p.id===button.dataset.toggleProduct);p.available=!p.available;persist();render()}));
    document.querySelectorAll("[data-delete-product]").forEach(button=>button.addEventListener("click",()=>{
      const index=state.products.findIndex(product=>product.id===button.dataset.deleteProduct);
      if(index<0)return;
      const product=state.products[index];
      if(!window.confirm(`Hapus produk "${product.name}" dari menu? Transaksi sebelumnya tetap tersimpan.`))return;
      state.products.splice(index,1);
      persist();
      render();
      toast("Produk dihapus dari menu");
    }));
    document.querySelector("#add-stock")?.addEventListener("click",()=>openStockDialog());
    document.querySelectorAll("[data-edit-stock]").forEach(button=>button.addEventListener("click",()=>openStockDialog(state.inventory.find(i=>i.id===button.dataset.editStock))));
    document.querySelectorAll("[data-delete-stock]").forEach(button=>button.addEventListener("click",()=>{
      const index=state.inventory.findIndex(item=>item.id===button.dataset.deleteStock);
      if(index<0)return;
      const item=state.inventory[index];
      if(!window.confirm(`Hapus "${item.name}" dari inventori?`))return;
      state.inventory.splice(index,1);
      persist();
      render();
      toast("Bahan baku dihapus dari inventori");
    }));
    document.querySelector("#add-user")?.addEventListener("click",()=>openUserDialog());
    document.querySelectorAll("[data-toggle-user]").forEach(button=>button.addEventListener("click",()=>{const u=state.users.find(u=>u.id===button.dataset.toggleUser);u.active=!u.active;persist();render()}));
    document.querySelectorAll("[data-delete-user]").forEach(button=>button.addEventListener("click",()=>{
      const index=state.users.findIndex(user=>user.id===button.dataset.deleteUser);
      if(index<0)return;
      const user=state.users[index];
      if(user.id===state.user?.id){toast("Akun yang sedang digunakan tidak dapat dihapus");return;}
      const activeAdmins=state.users.filter(candidate=>candidate.role==="Admin"&&candidate.active);
      if(user.role==="Admin"&&user.active&&activeAdmins.length<=1){toast("Admin aktif terakhir tidak dapat dihapus");return;}
      if(!window.confirm(`Hapus pengguna "${user.name}"? Riwayat transaksi tetap tersimpan.`))return;
      state.users.splice(index,1);
      persist();
      render();
      toast("Pengguna dihapus");
    }));
    document.querySelectorAll("[data-edit-user]").forEach(button=>button.addEventListener("click",()=>{
      const user=state.users.find(user=>user.id===button.dataset.editUser);
      if(user)openUserDialog(user);
    }));
    document.querySelectorAll("[data-edit-password]").forEach(button=>button.addEventListener("click",()=>{
      const user=state.users.find(user=>user.id===button.dataset.editPassword);
      if(user)openPasswordDialog(user);
    }));
    document.querySelector("#save-report")?.addEventListener("click",saveReportSnapshot);
    document.querySelectorAll("[data-view-report]").forEach(button=>button.addEventListener("click",()=>viewReportSnapshot(state.savedReports.find(report=>report.id===button.dataset.viewReport))));
    document.querySelectorAll("[data-edit-report]").forEach(button=>button.addEventListener("click",()=>editReportSnapshot(state.savedReports.find(report=>report.id===button.dataset.editReport))));
    document.querySelectorAll("[data-delete-report]").forEach(button=>button.addEventListener("click",()=>{
      const index=state.savedReports.findIndex(report=>report.id===button.dataset.deleteReport);
      if(index<0)return;
      const report=state.savedReports[index];
      if(!window.confirm(`Hapus laporan tersimpan "${report.name}"? Transaksi aslinya tidak akan berubah.`))return;
      state.savedReports.splice(index,1);
      persist();
      render();
      toast("Laporan tersimpan dihapus");
    }));
    document.querySelector("#shop-settings")?.addEventListener("submit",event=>{event.preventDefault();const data=new FormData(event.target);Object.assign(state.settings,{shopName:data.get("shopName"),address:data.get("address"),receiptFooter:data.get("receiptFooter")});persist();toast("Profil toko disimpan");render()});
    document.querySelector("#fee-settings")?.addEventListener("submit",event=>{event.preventDefault();const data=new FormData(event.target);state.settings.tax=Number(data.get("tax"))||0;state.settings.service=Number(data.get("service"))||0;persist();toast("Biaya transaksi disimpan");render()});
    document.querySelector("#filter-report")?.addEventListener("click",filterReports);
    document.querySelector("#export-report")?.addEventListener("click",exportSales);
  }

  function openProductForm(product=null){
    const p=product||{name:"",category:"Coffee",cost:0,price:0,icon:"☕",available:true,description:"",variants:true};
    const modal=document.createElement("div");modal.className="modal-backdrop";
    modal.innerHTML=`<section class="modal"><h2>${product?"Edit produk":"Tambah produk"}</h2><div class="modifier-grid"><div class="field"><label>Nama</label><input id="p-name" value="${esc(p.name)}"></div><div class="field"><label>Ikon</label><input id="p-icon" value="${esc(p.icon)}"></div><div class="field"><label>Kategori</label><select id="p-category">${["Coffee","Non-Coffee","Pastry & Food","Add-ons"].map(c=>`<option ${p.category===c?"selected":""}>${c}</option>`).join("")}</select></div><div class="field"><label>Status</label><select id="p-available"><option value="true" ${p.available?"selected":""}>Tersedia</option><option value="false" ${p.available?"":"selected"}>Habis</option></select></div><div class="field"><label>HPP</label><input id="p-cost" type="number" value="${p.cost}"></div><div class="field"><label>Harga jual</label><input id="p-price" type="number" value="${p.price}"></div></div><div class="field"><label>Deskripsi</label><input id="p-description" value="${esc(p.description)}"></div><div class="modal-actions"><button class="btn" data-close>Batal</button><button class="btn btn-primary" id="save-product">Simpan</button></div></section>`;
    document.body.appendChild(modal);modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
    modal.querySelector("#save-product").addEventListener("click",()=>{
      const data={name:modal.querySelector("#p-name").value.trim(),icon:modal.querySelector("#p-icon").value||"☕",category:modal.querySelector("#p-category").value,cost:Number(modal.querySelector("#p-cost").value)||0,price:Number(modal.querySelector("#p-price").value)||0,available:modal.querySelector("#p-available").value==="true",description:modal.querySelector("#p-description").value,variants:["Coffee","Non-Coffee"].includes(modal.querySelector("#p-category").value)};
      if(!data.name)return;
      if(product){Object.assign(product,data)}else state.products.push({id:"p"+Date.now(),...data});
      persist();modal.remove();render();toast("Produk disimpan");
    });
  }

  function openStockDialog(item=null){
    const modal=document.createElement("div");modal.className="modal-backdrop";
    modal.innerHTML=`<section class="modal"><h2>${item?"Edit stok":"Catat restock"}</h2><div class="field"><label>Bahan baku</label><select id="stock-item">${state.inventory.map(i=>`<option value="${i.id}" ${item?.id===i.id?"selected":""}>${esc(i.name)}</option>`).join("")}</select></div><div class="modifier-grid"><div class="field"><label>Stok akhir</label><input id="stock-amount" type="number" min="0" step="0.1" value="${item?item.stock:""}"></div><div class="field"><label>Stok minimum</label><input id="stock-min" type="number" min="0" step="0.1" value="${item?.minimum??1}"></div></div><div class="login-error" id="stock-error" role="alert"></div><div class="modal-actions"><button class="btn" data-close>Batal</button><button class="btn btn-primary" id="save-stock">Simpan</button></div></section>`;
    document.body.appendChild(modal);modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
    modal.querySelector("#save-stock").addEventListener("click",()=>{
      const stockInput=modal.querySelector("#stock-amount");
      const minimumInput=modal.querySelector("#stock-min");
      const stock=Number(stockInput.value);
      const minimum=Number(minimumInput.value);
      const error=modal.querySelector("#stock-error");
      if(stockInput.value===""||minimumInput.value===""||!Number.isFinite(stock)||!Number.isFinite(minimum)||stock<0||minimum<0){error.textContent="Stok dan batas minimum harus berupa angka nol atau lebih.";return;}
      const inventoryItem=state.inventory.find(candidate=>candidate.id===modal.querySelector("#stock-item").value);
      if(!inventoryItem){error.textContent="Bahan baku tidak ditemukan.";return;}
      inventoryItem.stock=stock;
      inventoryItem.minimum=minimum;
      persist();modal.remove();render();toast("Inventori diperbarui");
    });
  }

  function openUserDialog(user=null){
    const modal=document.createElement("div");modal.className="modal-backdrop";
    modal.innerHTML=`<section class="modal"><h2>${user?"Edit pengguna":"Tambah pengguna"}</h2><div class="field"><label>Nama</label><input id="u-name" value="${esc(user?.name||"")}"></div><div class="field"><label>Username</label><input id="u-user" value="${esc(user?.username||"")}"></div><div class="field"><label>Role</label><select id="u-role"><option ${user?.role==="Kasir"?"selected":""}>Kasir</option><option ${user?.role==="Admin"?"selected":""}>Admin</option></select></div>${user?"":`<div class="field"><label for="new-user-password">Password awal (minimal 6 karakter)</label><input id="new-user-password" type="password" autocomplete="new-password"></div><div class="field"><label for="new-user-password-confirm">Konfirmasi password</label><input id="new-user-password-confirm" type="password" autocomplete="new-password"></div>`}<div class="login-error" id="user-error" role="alert"></div><div class="modal-actions"><button class="btn" data-close>Batal</button><button class="btn btn-primary" id="save-user">Simpan</button></div></section>`;
    document.body.appendChild(modal);modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
    modal.querySelector("#save-user").addEventListener("click",async()=>{
      const name=modal.querySelector("#u-name").value.trim();
      const username=modal.querySelector("#u-user").value.trim();
      const role=modal.querySelector("#u-role").value;
      const error=modal.querySelector("#user-error");
      if(!name||!username){error.textContent="Nama dan username wajib diisi.";return;}
      if(state.users.some(existing=>existing.id!==user?.id&&existing.username.toLowerCase()===username.toLowerCase())){error.textContent="Username sudah digunakan.";return;}
      const password=modal.querySelector("#new-user-password")?.value||"";
      const passwordConfirm=modal.querySelector("#new-user-password-confirm")?.value||"";
      if(!user&&!password){error.textContent="Password awal wajib diisi.";return;}
      if(password&&(password.length<6||password!==passwordConfirm)){error.textContent=password.length<6?"Password minimal 6 karakter.":"Konfirmasi password tidak cocok.";return;}
      let passwordHash;
      if(password){
        const saveButton=modal.querySelector("#save-user");
        saveButton.disabled=true;
        try{
          passwordHash=await hashPassword(password);
        }catch(hashError){
          console.error("Password could not be secured.",hashError);
          error.textContent="Password tidak dapat disimpan dengan aman di browser ini.";
          saveButton.disabled=false;
          return;
        }
        saveButton.disabled=false;
      }
      if(user){
        const activeAdmins=state.users.filter(existing=>existing.role==="Admin"&&existing.active).length;
        if(user.active&&user.role==="Admin"&&role!=="Admin"&&activeAdmins<=1){error.textContent="Role admin aktif terakhir tidak dapat diubah menjadi kasir.";return;}
        Object.assign(user,{name,username,role});
        if(state.user?.id===user.id){
          state.role=role;
          if(role==="Kasir"&&!["pos","history"].includes(state.view))state.view="pos";
        }
      }else{
        state.users.push({id:"u"+Date.now(),name,username,role,active:true,passwordHash});
      }
      persist();
      modal.remove();
      render();
      toast(user?"Data pengguna diperbarui":"Pengguna ditambahkan");
    });
  }

  function openPasswordDialog(user){
    const modal=document.createElement("div");modal.className="modal-backdrop";
    modal.innerHTML=`<section class="modal"><h2>Ganti password</h2><p class="modal-sub">${esc(user.name)} · Password saat ini tidak ditampilkan.</p><div class="field"><label for="user-password-new">Password baru</label><input id="user-password-new" type="password" autocomplete="new-password" minlength="6"></div><div class="field"><label for="user-password-confirm">Konfirmasi password baru</label><input id="user-password-confirm" type="password" autocomplete="new-password" minlength="6"></div><div class="login-error" id="password-error" role="alert"></div><div class="modal-actions"><button class="btn" data-close>Batal</button><button class="btn btn-primary" id="save-password">Simpan password</button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
    modal.querySelector("#save-password").addEventListener("click",async()=>{
      const password=modal.querySelector("#user-password-new").value;
      const confirmPassword=modal.querySelector("#user-password-confirm").value;
      const error=modal.querySelector("#password-error");
      if(password.length<6){error.textContent="Password minimal 6 karakter.";return;}
      if(password!==confirmPassword){error.textContent="Konfirmasi password tidak cocok.";return;}
      const saveButton=modal.querySelector("#save-password");
      saveButton.disabled=true;
      try{
        user.passwordHash=await hashPassword(password);
      }catch(hashError){
        console.error("Password could not be secured.",hashError);
        error.textContent="Password tidak dapat disimpan dengan aman di browser ini.";
        saveButton.disabled=false;
        return;
      }
      persist();
      modal.remove();
      render();
      toast("Password pengguna diperbarui");
    });
  }

  function filterReports(){
    const start=document.querySelector("#report-start").value,end=document.querySelector("#report-end").value;
    if(start&&end&&start>end){toast("Tanggal awal tidak boleh melewati tanggal akhir");return;}
    document.querySelector("#report-result").innerHTML=salesTable(getReportSales(start,end),false,true);
  }

  function getReportSales(start,end){
    return state.sales.filter(sale=>(!start||sale.date.slice(0,10)>=start)&&(!end||sale.date.slice(0,10)<=end));
  }

  function saveReportSnapshot(){
    const start=document.querySelector("#report-start").value;
    const end=document.querySelector("#report-end").value;
    if(start&&end&&start>end){toast("Tanggal awal tidak boleh melewati tanggal akhir");return;}
    const sales=getReportSales(start,end);
    if(!sales.length){toast("Tidak ada transaksi pada periode ini untuk disimpan");return;}
    editReportSnapshot(null,{startDate:start,endDate:end,sales:window.POS_SERVICE.clone(sales)});
  }

  function editReportSnapshot(report, snapshot=null){
    const modal=document.createElement("div");modal.className="modal-backdrop";
    const defaultName=`Laporan ${new Date().toLocaleDateString("id-ID")}`;
    modal.innerHTML=`<section class="modal"><h2>${report?"Edit laporan tersimpan":"Simpan laporan"}</h2><p class="modal-sub">${report?"Edit nama dan catatan. Data transaksi snapshot tidak berubah.":"Snapshot akan menyimpan data transaksi pada periode yang dipilih."}</p><div class="field"><label for="saved-report-name">Nama laporan</label><input id="saved-report-name" maxlength="80" value="${esc(report?.name||defaultName)}"></div><div class="field"><label for="saved-report-notes">Catatan</label><textarea id="saved-report-notes" rows="3" maxlength="300">${esc(report?.notes||"")}</textarea></div><div class="login-error" id="saved-report-error" role="alert"></div><div class="modal-actions"><button class="btn" data-close>Batal</button><button class="btn btn-primary" id="confirm-save-report">Simpan</button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
    modal.querySelector("#confirm-save-report").addEventListener("click",()=>{
      const name=modal.querySelector("#saved-report-name").value.trim();
      if(!name){modal.querySelector("#saved-report-error").textContent="Nama laporan wajib diisi.";return;}
      const notes=modal.querySelector("#saved-report-notes").value.trim();
      if(report){
        report.name=name;
        report.notes=notes;
        report.updatedAt=new Date().toISOString();
      }else{
        const revenue=snapshot.sales.reduce((sum,sale)=>sum+(sale.status==="Void"?0:sale.total),0);
        state.savedReports.unshift({
          id:`report-${Date.now()}`,name,notes,createdAt:new Date().toISOString(),
          startDate:snapshot.startDate,endDate:snapshot.endDate,
          sales:snapshot.sales,revenue
        });
      }
      persist();
      modal.remove();
      render();
      toast(report?"Laporan diperbarui":"Laporan berhasil disimpan");
    });
  }

  function viewReportSnapshot(report){
    if(!report)return;
    const modal=document.createElement("div");modal.className="modal-backdrop";
    modal.innerHTML=`<section class="modal"><h2>${esc(report.name)}</h2><p class="modal-sub">${esc(report.startDate||"Semua tanggal")} – ${esc(report.endDate||"sekarang")}${report.notes?` · ${esc(report.notes)}`:""}</p><div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:14px"><div class="kpi"><small>Transaksi tersimpan</small><strong>${report.sales.length}</strong></div><div class="kpi"><small>Omzet tersimpan</small><strong>${rupiah(report.revenue)}</strong></div></div>${salesTable(report.sales,false)}<div class="modal-actions"><button class="btn" data-close>Tutup</button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
  }

  function exportSales(){
    const rows=[["No","Tanggal","Kasir","Tipe","Metode","Subtotal","Diskon","Pajak","Service","Total","Status"],...state.sales.map(s=>[s.number,s.date,s.cashier,s.orderType,s.method,s.subtotal,s.discount,s.tax,s.service,s.total,s.status])];
    downloadCsv(rows,"laporan-penjualan.csv");
  }

  function downloadCsv(rows,fileName){
    const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=fileName;link.click();URL.revokeObjectURL(url);toast("CSV berhasil diekspor");
  }

  function getSaleFeeRates(sale){
    const taxable=Math.max(0,(Number(sale.subtotal)||0)-(Number(sale.discount)||0));
    const taxRate=Number(sale.taxRate);
    const serviceRate=Number(sale.serviceRate);
    return {
      taxRate:Number.isFinite(taxRate)?taxRate:(taxable?(Number(sale.tax)||0)/taxable*100:(Number(state.settings.tax)||0)),
      serviceRate:Number.isFinite(serviceRate)?serviceRate:(taxable?(Number(sale.service)||0)/taxable*100:(Number(state.settings.service)||0))
    };
  }

  function editSale(sale){
    if(!sale||sale.status==="Void")return;
    const rates=getSaleFeeRates(sale);
    const items=window.POS_SERVICE.clone(sale.items||[]);
    const modal=document.createElement("div");modal.className="modal-backdrop";
    modal.innerHTML=`<section class="modal sale-editor" style="width:min(780px,100%)"><h2>Edit transaksi #${esc(sale.number)}</h2><p class="modal-sub">Perubahan akan memperbarui nilai transaksi dan laporan. Catatan koreksi wajib diisi.</p>
      <div class="sale-edit-controls"><div class="field"><label for="edit-sale-type">Tipe pesanan</label><select id="edit-sale-type"><option ${sale.orderType==="Dine-In"?"selected":""}>Dine-In</option><option ${sale.orderType==="Takeaway"?"selected":""}>Takeaway</option><option ${sale.orderType==="Delivery"?"selected":""}>Delivery</option></select></div><div class="field"><label for="edit-sale-method">Pembayaran</label><select id="edit-sale-method"><option ${sale.method==="Tunai"?"selected":""}>Tunai</option><option ${sale.method==="QRIS"?"selected":""}>QRIS</option><option ${sale.method==="Debit/Credit"?"selected":""}>Debit/Credit</option></select></div><div class="field" id="edit-table-field"><label for="edit-sale-table">Nomor meja</label><input id="edit-sale-table" value="${esc(sale.table||"")}"></div><div class="field" id="edit-cash-field"><label for="edit-sale-cash">Uang diterima</label><input id="edit-sale-cash" type="number" min="0" step="1" value="${sale.method==="Tunai"?Number(sale.cashReceived)||0:0}"></div></div>
      <div class="field"><label>Item transaksi</label><small style="color:var(--muted)">Nama item · Harga satuan · Jumlah</small><div id="sale-edit-lines"></div></div>
      <div class="toolbar-panel"><select id="add-sale-product"><option value="">Tambah item menu...</option>${state.products.map(product=>`<option value="${esc(product.id)}">${esc(product.name)} · ${rupiah(product.price)}</option>`).join("")}</select><button class="btn" type="button" id="add-sale-line">Tambah item</button></div>
      <div class="field"><label for="edit-sale-discount">Diskon transaksi (Rp)</label><input id="edit-sale-discount" type="number" min="0" step="1" value="${Number(sale.discount)||0}"></div>
      <div class="totals"><div class="total-row"><span>Subtotal</span><span id="edit-sale-subtotal"></span></div><div class="total-row"><span>Diskon</span><span id="edit-sale-discount-total"></span></div><div class="total-row"><span>Pajak (${rates.taxRate.toFixed(2)}%)</span><span id="edit-sale-tax"></span></div><div class="total-row"><span>Service (${rates.serviceRate.toFixed(2)}%)</span><span id="edit-sale-service"></span></div><div class="total-row grand"><span>Total</span><strong id="edit-sale-total"></strong></div></div>
      <div class="field"><label for="edit-sale-reason">Alasan koreksi</label><textarea id="edit-sale-reason" rows="2" maxlength="300" placeholder="Jelaskan alasan perubahan transaksi"></textarea></div><div class="login-error" id="edit-sale-error" role="alert"></div>
      <div class="modal-actions"><button class="btn" data-close>Batal</button><button class="btn btn-primary" id="save-sale-edit">Simpan perubahan</button></div></section>`;
    document.body.appendChild(modal);
    const lineContainer=modal.querySelector("#sale-edit-lines");
    const renderLines=()=>{
      lineContainer.innerHTML=items.map((item,index)=>`<div class="sale-edit-line" data-sale-line="${index}" style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(90px,.8fr) 68px 34px;gap:6px;margin:6px 0"><input data-line-name aria-label="Nama item" value="${esc(item.name)}" style="min-width:0;width:100%;border:1px solid var(--line);border-radius:8px;padding:8px"><input data-line-price aria-label="Harga satuan" type="number" min="0" step="1" value="${Number(item.unitPrice)||0}" style="min-width:0;width:100%;border:1px solid var(--line);border-radius:8px;padding:8px"><input data-line-quantity aria-label="Jumlah item" type="number" min="1" step="1" value="${Number(item.quantity)||1}" style="min-width:0;width:100%;border:1px solid var(--line);border-radius:8px;padding:8px"><button type="button" data-remove-sale-line="${index}" aria-label="Hapus item" title="Hapus item">×</button></div>`).join("");
    };
    const updateControls=()=>{
      modal.querySelector("#edit-table-field").hidden=modal.querySelector("#edit-sale-type").value!=="Dine-In";
      modal.querySelector("#edit-cash-field").hidden=modal.querySelector("#edit-sale-method").value!=="Tunai";
    };
    const calculate=()=>{
      const error=modal.querySelector("#edit-sale-error");
      const rows=Array.from(lineContainer.querySelectorAll(".sale-edit-line")).map(row=>({
        index:Number(row.dataset.saleLine),name:row.querySelector("[data-line-name]").value.trim(),
        unitPrice:Number(row.querySelector("[data-line-price]").value),quantity:Number(row.querySelector("[data-line-quantity]").value)
      }));
      const subtotal=rows.reduce((sum,row)=>sum+(Number.isFinite(row.unitPrice)?row.unitPrice:0)*(Number.isInteger(row.quantity)?row.quantity:0),0);
      const discount=Number(modal.querySelector("#edit-sale-discount").value);
      const validLines=rows.length>0&&rows.every(row=>row.name&&Number.isInteger(row.unitPrice)&&row.unitPrice>=0&&Number.isInteger(row.quantity)&&row.quantity>0);
      const validDiscount=Number.isInteger(discount)&&discount>=0&&discount<=subtotal;
      const taxable=Math.max(0,subtotal-(Number.isFinite(discount)?discount:0));
      const tax=Math.round(taxable*rates.taxRate/100);
      const service=Math.round(taxable*rates.serviceRate/100);
      const total=taxable+tax+service;
      const method=modal.querySelector("#edit-sale-method").value;
      const cashReceived=Number(modal.querySelector("#edit-sale-cash").value);
      const validCash=method!=="Tunai"||(Number.isInteger(cashReceived)&&cashReceived>=total);
      modal.querySelector("#edit-sale-subtotal").textContent=rupiah(subtotal);
      modal.querySelector("#edit-sale-discount-total").textContent=`-${rupiah(Number.isFinite(discount)?discount:0)}`;
      modal.querySelector("#edit-sale-tax").textContent=rupiah(tax);
      modal.querySelector("#edit-sale-service").textContent=rupiah(service);
      modal.querySelector("#edit-sale-total").textContent=rupiah(total);
      if(!validLines)error.textContent="Item harus memiliki nama, harga yang valid, dan jumlah minimal satu.";
      else if(!validDiscount)error.textContent="Diskon harus nol atau lebih dan tidak boleh melebihi subtotal.";
      else if(!validCash)error.textContent="Uang diterima harus mencukupi total pembayaran.";
      else if(!modal.querySelector("#edit-sale-reason").value.trim())error.textContent="Alasan koreksi wajib diisi.";
      else error.textContent="";
      modal.querySelector("#save-sale-edit").disabled=!(validLines&&validDiscount&&validCash&&modal.querySelector("#edit-sale-reason").value.trim());
      return { rows,subtotal,discount,tax,service,total,method,cashReceived };
    };
    renderLines();
    updateControls();
    calculate();
    lineContainer.addEventListener("input",calculate);
    lineContainer.addEventListener("click",event=>{
      const button=event.target.closest("[data-remove-sale-line]");
      if(!button)return;
      items.splice(Number(button.dataset.removeSaleLine),1);
      renderLines();calculate();
    });
    modal.querySelector("#add-sale-line").addEventListener("click",()=>{
      const product=state.products.find(candidate=>candidate.id===modal.querySelector("#add-sale-product").value);
      if(!product){toast("Pilih produk yang ingin ditambahkan");return;}
      items.push({productId:product.id,name:product.name,category:product.category,quantity:1,unitPrice:product.price,modifier:{}});
      modal.querySelector("#add-sale-product").value="";
      renderLines();calculate();
    });
    modal.querySelector("#edit-sale-discount").addEventListener("input",calculate);
    modal.querySelector("#edit-sale-reason").addEventListener("input",calculate);
    modal.querySelector("#edit-sale-cash").addEventListener("input",calculate);
    modal.querySelector("#edit-sale-method").addEventListener("change",()=>{updateControls();calculate()});
    modal.querySelector("#edit-sale-type").addEventListener("change",updateControls);
    modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
    modal.querySelector("#save-sale-edit").addEventListener("click",()=>{
      const result=calculate();
      if(modal.querySelector("#save-sale-edit").disabled)return;
      sale.items=result.rows.map(row=>({...items[row.index],name:row.name,unitPrice:row.unitPrice,quantity:row.quantity}));
      sale.orderType=modal.querySelector("#edit-sale-type").value;
      sale.table=sale.orderType==="Dine-In"?modal.querySelector("#edit-sale-table").value.trim():"";
      sale.method=result.method;
      sale.cashReceived=result.method==="Tunai"?result.cashReceived:0;
      sale.subtotal=result.subtotal;
      sale.discount=result.discount;
      sale.tax=result.tax;
      sale.service=result.service;
      sale.taxRate=rates.taxRate;
      sale.serviceRate=rates.serviceRate;
      sale.total=result.total;
      sale.updatedAt=new Date().toISOString();
      sale.updatedBy=state.user?.name||"Admin";
      sale.editReason=modal.querySelector("#edit-sale-reason").value.trim();
      persist();
      modal.remove();
      render();
      toast("Transaksi diperbarui");
    });
  }

  function bindCommon(){
    document.querySelectorAll("[data-view-sale]").forEach(button=>button.addEventListener("click",()=>openReceipt(state.sales.find(s=>String(s.id??s.number)===button.dataset.viewSale))));
    document.querySelectorAll("[data-edit-sale]").forEach(button=>button.addEventListener("click",()=>{
      const sale=state.sales.find(candidate=>String(candidate.id??candidate.number)===button.dataset.editSale);
      if(sale)editSale(sale);
    }));
    document.querySelectorAll("[data-delete-sale]").forEach(button=>button.addEventListener("click",()=>{
      const index=state.sales.findIndex(candidate=>String(candidate.id??candidate.number)===button.dataset.deleteSale);
      if(index<0)return;
      const sale=state.sales[index];
      if(!window.confirm(`Hapus transaksi #${sale.number} secara permanen dari riwayat penjualan? Snapshot laporan tersimpan tidak berubah.`))return;
      state.sales.splice(index,1);
      persist();
      render();
      toast("Transaksi dihapus dari riwayat");
    }));
    document.querySelectorAll("[data-void]").forEach(button=>button.addEventListener("click",()=>{
      const sale=state.sales.find(s=>String(s.id??s.number)===button.dataset.void);
      const reason=window.prompt("Masukkan alasan void/refund:");
      if(reason&&reason.trim()){sale.status="Void";sale.voidReason=reason.trim();persist();render();toast("Transaksi dibatalkan")}
    }));
  }

  function bindDashboard(){
    document.querySelector("#export-dashboard")?.addEventListener("click",exportSales);
  }

  function render(){
    if(!state.role){loginView();return;}
    let content="";
    if(state.view==="pos"){content=posView();shell(content);bindPos();}
    else if(state.view==="history"){content=historyView();shell(content);bindCommon();}
    else if(state.view==="dashboard"){content=dashboardView();shell(content);bindDashboard();}
    else if(state.view==="products"){content=productsView();shell(content);bindAdmin();}
    else if(state.view==="inventory"){content=inventoryView();shell(content);bindAdmin();}
    else if(state.view==="reports"){content=reportsView();shell(content);bindAdmin();bindCommon();}
    else if(state.view==="users"){content=usersView();shell(content);bindAdmin();}
    else if(state.view==="settings"){content=settingsView();shell(content);bindAdmin();}
  }

  render();
})();
