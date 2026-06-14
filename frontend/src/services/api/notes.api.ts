import axios from "axios"
import { useAuthStore } from "../../store/authStore"
import { API_BASE_URL } from "./config"

const api = axios.create({ baseURL: API_BASE_URL, timeout: 10000 })
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export interface Note {
  id: string
  title: string
  content: Record<string, unknown>
  content_text: string
  word_count: number
  created_at: string
  updated_at: string
}

export interface NoteQuery {
  page?: number
  page_size?: number
  search?: string
}

export interface CreateNoteData {
  title: string
  content?: Record<string, unknown>
  content_text?: string
}

export interface UpdateNoteData {
  title?: string
  content?: Record<string, unknown>
  content_text?: string
  word_count?: number
}

export interface NoteSummaryResponse {
  success: boolean
  response: string
  tokens_used: number
  model: string
  messages_remaining: number | "unlimited"
}

export const getNotes = async (params?: NoteQuery) => (await api.get("/notes/", { params })).data
export const getNote = async (id: string) => (await api.get(`/notes/${id}`)).data
export const createNote = async (data: CreateNoteData) => (await api.post("/notes/", data)).data
export const updateNote = async (id: string, data: UpdateNoteData) => (await api.put(`/notes/${id}`, data)).data
export const deleteNote = async (id: string) => (await api.delete(`/notes/${id}`)).data
export const summarizeNote = async (title: string, content: string) => (
  await api.post<NoteSummaryResponse>("/ai/summarize", { title, content }, { timeout: 60000 })
).data
