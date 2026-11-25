window.POS_STORE = (() => {
  const seed = window.POS_DATA;
  const saved = window.POS_SERVICE.load();
  const state = {
    products: Array.isArray(saved.products) ? saved.products : window.POS_SERVICE.clone(seed.products),
    inventory: Array.isArray(saved.inventory) ? saved.inventory : window.POS_SERVICE.clone(seed.inventory),
    users: Array.isArray(saved.users) ? saved.users : window.POS_SERVICE.clone(seed.users),
    settings: saved.settings || window.POS_SERVICE.clone(seed.settings),
    sales: Array.isArray(saved.sales) ? saved.sales : [],
    savedReports: Array.isArray(saved.savedReports) ? saved.savedReports : [],
    nextOrder: Number(saved.nextOrder) || 1001,
    role:null, user:null, view:"login",
    category:"Semua", search:"", cart:[], orderType:"Takeaway", table:"",
    discount:0, selectedPayment:"Tunai"
  };
  if (state.settings.shopName === "Ruang Seduh") state.settings.shopName = "Perkopian";
  const persist = () => window.POS_SERVICE.save(state);
  const totals = () => {
    const subtotal = state.cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const discount = Math.min(subtotal, Math.round(subtotal * Math.max(0, Math.min(state.discount, 100)) / 100));
    const taxable = subtotal - discount;
    const tax = Math.round(taxable * (Number(state.settings.tax) || 0) / 100);
    const service = Math.round(taxable * (Number(state.settings.service) || 0) / 100);
    return { subtotal, discount, tax, service, total:taxable + tax + service };
  };
  return { state, persist, totals };
})();
