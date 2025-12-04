(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const go12306 = document.getElementById("go12306");

  go12306?.addEventListener("click", () => {
    api.tabs.create({ url: "https://www.12306.cn/" });
  });
})();
