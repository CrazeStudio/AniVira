const crypto = require("node:crypto");

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
  console.error("Run this script in an interactive terminal so the password can be entered privately.");
  process.exit(1);
}

const input = process.stdin;
const output = process.stdout;
let password = "";

output.write("Admin password (hidden input): ");
input.setRawMode(true);
input.resume();
input.on("data", (chunk) => {
  const text = chunk.toString("utf8");
  for (const character of text) {
    if (character === "\u0003") {
      output.write("\nCancelled.\n");
      input.setRawMode(false);
      process.exit(130);
    }
    if (character === "\r" || character === "\n") {
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (password.length < 12) {
        console.error("Use an admin password with at least 12 characters.");
        process.exit(1);
      }
      const salt = crypto.randomBytes(16);
      const derived = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256");
      const encoded = ["pbkdf2-sha256",310000,salt.toString("base64"),derived.toString("base64")].join("$");
      password = "";
      console.log("ADMIN_PASSWORD_HASH=");
      console.log(encoded);
      console.log("Copy the value above into Vercel Environment Variables. Do not commit it.");
      process.exit(0);
    }
    if (character === "\u007f" || character === "\b") {
      password = password.slice(0,-1);
    } else if (character >= " ") {
      password += character;
    }
  }
});