import { bootApplication } from "./app/bootstrap.js";

bootApplication();

const lampHost = document.querySelector('[data-fusion-scroll-lamp]');
if (lampHost) {
  import('./components/ScrollLamp.jsx').then(({ mountScrollLamp }) => mountScrollLamp(lampHost));
}
