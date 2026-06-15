import axios from "axios"
import { API_BASE_URL } from "./config"

interface CheckoutResponse {
  success: boolean
  checkout_url: string
}

export const createProCheckout = async (accessToken: string): Promise<CheckoutResponse> => {
  const response = await axios.post<CheckoutResponse>(
    `${API_BASE_URL}/payments/checkout`,
    undefined,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 20000,
    },
  )
  return response.data
}
