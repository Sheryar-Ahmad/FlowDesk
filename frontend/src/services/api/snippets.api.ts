import axios from "axios"
import { useAuthStore } from "../../store/authStore"
import { API_BASE_URL } from "./config"

const api = axios.create({
  baseURL: API_BASE_URL,
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
  collection_id?: string | null
}

export interface SnippetQuery {
  page?: number
  page_size?: number
  language?: string
  search?: string
}

export interface UpdateSnippetData extends Partial<CreateSnippetData> {
  is_pinned?: boolean
}

export const getSnippets = async (params?: SnippetQuery) => {
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

export const updateSnippet = async (id: string, data: UpdateSnippetData) => {
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
