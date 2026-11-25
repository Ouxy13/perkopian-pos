/* Seed data yang realistis untuk demo. Ganti isi ini dengan respons API pada integrasi backend. */
window.POS_DATA = {
  categories: ["Semua", "Coffee", "Non-Coffee", "Pastry & Food", "Add-ons"],
  products: [
    { id:"p1", name:"Kopi Susu Gula Aren", category:"Coffee", price:24000, cost:8500, icon:"☕", available:true, description:"Espresso, susu segar, gula aren", variants:true },
    { id:"p2", name:"Americano", category:"Coffee", price:20000, cost:6000, icon:"🥤", available:true, description:"Double shot espresso", variants:true },
    { id:"p3", name:"Caffe Latte", category:"Coffee", price:27000, cost:9500, icon:"☕", available:true, description:"Espresso dan susu steamed", variants:true },
    { id:"p4", name:"Caramel Macchiato", category:"Coffee", price:32000, cost:11500, icon:"🍮", available:true, description:"Vanilla, espresso, karamel", variants:true },
    { id:"p5", name:"Matcha Latte", category:"Non-Coffee", price:29000, cost:10500, icon:"🍵", available:true, description:"Matcha premium dan susu", variants:true },
    { id:"p6", name:"Chocolate", category:"Non-Coffee", price:26000, cost:9000, icon:"🍫", available:true, description:"Cokelat Belgia", variants:true },
    { id:"p7", name:"Lychee Tea", category:"Non-Coffee", price:23000, cost:7000, icon:"🧋", available:true, description:"Teh melati dan leci", variants:true },
    { id:"p8", name:"Butter Croissant", category:"Pastry & Food", price:22000, cost:9000, icon:"🥐", available:true, description:"Croissant butter panggang", variants:false },
    { id:"p9", name:"Banana Bread", category:"Pastry & Food", price:18000, cost:6500, icon:"🍞", available:true, description:"Banana bread homemade", variants:false },
    { id:"p10", name:"Chicken Sandwich", category:"Pastry & Food", price:35000, cost:16000, icon:"🥪", available:true, description:"Ayam, sayuran, sourdough", variants:false },
    { id:"p11", name:"Extra Shot", category:"Add-ons", price:8000, cost:2500, icon:"✨", available:true, description:"Tambahan espresso", variants:false },
    { id:"p12", name:"Oat Milk", category:"Add-ons", price:7000, cost:3500, icon:"🌾", available:true, description:"Pengganti susu oat", variants:false }
  ],
  inventory: [
    { id:"i1", name:"Biji Kopi House Blend", unit:"kg", stock:8.5, minimum:3 },
    { id:"i2", name:"Susu Segar", unit:"liter", stock:12, minimum:8 },
    { id:"i3", name:"Gula Aren", unit:"kg", stock:2.2, minimum:3 },
    { id:"i4", name:"Cup 12 oz", unit:"pcs", stock:120, minimum:50 },
    { id:"i5", name:"Bubuk Matcha", unit:"kg", stock:1.4, minimum:1 },
    { id:"i6", name:"Biji Kopi Decaf", unit:"kg", stock:0.6, minimum:1 }
  ],
  users: [
    { id:"u1", name:"Ayu Pratama", username:"admin", role:"Admin", active:true },
    { id:"u2", name:"Bima Saputra", username:"kasir", role:"Kasir", active:true },
    { id:"u3", name:"Sari Wulandari", username:"sari", role:"Kasir", active:true }
  ],
  settings: { shopName:"Perkopian", address:"Jl. Senopati No. 18, Jakarta Selatan", tax:10, service:5, receiptFooter:"Terima kasih sudah mampir. Sampai jumpa lagi!" }
};
