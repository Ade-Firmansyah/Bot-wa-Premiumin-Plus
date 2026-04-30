import { config } from 'dotenv'
config()

export const API_KEY = process.env.API_KEY
export const BASE_URL = "https://premku.com/api/"
export const PORT = process.env.PORT || 3000