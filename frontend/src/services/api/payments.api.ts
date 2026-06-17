import api from "./client"

interface CheckoutResponse {
  success: boolean
  checkout_url: string
}

export const createProCheckout = async (): Promise<CheckoutResponse> => {
  const response = await api.post<CheckoutResponse>("/payments/checkout", undefined, {
    timeout: 20000,
  })
  return response.data
}
