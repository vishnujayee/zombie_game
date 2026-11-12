// W13.Events — tiny pub/sub bus.
window.W13 = window.W13 || {};
W13.Events = (function () {
  let handlers = {};
  return {
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
    off(name, fn) { if (handlers[name]) handlers[name] = handlers[name].filter(f => f !== fn); },
    emit(name, data) {
      const list = handlers[name];
      if (!list) return;
      for (let i = 0; i < list.length; i++) list[i](data);
    },
    clear() { handlers = {}; },
  };
})();
