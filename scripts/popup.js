(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;

  document.getElementById("go12306")?.addEventListener("click", () => {
    api.tabs.create({ url: "https://www.12306.cn/" });
  });

  document.getElementById("goTrains")?.addEventListener("click", () => {
    api.tabs.create({ url: "https://china-emu.cn/Trains/ALL/" });
  }); 
  
  document.getElementById("goRailroads")?.addEventListener("click", () => {
    api.tabs.create({ url: "https://www.china-emu.cn/Railroads/" });
  });
})();
