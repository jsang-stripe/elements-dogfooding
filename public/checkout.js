// This is your test publishable API key.
const stripe = Stripe(
  "pk_test_51NqHyxHYEWD6a7MHElYbpzgre5LFXSUVj9QdL7YkPEvZ11wBC0iWtJaaHvvNBxlD0NwZDEphHQSDDWKcchi1KFYJ00ib5eEFwJ"
);

// The items the customer wants to buy
const items = [{ id: "agent" }];
let currentAmount = 999;
let currentCouponCode = "";

let elements;

initialize();
checkStatus();

document
  .querySelector("#payment-form")
  .addEventListener("submit", handleSubmit);

let emailAddress = "";
// Fetches a payment intent and captures the client secret
async function initialize() {
  const appearance = {
    theme: "stripe",

    variables: {
      colorPrimary: "#00ff00",
      colorBackground: "#000000", // black background typical of a UNIX terminal
      colorText: "#ffffff", // white text for good contrast on the black background
      colorDanger: "#ff0000",
      fontFamily: "Courier, monospace", // monospace font typical of a terminal
      spacingUnit: "2px",
      borderRadius: "0px", // terminals usually have hard corners
      // See all possible variables below
    },
  };
  const options = {
    appearance,
    mode: "subscription",
    amount: currentAmount,
    currency: "usd",
  };
  elements = stripe.elements(options);

  const payButton = document.querySelector("#button-text");
  payButton.textContent = `Pay now $${(currentAmount / 100).toFixed(2)}`;

  const linkAuthenticationElement = elements.create("linkAuthentication");
  linkAuthenticationElement.mount("#link-authentication-element");

  linkAuthenticationElement.on("change", (event) => {
    emailAddress = event.value.email;
  });

  const paymentElementOptions = {
    layout: "tabs",
  };

  const paymentElement = elements.create("payment", paymentElementOptions);
  paymentElement.mount("#payment-element");

  // const addressElement = elements.create("address", {
  //   mode: "shipping"
  // });
  // addressElement.mount("#address-element");

  // const expressCheckoutElement = elements.create('expressCheckout', options)
  // expressCheckoutElement.mount('#express-checkout-element')

  let terminalOptions = document.querySelectorAll(".option");
  terminalOptions.forEach(function (option) {
    option.addEventListener("click", (e) => {
      e.target.classList.contains("selected")
        ? e.target.classList.remove("selected")
        : e.target.classList.add("selected");
      handleAddOn(e);
    });
  });
}

async function handleAddOn(e) {
  e.preventDefault();
  const id = e.target.id;
  const selected = e.target.classList.contains("selected");

  if (id === "securityKey" || id === "videoInput" || id === "audioInput") {
    if (selected) {
      if (items.find((item) => item.id === id)) {
        return;
      } else {
        items.push({ id });
      }
      if (id === "securityKey") {
        const pe = elements.getElement("address");
        if (!pe) {
          document
            .querySelectorAll(".address-section")
            .forEach((address) => address.classList.remove("hidden"));
          elements
            .create("address", {
              mode: "shipping",
            })
            .mount("#address-element");
        }
      }
    } else {
      items.splice(
        items.findIndex((item) => item.id === id),
        1
      );
      if (id === "securityKey") {
        const pe = elements.getElement("address");
        if (pe) {
          document.querySelector(".address-section").classList.add("hidden");
          pe.destroy();
        }
      }
    }
    updateCart();
  } else {
    throw new Error("Unknown add-on");
  }
}

async function updateCart() {
  const response = await fetch("/update-cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, promotionalCode: currentCouponCode }),
  });
  const { amount } = await response.json();
  const payButton = document.querySelector("#button-text");

  payButton.textContent = `Pay now $${(amount / 100).toFixed(2)}`;
  elements.update({ amount });
}

function handleCoupon(e) {
  e.preventDefault();
  const couponCode = document.querySelector("#coupon").value;
  currentCouponCode = couponCode;
  updateCart();
}

async function handleSubmit(e) {
  e.preventDefault();
  setLoading(true);

  const { error: submitError } = await elements.submit();
  if (submitError) {
    return;
  }

  const addressValue = (await elements.getElement("address").getValue()).value;

  try {
    var response = await fetch("/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        emailAddress,
        address: addressValue.address,
        name: addressValue.name,
        coupon: currentCouponCode,
      }),
    });
  } catch (e) {
    showMessage(e.message);
    setLoading(false);
    return;
  }

  const { clientSecret } = await response.json();

  const { error } = await stripe.confirmPayment({
    elements,
    clientSecret,
    confirmParams: {
      // Make sure to change this to your payment completion page
      return_url: "https://localhost:4242/completed.html",
      receipt_email: emailAddress,
    },
  });

  // This point will only be reached if there is an immediate error when
  // confirming the payment. Otherwise, your customer will be redirected to
  // your `return_url`. For some payment methods like iDEAL, your customer will
  // be redirected to an intermediate site first to authorize the payment, then
  // redirected to the `return_url`.
  if (error.type === "card_error" || error.type === "validation_error") {
    showMessage(error.message);
  } else {
    showMessage("An unexpected error occurred.");
  }

  setLoading(false);
}

// Fetches the payment intent status after payment submission
async function checkStatus() {
  const clientSecret = new URLSearchParams(window.location.search).get(
    "payment_intent_client_secret"
  );

  if (!clientSecret) {
    return;
  }

  const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);

  switch (paymentIntent.status) {
    case "succeeded":
      showMessage("Payment succeeded!");
      break;
    case "processing":
      showMessage("Your payment is processing.");
      break;
    case "requires_payment_method":
      showMessage("Your payment was not successful, please try again.");
      break;
    default:
      showMessage("Something went wrong.");
      break;
  }
}

// ------- UI helpers -------

function showMessage(messageText) {
  const messageContainer = document.querySelector("#payment-message");

  messageContainer.classList.remove("hidden");
  messageContainer.textContent = messageText;

  setTimeout(function () {
    messageContainer.classList.add("hidden");
    messageContainer.textContent = "";
  }, 4000);
}

// Show a spinner on payment submission
function setLoading(isLoading) {
  if (isLoading) {
    // Disable the button and show a spinner
    document.querySelector("#submit").disabled = true;
    document.querySelector("#spinner").classList.remove("hidden");
    document.querySelector("#button-text").classList.add("hidden");
  } else {
    document.querySelector("#submit").disabled = false;
    document.querySelector("#spinner").classList.add("hidden");
    document.querySelector("#button-text").classList.remove("hidden");
  }
}
