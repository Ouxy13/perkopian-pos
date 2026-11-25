window.POS_SERVICE = (() => {
  const KEY = "ruang-seduh-pos-v1";
  const clone = value => JSON.parse(JSON.stringify(value));
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      return saved && typeof saved === "object" ? saved : clone(window.POS_DATA);
    } catch (error) {
      console.warn("Data tersimpan tidak dapat dibaca. Menggunakan data demo.", error);
      return clone(window.POS_DATA);
    }
  }
  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        products: state.products, inventory: state.inventory, users: state.users,
        settings: state.settings, sales: state.sales, savedReports: state.savedReports,
        nextOrder: state.nextOrder
      }));
      return true;
    } catch (error) {
      console.error("Gagal menyimpan ke localStorage.", error);
      return false;
    }
  }
  return { load, save, clone };
})();
