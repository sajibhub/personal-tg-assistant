import mongoose from "mongoose";
import { config } from "./env.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20
  });
  console.log("MongoDB connected");
  mongoose.connection.on("error", error => {
    console.error("MongoDB connection error:", error.message);
  });
}
