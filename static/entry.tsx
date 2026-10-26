import { createRoot } from "react-dom/client";
import MerchantApp from "../app/merchant-app";
import { setApiTransport } from "../lib/client-api";
import { createBrowserApi, STORAGE_KEY } from "./browser-api";
import "../app/globals.css";

// Access storage lazily so blocked-storage errors can be shown inside the app.
setApiTransport(createBrowserApi({
  getItem: key => localStorage.getItem(key),
  setItem: (key,value) => localStorage.setItem(key,value),
}, Date.now, STORAGE_KEY + ":" + new URL("./", location.href).pathname));
createRoot(document.getElementById("root")!).render(<MerchantApp browserOnly />);
if (location.protocol === "https:" && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
}
