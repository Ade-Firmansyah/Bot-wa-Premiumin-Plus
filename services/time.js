export function greeting() {
  const hour = new Date().getHours()
  if (hour >= 4 && hour < 11) return "Selamat Pagi 🌅"
  if (hour >= 11 && hour < 15) return "Selamat Siang ☀️"
  if (hour >= 15 && hour < 18) return "Selamat Sore 🌤️"
  return "Selamat Malam 🌙"
}
