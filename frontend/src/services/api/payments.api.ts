import axios from "axios"

const API_URL = "http://localhost:8000/api/v1"

interface CheckoutResponse {
  success: boolean
  checkout_url: string
}

export const createProCheckout = async (accessToken: string): Promise<CheckoutResponse> => {
  const response = await axios.post<CheckoutResponse>(
    `${API_URL}/payments/checkout`,
    undefined,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 20000,
    },
  )
  return response.data
}
