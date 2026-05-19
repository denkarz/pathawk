import { createApp } from "vue";
import App from "./App.vue";
import "./styles/themes.css";
import { syncThemeFromStorage } from "./composables/useTheme";

syncThemeFromStorage();

createApp(App).mount("#app");
