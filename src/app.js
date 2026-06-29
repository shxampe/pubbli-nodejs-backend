import express from "express";
import cors from "cors";
import config from "./config/appconfig.js";
import compression from "compression";
import path from "path";
import session from "express-session";
import morgan from "morgan";
import router from "./router/index.js";
import { handleStripeWebhook } from "./controllers/Stripe.Controller.js";
import { initCronJobs } from "./cron/index.js";

const basePath = config.api.base_path;

initCronJobs();

const __dirname = path.resolve();
const app = express();
app.use(morgan("dev"));

app.use(cors());

app.post(
  `${basePath}/stripe/webhook`,
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use(express.json({ limit: "50mb" }));
app.use(
  express.urlencoded({
    limit: "50mb",
    extended: true,
    parameterLimit: 50000,
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "anySessionSecret",
    resave: false,
    saveUninitialized: true,
  })
);

app.set(config);
app.use(compression());
app.use(express.static(path.join(__dirname, "src", "public")));


app.get("/", (req, res) => {
  res.send("Server is up and running!");
});

app.use(router);
export { app };
