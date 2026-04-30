import fetch from "node-fetch"
import { API_KEY, BASE_URL } from "../config.js"

async function req(endpoint, data = {}) {
  const res = await fetch(BASE_URL + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: API_KEY,
      ...data
    })
  })
  return res.json()
}

export const API = {
  products: () => req("products"),
  order: (id, qty, ref) => req("order", { product_id: id, qty, ref_id: ref }),
  status: (invoice) => req("status", { invoice }),
  // 🔥 deposit flow
  createDeposit: (amount) => req("pay", { amount }),
  checkDeposit: (invoice) => req("pay_status", { invoice }),
  cancelDeposit: (invoice) => req("cancel_pay", { invoice })
}