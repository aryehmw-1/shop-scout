chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["shopScoutBaseUrl"], (data) => {
    if (!data.shopScoutBaseUrl) {
      chrome.storage.sync.set({ shopScoutBaseUrl: "http://localhost:3000" });
    }
  });
});
