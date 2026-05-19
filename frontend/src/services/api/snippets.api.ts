import axios from "axios"
import { useAuthStore } from "../../store/authStore"

const API_URL = "http://localhost:8000/api/v1"

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export interface Snippet {
  id: string
  title: string
  code: string
  language: string
  description?: string
  tags: string[]
  is_public: boolean
  is_pinned: boolean
  use_count: number
  created_at: string
  updated_at: string
}

export interface CreateSnippetData {
  title: string
  code: string
  language: string
  description?: string
  tags?: string[]
  is_public?: boolean
}

export const getSnippets = async (params?: any) => {
  const response = await api.get("/snippets/", { params })
  return response.data
}

export const getSnippet = async (id: string) => {
  const response = await api.get(`/snippets/${id}`)
  return response.data
}

export const createSnippet = async (data: CreateSnippetData) => {
  const response = await api.post("/snippets/", data)
  return response.data
}

export const updateSnippet = async (id: string, data: any) => {
  const response = await api.put(`/snippets/${id}`, data)
  return response.data
}

export const deleteSnippet = async (id: string) => {
  const response = await api.delete(`/snippets/${id}`)
  return response.data
}

export const copySnippet = async (id: string) => {
  const response = await api.post(`/snippets/${id}/copy`)
  return response.data
}
