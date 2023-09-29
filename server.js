const express = require("express");
var https = require("https");
const fs = require("fs");
var privateKey = fs.readFileSync("localhost-key.pem", "utf8");
var certificate = fs.readFileSync("localhost.pem", "utf8");

var credentials = { key: privateKey, cert: certificate };
const app = express();
// This is your test secret API key.
const stripe = require("stripe")(
  "sk_test_51NqHyxHYEWD6a7MHIqm9QMB33CAWHce5pgleiZR7kRh3yEH5DzV4SP6F6hlgsQOfvjM2pz5anVDGRfmmJ7Ly9UJl00Rl9rU5t8"
);

app.use(express.static("public"));
app.use(express.json());

const itemSubscriptionIndex = {
  agent: "price_1Nv1GEHYEWD6a7MHFRTVqvXN",
  videoInput: "price_1Nv1ieHYEWD6a7MHrInPXdKs",
  audioInput: "price_1Nv1j6HYEWD6a7MHM3on4pkA",
};

const itemInvoiceIndex = {
  securityKey: "price_1Nv1jPHYEWD6a7MH7au5ROA5",
};

const getSubscriptionItems = (items) => {
  const newItems = [];
  for (const item of items) {
    if (item.id in itemSubscriptionIndex) {
      newItems.push({ price: itemSubscriptionIndex[item.id] });
    }
  }
  return newItems;
};

const getInvoiceItems = (items) => {
  const newItems = [];
  for (const item of items) {
    if (item.id in itemInvoiceIndex) {
      newItems.push({ price: itemInvoiceIndex[item.id] });
    }
  }
  return newItems;
};

const calculateOrderAmount = async (items, discount = 1) => {
  // Replace this constant with a calculation of the order's amount
  // Calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  const subscriptionItems = getSubscriptionItems(items);

  const subscriptionCost = (
    await Promise.all(
      subscriptionItems.map(async (item) => {
        return (await stripe.prices.retrieve(item.price)).unit_amount;
      })
    )
  ).reduce((total, itemValue) => {
    return total + itemValue;
  });

  const invoiceItems = getInvoiceItems(items);

  const invoiceCost = await Promise.all(
    invoiceItems.map(async (item) => {
      return (await stripe.prices.retrieve(item.price)).unit_amount;
    })
  );
  if (invoiceCost.length === 0) {
    return subscriptionCost * discount;
  }

  return (
    subscriptionCost * discount +
    invoiceCost.reduce((total, itemValue) => {
      return total + itemValue;
    })
  );
};

app.post("/create-payment-intent", async (req, res) => {
  const { items, emailAddress, address, name, coupon } = req.body;

  const customer = await stripe.customers.create({
    email: emailAddress,
    name,
    shipping: {
      address,
      name,
    },
  });

  const subscriptionItems = getSubscriptionItems(items);
  const invoiceItems = getInvoiceItems(items);

  let couponId = null;

  if (coupon.length > 0) {
    const promotionCodes = await stripe.promotionCodes.list({
      limit: 1,
      code: coupon,
    });
    if (promotionCodes.data.length > 0) {
      couponId = promotionCodes.data[0].coupon.id;
    }
  }

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: subscriptionItems,
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
    add_invoice_items: invoiceItems,
    coupon: couponId,
  });

  res.send({
    clientSecret: subscription.latest_invoice.payment_intent.client_secret,
  });
});

app.post("/update-cart", async (req, res) => {
  const { items, promotionalCode } = req.body;
  let discount = 1;
  if (promotionalCode.length > 0) {
    const promotionCodes = await stripe.promotionCodes.list({
      limit: 1,
      code: promotionalCode,
    });

    if (promotionCodes.data.length === 0) {
      res.send({
        amount: await calculateOrderAmount(items),
      });
      return;
    }
    const couponId = promotionCodes.data[0].coupon.id;
    const coupon = await stripe.coupons.retrieve(couponId);
    discount = (100 - coupon.percent_off) / 100;
  }
  const amount = await calculateOrderAmount(items, discount);

  res.send({
    amount: Math.ceil(amount),
  });
});

const server = https.createServer(credentials, app);
server.listen(4242, () => console.log("Node server listening on port 4242!"));
