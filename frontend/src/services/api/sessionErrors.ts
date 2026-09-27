import axios from "axios"

export function isSessionRejected(error: unknown): boolean {
  return axios.isAxiosError(error)
    && [401, 403, 423].includes(error.response?.status ?? 0)
}
