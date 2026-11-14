// Chrome opens the panel when the user clicks the extension's toolbar icon.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  console.error({
    code: "PARSE_FAILED",
    message: "Could not enable the side panel. Reload the extension and try again.",
  });
});
