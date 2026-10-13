// glome – Gulnux webbläsare i Gulapp
//
//   glome            open Glome (or a new window if it is already running)
//   glome <url>      open an address, in the running Glome if there is one

import { openGlome } from "../lib/glome.mjs";

try {
  await openGlome(process.argv.slice(2));
} catch (e) {
  console.error(`glome: ${e.message}`);
  process.exit(1);
}
