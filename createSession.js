import dotenv from "dotenv";
dotenv.config();

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";

const createSession = async () => {
    console.log("Starting Telegram Session Generator...");

    const client = new TelegramClient(
        new StringSession(""),
        Number(process.env.API_ID),
        process.env.API_HASH,
        {
            connectionRetries: 5,
        }
    );

    await client.start({
        phoneNumber: async () => await input.text("Phone Number (with country code, e.g., +880...): "),
        password: async () => await input.text("2FA Password (if any, else press Enter): "),
        phoneCode: async () => await input.text("Telegram Code (sent to your app): "),
        onError: (err) => console.log("Error:", err),
    });

    console.log("\n✅ Login Successful!");
    console.log("\n==================== YOUR SESSION STRING ====================\n");
    console.log(client.session.save());
    console.log("\n=============================================================\n");
    console.log("Copy the string above and paste it into your .env file as SESSION=");

    process.exit(0); // Close the script
};

createSession();