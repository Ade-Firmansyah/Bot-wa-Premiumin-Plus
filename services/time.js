import moment from "moment-timezone"

export function greeting() {
  const hour = Number(moment().tz("Asia/Jakarta").format("HH"))

  if (hour >= 4 && hour < 10) return "Pagi 🌄"
  if (hour >= 10 && hour < 15) return "Siang ☀️"
  if (hour >= 15 && hour < 18) return "Sore 🌆"
  return "Malam 🌙"
}
